#!/bin/bash

# NotebookLM Auth Token Extractor
# This script opens a browser and extracts authentication tokens/cookies from NotebookLM

set -e

echo "🚀 NotebookLM Auth Extractor"
echo "============================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found"
  echo "Please run this script from the project root directory"
  exit 1
fi

# Check if playwright is installed
echo "📦 Checking dependencies..."
if ! npm list playwright > /dev/null 2>&1; then
  echo "⚠️  Playwright is not installed"
  echo "Installing playwright..."
  npm install --save-dev playwright @types/playwright
  npx playwright install chromium
fi

echo "✅ Dependencies OK"
echo ""

# Run the extractor
echo "🌐 Starting auth extraction..."
echo ""
npm run auth:extract

echo ""
echo "🎉 Auth extraction complete!"
echo ""
echo "Your authentication files are saved in: .notebooklm-auth/"
echo ""
echo "To use them with the API, set the environment variable:"
echo "  export NOTEBOOKLM_STORAGE_PATH=\"$(pwd)/.notebooklm-auth/storage_state.json\""
echo ""
echo "Or add to your .env file:"
echo "  NOTEBOOKLM_STORAGE_PATH=$(pwd)/.notebooklm-auth/storage_state.json"
echo ""
