// Import styles
import './styles.css';

// Initialize the markdown editor when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize SimpleMDE Markdown Editor
  const editor = new SimpleMDE({
    element: document.getElementById('editor'),
    spellChecker: false,
    autofocus: true,
    status: false,
    toolbar: [
      'bold', 'italic', 'heading', '|', 
      'quote', 'unordered-list', 'ordered-list', '|',
      'link', 'image', '|',
      'preview', 'side-by-side', 'fullscreen',
    ],
    placeholder: 'Write your notes here...',
    initialValue: document.getElementById('editor').textContent.trim(),
  });

  // Handle sidebar toggle
  const toggleSidebarBtn = document.getElementById('toggleSidebar');
  const sidebar = document.getElementById('sidebar');
  const editorContent = document.querySelector('.editor-content');
  
  toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
    editorContent.classList.toggle('full-width');
  });

  // Handle back button
  const backButton = document.getElementById('backButton');
  backButton.addEventListener('click', () => {
    window.electronAPI.navigate('home');
  });

  // Chat functionality
  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendButton');
  const chatMessages = document.getElementById('chatMessages');
  
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
      const noteContent = editor.value();
      
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
    button.addEventListener('click', () => {
      const prompt = button.getAttribute('data-prompt');
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });
});