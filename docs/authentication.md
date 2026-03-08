# Authentication

NotebookLM does not expose a public API. Access relies entirely on **cookie-based session authentication** captured from a real Google session via Playwright. This document explains how authentication works end-to-end — from capturing cookies to how the library refreshes tokens automatically.

---

## Overview

Every request to NotebookLM requires three things:

| Credential | Source | Used for |
|---|---|---|
| Session cookies (e.g. `SID`, `HSID`, `SSID`) | Playwright `storage_state.json` | Identifying the Google session |
| CSRF token (`SNlM0e`) | NotebookLM homepage HTML | Signing RPC request bodies |
| Session ID (`FdrFJe`) | NotebookLM homepage HTML | Appended to RPC URL query params |

Cookies are loaded once from disk (or an environment variable). The CSRF token and session ID are fetched live from the NotebookLM homepage on every client instantiation, and again automatically whenever a request fails with an auth error.

---

## Capturing a Session

The only supported method for obtaining valid credentials is a live browser session captured with [Playwright](https://playwright.dev/).

### Step 1 — Install Playwright

```bash
npm install -D playwright
npx playwright install chromium
```

### Step 2 — Open NotebookLM and log in

```bash
npx playwright codegen \
  --save-storage=storage_state.json \
  https://notebooklm.google.com/
```

A Chromium window opens. Log in with your Google account and navigate to NotebookLM. Once you see your notebooks, close the browser. Playwright writes your session cookies to `storage_state.json`.

### Step 3 — Verify the file

The file should look like this (abbreviated):

```json
{
  "cookies": [
    {
      "name": "SID",
      "value": "g.a000...",
      "domain": ".google.com",
      "path": "/",
      "expires": 1234567890,
      "httpOnly": false,
      "secure": true,
      "sameSite": "None"
    }
  ],
  "origins": []
}
```

The required cookie `SID` must be present for the library to proceed. If it is missing, `AuthTokens.fromStorage()` throws with a descriptive error.

---

## Supplying Credentials

### Option 1 — File on disk (default)

Place the file at the default path:

```bash
mkdir -p ~/.notebooklm
cp storage_state.json ~/.notebooklm/storage_state.json
```

The library checks `NOTEBOOKLM_HOME` first, then falls back to `~/.notebooklm/storage_state.json`:

```
${NOTEBOOKLM_HOME}/storage_state.json
  or
~/.notebooklm/storage_state.json
```

### Option 2 — Custom path via environment variable

```bash
export NOTEBOOKLM_STORAGE_PATH=/secrets/notebooklm/storage_state.json
```

Pass it to the client explicitly:

```typescript
const client = await NotebookLMClient.fromStorage({
  storagePath: process.env.NOTEBOOKLM_STORAGE_PATH,
});
```

### Option 3 — Inline JSON via environment variable

Useful for Docker secrets, GitHub Actions, or any environment where writing a file is not practical:

```bash
export NOTEBOOKLM_AUTH_JSON=$(cat storage_state.json)
```

The library detects `NOTEBOOKLM_AUTH_JSON` automatically when no `storagePath` is given:

```typescript
const client = await NotebookLMClient.fromStorage(); // reads NOTEBOOKLM_AUTH_JSON
```

### Option 4 — REST API header

When using the Express HTTP server, encode the storage state as base64 and send it in every request:

```bash
AUTH=$(cat storage_state.json | base64 -w 0)
curl -H "x-notebooklm-auth: $AUTH" http://localhost:3000/api/v1/notebooks
```

The `notebookLMAuthMiddleware` decodes this header, extracts cookies, fetches fresh CSRF/session tokens, and attaches an `AuthTokens` instance to `req.notebookLMAuth` before the request reaches any controller.

---

## Cookie Filtering

Not all cookies in a Playwright storage state are safe or useful for NotebookLM. The library applies strict domain filtering to avoid leaking credentials to unintended domains and to normalise across regional Google domains.

### Allowed domains

```
.google.com
notebooklm.google.com
.googleusercontent.com
.google.<regional-cctld>  (e.g. .google.co.uk, .google.de, .google.com.br)
```

Regional ccTLD support covers 70+ country variants (AU, BR, MX, UK, JP, IN, DE, FR, IT, etc.).

### Deduplication rule

When the same cookie name appears under both `.google.com` and a regional domain (e.g. `.google.co.uk`), the base domain `.google.com` value takes precedence. This ensures consistent auth behaviour regardless of which regional Google domain the session was captured on.

### Required cookies

At minimum, `SID` must be present after filtering. If it is absent an `Error` is thrown immediately with instructions to re-authenticate.

---

## Token Extraction

After cookies are loaded, the library GETs `https://notebooklm.google.com/` with the cookie header and parses two values from the HTML response:

| Token | HTML pattern | Purpose |
|---|---|---|
| CSRF (`SNlM0e`) | `"SNlM0e":"<value>"` | Appended as `at=<value>` to every RPC request body |
| Session ID (`FdrFJe`) | `"FdrFJe":"<value>"` | Appended as `f.sid=<value>` to RPC URL query params |

If the response redirects to `accounts.google.com` (sign-in page), the library raises an `AuthError` with a clear message:

```
Authentication expired or invalid. Run 'notebooklm login' to re-authenticate.
```

---

## Automatic Token Refresh

`ClientCore` is configured with a `RefreshCallback` that re-fetches the NotebookLM homepage whenever an RPC call fails for auth-related reasons. Refresh is triggered when:

- The HTTP response status is `401` or `403`
- The decoded RPC response contains an `AuthError`
- The RPC error message contains keywords: `authentication`, `expired`, `unauthorized`, `login`, `re-authenticate`

Only one refresh is in-flight at a time. Concurrent requests that all fail due to auth share the same refresh promise (`refreshPromise`). After a successful refresh, all waiting requests are retried once with `isRetry: true` to prevent infinite retry loops.

```typescript
// Simplified internal flow in ClientCore.rpcCall()
try {
  response = await this.fetchWithTimeout(url, body);
} catch (error) {
  if (!isRetry && this.refreshCallback && isAuthError(error)) {
    return this.tryRefreshAndRetry(method, params, options, error);
  }
  throw error;
}
```

A 200ms back-off delay is applied before the retry to allow the new CSRF token to propagate.

---

## AuthTokens Class

`AuthTokens` is the central auth state object passed through every layer of the library.

```typescript
class AuthTokens {
  readonly cookies: AuthCookies;     // { SID: "...", HSID: "...", ... }
  csrfToken: string;                 // mutable — updated on refresh
  sessionId: string;                 // mutable — updated on refresh

  get cookieHeader(): string;        // "SID=...; HSID=...; SSID=..."

  static fromStorage(path?: string): Promise<AuthTokens>;
  static fromStorageSync(path?: string): { cookies, storageState };
}
```

`csrfToken` and `sessionId` are mutable properties so that `ClientCore.refreshAuth()` can update them in-place on the shared instance without creating a new object.

---

## Security Considerations

- **Never commit `storage_state.json`** to version control. Add it to `.gitignore`.
- **Rotate sessions regularly.** Google sessions expire; the library will raise an `AuthError` when that happens. Re-capture a fresh session with Playwright.
- **Scope CORS and rate limits** in production so that the `x-notebooklm-auth` header cannot be forwarded by untrusted origins.
- **Use Docker secrets or a secrets manager** (e.g. GitHub Actions secrets, AWS Secrets Manager, HashiCorp Vault) when deploying `NOTEBOOKLM_AUTH_JSON` in a container or CI environment. Never pass it as a plain build argument.
- **Download safety.** The library validates cookie domains before attaching them to download requests to prevent cookie leakage to non-Google CDN domains.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Storage file not found: ~/.notebooklm/storage_state.json` | File does not exist at the default path | Run Playwright capture and place the file at the expected path, or set `NOTEBOOKLM_STORAGE_PATH` |
| `Missing required cookies: SID` | The `SID` cookie is absent after domain filtering | Re-capture the session; ensure you are fully logged in before closing the Playwright window |
| `Authentication expired or invalid` | Session has expired on Google's side | Re-run `npx playwright codegen` to capture a fresh session |
| `NOTEBOOKLM_AUTH_JSON is set but empty` | Env var is defined but blank | Ensure the variable contains valid JSON, not an empty string |
| `Invalid storage state. The 'cookies' key is required.` | JSON is parseable but not a Playwright storage state | Verify the JSON structure contains a top-level `cookies` array |
| `CSRF token not found in HTML` | Google changed the HTML structure, or the page returned unexpectedly | Check if there is a new version of the Python reference library and update the token extraction regex |
```

Now let me create the remaining doc files: