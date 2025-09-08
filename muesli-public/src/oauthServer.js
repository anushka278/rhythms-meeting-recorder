const http = require('http');
const url = require('url');

class OAuthCallbackServer {
  constructor() {
    this.server = null;
    this.authCode = null;
  }

  // Start a temporary server to handle OAuth callback
  async startServer() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const queryObject = url.parse(req.url, true).query;
        
        if (queryObject.code) {
          // We got the auth code!
          this.authCode = queryObject.code;
          
          // Send success response to browser
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head>
                <title>Authorization Successful</title>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  }
                  .container {
                    background: white;
                    padding: 40px;
                    border-radius: 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    text-align: center;
                    max-width: 400px;
                  }
                  h1 { color: #333; margin-bottom: 10px; }
                  p { color: #666; margin-bottom: 20px; }
                  .success-icon {
                    width: 60px;
                    height: 60px;
                    margin: 0 auto 20px;
                    background: #4CAF50;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                  .checkmark {
                    color: white;
                    font-size: 30px;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="success-icon">
                    <span class="checkmark">✓</span>
                  </div>
                  <h1>Authorization Successful!</h1>
                  <p>You can now close this window and return to Muesli.</p>
                  <p style="font-size: 12px; color: #999;">Your Google Calendar has been connected.</p>
                </div>
              </body>
            </html>
          `);
          
          // Close the server after a short delay
          setTimeout(() => {
            this.stopServer();
          }, 1000);
        } else if (queryObject.error) {
          // Authorization was denied
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head>
                <title>Authorization Failed</title>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                  }
                  .container {
                    background: white;
                    padding: 40px;
                    border-radius: 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    text-align: center;
                    max-width: 400px;
                  }
                  h1 { color: #333; margin-bottom: 10px; }
                  p { color: #666; }
                  .error-icon {
                    width: 60px;
                    height: 60px;
                    margin: 0 auto 20px;
                    background: #f44336;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                  .x-mark {
                    color: white;
                    font-size: 30px;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="error-icon">
                    <span class="x-mark">✕</span>
                  </div>
                  <h1>Authorization Failed</h1>
                  <p>Authorization was denied. Please try again.</p>
                </div>
              </body>
            </html>
          `);
          
          this.stopServer();
        }
      });

      this.server.listen(3000, 'localhost', () => {
        console.log('OAuth callback server listening on http://localhost:3000');
        resolve();
      });
    });
  }

  // Stop the server
  stopServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  // Get the auth code (waits for it to be received)
  async waitForAuthCode(timeout = 120000) { // 2 minute timeout
    const startTime = Date.now();
    
    while (!this.authCode && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const code = this.authCode;
    this.authCode = null; // Reset for next use
    return code;
  }
}

module.exports = OAuthCallbackServer;
