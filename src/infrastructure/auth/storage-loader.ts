import * as fs from 'fs';
import * as path from 'path';

interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

interface ExtractedAuth {
  timestamp: string;
  cookies: {
    [key: string]: string;
  };
  localStorage: {
    [key: string]: string;
  };
  storageState?: StorageState;
}

/**
 * Load authentication from extracted storage state file
 * @param storagePath Path to the storage_state.json file
 * @returns The storage state object
 */
export function loadStorageState(storagePath: string): StorageState {
  if (!fs.existsSync(storagePath)) {
    throw new Error(
      `Storage state file not found at ${storagePath}. Run 'npm run auth:extract' to generate it.`,
    );
  }

  const content = fs.readFileSync(storagePath, 'utf-8');
  return JSON.parse(content) as StorageState;
}

/**
 * Load authentication from extracted auth JSON file
 * @param authPath Path to the auth.json file
 * @returns The extracted auth object
 */
export function loadAuthJson(authPath: string): ExtractedAuth {
  if (!fs.existsSync(authPath)) {
    throw new Error(
      `Auth file not found at ${authPath}. Run 'npm run auth:extract' to generate it.`,
    );
  }

  const content = fs.readFileSync(authPath, 'utf-8');
  return JSON.parse(content) as ExtractedAuth;
}

/**
 * Get storage state from environment or file
 * @returns The storage state object
 */
export function getStorageState(): StorageState {
  const storagePath = process.env.NOTEBOOKLM_STORAGE_PATH;
  const authJson = process.env.NOTEBOOKLM_AUTH_JSON;

  if (authJson) {
    try {
      const parsed = JSON.parse(authJson);
      if (parsed.storageState) {
        return parsed.storageState;
      }
      // Convert from extracted format to storage state format
      return {
        cookies: Object.entries(parsed.cookies || {}).map(([name, value]) => ({
          name,
          value: value as string,
          domain: '.google.com',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: 'None' as const,
        })),
        origins: [
          {
            origin: 'https://notebooklm.google.com',
            localStorage: Object.entries(parsed.localStorage || {}).map(
              ([name, value]) => ({
                name,
                value: value as string,
              }),
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to parse NOTEBOOKLM_AUTH_JSON environment variable: ${error}`,
      );
    }
  }

  if (storagePath) {
    return loadStorageState(storagePath);
  }

  // Try default locations
  const defaultPath = path.join(
    process.cwd(),
    '.notebooklm-auth',
    'storage_state.json',
  );
  if (fs.existsSync(defaultPath)) {
    return loadStorageState(defaultPath);
  }

  throw new Error(
    'No authentication found. Please run "npm run auth:extract" to set up authentication.',
  );
}

/**
 * Get cookies as a map from storage state
 * @returns Map of cookie name to value
 */
export function getCookiesMap(storageState: StorageState): Record<
  string,
  string
> {
  const cookies: Record<string, string> = {};
  storageState.cookies.forEach((cookie) => {
    cookies[cookie.name] = cookie.value;
  });
  return cookies;
}

/**
 * Get localStorage items from storage state
 * @returns Map of localStorage key to value
 */
export function getLocalStorage(
  storageState: StorageState,
): Record<string, string> {
  const storage: Record<string, string> = {};
  storageState.origins.forEach((origin) => {
    origin.localStorage.forEach((item) => {
      storage[item.name] = item.value;
    });
  });
  return storage;
}

/**
 * Get authentication info (for display purposes)
 */
export function getAuthInfo(): {
  source: 'file' | 'env';
  path?: string;
  timestamp?: string;
} {
  const storagePath = process.env.NOTEBOOKLM_STORAGE_PATH;
  const authJson = process.env.NOTEBOOKLM_AUTH_JSON;

  if (authJson) {
    try {
      const parsed = JSON.parse(authJson);
      return {
        source: 'env',
        timestamp: parsed.timestamp,
      };
    } catch {
      return {
        source: 'env',
      };
    }
  }

  if (storagePath) {
    return {
      source: 'file',
      path: storagePath,
      timestamp: fs.statSync(storagePath).mtime.toISOString(),
    };
  }

  const defaultPath = path.join(
    process.cwd(),
    '.notebooklm-auth',
    'storage_state.json',
  );
  if (fs.existsSync(defaultPath)) {
    return {
      source: 'file',
      path: defaultPath,
      timestamp: fs.statSync(defaultPath).mtime.toISOString(),
    };
  }

  throw new Error('No authentication configured');
}
