#!/bin/bash

echo "Google Calendar Credentials Installer"
echo "======================================"
echo ""
echo "After downloading credentials.json from Google Cloud Console:"
echo ""
echo "1. Place the downloaded credentials.json in this directory (muesli-public)"
echo "2. This script will install it to the correct location"
echo ""

# Check if credentials.json exists in current directory
if [ ! -f "credentials.json" ]; then
    echo "❌ credentials.json not found in current directory!"
    echo "Please download it from Google Cloud Console and place it here first."
    exit 1
fi

# Copy to app data directory
APP_DATA_DIR="$HOME/Library/Application Support/Muesli"
mkdir -p "$APP_DATA_DIR"
cp credentials.json "$APP_DATA_DIR/credentials.json"

if [ $? -eq 0 ]; then
    echo "✅ Successfully installed credentials.json to:"
    echo "   $APP_DATA_DIR/credentials.json"
    echo ""
    echo "You can now restart the app and connect Google Calendar!"
else
    echo "❌ Failed to copy credentials.json"
    exit 1
fi
