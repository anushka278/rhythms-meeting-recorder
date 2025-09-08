/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 */

import './index.css';

// Create empty meetings data structure to be filled from the file
const meetingsData = {
  upcomingMeetings: [],
  pastMeetings: []
};

// Create empty arrays that will be filled from file
const upcomingMeetings = [];
const pastMeetings = [];

// Google Calendar state
let googleCalendarConnected = false;
let showAllUpcomingMeetings = false;

// Group past meetings by date
let pastMeetingsByDate = {};

// Global recording state variables
window.isRecording = false;
window.currentRecordingId = null;

// Store current view mode (summary or transcript)
let currentViewMode = 'summary';


// Function to check if there's an active recording for the current note
async function checkActiveRecordingState() {
  if (!currentEditingMeetingId) return;

  try {
    console.log('Checking active recording state for note:', currentEditingMeetingId);
    const result = await window.electronAPI.getActiveRecordingId(currentEditingMeetingId);

    if (result.success && result.data) {
      console.log('Found active recording for current note:', result.data);
      updateRecordingButtonUI(true, result.data.recordingId);
    } else {
      console.log('No active recording found for note');
      updateRecordingButtonUI(false, null);
    }
  } catch (error) {
    console.error('Error checking recording state:', error);
  }
}

// Function to update the recording button UI
function updateRecordingButtonUI(isActive, recordingId) {
  const recordButton = document.getElementById('recordButton');
  if (!recordButton) return;

  // Get the elements inside the button
  const recordIcon = recordButton.querySelector('.record-icon');
  const stopIcon = recordButton.querySelector('.stop-icon');

  if (isActive) {
    // Recording is active
    console.log('Updating UI for active recording:', recordingId);
    window.isRecording = true;
    window.currentRecordingId = recordingId;

    // Update button UI
    recordButton.classList.add('recording');
    recordIcon.style.display = 'none';
    stopIcon.style.display = 'block';
  } else {
    // No active recording
    console.log('Updating UI for inactive recording');
    window.isRecording = false;
    window.currentRecordingId = null;

    // Update button UI
    recordButton.classList.remove('recording');
    recordIcon.style.display = 'block';
    stopIcon.style.display = 'none';
  }
}

// Function to format date for section headers
function formatDateHeader(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if date is today, yesterday, or earlier
  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    // Format as "Fri, Apr 25" or similar
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }
}

// We'll initialize pastMeetings and pastMeetingsByDate when we load data from file

// Function to set up left panel actions
function setupLeftPanelActions() {
  // Copy Text button
  const copyTextBtn = document.getElementById('copyTextBtn');
  if (copyTextBtn) {
    copyTextBtn.addEventListener('click', async () => {
      const editorElement = document.getElementById('simple-editor');
      if (!editorElement) return;
      
      try {
        // Get the current content (summary or transcript)
        const textToCopy = editorElement.value;
        
        // Copy to clipboard
        await navigator.clipboard.writeText(textToCopy);
        
        // Visual feedback
        const originalText = copyTextBtn.querySelector('span').textContent;
        copyTextBtn.querySelector('span').textContent = 'Copied!';
        copyTextBtn.style.background = '#7C3AED';
        copyTextBtn.style.color = 'white';
        copyTextBtn.style.borderColor = '#7C3AED';
        
        setTimeout(() => {
          copyTextBtn.querySelector('span').textContent = originalText;
          copyTextBtn.style.background = '';
          copyTextBtn.style.color = '';
          copyTextBtn.style.borderColor = '';
        }, 2000);
        
        console.log('Text copied to clipboard');
      } catch (err) {
        console.error('Failed to copy text:', err);
        alert('Failed to copy text to clipboard');
      }
    });
  }
  
  // Save as PDF button
  const savePdfBtn = document.getElementById('savePdfBtn');
  if (savePdfBtn) {
    savePdfBtn.addEventListener('click', async () => {
      if (!currentEditingMeetingId) {
        alert('No note is currently open');
        return;
      }
      
      // Find the current meeting
      const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === currentEditingMeetingId);
      if (!meeting) {
        alert('Meeting not found');
        return;
      }
      
      try {
        // Visual feedback
        const originalText = savePdfBtn.querySelector('span').textContent;
        savePdfBtn.querySelector('span').textContent = 'Saving...';
        savePdfBtn.style.background = '#7C3AED';
        savePdfBtn.style.color = 'white';
        savePdfBtn.style.borderColor = '#7C3AED';
        
        // Get the current content
        const editorElement = document.getElementById('simple-editor');
        const content = editorElement.value;
        
        // Call the main process to save as PDF
        const result = await window.electronAPI.saveAsPDF({
          meetingId: currentEditingMeetingId,
          title: meeting.title,
          content: content,
          isTranscript: currentViewMode === 'transcript'
        });
        
        if (result.success) {
          savePdfBtn.querySelector('span').textContent = 'Saved!';
          setTimeout(() => {
            savePdfBtn.querySelector('span').textContent = originalText;
            savePdfBtn.style.background = '';
            savePdfBtn.style.color = '';
            savePdfBtn.style.borderColor = '';
          }, 2000);
        } else {
          throw new Error(result.error || 'Failed to save PDF');
        }
      } catch (err) {
        console.error('Failed to save as PDF:', err);
        alert('Failed to save as PDF: ' + err.message);
        
        // Reset button
        savePdfBtn.querySelector('span').textContent = 'Save as PDF';
        savePdfBtn.style.background = '';
        savePdfBtn.style.color = '';
        savePdfBtn.style.borderColor = '';
      }
    });
  }
}

// Function to set up view toggle handler
function setupViewToggle(meeting) {
  const viewToggle = document.getElementById('viewToggle');
  const editorElement = document.getElementById('simple-editor');
  
  if (!viewToggle || !editorElement) return;
  
  // Remove any existing listeners
  viewToggle.removeEventListener('change', viewToggle._handler);
  
  // Create new handler
  viewToggle._handler = function() {
    if (this.checked) {
      // Switch to transcript view
      currentViewMode = 'transcript';
      
      // Store current summary content if user was editing it
      if (meeting.content !== editorElement.value) {
        meeting.content = editorElement.value;
        // Save the updated content
        saveMeetingsData();
      }
      
      // Display formatted transcript
      console.log(`Switching to transcript mode. Meeting has ${meeting.transcript ? meeting.transcript.length : 0} transcript entries`);
      updateMainNoteWithTranscript(meeting);
      
      // Make editor read-only in transcript mode
      editorElement.readOnly = true;
      editorElement.style.backgroundColor = '#f9f9f9';
    } else {
      // Switch back to summary view
      currentViewMode = 'summary';
      
      // Restore summary content (this should always be the saved meeting content)
      editorElement.value = meeting.content || '';
      
      // Make editor editable again
      editorElement.readOnly = false;
      editorElement.style.backgroundColor = '';
      
      // Debug: Log that we're switching back to summary and transcript data is still available
      if (meeting.transcript && meeting.transcript.length > 0) {
        console.log(`Switched back to summary mode. Transcript data still available: ${meeting.transcript.length} entries`);
      } else {
        console.log('Switched back to summary mode. No transcript data available.');
      }
    }
  };
  
  // Add the event listener
  viewToggle.addEventListener('change', viewToggle._handler);
}

// Function to format transcript for display
function formatTranscriptForDisplay(meeting) {
  if (!meeting.transcript || meeting.transcript.length === 0) {
    return '# No Transcript Available\n\nNo transcript has been recorded for this meeting yet.';
  }
  
  let formattedTranscript = '# Meeting Transcript\n\n';
  formattedTranscript += `**Meeting:** ${meeting.title}\n`;
  formattedTranscript += `**Date:** ${new Date(meeting.date).toLocaleString()}\n\n`;
  formattedTranscript += '---\n\n';
  
  // Group transcript by speaker for better readability
  let currentSpeaker = null;
  let speakerText = [];
  
  meeting.transcript.forEach((entry, index) => {
    const speaker = entry.speaker || 'Unknown Speaker';
    
    if (speaker !== currentSpeaker) {
      // Output previous speaker's text if any
      if (currentSpeaker && speakerText.length > 0) {
        formattedTranscript += `**${currentSpeaker}:**\n${speakerText.join(' ')}\n\n`;
      }
      
      // Start new speaker
      currentSpeaker = speaker;
      speakerText = [entry.text];
    } else {
      // Continue with same speaker
      speakerText.push(entry.text);
    }
    
    // Handle last entry
    if (index === meeting.transcript.length - 1) {
      formattedTranscript += `**${currentSpeaker}:**\n${speakerText.join(' ')}\n\n`;
    }
  });
  
  return formattedTranscript;
}

// Google Calendar Functions
async function checkGoogleCalendarAuth() {
  console.log('Checking Google Calendar authentication...');
  
  // First, make sure the upcoming section exists
  const upcomingSection = document.getElementById('upcoming-section');
  if (!upcomingSection) {
    console.error('Upcoming section not found in DOM!');
    return;
  }
  console.log('Upcoming section found:', upcomingSection);
  
  try {
    const result = await window.electronAPI.isGoogleCalendarAuthenticated();
    console.log('Google Calendar auth check result:', result);
    
    if (result.success && result.authenticated) {
      console.log('Google Calendar is authenticated');
      googleCalendarConnected = true;
      await loadUpcomingMeetings();
      updateCalendarButtonVisibility();
    } else {
      console.log('Google Calendar is not authenticated');
      googleCalendarConnected = false;
      showEmptyUpcomingState();
      updateCalendarButtonVisibility();
    }
  } catch (error) {
    console.error('Error checking Google Calendar auth:', error);
    // Show the empty state with connect button on error
    showEmptyUpcomingState();
    updateCalendarButtonVisibility();
  }
}

