import * as fs from "fs";
import * as path from "path";

export interface AuthCookies {
  [key: string]: string;
}

export interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface StorageState {
  cookies: StorageStateCookie[];
  origins?: unknown[];
}

const MINIMUM_REQUIRED_COOKIES = new Set(["SID"]);

const ALLOWED_COOKIE_DOMAINS = new Set([
  ".google.com",
  "notebooklm.google.com",
  ".googleusercontent.com",
]);

const GOOGLE_REGIONAL_CCTLDS = new Set([
  "com.sg", "com.au", "com.br", "com.mx", "com.ar", "com.hk",
  "com.tw", "com.my", "com.ph", "com.vn", "com.pk", "com.bd",
  "com.ng", "com.eg", "com.tr", "com.ua", "com.co", "com.pe",
  "com.sa", "com.ae", "co.uk", "co.jp", "co.in", "co.kr",
  "co.za", "co.nz", "co.id", "co.th", "co.il", "co.ve",
  "co.cr", "co.ke", "co.ug", "co.tz", "co.ma", "co.ao",
  "co.mz", "co.zw", "co.bw", "cn", "de", "fr", "it", "es",
  "nl", "pl", "ru", "ca", "be", "at", "ch", "se", "no", "dk",
  "fi", "pt", "gr", "cz", "ro", "hu", "ie", "sk", "bg", "hr",
  "si", "lt", "lv", "ee", "lu", "cl", "cat",
]);

const isGoogleDomain = (domain: string): boolean => {
  if (domain === ".google.com") return true;
  if (!domain.startsWith(".google.")) return false;
  const suffix = domain.slice(8);
  return GOOGLE_REGIONAL_CCTLDS.has(suffix);
};

const isAllowedAuthDomain = (domain: string): boolean =>
  ALLOWED_COOKIE_DOMAINS.has(domain) || isGoogleDomain(domain);

const getDefaultStoragePath = (): string => {
  const home = process.env["NOTEBOOKLM_HOME"] ?? path.join(process.env["HOME"] ?? "~", ".notebooklm");
  return path.join(home, "storage_state.json");
};

const loadStorageState = (storagePath?: string): StorageState => {
  if (storagePath) {
    if (!fs.existsSync(storagePath)) {
      throw new Error(
        `Storage file not found: ${storagePath}\nRun 'notebooklm login' to authenticate first.`
      );
    }
    return JSON.parse(fs.readFileSync(storagePath, "utf-8")) as StorageState;
  }

  const envJson = process.env["NOTEBOOKLM_AUTH_JSON"];
  if (envJson !== undefined) {
    if (!envJson.trim()) {
      throw new Error(
        "NOTEBOOKLM_AUTH_JSON environment variable is set but empty."
      );
    }
    const parsed = JSON.parse(envJson) as StorageState;
    if (!parsed || !Array.isArray(parsed.cookies)) {
      throw new Error(
        "NOTEBOOKLM_AUTH_JSON must contain valid Playwright storage state with a 'cookies' key."
      );
    }
    return parsed;
  }

  const defaultPath = getDefaultStoragePath();
  if (!fs.existsSync(defaultPath)) {
    throw new Error(
      `Storage file not found: ${defaultPath}\nRun 'notebooklm login' to authenticate first.`
    );
  }
  return JSON.parse(fs.readFileSync(defaultPath, "utf-8")) as StorageState;
};

export const extractCookiesFromStorage = (storageState: StorageState): AuthCookies => {
  const cookies: AuthCookies = {};
  const cookieDomains: Record<string, string> = {};

  for (const cookie of storageState.cookies) {
    const domain = cookie.domain ?? "";
    const name = cookie.name;

    if (!isAllowedAuthDomain(domain) || !name) continue;

    const isBaseDomain = domain === ".google.com";
    if (!(name in cookies) || isBaseDomain) {
      cookies[name] = cookie.value ?? "";
      cookieDomains[name] = domain;
    }
  }

  const missing = [...MINIMUM_REQUIRED_COOKIES].filter((k) => !(k in cookies));
  if (missing.length > 0) {
    throw new Error(
      `Missing required cookies: ${missing.join(", ")}\nRun 'notebooklm login' to authenticate.`
    );
  }

  return cookies;
};

export const extractCsrfFromHtml = (html: string, finalUrl = ""): string => {
  const match = html.match(/"SNlM0e"\s*:\s*"([^"]+)"/);
  if (!match) {
    const isAuthRedirect =
      finalUrl.includes("accounts.google.com") ||
      finalUrl.includes("ServiceLogin") ||
      html.includes("accounts.google.com/ServiceLogin");

    if (isAuthRedirect) {
      throw new Error(
        "Authentication expired or invalid. Run 'notebooklm login' to re-authenticate."
      );
    }
    throw new Error(
      `CSRF token not found in HTML. Final URL: ${finalUrl}\nPage structure may have changed.`
    );
  }
  return match[1];
};

export const extractSessionIdFromHtml = (html: string, finalUrl = ""): string => {
  const match = html.match(/"FdrFJe"\s*:\s*"([^"]+)"/);
  if (!match) {
    const isAuthRedirect =
      finalUrl.includes("accounts.google.com") ||
      finalUrl.includes("ServiceLogin") ||
      html.includes("accounts.google.com/ServiceLogin");

    if (isAuthRedirect) {
      throw new Error(
        "Authentication expired or invalid. Run 'notebooklm login' to re-authenticate."
      );
    }
    throw new Error(
      `Session ID not found in HTML. Final URL: ${finalUrl}\nPage structure may have changed.`
    );
  }
  return match[1];
};

export const fetchTokens = async (
  cookies: AuthCookies
): Promise<{ csrfToken: string; sessionId: string }> => {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const response = await fetch("https://notebooklm.google.com/", {
    headers: { Cookie: cookieHeader },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch NotebookLM homepage: HTTP ${response.status}`);
  }

  const finalUrl = response.url;
  const html = await response.text();

  const csrfToken = extractCsrfFromHtml(html, finalUrl);
  const sessionId = extractSessionIdFromHtml(html, finalUrl);

  return { csrfToken, sessionId };
};

export class AuthTokens {
  public readonly cookies: AuthCookies;
  public csrfToken: string;
  public sessionId: string;

  constructor(cookies: AuthCookies, csrfToken: string, sessionId: string) {
    this.cookies = cookies;
    this.csrfToken = csrfToken;
    this.sessionId = sessionId;
  }

  get cookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  static async fromStorage(storagePath?: string): Promise<AuthTokens> {
    const storageState = loadStorageState(storagePath);
    const cookies = extractCookiesFromStorage(storageState);
    const { csrfToken, sessionId } = await fetchTokens(cookies);
    return new AuthTokens(cookies, csrfToken, sessionId);
  }

  static fromStorageSync(storagePath?: string): { cookies: AuthCookies; storageState: StorageState } {
    const storageState = loadStorageState(storagePath);
    const cookies = extractCookiesFromStorage(storageState);
    return { cookies, storageState };
  }
}
