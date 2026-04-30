#!/bin/bash

# NotebookLM API - Quick Start Test Script
# This script helps you quickly set up and test the API

set -e

echo "🚀 NotebookLM API - Quick Start Test"
echo "===================================="
echo ""

# Check if API is running
echo "📡 Checking if API is running..."
API_URL="${API_URL:-http://localhost:3000/api/v1}"

if ! curl -s "$API_URL/health" > /dev/null; then
    echo "❌ API is not running at $API_URL"
    echo "Please start the API server first:"
    echo "  npm run dev"
    exit 1
fi

echo "✅ API is running at $API_URL"
echo ""

# Check for auth token
echo "🔑 Authentication Token"
echo "======================"
echo ""
echo "You need a NotebookLM authentication token to use the API."
echo "To get your token:"
echo "  1. Log in to https://notebooklm.google.com"
echo "  2. Open browser DevTools (F12)"
echo "  3. Go to Application > Cookies"
echo "  4. Find and copy your authentication token"
echo ""
echo "Set the token in your environment:"
echo "  export NOTEBOOKLM_AUTH_TOKEN='your-token-here'"
echo ""

if [ -z "$NOTEBOOKLM_AUTH_TOKEN" ]; then
    echo "⚠️  No NOTEBOOKLM_AUTH_TOKEN environment variable found"
    echo "Please set it before continuing"
    exit 1
fi

echo "✅ Auth token is set"
echo ""

# Test basic endpoints
echo "🧪 Running Basic Tests"
echo "====================="
echo ""

echo "1️⃣  Health Check..."
curl -s "$API_URL/health" | jq '.'
echo ""
echo "✅ Health check passed"
echo ""

echo "2️⃣  List Notebooks..."
curl -s -H "x-notebooklm-auth: $NOTEBOOKLM_AUTH_TOKEN" \
  "$API_URL/notebooks" | jq '.'
echo ""
echo "✅ Notebook listing works"
echo ""

echo "📚 Quick Commands"
echo "================="
echo ""
echo "Create a notebook:"
echo "  curl -X POST $API_URL/notebooks \\"
echo "    -H 'x-notebooklm-auth: \$NOTEBOOKLM_AUTH_TOKEN' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"title\": \"My Notebook\"}'"
echo ""

echo "List all notebooks:"
echo "  curl -H 'x-notebooklm-auth: \$NOTEBOOKLM_AUTH_TOKEN' \\"
echo "    $API_URL/notebooks"
echo ""

echo "🎉 Setup complete! You can now use Postman or curl to test the API"
echo ""
echo "📖 For detailed documentation, see POSTMAN_GUIDE.md"