async function connectGoogleCalendar() {
  try {
    console.log('Connecting to Google Calendar...');
    
    // Show loading state
    const connectBtn = document.getElementById('connectCalendarBtn');
    const connectBtnLarge = document.getElementById('connectCalendarBtnLarge');
    
    if (connectBtn) connectBtn.disabled = true;
    if (connectBtnLarge) {
      connectBtnLarge.disabled = true;
      connectBtnLarge.textContent = 'Connecting...';
    }
    
    const result = await window.electronAPI.getGoogleAuthUrl();
    
    if (result.success && result.autoAuthorized) {
      // Authorization completed automatically!
      console.log('Google Calendar connected successfully!');
      googleCalendarConnected = true;
      await loadUpcomingMeetings();
      updateCalendarButtonVisibility();
      
      // Show success message
      const emptyState = document.getElementById('upcoming-empty-state');
      if (emptyState) {
        emptyState.innerHTML = '<p style="color: #7C3AED;">✓ Google Calendar connected successfully!</p>';
        setTimeout(() => {
          loadUpcomingMeetings();
        }, 2000);
      }
    } else if (result.success) {
      // Show the auth modal for manual code entry (fallback)
      document.getElementById('authModal').style.display = 'flex';
    } else {
      console.error('Failed to connect:', result.error);
      alert('Failed to connect to Google Calendar. Please try again.');
    }
    
    // Reset button states
    if (connectBtn) connectBtn.disabled = false;
    if (connectBtnLarge) {
      connectBtnLarge.disabled = false;
      connectBtnLarge.textContent = 'Connect Google Calendar';
    }
  } catch (error) {
    console.error('Error connecting to Google Calendar:', error);
    alert('An error occurred while connecting to Google Calendar.');
  }
}

async function loadUpcomingMeetings() {
  try {
    const maxResults = showAllUpcomingMeetings ? 10 : 3;
    const result = await window.electronAPI.getUpcomingMeetings(maxResults);
    
    if (result.success && result.meetings) {
      displayUpcomingMeetings(result.meetings);
      
      // Show/hide "More" button
      const moreBtn = document.getElementById('moreUpcomingBtn');
      if (!showAllUpcomingMeetings && result.meetings.length >= 3) {
        moreBtn.style.display = 'block';
        moreBtn.textContent = 'Show More';
      } else if (showAllUpcomingMeetings && result.meetings.length > 3) {
        moreBtn.style.display = 'block';
        moreBtn.textContent = 'Show Less';
      } else {
        moreBtn.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Error loading upcoming meetings:', error);
  }
}

function displayUpcomingMeetings(meetings) {
  const container = document.getElementById('upcoming-meetings-list');
  const emptyState = document.getElementById('upcoming-empty-state');
  
  if (meetings.length === 0) {
    emptyState.style.display = 'block';
    emptyState.querySelector('p').textContent = 'No upcoming meetings';
    emptyState.querySelector('.connect-btn-large').style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    
    // Clear existing meetings
    const existingCards = container.querySelectorAll('.upcoming-meeting-card');
    existingCards.forEach(card => card.remove());
    
    // Add meeting cards
    meetings.forEach(meeting => {
      const card = createUpcomingMeetingCard(meeting);
      container.insertBefore(card, emptyState);
    });
  }
}

function createUpcomingMeetingCard(meeting) {
  const card = document.createElement('div');
  card.className = 'upcoming-meeting-card';
  
  const startTime = new Date(meeting.startTime);
  const endTime = new Date(meeting.endTime);
  
  // Format time
  const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  
  const timeStr = `${startTime.toLocaleTimeString('en-US', timeOptions)} - ${endTime.toLocaleTimeString('en-US', timeOptions)}`;
  const dateStr = startTime.toLocaleDateString('en-US', dateOptions);
  
  card.innerHTML = `
    <div class="upcoming-meeting-time">${dateStr} • ${timeStr}</div>
    <div class="upcoming-meeting-title">${meeting.title}</div>
    <div class="upcoming-meeting-details">
      ${meeting.location ? `<span>📍 ${meeting.location}</span>` : ''}
      ${meeting.meetingLink ? `
        <a href="#" class="upcoming-meeting-link" data-url="${meeting.meetingLink.url}">
          ${getMeetingIcon(meeting.meetingLink.type)} Join ${meeting.meetingLink.type === 'zoom' ? 'Zoom' : meeting.meetingLink.type === 'google-meet' ? 'Google Meet' : 'Meeting'}
        </a>
      ` : ''}
    </div>
  `;
  
  // Add click handler for meeting links
  const meetingLink = card.querySelector('.upcoming-meeting-link');
  if (meetingLink) {
    meetingLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Open meeting link in browser
      window.open(meetingLink.dataset.url, '_blank');
    });
  }
  
  return card;
}

function getMeetingIcon(type) {
  switch(type) {
    case 'zoom':
      return '🎥';
    case 'google-meet':
      return '📹';
    case 'teams':
      return '💻';
    default:
      return '🔗';
  }
}

function showEmptyUpcomingState() {
  console.log('Showing empty upcoming state...');
  const container = document.getElementById('upcoming-meetings-list');
  const emptyState = document.getElementById('upcoming-empty-state');
  
  if (!container || !emptyState) {
    console.error('Container or empty state not found:', { container, emptyState });
    return;
  }
  
  emptyState.style.display = 'block';
  emptyState.querySelector('p').textContent = 'No upcoming meetings';
  
  const connectBtn = emptyState.querySelector('.connect-btn-large');
  if (connectBtn) {
    connectBtn.style.display = googleCalendarConnected ? 'none' : 'block';
  }
  
  // Clear any existing cards
  const existingCards = container.querySelectorAll('.upcoming-meeting-card');
  existingCards.forEach(card => card.remove());
  
  console.log('Empty state shown, connect button visible:', !googleCalendarConnected);
}

function updateCalendarButtonVisibility() {
  const connectBtn = document.getElementById('connectCalendarBtn');
  const connectBtnLarge = document.getElementById('connectCalendarBtnLarge');
  
  if (googleCalendarConnected) {
    connectBtn.style.display = 'none';
    connectBtnLarge.style.display = 'none';
  } else {
    connectBtn.style.display = 'flex';
    connectBtnLarge.style.display = 'block';
  }
}

// Save meetings data back to file
async function saveMeetingsData() {
  // Save to localStorage as a backup
  localStorage.setItem('meetingsData', JSON.stringify(meetingsData));

  // Save to the actual file using IPC
  try {
    console.log('Saving meetings data to file...');
    const result = await window.electronAPI.saveMeetingsData(meetingsData);
    if (result.success) {
      console.log('Meetings data saved successfully to file');
    } else {
      console.error('Failed to save meetings data to file:', result.error);
    }
  } catch (error) {
    console.error('Error saving meetings data to file:', error);
  }
}

// Keep track of which meeting is being edited
let currentEditingMeetingId = null;

// Function to save the current note
async function saveCurrentNote() {
  const editorElement = document.getElementById('simple-editor');
  const noteTitleElement = document.getElementById('noteTitle');

  // Early exit if elements aren't available
  if (!editorElement || !noteTitleElement) {
    console.warn('Cannot save note: Editor elements not found');
    return;
  }

  // Early exit if no current meeting ID
  if (!currentEditingMeetingId) {
    console.warn('Cannot save note: No active meeting ID');
    return;
  }
  
  // Don't save if in transcript mode
  if (currentViewMode === 'transcript') {
    console.log('In transcript view, not saving transcript as content');
    return;
  }

  // Get title text, defaulting to "New Note" if empty
  const noteTitle = noteTitleElement.textContent.trim() || 'New Note';

  // Set title back to element in case it was empty
  if (!noteTitleElement.textContent.trim()) {
    noteTitleElement.textContent = noteTitle;
  }

  // Find which meeting is currently active by ID
  const activeMeeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === currentEditingMeetingId);

  if (activeMeeting) {
    console.log(`Saving note with ID: ${currentEditingMeetingId}, Title: ${noteTitle}`);

    // Get the current content from the editor
    const content = editorElement.value;
    console.log(`Note content length: ${content.length} characters`);

    // Update the title and content in the meeting object
    activeMeeting.title = noteTitle;
    activeMeeting.content = content;

    // Update the data arrays directly to make sure they stay in sync
    const pastIndex = meetingsData.pastMeetings.findIndex(m => m.id === currentEditingMeetingId);
    if (pastIndex !== -1) {
      meetingsData.pastMeetings[pastIndex].title = noteTitle;
      meetingsData.pastMeetings[pastIndex].content = content;
      console.log('Updated meeting in pastMeetings array');
    }

    const upcomingIndex = meetingsData.upcomingMeetings.findIndex(m => m.id === currentEditingMeetingId);
    if (upcomingIndex !== -1) {
      meetingsData.upcomingMeetings[upcomingIndex].title = noteTitle;
      meetingsData.upcomingMeetings[upcomingIndex].content = content;
      console.log('Updated meeting in upcomingMeetings array');
    }

    // Also update the subtitle if it's a date-based one
    const dateObj = new Date(activeMeeting.date);
    if (dateObj) {
      document.getElementById('noteDate').textContent = formatDate(dateObj);
    }

    try {
      // Save the data to file
      await saveMeetingsData();
      console.log('Note saved successfully:', noteTitle);
    } catch (error) {
      console.error('Error saving note:', error);
    }
  } else {
    console.error(`Cannot save note: Meeting not found with ID: ${currentEditingMeetingId}`);

    // Log all available meetings for debugging
    console.log('Available meeting IDs:', [...upcomingMeetings, ...pastMeetings].map(m => m.id).join(', '));
  }
}

