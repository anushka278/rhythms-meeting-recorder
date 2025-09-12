# OAuth Fixed Port Setup - Verification Guide

## ✅ Implementation Complete!

Your OAuth callback server has been successfully configured to use a fixed port (64849). Here's how to verify everything works:

## Step 1: Start ngrok tunnel

```bash
# Navigate to your project directory
cd /Users/anushkarawat/rhythms-meeting-recorder/muesli-public

# Start ngrok with the fixed port
ngrok http 64849
```

You should see output like:
```
Session Status                online
Account                       your-account (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok-free.app -> http://localhost:64849
```

## Step 2: Update your .env file (if needed)

If your ngrok URL changed, update the `.env` file:

```bash
# Edit .env file
nano .env

# Update this line with your new ngrok URL:
OAUTH_REDIRECT_URI=https://your-new-ngrok-url.ngrok-free.app
```

## Step 3: Update Google OAuth Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to APIs & Services > Credentials
3. Click on your OAuth 2.0 Client ID
4. In "Authorized redirect URIs", ensure you have:
   ```
   https://your-ngrok-url.ngrok-free.app
   ```
5. Save the changes

## Step 4: Test the OAuth flow

1. **Start your app:**
   ```bash
   npm start
   ```

2. **Check the console output** - you should see:
   ```
   🔗 OAuth redirect URI: https://your-ngrok-url.ngrok-free.app
   🌐 Local server: http://localhost:64849
   📝 Fixed port configured: 64849
   OAuth callback server listening on http://localhost:64849
   ```

3. **Test Google Calendar connection** in your app:
   - Click "Connect Google Calendar"
   - You should be redirected to Google's OAuth page
   - After authorization, you should be redirected back to your ngrok URL
   - The app should successfully receive the authorization code

## Step 5: Verify consistency

The key benefits you should now see:

1. **Port is always 64849** - No more random ports
2. **ngrok tunnel can stay running** - No need to restart it when you restart your app
3. **OAuth redirect URI is consistent** - Works reliably with Google's OAuth

## Troubleshooting

### Port already in use error:
```bash
# Find what's using port 64849
lsof -i :64849

# Kill the process if needed
lsof -ti:64849 | xargs kill
```

### ngrok URL changed:
```bash
# Update your .env file
echo "OAUTH_REDIRECT_URI=https://new-ngrok-url.ngrok-free.app" >> .env
```

### Google OAuth errors:
- Make sure the redirect URI in Google Console matches your ngrok URL exactly
- Ensure there are no trailing slashes or extra paths

## Configuration Summary

Your OAuth setup now uses:
- **Fixed Port:** 64849 (configurable via `OAUTH_CALLBACK_PORT`)
- **Redirect URI:** From `OAUTH_REDIRECT_URI` environment variable
- **Fallback:** Hardcoded values if environment variables aren't set

## Environment Variables

```env
# OAuth Configuration
OAUTH_CALLBACK_PORT=64849
OAUTH_REDIRECT_URI=https://your-ngrok-url.ngrok-free.app
```

## Success Indicators

✅ Port 64849 is consistently used  
✅ ngrok tunnel stays stable  
✅ OAuth flow completes successfully  
✅ Google Calendar connects without errors  
✅ No port conflicts or random port assignments  

---

**Note:** Keep your ngrok tunnel running during development for the best experience!
