# Google Authentication Security Challenges

If you're getting the error **"This browser or app may not be secure"** when trying to extract your NotebookLM credentials, don't worry. This is a common issue with automated browsers. Here are the solutions.

## Why This Happens

Google detects when a browser is automated (headless/non-interactive) and blocks sign-in for security reasons. Playwright uses Chromium in a way that Google recognizes as non-human.

## Solutions (Try in Order)

### ✅ Solution 1: Retry (Often Works)

The simplest solution - just try again:

```bash
npm run auth:extract
```

Wait a few minutes and retry. Google's security blocks may have been temporary.

### ✅ Solution 2: Clear Playwright Cache

Sometimes the cached browser version has detection markers:

```bash
# Remove cached browser
rm -rf ~/.cache/ms-playwright/

# Reinstall clean browser
npx playwright install chromium

# Try again
npm run auth:extract
```

### ✅ Solution 3: Manual Playwright Codegen (Most Reliable)

Use Playwright's interactive mode. This opens a real browser where you log in normally:

```bash
npx playwright codegen --save-storage=storage_state.json https://notebooklm.google.com/
```

**Steps:**
1. Chromium opens automatically
2. Log in with your Google account
3. Complete any security challenges (2FA, etc.)
4. Wait for the NotebookLM page to load
5. Close the browser
6. `storage_state.json` is automatically created

Then set the environment variable:

```bash
export NOTEBOOKLM_STORAGE_PATH="./storage_state.json"
npm run dev
```

### ✅ Solution 4: Complete Google Security Verification

Complete security checks in your Google Account:

1. Go to https://myaccount.google.com/security-checkup
2. Review and update security settings
3. Complete any pending verification
4. Check for suspicious activity alerts
5. Wait a few minutes
6. Try `npm run auth:extract` again

### ✅ Solution 5: Disable VPN/Proxy

Google may block sign-in from certain network locations:

1. **Disable VPN/Proxy temporarily**
2. **Try a different network:**
   - Mobile hotspot
   - Different WiFi
   - Tethered phone connection
3. **Retry:**
   ```bash
   npm run auth:extract
   ```

### ✅ Solution 6: Manual Cookie Extraction

If automated methods don't work, manually copy cookies:

**Steps:**

1. Open https://notebooklm.google.com in **Chrome** or **Edge** (not Playwright)
2. Log in with your Google account
3. Press **F12** to open DevTools
4. Go to **Application** → **Cookies** → **https://notebooklm.google.com**
5. Look for these cookies and copy their **Value**:
   - `__Secure-1PSID`
   - `__Secure-3PSID`
   - `NID`
   - `HSID`
   - `SSID`

6. Create `.notebooklm-auth/storage_state.json`:

```bash
mkdir -p .notebooklm-auth
cat > .notebooklm-auth/storage_state.json << 'EOF'
{
  "cookies": [
    {
      "name": "__Secure-1PSID",
      "value": "YOUR_COOKIE_VALUE_HERE",
      "domain": ".google.com",
      "path": "/",
      "expires": 1735689600,
      "httpOnly": true,
      "secure": true,
      "sameSite": "None"
    },
    {
      "name": "NID",
      "value": "YOUR_COOKIE_VALUE_HERE",
      "domain": ".google.com",
      "path": "/",
      "expires": 1735689600,
      "httpOnly": true,
      "secure": true,
      "sameSite": "None"
    }
  ],
  "origins": [
    {
      "origin": "https://notebooklm.google.com",
      "localStorage": []
    }
  ]
}
EOF
```

7. Set environment variable:
   ```bash
   export NOTEBOOKLM_STORAGE_PATH=".notebooklm-auth/storage_state.json"
   ```

## Advanced: Use System Browser

If you have Chrome or Edge installed system-wide, use that instead:

```bash
# On Linux
google-chrome --save-storage=storage_state.json https://notebooklm.google.com

# Or use Playwright with system Chrome
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npx playwright install --with-deps
```

## Check Your Connection

Google may block access from:

- **Certain countries/regions**
- **Corporate networks with proxy**
- **VPN services**
- **Certain ISPs**

Try:

```bash
# Check if you can reach Google
curl -I https://accounts.google.com

# Check if DNS resolves
nslookup notebooklm.google.com
```

## Complete Your Google Security Setup

Go through your Google Account security:

1. **Visit Security Checkup:** https://myaccount.google.com/security-checkup
2. **Check for alerts:** https://myaccount.google.com/notifications
3. **Review sign-in activity:** https://myaccount.google.com/security
4. **Enable 2FA if not already:** https://myaccount.google.com/security (Signing in to Google)
5. **Check app access:** https://myaccount.google.com/permissions

## Still Not Working?

If none of these solutions work:

1. **File an issue** with:
   - Your OS (Linux, macOS, Windows)
   - Exact error message
   - What you've already tried
   - System details (Node version, etc.)

2. **Use the Python version** as a reference:
   ```bash
   pip install notebooklm-py
   notebooklm login
   ```

3. **Contact Google Support** if you think your account is blocked:
   - https://support.google.com/accounts/

## Comparison with Python Version

The Python version (`notebooklm-py`) uses the exact same Playwright approach:

```bash
notebooklm login  # Also may encounter security challenges
```

If the Python version works but TypeScript doesn't, it's likely an environment issue (VPN, proxy, etc.).

## Prevention for Next Time

Once you have `storage_state.json`:

1. **Back it up securely:**
   ```bash
   # Keep a backup
   cp .notebooklm-auth/storage_state.json ~/.local/share/notebooklm/backup.json
   chmod 600 ~/.local/share/notebooklm/backup.json
   ```

2. **Refresh credentials periodically:**
   ```bash
   # Every month or so
   npm run auth:extract
   ```

3. **Keep .gitignore updated:**
   ```bash
   echo ".notebooklm-auth/" >> .gitignore
   ```

## Related Documentation

- [Authentication Guide](./authentication.md)
- [POSTMAN_GUIDE.md](../POSTMAN_GUIDE.md)
- [README.md](../README.md)

## Need Help?

Check these resources:

- **Playwright Docs:** https://playwright.dev/docs/auth
- **Google Security FAQ:** https://support.google.com/accounts/answer/185833
- **NotebookLM Python Docs:** https://github.com/teng-lin/notebooklm-py/blob/main/docs/troubleshooting.md