// Format date for display in the note header
function formatDate(date) {
  const options = { month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

// Simple debounce function
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}



// Function to create meeting card elements
function createMeetingCard(meeting) {
  const card = document.createElement('div');
  card.className = 'meeting-card';
  card.dataset.id = meeting.id;

  let iconHtml = '';

  if (meeting.type === 'profile') {
    iconHtml = `
      <div class="profile-pic">
        <img src="https://via.placeholder.com/40" alt="Profile">
      </div>
    `;
  } else if (meeting.type === 'calendar') {
    iconHtml = `
      <div class="meeting-icon calendar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3.01 4.9 3.01 6L3 20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V10H19V20ZM19 8H5V6H19V8ZM9 14H7V12H9V14ZM13 14H11V12H13V14ZM17 14H15V12H17V14ZM9 18H7V16H9V18ZM13 18H11V16H13V18ZM17 18H15V16H17V18Z" fill="#6947BD"/>
        </svg>
      </div>
    `;
  } else if (meeting.type === 'document') {
    iconHtml = `
      <div class="meeting-icon document">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#4CAF50"/>
        </svg>
      </div>
    `;
  }

  let subtitleHtml = meeting.hasDemo
    ? `<div class="meeting-time"><a class="meeting-demo-link">${meeting.subtitle}</a></div>`
    : `<div class="meeting-time">${meeting.subtitle}</div>`;

  card.innerHTML = `
    ${iconHtml}
    <div class="meeting-content">
      <div class="meeting-title">${meeting.title}</div>
      ${subtitleHtml}
    </div>
    <div class="meeting-actions">
      <button class="delete-meeting-btn" data-id="${meeting.id}" title="Delete note">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  `;

  return card;
}

// Function to show home view
function showHomeView() {
  document.getElementById('homeView').style.display = 'block';
  document.getElementById('editorView').style.display = 'none';
  document.getElementById('backButton').style.display = 'none';
  document.getElementById('newNoteBtn').style.display = 'block';
  document.getElementById('toggleSidebar').style.display = 'none';

  // Show Record Meeting button and set its state based on meeting detection
  const joinMeetingBtn = document.getElementById('joinMeetingBtn');
  if (joinMeetingBtn) {
    // Always show the button
    joinMeetingBtn.style.display = 'block';
    joinMeetingBtn.innerHTML = 'Record Meeting';

    // Enable/disable based on meeting detection
    if (window.meetingDetected) {
      joinMeetingBtn.disabled = false;
    } else {
      joinMeetingBtn.disabled = true;
    }
  }
}

// Function to show editor view
function showEditorView(meetingId) {
  console.log(`Showing editor view for meeting ID: ${meetingId}`);

  // Make the views visible/hidden
  document.getElementById('homeView').style.display = 'none';
  document.getElementById('editorView').style.display = 'block';
  document.getElementById('backButton').style.display = 'block';
  document.getElementById('newNoteBtn').style.display = 'none';
  document.getElementById('toggleSidebar').style.display = 'none'; // Hide the sidebar toggle

  // Always hide the join meeting button when in editor view
  const joinMeetingBtn = document.getElementById('joinMeetingBtn');
  if (joinMeetingBtn) {
    joinMeetingBtn.style.display = 'none';
  }

  // Find the meeting in either upcoming or past meetings
  let meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);

  if (!meeting) {
    console.error(`Meeting not found: ${meetingId}`);
    return;
  }

  // Set the current editing meeting ID
  currentEditingMeetingId = meetingId;
  console.log(`Now editing meeting: ${meetingId} - ${meeting.title}`);



  // Set the meeting title
  document.getElementById('noteTitle').textContent = meeting.title;

  // Set the date display
  const dateObj = new Date(meeting.date);
  document.getElementById('noteDate').textContent = formatDate(dateObj);

  // Get the editor element
  const editorElement = document.getElementById('simple-editor');

  // Important: Reset the editor content completely
  if (editorElement) {
    editorElement.value = '';
  }

  // Reset view mode to summary
  currentViewMode = 'summary';
  const viewToggle = document.getElementById('viewToggle');
  if (viewToggle) {
    viewToggle.checked = false;
  }

  // Add a small delay to ensure the DOM has updated before setting content
  setTimeout(() => {
    if (meeting.content) {
      editorElement.value = meeting.content;
      console.log(`Loaded content for meeting: ${meetingId}, length: ${meeting.content.length} characters`);
    } else {
      // If content is missing, create template
      const now = new Date();
      const template = `# Meeting Title\n• ${meeting.title}\n\n# Meeting Date and Time\n• ${now.toLocaleString()}\n\n# Participants\n• \n\n# Description\n• \n\nChat with meeting transcript: `;
      editorElement.value = template;

      // Save this template to the meeting
      meeting.content = template;
      saveMeetingsData();
      console.log(`Created new template for meeting: ${meetingId}`);
    }

    // If there's transcript data, make sure it's available for the transcript toggle
    if (meeting.transcript && meeting.transcript.length > 0) {
      console.log(`Found ${meeting.transcript.length} transcript entries for meeting: ${meetingId}`);
    }

    // Set up toggle handler
    setupViewToggle(meeting);

    // Set up auto-save handler for this specific note
    setupAutoSaveHandler();

    // Add event listener to the title
    setupTitleEditing();

    // Check if this note has an active recording and update the record button
    checkActiveRecordingState();

    // Update debug panel with any available data if it's open
    const debugPanel = document.getElementById('debugPanel');
    if (debugPanel && !debugPanel.classList.contains('hidden')) {
      // Update transcript if available
      if (meeting.transcript && meeting.transcript.length > 0) {
        updateDebugTranscript(meeting.transcript);
      } else {
        // Clear transcript area if no transcript
        const transcriptContent = document.getElementById('transcriptContent');
        if (transcriptContent) {
          transcriptContent.innerHTML = `
            <div class="placeholder-content">
              <p>No transcript available yet</p>
            </div>
          `;
        }
      }

      // Update participants if available
      if (meeting.participants && meeting.participants.length > 0) {
        updateDebugParticipants(meeting.participants);
      } else {
        // Clear participants area if no participants
        const participantsContent = document.getElementById('participantsContent');
        if (participantsContent) {
          participantsContent.innerHTML = `
            <div class="placeholder-content">
              <p>No participants detected yet</p>
            </div>
          `;
        }
      }

      // Reset video preview when changing notes
      const videoContent = document.getElementById('videoContent');
      if (videoContent) {
        videoContent.innerHTML = `
          <div class="placeholder-content video-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" fill="#999"/>
            </svg>
            <p>Video preview will appear here</p>
          </div>
        `;
      }
    }
  }, 50);
}

// Setup the title editing and save function
function setupTitleEditing() {
  const titleElement = document.getElementById('noteTitle');

  // Remove existing event listeners if any
  titleElement.removeEventListener('blur', titleBlurHandler);
  titleElement.removeEventListener('keydown', titleKeydownHandler);

  // Add event listeners
  titleElement.addEventListener('blur', titleBlurHandler);
  titleElement.addEventListener('keydown', titleKeydownHandler);
}

// Event handler for title blur
async function titleBlurHandler() {
  await saveCurrentNote();
}

// Event handler for title keydown
function titleKeydownHandler(e) {
  if (e.key === 'Enter') {
    e.preventDefault(); // Prevent new line
    e.target.blur(); // Remove focus to trigger save
  }
}

// Create a single reference to the auto-save handler to ensure we can remove it properly
let currentAutoSaveHandler = null;


// Function to set up auto-save handler
function setupAutoSaveHandler() {
  // Create a debounced auto-save handler
  const autoSaveHandler = debounce(async () => {
    // Don't auto-save in transcript mode
    if (currentViewMode === 'transcript') {
      console.log('In transcript view, skipping auto-save');
      return;
    }
    
    console.log('Auto-saving note due to content change');
    if (currentEditingMeetingId) {
      console.log(`Auto-save triggered for meeting: ${currentEditingMeetingId}`);
      await saveCurrentNote();
    } else {
      console.warn('Cannot auto-save: No active meeting ID');
    }
  }, 1000);

  // First remove any existing handler
  if (currentAutoSaveHandler) {
    const editorElement = document.getElementById('simple-editor');
    if (editorElement) {
      console.log('Removing existing auto-save handler');
      editorElement.removeEventListener('input', currentAutoSaveHandler);
    }
  }

  // Store the reference for future cleanup
  currentAutoSaveHandler = autoSaveHandler;

  // Get the editor element and attach the new handler
  const editorElement = document.getElementById('simple-editor');
  if (editorElement) {
    editorElement.addEventListener('input', autoSaveHandler);
    console.log(`Set up editor auto-save handler for meeting: ${currentEditingMeetingId || 'none'}`);

    // Manually trigger a save once to ensure the content is saved
    setTimeout(() => {
      console.log('Triggering initial save after setup');
      editorElement.dispatchEvent(new Event('input'));
    }, 500);
  } else {
    console.warn('Editor element not found for auto-save setup');
  }
}

// Function to create a new meeting
async function createNewMeeting() {
  console.log('Creating new note...');

  // Save any existing note before creating a new one
  if (currentEditingMeetingId) {
    await saveCurrentNote();
    console.log('Saved current note before creating new one');
  }

  // Reset the current editing ID to ensure we start fresh
  currentEditingMeetingId = null;

  // Generate a unique ID
  const id = 'meeting-' + Date.now();
  console.log('Generated new meeting ID:', id);

  // Current date and time
  const now = new Date();

  // Generate the template for the content
  const template = `# Meeting Title\n• New Note\n\n# Meeting Date and Time\n• ${now.toLocaleString()}\n\n# Participants\n• \n\n# Description\n• \n\nChat with meeting transcript: `;

  // Create a new meeting object - ensure it's of type document
  const newMeeting = {
    id: id,
    type: 'document', // Explicitly set as document type, not calendar
    title: 'New Note',
    subtitle: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    hasDemo: false,
    date: now.toISOString(),
    participants: [],
    content: template // Set the content directly
  };

  // Log what we're adding
  console.log(`Adding new meeting: id=${id}, title=${newMeeting.title}, content.length=${template.length}`);

  // Add to pastMeetings - make sure to push to both arrays
  pastMeetings.unshift(newMeeting);
  meetingsData.pastMeetings.unshift(newMeeting);

  // Update the grouped meetings
  const dateKey = formatDateHeader(newMeeting.date);
  if (!pastMeetingsByDate[dateKey]) {
    pastMeetingsByDate[dateKey] = [];
  }
  pastMeetingsByDate[dateKey].unshift(newMeeting);

  // Save the data to file
  try {
    await saveMeetingsData();
    console.log('New meeting created and saved:', newMeeting.title);
  } catch (error) {
    console.error('Error saving new meeting:', error);
  }

  // Set current editing ID to the new meeting ID BEFORE showing the editor
  currentEditingMeetingId = id;
  console.log('Set currentEditingMeetingId to:', id);

  // Force a reset of the editor before showing the new meeting
  const editorElement = document.getElementById('simple-editor');
  if (editorElement) {
    editorElement.value = '';
  }

  // Now show the editor view with the new meeting
  showEditorView(id);

  // Automatically start recording for the new note
  try {
    console.log('Auto-starting recording for new note');
    // Start manual recording for the new note
    window.electronAPI.startManualRecording(id)
      .then(result => {
        if (result.success) {
          console.log('Auto-started recording for new note with ID:', result.recordingId);
          // Update recording button UI
          window.isRecording = true;
          window.currentRecordingId = result.recordingId;

          // Update recording button UI
          const recordButton = document.getElementById('recordButton');
          if (recordButton) {
            const recordIcon = recordButton.querySelector('.record-icon');
            const stopIcon = recordButton.querySelector('.stop-icon');

            recordButton.classList.add('recording');
            recordIcon.style.display = 'none';
            stopIcon.style.display = 'block';
          }
        } else {
          console.error('Failed to auto-start recording:', result.error);
        }
      })
      .catch(error => {
        console.error('Error auto-starting recording:', error);
      });
  } catch (error) {
    console.error('Exception auto-starting recording:', error);
  }

  return id;
}

