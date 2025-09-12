const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const OAuthCallbackServer = require('./oauthServer');

// Paths for credentials and token
// Use userData directory for both credentials and token
const CREDENTIALS_PATH = path.join(app.getPath('userData'), 'credentials.json');
const TOKEN_PATH = path.join(app.getPath('userData'), 'token.json');

// Scopes for Google Calendar API
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

class GoogleCalendarService {
  constructor() {
    this.auth = null;
    this.calendar = null;
    this.callbackServer = null;
  }

  // Initialize the OAuth2 client
  async initialize() {
    try {
      // Check if credentials.json exists
      if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log('No credentials.json found at:', CREDENTIALS_PATH);
        console.log('Please copy your credentials.json to:', CREDENTIALS_PATH);
        return false;
      }

      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      // Support both web and installed app types
      const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
      
      // Use http://localhost redirect URI instead of urn:ietf:wg:oauth:2.0:oob
      const localhostRedirectUri = redirect_uris.find(uri => uri.includes('localhost')) || redirect_uris[1] || 'http://localhost';
      this.auth = new OAuth2Client(client_id, client_secret, localhostRedirectUri);
      
      // Check if we have a token
      if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        this.auth.setCredentials(token);
        this.calendar = google.calendar({ version: 'v3', auth: this.auth });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error initializing Google Calendar:', error);
      return false;
    }
  }

  // Get authorization URL
  getAuthUrl() {
    if (!this.auth) return null;
    
    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force consent screen to ensure refresh token
    });
  }

  // Get authorization URL with Cloudflare Worker for callback
  async getAuthUrlWithServer() {
    if (!this.auth) return { success: false, error: 'Auth not initialized' };
    
    try {
      // Generate unique session ID for this OAuth request
      const sessionId = this.generateSessionId();
      
      // Use Cloudflare Worker as redirect URI
      const redirectUri = 'https://meeting-recording.anushka-d22.workers.dev/oauth/callback';
      
      const authUrl = this.auth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        redirect_uri: redirectUri,
        state: sessionId // Pass session ID to track this auth request
      });
      
      console.log(`🔗 Using Cloudflare redirect URI: ${redirectUri}`);
      console.log(`🆔 Session ID: ${sessionId}`);
      console.log(`🌐 Opening OAuth URL...`);
      
      return {
        success: true,
        authUrl,
        sessionId,
        redirectUri: redirectUri,
        waitForCode: () => this.pollForTokens(sessionId)
      };
    } catch (error) {
      console.error('Error setting up Cloudflare OAuth:', error);
      return { success: false, error: error.message };
    }
  }

  // Generate unique session ID
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Poll Cloudflare Worker for tokens
  async pollForTokens(sessionId, timeout = 120000) {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds
    
    console.log(`🔄 Polling for tokens with session ID: ${sessionId}`);
    
    while ((Date.now() - startTime) < timeout) {
      try {
        const response = await fetch(`https://meeting-recording.anushka-d22.workers.dev/oauth/poll?session=${sessionId}`);
        
        if (response.ok && response.status === 200) {
          const tokens = await response.json();
          console.log('✅ Tokens received from Cloudflare!');
          return tokens;
        }
        
        if (response.status === 202) {
          // Still pending, continue polling
          console.log('⏳ Waiting for OAuth completion...');
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Polling failed');
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error('Polling error:', error);
        // Continue polling unless it's a critical error
        if (error.message.includes('fetch')) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('OAuth timeout - user did not complete authorization');
  }

  // Authorize with tokens from Cloudflare
  async authorizeWithTokens(tokens) {
    try {
      console.log('🔑 Setting credentials with tokens from Cloudflare...');
      
      this.auth.setCredentials(tokens);
      
      // Save the token
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      
      console.log('✅ Google Calendar authorization successful!');
      return true;
    } catch (error) {
      console.error('Error setting credentials:', error);
      return false;
    }
  }

  // Legacy method - Authorize with the code from Google (keeping for backward compatibility)
  async authorize(code, redirectUri = null) {
    try {
      // If redirectUri is provided, temporarily update the OAuth2 client
      const originalRedirectUri = this.auth.redirectUri;
      if (redirectUri) {
        this.auth.redirectUri = redirectUri;
        console.log(`Using redirect URI for token exchange: ${redirectUri}`);
      }
      
      const { tokens } = await this.auth.getToken(code);
      
      // Restore original redirect URI
      if (redirectUri) {
        this.auth.redirectUri = originalRedirectUri;
      }
      
      this.auth.setCredentials(tokens);
      
      // Save the token
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      return true;
    } catch (error) {
      console.error('Error authorizing Google Calendar:', error);
      return false;
    }
  }

  // Get upcoming meetings
  async getUpcomingMeetings(maxResults = 10) {
    if (!this.calendar) {
      console.log('Calendar not initialized');
      return [];
    }

    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      
      return events.map(event => ({
        id: event.id,
        title: event.summary || 'No Title',
        description: event.description || '',
        startTime: event.start.dateTime || event.start.date,
        endTime: event.end.dateTime || event.end.date,
        location: event.location || '',
        meetingLink: this.extractMeetingLink(event),
        attendees: event.attendees ? event.attendees.map(a => ({
          email: a.email,
          name: a.displayName || a.email,
          responseStatus: a.responseStatus
        })) : [],
        isAllDay: !event.start.dateTime
      }));
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      return [];
    }
  }

  // Extract meeting link from event
  extractMeetingLink(event) {
    // Check for Google Meet link
    if (event.hangoutLink) {
      return {
        type: 'google-meet',
        url: event.hangoutLink
      };
    }

    // Check for Zoom link in location or description
    const zoomRegex = /https?:\/\/[\w-]*\.?zoom\.us\/[^\s]*/gi;
    
    if (event.location) {
      const zoomMatch = event.location.match(zoomRegex);
      if (zoomMatch) {
        return {
          type: 'zoom',
          url: zoomMatch[0]
        };
      }
    }

    if (event.description) {
      const zoomMatch = event.description.match(zoomRegex);
      if (zoomMatch) {
        return {
          type: 'zoom',
          url: zoomMatch[0]
        };
      }
    }

    // Check for Teams link
    const teamsRegex = /https?:\/\/teams\.microsoft\.com\/[^\s]*/gi;
    if (event.description) {
      const teamsMatch = event.description.match(teamsRegex);
      if (teamsMatch) {
        return {
          type: 'teams',
          url: teamsMatch[0]
        };
      }
    }

    return null;
  }

  // Check if authenticated
  isAuthenticated() {
    return this.auth && this.auth.credentials && this.auth.credentials.access_token;
  }

  // Revoke authorization
  async revokeAuth() {
    try {
      // Clean up callback server if it exists
      if (this.callbackServer) {
        this.callbackServer.stopServer();
        this.callbackServer = null;
      }
      
      if (fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
      }
      this.auth = null;
      this.calendar = null;
      return true;
    } catch (error) {
      console.error('Error revoking auth:', error);
      return false;
    }
  }
}

module.exports = GoogleCalendarService;
