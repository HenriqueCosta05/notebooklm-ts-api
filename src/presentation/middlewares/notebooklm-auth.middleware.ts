import type { Request, Response, NextFunction } from "express";
import { AuthTokens } from "../../infrastructure/third-party/notebooklm/auth";
import type { StorageState } from "../../infrastructure/third-party/notebooklm/auth";
import {
  extractCookiesFromStorage,
  fetchTokens,
} from "../../infrastructure/third-party/notebooklm/auth";
import { t } from "../../i18n";

declare global {
  namespace Express {
    /**
     * Augments the Express `Request` interface to carry a resolved
     * {@link AuthTokens} instance once the {@link notebookLMAuthMiddleware}
     * has successfully authenticated the incoming request.
     */
    interface Request {
      /**
       * NotebookLM authentication tokens extracted from the
       * `x-notebooklm-auth` request header.
       *
       * Present only after {@link notebookLMAuthMiddleware} has run
       * successfully.  Downstream handlers can safely assert non-null with
       * `req.notebookLMAuth!` when the middleware is applied to the route.
       */
      notebookLMAuth?: AuthTokens;
    }
  }
}

/** Name of the request header that carries the base64-encoded storage state. */
const AUTH_HEADER = "x-notebooklm-auth";

/**
 * Decodes and validates a base64-encoded Playwright `storage_state` JSON
 * string supplied via the `x-notebooklm-auth` request header.
 *
 * @param raw - Raw base64 string from the request header.
 * @returns A validated {@link StorageState} object.
 * @throws {Error} When the decoded value is not valid JSON or is missing the
 *   required `cookies` array.
 */
const parseStorageStateFromHeader = (raw: string): StorageState => {
  const decoded = Buffer.from(raw, "base64").toString("utf-8");
  const parsed = JSON.parse(decoded) as StorageState;

  if (!parsed || !Array.isArray(parsed.cookies)) {
    throw new Error(t("errors.auth_invalid_storage"));
  }

  return parsed;
};

/**
 * Express middleware that authenticates every request against NotebookLM by
 * extracting a Playwright storage state from the `x-notebooklm-auth` header.
 *
 * ### Flow
 * 1. Reads the `x-notebooklm-auth` header value (expected to be a base64-
 *    encoded Playwright `storage_state.json` payload).
 * 2. Decodes and validates the storage state JSON.
 * 3. Extracts allowed Google-domain cookies via
 *    {@link extractCookiesFromStorage}.
 * 4. Fetches fresh CSRF (`SNlM0e`) and session (`FdrFJe`) tokens from the
 *    NotebookLM homepage via {@link fetchTokens}.
 * 5. Attaches the resulting {@link AuthTokens} to `req.notebookLMAuth` and
 *    calls `next()`.
 *
 * On any failure the middleware responds immediately with `401 Unauthorized`
 * and does **not** call `next()`, preventing unauthenticated requests from
 * reaching route handlers.
 *
 * ### Header format
 * ```
 * x-notebooklm-auth: <base64(JSON.stringify(playwrightStorageState))>
 * ```
 *
 * @param req  - Express `Request`.  `req.notebookLMAuth` is set on success.
 * @param res  - Express `Response` used to send `401` on auth failure.
 * @param next - Express `NextFunction` called when authentication succeeds.
 *
 * @example
 * ```ts
 * // Apply to all /api/v1 routes in app.ts:
 * app.use(config.apiPrefix, notebookLMAuthMiddleware);
 *
 * // In a route handler, the tokens are always present after this middleware:
 * const client = new NotebookLMClient(req.notebookLMAuth!);
 * ```
 */
export const notebookLMAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const headerValue = req.headers[AUTH_HEADER];

  if (!headerValue || typeof headerValue !== "string" || !headerValue.trim()) {
    res.status(401).json({
      statusCode: 401,
      error: "Unauthorized",
      message: t("errors.unauthorized"),
    });
    return;
  }

  try {
    const storageState = parseStorageStateFromHeader(headerValue);
    const cookies = extractCookiesFromStorage(storageState);
    const { csrfToken, sessionId } = await fetchTokens(cookies);
    req.notebookLMAuth = new AuthTokens(cookies, csrfToken, sessionId);
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : t("errors.unauthorized");
    res.status(401).json({
      statusCode: 401,
      error: "AuthError",
      message,
    });
  }
};