// Function to render meetings to the page
function renderMeetings() {
  // Get the main content container
  const mainContent = document.querySelector('.main-content .content-container');
  
  // Only clear and recreate the notes section, preserve upcoming meetings section
  let notesSection = mainContent.querySelector('.meetings-section:not(#upcoming-section)');
  
  if (notesSection) {
    // Remove existing notes section
    notesSection.remove();
  }
  
  // Create new notes section
  notesSection = document.createElement('section');
  notesSection.className = 'meetings-section';
  notesSection.innerHTML = `
    <h2 class="section-title">Meeting Notes</h2>
    <div class="meetings-list" id="notes-list"></div>
  `;
  mainContent.appendChild(notesSection);

  // Get the notes container
  const notesContainer = notesSection.querySelector('#notes-list');

  // Add all meetings to the notes section (both upcoming and past)
  const allMeetings = [...upcomingMeetings, ...pastMeetings];

  // Sort by date, newest first
  allMeetings.sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });

  // Filter out calendar entries and add only document type meetings to the container
  allMeetings
    .filter(meeting => meeting.type !== 'calendar') // Skip calendar entries
    .forEach(meeting => {
      notesContainer.appendChild(createMeetingCard(meeting));
    });
}

// Load meetings data from file
async function loadMeetingsDataFromFile() {
  console.log("Loading meetings data from file...");
  try {
    const result = await window.electronAPI.loadMeetingsData();
    console.log("Load result success:", result.success);

    if (result.success) {
      console.log(`Got data with ${result.data.pastMeetings?.length || 0} past meetings`);
      if (result.data.pastMeetings && result.data.pastMeetings.length > 0) {
        console.log("Most recent meeting:", result.data.pastMeetings[0].id, result.data.pastMeetings[0].title);
      }

      // Initialize arrays if they don't exist in the loaded data
      if (!result.data.upcomingMeetings) {
        result.data.upcomingMeetings = [];
      }

      if (!result.data.pastMeetings) {
        result.data.pastMeetings = [];
      }

      // Update the meetings data objects
      Object.assign(meetingsData, result.data);

      // Clear and reassign the references
      upcomingMeetings.length = 0;
      pastMeetings.length = 0;

      console.log("Before updating arrays, pastMeetings count:", pastMeetings.length);

      // Filter out calendar entries when loading data
      meetingsData.upcomingMeetings
        .filter(meeting => meeting.type !== 'calendar')
        .forEach(meeting => upcomingMeetings.push(meeting));

      meetingsData.pastMeetings
        .filter(meeting => meeting.type !== 'calendar')
        .forEach(meeting => pastMeetings.push(meeting));

      console.log("After updating arrays, pastMeetings count:", pastMeetings.length);
      if (pastMeetings.length > 0) {
        console.log("First past meeting:", pastMeetings[0].id, pastMeetings[0].title);
      }

      // Regroup past meetings by date
      pastMeetingsByDate = {};
      meetingsData.pastMeetings.forEach(meeting => {
        const dateKey = formatDateHeader(meeting.date);
        if (!pastMeetingsByDate[dateKey]) {
          pastMeetingsByDate[dateKey] = [];
        }
        pastMeetingsByDate[dateKey].push(meeting);
      });

      console.log('Meetings data loaded from file');

      // Re-render the meetings
      renderMeetings();
    } else {
      console.error('Failed to load meetings data from file:', result.error);
    }
  } catch (error) {
    console.error('Error loading meetings data from file:', error);
  }
}

// Function to update the transcript section in the debug panel
function updateDebugTranscript(transcript) {
  const transcriptContent = document.getElementById('transcriptContent');
  if (!transcriptContent) return;

  // Check if user was at bottom before clearing content
  const wasAtBottom = transcriptContent.scrollTop + transcriptContent.clientHeight >= transcriptContent.scrollHeight - 5;

  // Clear previous content
  transcriptContent.innerHTML = '';

  if (!transcript || transcript.length === 0) {
    // Show placeholder if no transcript is available
    transcriptContent.innerHTML = `
      <div class="placeholder-content">
        <p>No transcript available yet</p>
      </div>
    `;
    return;
  }

  // Create transcript entries
  const transcriptDiv = document.createElement('div');
  transcriptDiv.className = 'transcript-entries';

  // Add each transcript entry
  transcript.forEach((entry, index) => {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'transcript-entry';

    // Format timestamp
    const timestamp = new Date(entry.timestamp);
    const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Create HTML for this entry
    entryDiv.innerHTML = `
      <div class="transcript-speaker">${entry.speaker || 'Unknown'}</div>
      <div class="transcript-text">${entry.text}</div>
      <div class="transcript-timestamp">${formattedTime}</div>
    `;

    // Add a highlight class for the newest entry
    if (index === transcript.length - 1) {
      entryDiv.classList.add('newest-entry');
    }

    transcriptDiv.appendChild(entryDiv);
  });

  transcriptContent.appendChild(transcriptDiv);

  // Only auto-scroll to bottom if user was at the bottom before the update
  if (wasAtBottom) {
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      transcriptContent.scrollTop = transcriptContent.scrollHeight;
    }, 0);
  }
}

// Function to update the main note content with transcript
function updateMainNoteWithTranscript(meeting) {
  const editorElement = document.getElementById('simple-editor');
  if (!editorElement) {
    console.log('Editor element not found');
    return;
  }
  
  if (!meeting.transcript || meeting.transcript.length === 0) {
    console.log('No transcript data available for meeting:', meeting.id);
    return;
  }

  console.log(`Updating main note with transcript: ${meeting.transcript.length} entries`);

  // Format transcript for display in the main editor
  let transcriptText = '';
  
  // Add header
  transcriptText += '# Meeting Transcript\n\n';
  
  // Add each transcript entry
  meeting.transcript.forEach((entry, index) => {
    const timestamp = new Date(entry.timestamp);
    const timeString = timestamp.toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    
    transcriptText += `**${entry.speaker}** (${timeString}): ${entry.text}\n\n`;
  });

  // Update the editor content
  editorElement.value = transcriptText;
  
  // Auto-scroll to bottom to show latest content
  editorElement.scrollTop = editorElement.scrollHeight;
  
  console.log('Updated main note content with transcript');
}

// Function to generate summary from transcript after meeting ends
async function generateSummaryFromTranscript(meeting) {
  try {
    console.log('Generating summary from transcript for meeting:', meeting.id);
    
    // Format the transcript into a single text for the AI to process
    const transcriptText = meeting.transcript.map(entry => 
      `${entry.speaker}: ${entry.text}`
    ).join('\n');

    // Format detected participants if available
    let participantsText = "";
    if (meeting.participants && meeting.participants.length > 0) {
      participantsText = "Detected participants:\n" + meeting.participants.map(p =>
        `- ${p.name}${p.isHost ? ' (Host)' : ''}`
      ).join('\n') + "\n\n";
    }

    // Define a system prompt to guide the AI's response with a specific format
    const systemMessage =
      "You are an AI assistant that summarizes meeting transcripts. " +
      "You MUST format your response using the following structure:\n\n" +
      "# Participants\n" +
      "- [List all participants mentioned in the transcript]\n\n" +
      "# Summary\n" +
      "- [Key discussion point 1]\n" +
      "- [Key discussion point 2]\n" +
      "- [Key decisions made]\n" +
      "- [Include any important deadlines or dates mentioned]\n\n" +
      "# Action Items\n" +
      "- [Action item 1] - [Responsible person if mentioned]\n" +
      "- [Action item 2] - [Responsible person if mentioned]\n" +
      "- [Add any other action items discussed]\n\n" +
      "Stick strictly to this format with these exact section headers. Keep each bullet point concise but informative.";

    // Prepare the messages array for the API
    const messages = [
      { role: "system", content: systemMessage },
      { 
        role: "user", 
        content: `Please summarize this meeting transcript:\n\n${participantsText}${transcriptText}` 
      }
    ];

    // Call the OpenAI API
    const response = await window.electronAPI.chatWithOpenAI(messages);
    
    if (response && response.content) {
      // Update the meeting content with the generated summary
      meeting.content = response.content;
      
      // Update the editor if this meeting is currently being edited
      if (currentEditingMeetingId === meeting.id) {
        const editorElement = document.getElementById('simple-editor');
        if (editorElement) {
          editorElement.value = response.content;
        }
      }
      
      // Save the updated meeting data
      await saveMeetingsData();
      
      console.log('Successfully generated summary from transcript');
    } else {
      console.error('Failed to generate summary from transcript');
    }
  } catch (error) {
    console.error('Error generating summary from transcript:', error);
  }
}

// Function to update the video preview in the debug panel
function updateDebugVideoPreview(frameData) {
  // Get the image data from the frame
  const { buffer, participantId, participantName, frameType } = frameData;

  // Determine if this is a screenshare or participant video
  const isScreenshare = frameType !== 'webcam';

  if (isScreenshare) {
    updateScreensharePreview(frameData);
  } else {
    updateParticipantVideoPreview(frameData);
  }

  // Make sure debug panel toggle shows new content notification if panel is closed
  const debugPanel = document.getElementById('debugPanel');
  if (debugPanel && debugPanel.classList.contains('hidden')) {
    const debugPanelToggle = document.getElementById('debugPanelToggle');
    if (debugPanelToggle && !debugPanelToggle.classList.contains('has-new-content')) {
      debugPanelToggle.classList.add('has-new-content');
    }
  }
}

// Function to update participant video preview
function updateParticipantVideoPreview(frameData) {
  const videoContent = document.getElementById('videoContent');
  if (!videoContent) return;

  const { buffer, participantId, participantName, frameType } = frameData;

  // Check if we already have a container for this participant
  let participantVideoContainer = document.getElementById(`video-participant-${participantId}`);

  // If no container exists, create one
  if (!participantVideoContainer) {
    // Clear the placeholder content if this is the first frame
    if (videoContent.querySelector('.placeholder-content')) {
      videoContent.innerHTML = '';
    }

    // Create a container for this participant's video
    participantVideoContainer = document.createElement('div');
    participantVideoContainer.id = `video-participant-${participantId}`;
    participantVideoContainer.className = 'video-participant-container';

    // Add the name label
    const nameLabel = document.createElement('div');
    nameLabel.className = 'video-participant-name';
    nameLabel.textContent = participantName;
    participantVideoContainer.appendChild(nameLabel);

    // Create an image element for the video frame
    const videoImg = document.createElement('img');
    videoImg.className = 'video-frame';
    videoImg.id = `video-frame-${participantId}`;
    participantVideoContainer.appendChild(videoImg);

    // Add the frame type label
    const typeLabel = document.createElement('div');
    typeLabel.className = 'video-frame-type';
    typeLabel.textContent = 'Camera';
    participantVideoContainer.appendChild(typeLabel);

    // Add to the video content area
    videoContent.appendChild(participantVideoContainer);
  }

  // Update the image with the new frame
  const videoImg = document.getElementById(`video-frame-${participantId}`);
  if (videoImg) {
    videoImg.src = `data:image/png;base64,${buffer}`;
  }
}

