# Google Calendar Setup Instructions

To connect Google Calendar to the Muesli app, you need to set up Google Calendar API credentials.

## Steps:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create a new project or select an existing one**

3. **Enable Google Calendar API**
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click on it and press "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - If prompted, configure the OAuth consent screen first:
     - Choose "External" user type
     - Fill in the required fields
     - Add your email to test users
   - For Application type, choose "Desktop app"
   - Give it a name (e.g., "Muesli Calendar Integration")
   - Click "Create"

5. **Download the credentials**
   - After creating, click the download button (JSON)
   - Save the file as `credentials.json`

6. **Place the credentials file**
   - Copy `credentials.json` to:
     - macOS: `~/Library/Application Support/muesli/credentials.json`
     - Windows: `%APPDATA%/muesli/credentials.json`
     - Linux: `~/.config/muesli/credentials.json`

7. **Restart the app and connect**
   - Restart Muesli
   - Click "Connect Google Calendar"
   - Authorize in the browser
   - Copy the authorization code and paste it in the app

## Important Notes:

- Keep your `credentials.json` file secure and never share it
- The app will store authentication tokens locally after the first authorization
- You only need to authorize once unless you revoke access

## Troubleshooting:

If you see "No credentials.json found":
- Make sure the file is in the correct location
- Ensure the file is named exactly `credentials.json`
- Check that the JSON file is valid and not corrupted

If authorization fails:
- Make sure you've enabled the Google Calendar API
- Verify you're using the correct Google account
- Check that your OAuth consent screen is configured properly
