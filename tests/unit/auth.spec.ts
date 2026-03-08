import {
  extractCookiesFromStorage,
  extractCsrfFromHtml,
  extractSessionIdFromHtml,
} from "../../src/infrastructure/third-party/notebooklm/auth";
import type { StorageState } from "../../src/infrastructure/third-party/notebooklm/auth";

const buildStorageState = (
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
  }>,
): StorageState => ({ cookies });

describe("extractCookiesFromStorage", () => {
  it("extracts cookies from allowed google.com domain", () => {
    const state = buildStorageState([
      { name: "SID", value: "sid-value", domain: ".google.com" },
    ]);
    const cookies = extractCookiesFromStorage(state);
    expect(cookies["SID"]).toBe("sid-value");
  });

  it("extracts cookies from notebooklm.google.com domain", () => {
    const state = buildStorageState([
      { name: "SID", value: "sid-value", domain: "notebooklm.google.com" },
    ]);
    const cookies = extractCookiesFromStorage(state);
    expect(cookies["SID"]).toBe("sid-value");
  });

  it("extracts cookies from .googleusercontent.com domain", () => {
    const state = buildStorageState([
      { name: "SID", value: "sid-value", domain: ".google.com" },
      { name: "HSID", value: "hsid-value", domain: ".googleusercontent.com" },
    ]);
    const cookies = extractCookiesFromStorage(state);
    expect(cookies["HSID"]).toBe("hsid-value");
  });

  it("ignores cookies from disallowed domains", () => {
    const state = buildStorageState([
      { name: "SID", value: "sid-value", domain: ".google.com" },
      { name: "TRACKER", value: "evil", domain: "evil.com" },
    ]);
    const cookies = extractCookiesFromStorage(state);
    expect(cookies["TRACKER"]).toBeUndefined();
  });

  it("throws when required SID cookie is missing", () => {
    const state = buildStorageState([
      { name: "HSID", value: "hsid-value", domain: ".google.com" },
    ]);
    expect(() => extractCookiesFromStorage(state)).toThrow(
      /Missing required cookies/,
    );
  });

  it("throws when cookies array is empty", () => {
    const state = buildStorageState([]);
    expect(() => extractCookiesFromStorage(state)).toThrow(
      /Missing required cookies/,
    );
  });

  it("prefers .google.com domain cookies over regional ccTLD variants", () => {
    const state = buildStorageState([
      { name: "SID", value: "regional-value", domain: ".google.co.uk" },
      { name: "SID", value: "base-value", domain: ".google.com" },
    ]);
    const cookies = extractCookiesFromStorage(state);
    expect(cookies["SID"]).toBe("base-value");
  });

  it("accepts cookies from regional google ccTLDs", () => {
    const state = buildStorageState([
      { name: "SID", value: "au-value", domain: ".google.com.au" },
    ]);
    const cookies = extractCookiesFromStorage(state);
    expect(cookies["SID"]).toBe("au-value");
  });

  it("skips cookies with empty names", () => {
    const state = buildStorageState([
      { name: "SID", value: "sid-value", domain: ".google.com" },
      { name: "", value: "something", domain: ".google.com" },
    ]);
    const cookies = extractCookiesFromStorage(state);
    expect(Object.keys(cookies)).not.toContain("");
  });

  it("returns all cookies from allowed domains", () => {
    const state = buildStorageState([
      { name: "SID", value: "sid-val", domain: ".google.com" },
      { name: "SSID", value: "ssid-val", domain: ".google.com" },
      { name: "APISID", value: "apisid-val", domain: ".google.com" },
    ]);
    const cookies = extractCookiesFromStorage(state);
    expect(cookies["SID"]).toBe("sid-val");
    expect(cookies["SSID"]).toBe("ssid-val");
    expect(cookies["APISID"]).toBe("apisid-val");
  });
});

describe("extractCsrfFromHtml", () => {
  it("extracts the CSRF token from valid HTML", () => {
    const html = `<html><body><script>var x = {"SNlM0e": "my-csrf-token-123"};</script></body></html>`;
    const token = extractCsrfFromHtml(html);
    expect(token).toBe("my-csrf-token-123");
  });

  it("handles whitespace around the colon in the SNlM0e key", () => {
    const html = `{"SNlM0e" : "spaced-token"}`;
    const token = extractCsrfFromHtml(html);
    expect(token).toBe("spaced-token");
  });

  it("throws when the CSRF token is not found", () => {
    const html = `<html><body>No token here</body></html>`;
    expect(() => extractCsrfFromHtml(html)).toThrow(
      /CSRF token not found/,
    );
  });

  it("throws an auth-specific error when redirected to Google login", () => {
    const html = `<html><body>accounts.google.com/ServiceLogin</body></html>`;
    expect(() =>
      extractCsrfFromHtml(html, "https://accounts.google.com/ServiceLogin"),
    ).toThrow(/Authentication expired/);
  });

  it("throws auth error when finalUrl contains ServiceLogin", () => {
    const html = `<html><body>Some content</body></html>`;
    expect(() =>
      extractCsrfFromHtml(html, "https://accounts.google.com/ServiceLogin?continue=x"),
    ).toThrow(/Authentication expired/);
  });

  it("throws auth error when HTML contains ServiceLogin reference", () => {
    const html = `<html>Please sign in accounts.google.com/ServiceLogin</html>`;
    expect(() => extractCsrfFromHtml(html)).toThrow(/Authentication expired/);
  });

  it("extracts token when it appears among other keys", () => {
    const html = `{"other":"value","SNlM0e":"abc-def-123","more":"stuff"}`;
    expect(extractCsrfFromHtml(html)).toBe("abc-def-123");
  });
});

describe("extractSessionIdFromHtml", () => {
  it("extracts the session ID from valid HTML", () => {
    const html = `<html><body><script>var data = {"FdrFJe": "session-id-456"};</script></body></html>`;
    const sessionId = extractSessionIdFromHtml(html);
    expect(sessionId).toBe("session-id-456");
  });

  it("handles whitespace around the colon in the FdrFJe key", () => {
    const html = `{"FdrFJe" : "spaced-session"}`;
    const sessionId = extractSessionIdFromHtml(html);
    expect(sessionId).toBe("spaced-session");
  });

  it("throws when the session ID is not found", () => {
    const html = `<html><body>No session here</body></html>`;
    expect(() => extractSessionIdFromHtml(html)).toThrow(
      /Session ID not found/,
    );
  });

  it("throws an auth-specific error when redirected to Google login", () => {
    const html = `<html><body>Please sign in</body></html>`;
    expect(() =>
      extractSessionIdFromHtml(
        html,
        "https://accounts.google.com/ServiceLogin",
      ),
    ).toThrow(/Authentication expired/);
  });

  it("throws auth error when HTML contains ServiceLogin reference", () => {
    const html = `<html>Redirecting accounts.google.com/ServiceLogin</html>`;
    expect(() => extractSessionIdFromHtml(html)).toThrow(/Authentication expired/);
  });

  it("extracts session ID when it appears among other keys", () => {
    const html = `{"SNlM0e":"csrf","FdrFJe":"real-session-id","other":"x"}`;
    expect(extractSessionIdFromHtml(html)).toBe("real-session-id");
  });

  it("works correctly when both CSRF and session tokens are present", () => {
    const html = `{"SNlM0e":"csrf-val","FdrFJe":"session-val"}`;
    expect(extractCsrfFromHtml(html)).toBe("csrf-val");
    expect(extractSessionIdFromHtml(html)).toBe("session-val");
  });
});