// Function to update screenshare preview
function updateScreensharePreview(frameData) {
  const screenshareContent = document.getElementById('screenshareContent');
  if (!screenshareContent) return;

  const { buffer, participantId, participantName, frameType } = frameData;

  // Check if we already have a container for this screenshare
  let screenshareContainer = document.getElementById(`screenshare-participant-${participantId}`);

  // If no container exists, create one
  if (!screenshareContainer) {
    // Clear the placeholder content if this is the first frame
    if (screenshareContent.querySelector('.placeholder-content')) {
      screenshareContent.innerHTML = '';
    }

    // Create a container for this participant's screenshare
    screenshareContainer = document.createElement('div');
    screenshareContainer.id = `screenshare-participant-${participantId}`;
    screenshareContainer.className = 'video-participant-container';

    // Create an image element for the screenshare frame
    const screenshareImg = document.createElement('img');
    screenshareImg.className = 'video-frame';
    screenshareImg.id = `screenshare-frame-${participantId}`;
    screenshareContainer.appendChild(screenshareImg);

    // Add the frame type label
    const typeLabel = document.createElement('div');
    typeLabel.className = 'video-frame-type';
    typeLabel.textContent = 'Screen';
    screenshareContainer.appendChild(typeLabel);

    // Add to the screenshare content area
    screenshareContent.appendChild(screenshareContainer);
  }

  // Update the image with the new frame
  const screenshareImg = document.getElementById(`screenshare-frame-${participantId}`);
  if (screenshareImg) {
    screenshareImg.src = `data:image/png;base64,${buffer}`;
  }
}

// Function to update the participants section in the debug panel
function updateDebugParticipants(participants) {
  const participantsContent = document.getElementById('participantsContent');
  if (!participantsContent) return;

  // Clear previous content
  participantsContent.innerHTML = '';

  if (!participants || participants.length === 0) {
    // Show placeholder if no participants are available
    participantsContent.innerHTML = `
      <div class="placeholder-content">
        <p>No participants detected yet</p>
      </div>
    `;
    return;
  }

  // Create participants list
  const participantsList = document.createElement('div');
  participantsList.className = 'participants-list';

  // Add each participant
  participants.forEach(participant => {
    const participantDiv = document.createElement('div');
    participantDiv.className = 'participant-entry';

    participantDiv.innerHTML = `
      <div class="participant-avatar">
        <svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" rx="20" fill="#f0f0f0"/>
          <path d="M20 20C22.7614 20 25 17.7614 25 15C25 12.2386 22.7614 10 20 10C17.2386 10 15 12.2386 15 15C15 17.7614 17.2386 20 20 20Z" fill="#a0a0a0"/>
          <path d="M12 31C12 26.0294 15.5817 22 20 22C24.4183 22 28 26.0294 28 31" stroke="#a0a0a0" stroke-width="4"/>
        </svg>
      </div>
      <div class="participant-name">${participant.name || 'Unknown'}</div>
      <div class="participant-status">${participant.status || 'Active'}</div>
    `;

    participantsList.appendChild(participantDiv);
  });

  participantsContent.appendChild(participantsList);
}

// Function to initialize the debug panel
function initDebugPanel() {
  const debugPanelToggle = document.getElementById('debugPanelToggle');
  const debugPanel = document.getElementById('debugPanel');
  const closeDebugPanelBtn = document.getElementById('closeDebugPanelBtn');

  // Set up toggle button for the debug panel
  if (debugPanelToggle && debugPanel) {
    debugPanelToggle.addEventListener('click', () => {
      // Toggle the debug panel visibility
      if (debugPanel.classList.contains('hidden')) {
        debugPanel.classList.remove('hidden');
        document.querySelector('.app-container').classList.add('debug-panel-open');

        // Update the toggle button position and remove any notification indicators
        debugPanelToggle.style.right = '50%';
        debugPanelToggle.classList.remove('has-new-content');
        debugPanelToggle.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7.99 11H20v2H7.99v3L4 12l3.99-4v3z" fill="currentColor"/>
          </svg>
        `;

        // If there's an active meeting, refresh the debug panels with latest data
        if (currentEditingMeetingId) {
          const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === currentEditingMeetingId);
          if (meeting) {
            // Update transcript if available
            if (meeting.transcript && meeting.transcript.length > 0) {
              updateDebugTranscript(meeting.transcript);
            } else {
              // Clear transcript area if no transcript
              const transcriptContent = document.getElementById('transcriptContent');
              if (transcriptContent) {
                transcriptContent.innerHTML = `
                  <div class="placeholder-content">
                    <p>No transcript available yet</p>
                  </div>
                `;
              }
            }

            // Update participants if available
            if (meeting.participants && meeting.participants.length > 0) {
              updateDebugParticipants(meeting.participants);
            } else {
              // Clear participants area if no participants
              const participantsContent = document.getElementById('participantsContent');
              if (participantsContent) {
                participantsContent.innerHTML = `
                  <div class="placeholder-content">
                    <p>No participants detected yet</p>
                  </div>
                `;
              }
            }

            // Reset video preview when opening debug panel
            const videoContent = document.getElementById('videoContent');
            if (videoContent) {
              videoContent.innerHTML = `
                <div class="placeholder-content video-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" fill="#999"/>
                  </svg>
                  <p>Video preview will appear here</p>
                </div>
              `;
            }
          }
        }
      } else {
        debugPanel.classList.add('hidden');
        document.querySelector('.app-container').classList.remove('debug-panel-open');

        // Reset the toggle button position
        debugPanelToggle.style.right = '0';
        debugPanelToggle.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" fill="currentColor"/>
          </svg>
        `;
      }
    });
  }

  // Set up close button for the debug panel
  if (closeDebugPanelBtn && debugPanel) {
    closeDebugPanelBtn.addEventListener('click', () => {
      debugPanel.classList.add('hidden');
      // Restore the editorView to full width
      document.querySelector('.app-container').classList.remove('debug-panel-open');

      // Reset the toggle button position and icon
      const debugPanelToggle = document.getElementById('debugPanelToggle');
      if (debugPanelToggle) {
        debugPanelToggle.style.right = '0';
        debugPanelToggle.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" fill="currentColor"/>
          </svg>
        `;
      }
    });
  }

  // Set up clear button for the logger section
  const clearLoggerBtn = document.getElementById('clearLoggerBtn');
  if (clearLoggerBtn) {
    clearLoggerBtn.addEventListener('click', () => {
      sdkLogger.clear();
    });
  }
}

// SDK Logger functions
const sdkLogger = {
  logs: [],
  maxLogs: 100,

  // Initialize the logger
  init() {
    // Listen for logs from the main process
    window.sdkLoggerBridge?.onSdkLog(logEntry => {
      // Add an origin flag to logs created in this renderer to prevent duplicates
      if (!logEntry.originatedFromRenderer) {
        this.addLogEntry(logEntry);
      }
    });

    // Log initialization
    this.log('SDK Logger initialized', 'info');
  },

  // Log an API call
  logApiCall(method, params = {}) {
    const logEntry = {
      type: 'api-call',
      method,
      params,
      timestamp: new Date()
    };

    // Send to main process
    this._sendToMainProcess(logEntry);

    // Add to local logs
    this.addLogEntry(logEntry);
  },

  // Log an event
  logEvent(eventType, data = {}) {
    const logEntry = {
      type: 'event',
      eventType,
      data,
      timestamp: new Date()
    };

    // Send to main process
    this._sendToMainProcess(logEntry);

    // Add to local logs
    this.addLogEntry(logEntry);
  },

  // Log an error
  logError(errorType, message) {
    const logEntry = {
      type: 'error',
      errorType,
      message,
      timestamp: new Date()
    };

    // Send to main process
    this._sendToMainProcess(logEntry);

    // Add to local logs
    this.addLogEntry(logEntry);
  },

  // Log a generic message
  log(message, level = 'info') {
    const logEntry = {
      type: level,
      message,
      timestamp: new Date()
    };

    // Send to main process
    this._sendToMainProcess(logEntry);

    // Add to local logs
    this.addLogEntry(logEntry);
  },

  // Helper to send logs to main process
  _sendToMainProcess(logEntry) {
    if (window.sdkLoggerBridge?.sendSdkLog) {
      // Mark this log entry as originating from this renderer to prevent duplicates
      const markedLogEntry = { ...logEntry, originatedFromRenderer: true };
      window.sdkLoggerBridge.sendSdkLog(markedLogEntry);
    }
  },

  // Add a log entry to the UI and internal array
  addLogEntry(entry) {
    // Add to internal logs array
    this.logs.push(entry);

    // Trim logs if we have too many
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Add to UI
    const loggerContent = document.getElementById('sdkLoggerContent');
    if (loggerContent) {
      const logElement = document.createElement('div');
      logElement.className = `sdk-log-entry ${entry.type}`;

      const timestamp = document.createElement('div');
      timestamp.className = 'timestamp';
      timestamp.textContent = this.formatTimestamp(entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp));
      logElement.appendChild(timestamp);

      // Format content based on log type
      let content = '';

      switch (entry.type) {
        case 'api-call':
          content = `<span class="method">RecallAiSdk.${entry.method}()</span>`;
          if (entry.params && Object.keys(entry.params).length > 0) {
            content += `<div class="params">${this.formatParams(entry.params)}</div>`;
          }
          break;

        case 'event':
          content = `<span class="event-type">Event: ${entry.eventType}</span>`;
          if (entry.data && Object.keys(entry.data).length > 0) {
            content += `<div class="params">${this.formatParams(entry.data)}</div>`;
          }
          break;

        case 'error':
          content = `<span class="error-type">Error: ${entry.errorType}</span>`;
          if (entry.message) {
            content += `<div class="params">${entry.message}</div>`;
          }
          break;

        default:
          content = entry.message;
      }

      logElement.innerHTML += content;

      // Add to the top of the log
      loggerContent.insertBefore(logElement, loggerContent.firstChild);

      // Only auto-scroll to top if user is already at the top
      const isAtTop = loggerContent.scrollTop <= 5;
      if (isAtTop) {
        loggerContent.scrollTop = 0;
      }
    }
  },

  // Clear all logs
  clear() {
    this.logs = [];
    const loggerContent = document.getElementById('sdkLoggerContent');
    if (loggerContent) {
      loggerContent.innerHTML = '';
    }
  },

  // Format timestamp to readable string
  formatTimestamp(date) {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  },

  // Format parameters object to JSON string
  formatParams(params) {
    try {
      return JSON.stringify(params, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;');
    } catch (e) {
      return String(params);
    }
  }
};

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM content loaded, loading data from file...');

  // Initialize the SDK Logger
  sdkLogger.init();

  // Initialize the debug panel
  initDebugPanel();

  // Try to load the latest data from file - this is the only data source
  await loadMeetingsDataFromFile();

  // Render meetings only after loading from file
  console.log('Data loaded, rendering meetings...');
  renderMeetings();

  // Initially show home view
  showHomeView();

  // Initialize Google Calendar after a small delay to ensure DOM is ready
  console.log('Initializing Google Calendar integration...');
  setTimeout(async () => {
    await checkGoogleCalendarAuth();
    console.log('Google Calendar initialization complete');
  }, 100);

  // Set up left panel action buttons
  setupLeftPanelActions();

  // Set up Google Calendar event listeners
  const connectBtn = document.getElementById('connectCalendarBtn');
  const connectBtnLarge = document.getElementById('connectCalendarBtnLarge');
  const moreUpcomingBtn = document.getElementById('moreUpcomingBtn');
  const authModal = document.getElementById('authModal');
  const authModalCancel = document.getElementById('authModalCancel');
  const authModalSubmit = document.getElementById('authModalSubmit');
  const authCodeInput = document.getElementById('authCodeInput');

  if (connectBtn) {
    connectBtn.addEventListener('click', connectGoogleCalendar);
  }

  if (connectBtnLarge) {
    connectBtnLarge.addEventListener('click', connectGoogleCalendar);
  }

  if (moreUpcomingBtn) {
    moreUpcomingBtn.addEventListener('click', () => {
      showAllUpcomingMeetings = !showAllUpcomingMeetings;
      loadUpcomingMeetings();
    });
  }

  if (authModalCancel) {
    authModalCancel.addEventListener('click', () => {
      authModal.style.display = 'none';
      authCodeInput.value = '';
    });
  }

  if (authModalSubmit) {
    authModalSubmit.addEventListener('click', async () => {
      const code = authCodeInput.value.trim();
      if (code) {
        try {
          const result = await window.electronAPI.authorizeGoogleCalendar(code);
          if (result.success) {
            authModal.style.display = 'none';
            authCodeInput.value = '';
            googleCalendarConnected = true;
            await loadUpcomingMeetings();
            updateCalendarButtonVisibility();
          } else {
            alert('Authorization failed. Please try again.');
          }
        } catch (error) {
          console.error('Error authorizing:', error);
          alert('An error occurred during authorization.');
        }
      }
    });
  }

  // Listen for meeting detection status updates
  window.electronAPI.onMeetingDetectionStatus((data) => {
    console.log('Meeting detection status update:', data);
    const joinMeetingBtn = document.getElementById('joinMeetingBtn');

    // Store the meeting detection state globally
    window.meetingDetected = data.detected;

    if (joinMeetingBtn) {
      // Only update button state if we're in the home view
      const inHomeView = document.getElementById('homeView').style.display !== 'none';

      if (inHomeView) {
        // Always show the button, but enable/disable based on meeting detection
        joinMeetingBtn.style.display = 'block';
        joinMeetingBtn.disabled = !data.detected;
      }
    }
  });

  // Listen for requests to open a meeting note (from notification click)
  window.electronAPI.onOpenMeetingNote((meetingId) => {
    console.log('Received request to open meeting note:', meetingId);

    // Ensure we have the latest data before showing the note
    loadMeetingsDataFromFile().then(() => {
      console.log('Data refreshed, checking for meeting ID:', meetingId);

      // Log the list of available meeting IDs to help with debugging
      console.log('Available meeting IDs:', pastMeetings.map(m => m.id));

      // Verify the meeting exists in our data
      const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);

      if (meeting) {
        console.log('Found meeting to open:', meeting.title);
        setTimeout(() => {
          showEditorView(meetingId);
        }, 200); // Add a small delay to ensure UI is ready
      } else {
        console.error('Meeting not found with ID:', meetingId);
        // Attempt to reload data again after a delay
        setTimeout(() => {
          console.log('Retrying data load after delay...');
          loadMeetingsDataFromFile().then(() => {
            const retryMeeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
            if (retryMeeting) {
              console.log('Found meeting on second attempt:', retryMeeting.title);
              showEditorView(meetingId);
            } else {
              console.error('Meeting still not found after retry. Available meetings:',
                pastMeetings.map(m => `${m.id}: ${m.title}`));
            }
          });
        }, 1500);
      }
    });
  });

  // Listen for recording completed events
  window.electronAPI.onRecordingCompleted((meetingId) => {
    console.log('Recording completed for meeting:', meetingId);
    // If this note is currently being edited, reload its content
    if (currentEditingMeetingId === meetingId) {
      loadMeetingsDataFromFile().then(() => {
        // Refresh the editor with the updated content
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting) {
          // Update the editor with the latest content (summary will be generated by main process)
          document.getElementById('simple-editor').value = meeting.content;
          console.log('Updated editor with meeting content after recording completion');
        }
      });
    }
  });

  // Listen for video frame events
  window.electronAPI.onVideoFrame((data) => {
    // Only handle video frames for the currently open meeting
    if (data.noteId === currentEditingMeetingId) {
      console.log(`Video frame received for participant: ${data.participantName}`);

      // Update the video preview in the debug panel
      updateDebugVideoPreview(data);
    }
  });

  // Listen for participants update events
  window.electronAPI.onParticipantsUpdated((meetingId) => {
    console.log('Participants updated for meeting:', meetingId);

    // If this note is currently being edited, refresh the data
    // and update the debug panel's participants section
    if (currentEditingMeetingId === meetingId) {
      loadMeetingsDataFromFile().then(() => {
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting && meeting.participants && meeting.participants.length > 0) {
          // Log the latest participant
          const latestParticipant = meeting.participants[meeting.participants.length - 1];
          console.log(`Participant updated: ${latestParticipant.name}`);

          // Update the participants area in the debug panel
          updateDebugParticipants(meeting.participants);

          // Show notification about new participant if debug panel is closed
          const debugPanel = document.getElementById('debugPanel');
          if (debugPanel && debugPanel.classList.contains('hidden')) {
            const debugPanelToggle = document.getElementById('debugPanelToggle');
            if (debugPanelToggle) {
              // Add pulse effect to show there's new content
              debugPanelToggle.classList.add('has-new-content');

              // Create a mini notification for participant join
              const miniNotification = document.createElement('div');
              miniNotification.className = 'debug-notification participant-notification';
              miniNotification.innerHTML = `
                <span class="debug-notification-title">New Participant:</span>
                <span class="debug-notification-name">${latestParticipant.name || 'Unknown'}</span>
              `;

              // Add to document
              document.body.appendChild(miniNotification);

              // Remove after a short time
              setTimeout(() => {
                miniNotification.classList.add('fade-out');
                setTimeout(() => {
                  document.body.removeChild(miniNotification);
                }, 500);
              }, 5000);
            }
          }
        }
      });
    }
  });

  // Listen for transcript update events
  window.electronAPI.onTranscriptUpdated((meetingId) => {
    console.log('Transcript updated for meeting:', meetingId);

    // If this note is currently being edited, we can refresh the data
    // and update the debug panel's transcript section
    if (currentEditingMeetingId === meetingId) {
      loadMeetingsDataFromFile().then(() => {
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting && meeting.transcript && meeting.transcript.length > 0) {
          // Log the latest transcript entry
          const latestEntry = meeting.transcript[meeting.transcript.length - 1];
          console.log(`Latest transcript: ${latestEntry.speaker}: "${latestEntry.text}"`);

          // Update the transcript area in the debug panel
          updateDebugTranscript(meeting.transcript);

          // Only update the main note content with transcript if transcript view is selected
          if (currentViewMode === 'transcript') {
            updateMainNoteWithTranscript(meeting);
          }

          // Show notification about new transcript if debug panel is closed
          const debugPanel = document.getElementById('debugPanel');
          if (debugPanel && debugPanel.classList.contains('hidden')) {
            const debugPanelToggle = document.getElementById('debugPanelToggle');
            if (debugPanelToggle) {
              // Add pulse effect to show there's new content
              debugPanelToggle.classList.add('has-new-content');

              // Create a mini notification if we're recording
              if (window.isRecording) {
                const miniNotification = document.createElement('div');
                miniNotification.className = 'debug-notification transcript-notification';
                miniNotification.innerHTML = `
                  <span class="debug-notification-speaker">${latestEntry.speaker || 'Unknown'}</span>:
                  <span class="debug-notification-text">${latestEntry.text.slice(0, 40)}${latestEntry.text.length > 40 ? '...' : ''}</span>
                `;

                // Add to document
                document.body.appendChild(miniNotification);

                // Remove after a short time
                setTimeout(() => {
                  miniNotification.classList.add('fade-out');
                  setTimeout(() => {
                    document.body.removeChild(miniNotification);
                  }, 500);
                }, 5000);
              }
            }
          }
        }
      });
    }
  });

  // Listen for summary generation events
  window.electronAPI.onSummaryGenerated((meetingId) => {
    console.log('Summary generated for meeting:', meetingId);

    // If this note is currently being edited, refresh the content
    if (currentEditingMeetingId === meetingId) {
      loadMeetingsDataFromFile().then(() => {
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting) {
          // Update the editor with the new content containing the summary
          document.getElementById('simple-editor').value = meeting.content;
        }
      });
    }
  });

  // Listen for streaming summary updates
  window.electronAPI.onSummaryUpdate((data) => {
    const { meetingId, content, timestamp } = data;

    // If this note is currently being edited, update the content immediately
    if (currentEditingMeetingId === meetingId) {
      // Get the editor element
      const editorElement = document.getElementById('simple-editor');

      // Update the editor with the latest streamed content
      // Use requestAnimationFrame for smoother updates that don't block the main thread
      requestAnimationFrame(() => {
        editorElement.value = content;

        // Force the editor to scroll to the bottom to follow the new text
        // This creates a better experience of watching text appear
        editorElement.scrollTop = editorElement.scrollHeight;
      });
    }
  });

  // Add event listeners for buttons
  document.querySelector('.new-note-btn').addEventListener('click', async () => {
    console.log('New note button clicked');
    await createNewMeeting();
  });

  // Join Meeting button handler
  document.getElementById('joinMeetingBtn').addEventListener('click', async () => {
    console.log('Join Meeting button clicked');

    // Get the button element
    const joinButton = document.getElementById('joinMeetingBtn');

    // Show loading state
    const originalText = joinButton.textContent;
    joinButton.disabled = true;
    joinButton.innerHTML = `
      <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;">
        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Joining...
    `;

    // First check if there's a detected meeting
    if (window.electronAPI.checkForDetectedMeeting) {
      try {
        const hasDetectedMeeting = await window.electronAPI.checkForDetectedMeeting();
        if (hasDetectedMeeting) {
          console.log('Found detected meeting, joining...');
          await window.electronAPI.joinDetectedMeeting();
          // Keep button disabled as we're navigating to a different view
        } else {
          console.log('No active meeting detected');

          // Reset button state
          joinButton.disabled = false;
          joinButton.textContent = originalText;

          // Show a little toast message
          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.textContent = 'No active meeting detected';
          document.body.appendChild(toast);

          // Remove toast after 3 seconds
          setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
              document.body.removeChild(toast);
            }, 300);
          }, 3000);
        }
      } catch (error) {
        console.error('Error joining meeting:', error);

        // Reset button state
        joinButton.disabled = false;
        joinButton.textContent = originalText;

        // Show error toast
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = 'Error joining meeting';
        document.body.appendChild(toast);

        // Remove toast after 3 seconds
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => {
            document.body.removeChild(toast);
          }, 300);
        }, 3000);
      }
    } else {
      // Fallback for direct call
      try {
        await window.electronAPI.joinDetectedMeeting();
        // Keep button disabled as we're navigating to a different view
      } catch (error) {
        console.error('Error joining meeting:', error);

        // Reset button state
        joinButton.disabled = false;
        joinButton.textContent = originalText;
      }
    }
  });

  document.querySelector('.search-input').addEventListener('input', (e) => {
    console.log('Search query:', e.target.value);
    // TODO: Implement search functionality
  });

  // Add click event delegation for meeting cards and their actions
  document.querySelector('.main-content').addEventListener('click', (e) => {
    // Check if delete button was clicked
    if (e.target.closest('.delete-meeting-btn')) {
      e.stopPropagation(); // Prevent opening the note
      const deleteBtn = e.target.closest('.delete-meeting-btn');
      const meetingId = deleteBtn.dataset.id;

      if (confirm('Are you sure you want to delete this note? This cannot be undone.')) {
        console.log('Deleting meeting:', meetingId);

        // Show loading state
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = `<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`;

        // Use the main process deletion via IPC
        window.electronAPI.deleteMeeting(meetingId)
          .then(result => {
            if (result.success) {
              console.log('Meeting deleted successfully on server');

              // After successful server deletion, update local data
              // Remove from local pastMeetings array
              const pastMeetingIndex = pastMeetings.findIndex(meeting => meeting.id === meetingId);
              if (pastMeetingIndex !== -1) {
                pastMeetings.splice(pastMeetingIndex, 1);
              }

              // Remove from meetingsData as well
              const pastDataIndex = meetingsData.pastMeetings.findIndex(meeting => meeting.id === meetingId);
              if (pastDataIndex !== -1) {
                meetingsData.pastMeetings.splice(pastDataIndex, 1);
              }

              // Also check upcomingMeetings
              const upcomingMeetingIndex = upcomingMeetings.findIndex(meeting => meeting.id === meetingId);
              if (upcomingMeetingIndex !== -1) {
                upcomingMeetings.splice(upcomingMeetingIndex, 1);
              }

              const upcomingDataIndex = meetingsData.upcomingMeetings.findIndex(meeting => meeting.id === meetingId);
              if (upcomingDataIndex !== -1) {
                meetingsData.upcomingMeetings.splice(upcomingDataIndex, 1);
              }

              // Update the grouped meetings
              pastMeetingsByDate = {};
              meetingsData.pastMeetings.forEach(meeting => {
                const dateKey = formatDateHeader(meeting.date);
                if (!pastMeetingsByDate[dateKey]) {
                  pastMeetingsByDate[dateKey] = [];
                }
                pastMeetingsByDate[dateKey].push(meeting);
              });

              // Re-render the meetings list
              renderMeetings();
            } else {
              // Server side deletion failed
              console.error('Server deletion failed:', result.error);
              alert('Failed to delete note: ' + (result.error || 'Unknown error'));
            }
          })
          .catch(error => {
            console.error('Error deleting meeting:', error);
            alert('Failed to delete note: ' + (error.message || 'Unknown error'));
          })
          .finally(() => {
            // Reset button state whether success or failure
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
            </svg>`;
          });
      }
      return;
    }

    // Find the meeting card that was clicked (for opening)
    const card = e.target.closest('.meeting-card');
    if (card) {
      const meetingId = card.dataset.id;
      showEditorView(meetingId);
    }
  });

  // Back button event listener
  document.getElementById('backButton').addEventListener('click', async () => {
    // Save content before going back to home
    await saveCurrentNote();
    showHomeView();
    renderMeetings(); // Refresh the meeting list
  });

  // Set up the initial auto-save handler
  setupAutoSaveHandler();

  // Toggle sidebar button with initial state
  const toggleSidebarBtn = document.getElementById('toggleSidebar');
  const sidebar = document.getElementById('sidebar');
  const editorContent = document.querySelector('.editor-content');
  const chatInputContainer = document.querySelector('.chat-input-container');

  // Start with sidebar hidden
  sidebar.classList.add('hidden');
  editorContent.classList.add('full-width');
  chatInputContainer.style.display = 'none';

  toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
    editorContent.classList.toggle('full-width');

    // Show/hide chat input with sidebar
    if (sidebar.classList.contains('hidden')) {
      chatInputContainer.style.display = 'none';
    } else {
      chatInputContainer.style.display = 'block';
    }
  });

  // Chat input handling
  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendButton');

  // When send button is clicked
  sendButton.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message) {
      console.log('Sending message:', message);
      // Here you would handle the AI chat functionality
      // For now, just clear the input
      chatInput.value = '';
    }
  });

  // Send message on Enter key
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendButton.click();
    }
  });

  // Handle share buttons
  const shareButtons = document.querySelectorAll('.share-btn');
  shareButtons.forEach(button => {
    button.addEventListener('click', () => {
      const action = button.textContent.trim();
      console.log(`Share action: ${action}`);
      // Implement actual sharing functionality here
    });
  });

  // Handle AI option buttons
  const aiButtons = document.querySelectorAll('.ai-btn');
  aiButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const action = button.textContent.trim();
      console.log(`AI action: ${action}`);

      // Handle different AI actions
      if (action === 'Generate meeting summary') {
        if (!currentEditingMeetingId) {
          alert('No meeting is currently open');
          return;
        }

        // Show loading state
        const originalText = button.textContent;
        button.textContent = 'Generating summary...';
        button.disabled = true;

        try {
          // Use streaming version instead of standard version
          console.log('Starting streaming summary generation');

          // Log the summary generation request to the SDK logger
          sdkLogger.log('Requesting AI summary generation for meeting: ' + currentEditingMeetingId);

          window.electronAPI.generateMeetingSummaryStreaming(currentEditingMeetingId)
            .then(result => {
              if (result.success) {
                console.log('Summary generated successfully (streaming)');
              } else {
                console.error('Failed to generate summary:', result.error);
                alert('Failed to generate summary: ' + result.error);
              }
            })
            .catch(error => {
              console.error('Error generating summary:', error);
              alert('Error generating summary: ' + (error.message || error));
            })
            .finally(() => {
              // Reset button state
              button.textContent = originalText;
              button.disabled = false;
            });
        } catch (error) {
          console.error('Error starting streaming summary generation:', error);
          alert('Error starting summary generation: ' + (error.message || error));

          // Reset button state
          button.textContent = originalText;
          button.disabled = false;
        }
      } else if (action === 'List action items') {
        alert('List action items functionality coming soon');
      } else if (action === 'Write follow-up email') {
        alert('Write follow-up email functionality coming soon');
      } else if (action === 'List Q&A') {
        alert('List Q&A functionality coming soon');
      }
    });
  });

  // UI variables will be initialized when the recording button is set up

  // Listen for recording state change events
  window.electronAPI.onRecordingStateChange((data) => {
    console.log('Recording state change received:', data);

    // If this state change is for the current note, update the UI
    if (data.noteId === currentEditingMeetingId) {
      console.log('Updating recording button for current note');
      const isActive = data.state === 'recording' || data.state === 'paused';
      updateRecordingButtonUI(isActive, isActive ? data.recordingId : null);
    }
  });

  // Setup record/stop button toggle
  const recordButton = document.getElementById('recordButton');
  if (recordButton) {

    recordButton.addEventListener('click', async () => {
      // Only allow recording if we're in a note
      if (!currentEditingMeetingId) {
        alert('You need to be in a note to start recording');
        return;
      }

      window.isRecording = !window.isRecording;

      // Get the elements inside the button
      const recordIcon = recordButton.querySelector('.record-icon');
      const stopIcon = recordButton.querySelector('.stop-icon');

      if (window.isRecording) {
        try {
          // Start recording
          console.log('Starting manual recording for meeting:', currentEditingMeetingId);
          recordButton.disabled = true; // Temporarily disable to prevent double-clicks

          // Change to stop mode immediately for better feedback
          recordButton.classList.add('recording');
          recordIcon.style.display = 'none';
          stopIcon.style.display = 'block';

          // Call the API to start recording
          const result = await window.electronAPI.startManualRecording(currentEditingMeetingId);
          recordButton.disabled = false;

          if (result.success) {
            console.log('Manual recording started with ID:', result.recordingId);
            window.currentRecordingId = result.recordingId;

            // Show a little toast message
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = 'Recording started...';
            document.body.appendChild(toast);

            // Remove toast after 3 seconds
            setTimeout(() => {
              toast.style.opacity = '0';
              setTimeout(() => {
                document.body.removeChild(toast);
              }, 300);
            }, 3000);
          } else {
            // If starting failed, revert UI
            console.error('Failed to start recording:', result.error);
            alert('Failed to start recording: ' + result.error);
            window.isRecording = false;
            recordButton.classList.remove('recording');
            recordIcon.style.display = 'block';
            stopIcon.style.display = 'none';
          }
        } catch (error) {
          // Handle errors
          console.error('Error starting recording:', error);
          alert('Error starting recording: ' + (error.message || error));

          // Reset UI state
          window.isRecording = false;
          recordButton.classList.remove('recording');
          recordIcon.style.display = 'block';
          stopIcon.style.display = 'none';
          recordButton.disabled = false;
        }
      } else {
        // Stop recording
        if (window.currentRecordingId) {
          try {
            console.log('Stopping manual recording:', window.currentRecordingId);
            recordButton.disabled = true; // Temporarily disable

            // Call the API to stop recording
            const result = await window.electronAPI.stopManualRecording(window.currentRecordingId);

            // Change to record mode
            recordButton.classList.remove('recording');
            recordIcon.style.display = 'block';
            stopIcon.style.display = 'none';
            recordButton.disabled = false;

            if (result.success) {
              console.log('Manual recording stopped successfully');

              // Show a little toast message
              const toast = document.createElement('div');
              toast.className = 'toast';
              toast.textContent = 'Recording stopped. Generating summary...';
              document.body.appendChild(toast);

              // Remove toast after 3 seconds
              setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => {
                  document.body.removeChild(toast);
                }, 300);
              }, 3000);

              // The recording-completed event handler will take care of refreshing the content
              // and generating the summary when the recording finishes processing

            } else {
              console.error('Failed to stop recording:', result.error);
              alert('Failed to stop recording: ' + result.error);
            }

            // Reset recording ID
            window.currentRecordingId = null;
          } catch (error) {
            console.error('Error stopping recording:', error);
            alert('Error stopping recording: ' + (error.message || error));
            recordButton.disabled = false;
          }
        } else {
          console.warn('No active recording ID found');
          // Reset UI anyway
          recordButton.classList.remove('recording');
          recordIcon.style.display = 'block';
          stopIcon.style.display = 'none';
        }
      }
    });
  }

  // Handle generate notes button (Auto button)
  const generateButton = document.querySelector('.generate-btn');
  if (generateButton) {
    generateButton.addEventListener('click', async () => {
      console.log('Generating AI summary from transcript...');

      // Check if we have an active meeting
      if (!currentEditingMeetingId) {
        alert('No meeting is currently open');
        return;
      }

      // Store the original HTML content (including the sparkle icon)
      const originalHTML = generateButton.innerHTML;

      // Show loading state - but keep the same structure
      generateButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 4px;">
          <path d="M208,512a24.84,24.84,0,0,1-23.34-16l-39.84-103.6a16.06,16.06,0,0,0-9.19-9.19L32,343.34a25,25,0,0,1,0-46.68l103.6-39.84a16.06,16.06,0,0,0,9.19-9.19L184.66,144a25,25,0,0,1,46.68,0l39.84,103.6a16.06,16.06,0,0,0,9.19,9.19l103,39.63A25.49,25.49,0,0,1,400,320.52a24.82,24.82,0,0,1-16,22.82l-103.6,39.84a16.06,16.06,0,0,0-9.19,9.19L231.34,496A24.84,24.84,0,0,1,208,512Z" fill="currentColor"/>
          <path d="M88,176a14.67,14.67,0,0,1-13.69-9.4L57.45,122.76a7.28,7.28,0,0,0-4.21-4.21L9.4,101.69a14.67,14.67,0,0,1,0-27.38L53.24,57.45a7.31,7.31,0,0,0,4.21-4.21L74.16,9.79A15,15,0,0,1,86.23.11,14.67,14.67,0,0,1,101.69,9.4l16.86,43.84a7.31,7.31,0,0,0,4.21,4.21L166.6,74.31a14.67,14.67,0,0,1,0,27.38l-43.84,16.86a7.28,7.28,0,0,0-4.21,4.21L101.69,166.6A14.67,14.67,0,0,1,88,176Z" fill="currentColor"/>
          <path d="M400,256a16,16,0,0,1-14.93-10.26l-22.84-59.37a8,8,0,0,0-4.6-4.6l-59.37-22.84a16,16,0,0,1,0-29.86l59.37-22.84a8,8,0,0,0,4.6-4.6L384.9,42.68a16.45,16.45,0,0,1,13.17-10.57,16,16,0,0,1,16.86,10.15l22.84,59.37a8,8,0,0,0,4.6,4.6l59.37,22.84a16,16,0,0,1,0,29.86l-59.37,22.84a8,8,0,0,0-4.6,4.6l-22.84,59.37A16,16,0,0,1,400,256Z" fill="currentColor"/>
        </svg>
        Generating...
      `;
      generateButton.disabled = true;

      try {
        // Use streaming version for better user experience
        console.log('Starting streaming summary generation');

        // Log the Auto button summary generation to the SDK logger
        sdkLogger.log('Auto button: Requesting AI summary generation for meeting: ' + currentEditingMeetingId);

        const result = await window.electronAPI.generateMeetingSummaryStreaming(currentEditingMeetingId);

        if (result.success) {
          console.log('Summary generated successfully (streaming)');
          // Show a little toast message
          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.textContent = 'Summary generated successfully!';
          document.body.appendChild(toast);

          // Remove toast after 3 seconds
          setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
              document.body.removeChild(toast);
            }, 300);
          }, 3000);
        } else {
          console.error('Failed to generate summary:', result.error);
          alert('Failed to generate summary: ' + result.error);
        }
      } catch (error) {
        console.error('Error generating summary:', error);
        alert('Error generating summary: ' + (error.message || error));
      } finally {
        // Reset button state with the original HTML (including sparkle icon)
        generateButton.innerHTML = originalHTML;
        generateButton.disabled = false;
      }
    });
  }




  // Initialize chat functionality
  initChatFunctionality();
  initChatModal();

});

// Chat functionality
function initChatFunctionality() {
  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendButton');
  const chatMessages = document.getElementById('chatMessages');
  
  if (!chatInput || !sendButton || !chatMessages) {
    console.log('Chat elements not found, skipping chat initialization');
    return;
  }
  
  // Add message to chat
  function addMessage(content, isUser = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user' : 'assistant'}`;
    messageDiv.textContent = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Send message to OpenAI
  async function sendMessage(message) {
    try {
      // Get the current note content
      const noteContent = document.getElementById('simple-editor')?.value || '';
      
      // Add user message to chat
      addMessage(message, true);
      
      // Show loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'chat-message assistant';
      loadingDiv.textContent = 'Thinking...';
      chatMessages.appendChild(loadingDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      
      // Call OpenAI API
      const response = await window.electronAPI.chatWithOpenAI(message, noteContent);
      
      // Remove loading indicator
      chatMessages.removeChild(loadingDiv);
      
      // Add assistant response
      addMessage(response, false);
      
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove loading indicator if it exists
      const loadingDiv = chatMessages.querySelector('.chat-message.assistant:last-child');
      if (loadingDiv && loadingDiv.textContent === 'Thinking...') {
        chatMessages.removeChild(loadingDiv);
      }
      addMessage('Sorry, I encountered an error. Please try again.', false);
    }
  }
  
  // When send button is clicked
  sendButton.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message) {
      sendMessage(message);
      chatInput.value = '';
    }
  });
  
  // Send message on Enter key
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendButton.click();
    }
  });

  // Handle AI option buttons
  const aiButtons = document.querySelectorAll('.ai-btn');
  aiButtons.forEach(button => {
    button.addEventListener('click', () => {
      const prompt = button.getAttribute('data-prompt');
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });
}

// Chat Modal functionality
function initChatModal() {
  const chatBtn = document.getElementById('chatBtn');
  const chatModal = document.getElementById('chatModal');
  const chatModalClose = document.getElementById('chatModalClose');
  const chatInputModal = document.getElementById('chatInputModal');
  const sendButtonModal = document.getElementById('sendButtonModal');
  const chatMessagesModal = document.getElementById('chatMessagesModal');
  
  if (!chatBtn || !chatModal) {
    console.log('Chat modal elements not found, skipping modal initialization');
    return;
  }
  
  // Open chat modal
  chatBtn.addEventListener('click', () => {
    chatModal.style.display = 'flex';
    chatInputModal.focus();
  });
  
  // Close chat modal
  chatModalClose.addEventListener('click', () => {
    chatModal.style.display = 'none';
  });
  
  // Close modal when clicking outside
  chatModal.addEventListener('click', (e) => {
    if (e.target === chatModal) {
      chatModal.style.display = 'none';
    }
  });
  
  // Add message to modal chat
  function addMessageModal(content, isUser = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message-modal ${isUser ? 'user' : 'assistant'}`;
    messageDiv.textContent = content;
    chatMessagesModal.appendChild(messageDiv);
    
    // Scroll to bottom with smooth behavior
    setTimeout(() => {
      chatMessagesModal.scrollTop = chatMessagesModal.scrollHeight;
    }, 10);
  }
  
  // Send message from modal
  async function sendMessageModal(message) {
    try {
      // Get the current note content
      const noteContent = document.getElementById('simple-editor')?.value || '';
      
      // Add user message to chat
      addMessageModal(message, true);
      
      // Show loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'chat-message-modal assistant';
      loadingDiv.textContent = 'Thinking...';
      chatMessagesModal.appendChild(loadingDiv);
      
      // Scroll to bottom
      setTimeout(() => {
        chatMessagesModal.scrollTop = chatMessagesModal.scrollHeight;
      }, 10);
      
      // Call OpenAI API
      const response = await window.electronAPI.chatWithOpenAI(message, noteContent);
      
      // Remove loading indicator
      chatMessagesModal.removeChild(loadingDiv);
      
      // Add assistant response
      addMessageModal(response, false);
      
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove loading indicator if it exists
      const loadingDiv = chatMessagesModal.querySelector('.chat-message-modal.assistant:last-child');
      if (loadingDiv && loadingDiv.textContent === 'Thinking...') {
        chatMessagesModal.removeChild(loadingDiv);
      }
      addMessageModal('Sorry, I encountered an error. Please try again.', false);
    }
  }
  
  // Send message on button click
  sendButtonModal.addEventListener('click', () => {
    const message = chatInputModal.value.trim();
    if (message) {
      sendMessageModal(message);
      chatInputModal.value = '';
    }
  });
  
  // Send message on Enter key
  chatInputModal.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendButtonModal.click();
    }
  });

  // Handle quick action buttons in modal
  const chatQuickBtns = document.querySelectorAll('.chat-quick-btn');
  chatQuickBtns.forEach(button => {
    button.addEventListener('click', () => {
      const prompt = button.getAttribute('data-prompt');
      if (prompt) {
        sendMessageModal(prompt);
      }
    });
  });
}
