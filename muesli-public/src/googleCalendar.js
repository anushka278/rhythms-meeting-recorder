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
      
      this.auth = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
      
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

  // Get authorization URL with local server for callback
  async getAuthUrlWithServer() {
    if (!this.auth) return { success: false, error: 'Auth not initialized' };
    
    try {
      // Start local server to handle callback
      const callbackServer = new OAuthCallbackServer();
      await callbackServer.startServer();
      
      // Generate auth URL with localhost:3000 as redirect
      const authUrl = this.auth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        redirect_uri: 'http://localhost:3000'
      });
      
      return {
        success: true,
        authUrl,
        waitForCode: () => callbackServer.waitForAuthCode()
      };
    } catch (error) {
      console.error('Error setting up auth server:', error);
      return { success: false, error: error.message };
    }
  }

  // Authorize with the code from Google
  async authorize(code) {
    try {
      const { tokens } = await this.auth.getToken(code);
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
