import * as dotenv from "dotenv";

dotenv.config();

/**
 * Reads a required environment variable and throws if it is absent or empty.
 *
 * @param key - The name of the environment variable.
 * @returns The non-empty string value of the variable.
 * @throws {Error} When the variable is not set or is an empty string.
 */
const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

/**
 * Reads an optional environment variable, returning `fallback` when absent.
 *
 * @param key      - The name of the environment variable.
 * @param fallback - Value to use when the variable is not set.
 * @returns The variable's string value or `fallback`.
 */
const optionalEnv = (key: string, fallback: string): string => process.env[key] ?? fallback;

/**
 * Reads an optional environment variable and parses it as a base-10 integer.
 * Returns `fallback` when the variable is absent or cannot be parsed.
 *
 * @param key      - The name of the environment variable.
 * @param fallback - Numeric fallback when the variable is absent or invalid.
 * @returns Parsed integer or `fallback`.
 */
const optionalIntEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? fallback : parsed;
};

/**
 * Reads an optional environment variable and coerces it to a boolean.
 * Only the exact string `"true"` (case-insensitive) is treated as `true`.
 * Returns `fallback` when the variable is absent.
 *
 * @param key      - The name of the environment variable.
 * @param fallback - Boolean fallback when the variable is absent.
 * @returns `true` when the variable equals `"true"` (case-insensitive), otherwise `false` or `fallback`.
 */
const optionalBoolEnv = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw.toLowerCase() === "true";
};

/**
 * Typed application configuration resolved from environment variables.
 *
 * All fields are resolved once at startup via {@link buildConfig} and exported
 * as the immutable {@link config} singleton.
 */
export interface AppConfig {
  /** Node.js runtime environment (`"development"` | `"production"` | `"test"`). */
  nodeEnv: string;
  /** TCP port the HTTP server binds to. Defaults to `3000`. */
  port: number;
  /** Network interface the HTTP server binds to. Defaults to `"0.0.0.0"`. */
  host: string;
  /** URL prefix applied to all API routes (e.g. `"/api/v1"`). */
  apiPrefix: string;
  /** Allowed CORS origin(s). Defaults to `"*"`. */
  corsOrigin: string;
  /** Maximum milliseconds to wait for a single HTTP request before aborting. */
  requestTimeoutMs: number;
  /** Sliding window duration in milliseconds used by the rate limiter. */
  rateLimitWindowMs: number;
  /** Maximum number of requests allowed within `rateLimitWindowMs`. */
  rateLimitMax: number;
  /**
   * Absolute path to a Playwright `storage_state.json` file used to
   * authenticate against NotebookLM.  Mutually exclusive with
   * {@link notebookLmAuthJson}.  `null` when not configured.
   */
  notebookLmStoragePath: string | null;
  /**
   * Serialised Playwright storage state provided as a JSON string.
   * Mutually exclusive with {@link notebookLmStoragePath}.
   * `null` when not configured.
   */
  notebookLmAuthJson: string | null;
  /** Timeout in milliseconds for individual NotebookLM RPC calls. */
  notebookLmTimeoutMs: number;
  /** Minimum log level (`"debug"` | `"info"` | `"warn"` | `"error"`). */
  logLevel: string;
}

/**
 * Resolves all configuration values from the current process environment.
 *
 * @returns A fully-populated {@link AppConfig} object.
 */
const buildConfig = (): AppConfig => ({
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  port: optionalIntEnv("PORT", 3000),
  host: optionalEnv("HOST", "0.0.0.0"),
  apiPrefix: optionalEnv("API_PREFIX", "/api/v1"),
  corsOrigin: optionalEnv("CORS_ORIGIN", "*"),
  requestTimeoutMs: optionalIntEnv("REQUEST_TIMEOUT_MS", 30_000),
  rateLimitWindowMs: optionalIntEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMax: optionalIntEnv("RATE_LIMIT_MAX", 60),
  notebookLmStoragePath: process.env["NOTEBOOKLM_STORAGE_PATH"] ?? null,
  notebookLmAuthJson: process.env["NOTEBOOKLM_AUTH_JSON"] ?? null,
  notebookLmTimeoutMs: optionalIntEnv("NOTEBOOKLM_TIMEOUT_MS", 60_000),
  logLevel: optionalEnv("LOG_LEVEL", "info"),
});

/**
 * Immutable application configuration singleton.
 *
 * Resolved once when this module is first imported.  Import this object
 * wherever typed access to environment-driven settings is needed.
 *
 * @example
 * ```ts
 * import { config } from "../config/env";
 *
 * app.listen(config.port, config.host);
 * ```
 */
export const config: AppConfig = buildConfig();

/**
 * Asserts that at least one NotebookLM authentication source is configured.
 *
 * Call this during application startup (before handling requests) to fail
 * fast with a descriptive error rather than receiving a cryptic auth failure
 * at request time.
 *
 * @throws {Error} When neither `NOTEBOOKLM_STORAGE_PATH` nor
 *   `NOTEBOOKLM_AUTH_JSON` is set in the environment.
 *
 * @example
 * ```ts
 * requireNotebookLMAuth(); // throws early if auth is not configured
 * ```
 */
export const requireNotebookLMAuth = (): void => {
  if (!config.notebookLmStoragePath && !config.notebookLmAuthJson) {
    throw new Error(
      "NotebookLM authentication is required. " +
        "Set NOTEBOOKLM_STORAGE_PATH or NOTEBOOKLM_AUTH_JSON environment variable.",
    );
  }
};

export { requireEnv, optionalEnv, optionalIntEnv, optionalBoolEnv };
