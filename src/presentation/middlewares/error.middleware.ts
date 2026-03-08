/**
 * @file error.middleware.ts
 *
 * Centralised Express error-handling middleware.
 *
 * Catches any error forwarded via `next(err)` from a route handler and maps
 * it to a structured {@link ErrorResponse} JSON payload with the appropriate
 * HTTP status code.  All domain-specific error classes from the RPC, source,
 * artifact and chat layers are handled explicitly; unknown values fall back to
 * a generic `500 InternalError` response.
 *
 * Register this middleware **last** in the Express application chain, after
 * all routers, so it can intercept errors from every route:
 *
 * ```ts
 * app.use(errorMiddleware);
 * ```
 */
import type { Request, Response, NextFunction } from "express";
import {
  RPCError,
  AuthError,
  NetworkError,
  RPCTimeoutError,
  RateLimitError,
  ServerError,
  ClientError,
} from "../../infrastructure/third-party/notebooklm/rpc/errors";
import {
  SourceError,
  SourceNotFoundError,
  SourceProcessingError,
  SourceTimeoutError,
  ArtifactError,
  ArtifactNotFoundError,
  ArtifactNotReadyError,
  ChatError,
  ValidationError,
} from "../../infrastructure/third-party/notebooklm/rpc/errors";
import { DefaultApplicationError } from "../../main/factories/error/error-factory";
import { t } from "../../i18n";

/**
 * Normalised error payload sent to the client.
 *
 * Every error response—regardless of the original error class—is serialised
 * into this shape so consumers can rely on a consistent structure.
 */
interface ErrorResponse {
  /** Machine-readable error name (e.g. `"AuthError"`, `"ValidationError"`). */
  error: string;
  /** Human-readable, i18n-translated description of what went wrong. */
  message: string;
  /** HTTP status code mirrored in the body for convenience. */
  statusCode: number;
  /** Optional extra context, present only for unrecognised `Error` instances. */
  details?: string;
}

/**
 * Constructs a normalised {@link ErrorResponse} object.
 *
 * @param statusCode - HTTP status code to send.
 * @param error      - Machine-readable error name.
 * @param message    - Translated, human-readable description.
 * @param details    - Optional raw details (e.g. the original `Error#message`).
 * @returns A fully-formed {@link ErrorResponse}.
 */
const buildErrorResponse = (
  statusCode: number,
  error: string,
  message: string,
  details?: string,
): ErrorResponse => ({
  statusCode,
  error,
  message,
  ...(details !== undefined ? { details } : {}),
});

/**
 * Maps an {@link RPCError} (or any of its subclasses) to an
 * {@link ErrorResponse}.
 *
 * Subclass priority (most-specific first):
 * `AuthError` → 401, `RateLimitError` → 429, `RPCTimeoutError` → 504,
 * `NetworkError` → 502, `ServerError` → 502, `ClientError` → 400,
 * generic `RPCError` → 500.
 *
 * @param err - The RPC-layer error to resolve.
 * @returns A normalised {@link ErrorResponse}.
 */
const resolveRpcError = (err: RPCError): ErrorResponse => {
  if (err instanceof AuthError) {
    return buildErrorResponse(401, "AuthError", t("errors.auth_expired"));
  }

  if (err instanceof RateLimitError) {
    return buildErrorResponse(429, "RateLimitError", t("errors.rate_limited"));
  }

  if (err instanceof RPCTimeoutError) {
    return buildErrorResponse(
      504,
      "RPCTimeoutError",
      t("errors.request_timeout", {
        seconds: String(err.timeoutSeconds ?? "unknown"),
      }),
    );
  }

  if (err instanceof NetworkError) {
    return buildErrorResponse(
      502,
      "NetworkError",
      t("errors.network_failed", { reason: err.message }),
    );
  }

  if (err instanceof ServerError) {
    return buildErrorResponse(502, "ServerError", t("errors.server_error"));
  }

  if (err instanceof ClientError) {
    return buildErrorResponse(400, "ClientError", t("errors.client_error"));
  }

  return buildErrorResponse(500, "RPCError", err.message);
};

/**
 * Maps a {@link SourceError} (or any of its subclasses) to an
 * {@link ErrorResponse}.
 *
 * Subclass priority: `SourceNotFoundError` → 404,
 * `SourceProcessingError` → 422, `SourceTimeoutError` → 504,
 * generic `SourceError` → 500.
 *
 * @param err - The source-layer error to resolve.
 * @returns A normalised {@link ErrorResponse}.
 */
const resolveSourceError = (err: SourceError): ErrorResponse => {
  if (err instanceof SourceNotFoundError) {
    return buildErrorResponse(
      404,
      "SourceNotFoundError",
      t("sources.not_found", { id: err.sourceId }),
    );
  }

  if (err instanceof SourceProcessingError) {
    return buildErrorResponse(
      422,
      "SourceProcessingError",
      t("sources.processing_failed", { id: err.sourceId }),
    );
  }

  if (err instanceof SourceTimeoutError) {
    return buildErrorResponse(
      504,
      "SourceTimeoutError",
      t("sources.timeout", {
        id: err.sourceId,
        seconds: String(err.timeoutSeconds),
      }),
    );
  }

  return buildErrorResponse(500, "SourceError", err.message);
};

/**
 * Maps an {@link ArtifactError} (or any of its subclasses) to an
 * {@link ErrorResponse}.
 *
 * Subclass priority: `ArtifactNotFoundError` → 404,
 * `ArtifactNotReadyError` → 409, generic `ArtifactError` → 500.
 *
 * @param err - The artifact-layer error to resolve.
 * @returns A normalised {@link ErrorResponse}.
 */
const resolveArtifactError = (err: ArtifactError): ErrorResponse => {
  if (err instanceof ArtifactNotFoundError) {
    return buildErrorResponse(
      404,
      "ArtifactNotFoundError",
      t("artifacts.not_found", { id: err.artifactId }),
    );
  }

  if (err instanceof ArtifactNotReadyError) {
    return buildErrorResponse(
      409,
      "ArtifactNotReadyError",
      t("artifacts.not_ready", { type: err.artifactType }),
    );
  }

  return buildErrorResponse(500, "ArtifactError", err.message);
};

/**
 * Top-level dispatcher: inspects `err` and delegates to the appropriate
 * typed resolver, falling back gracefully for unknown values.
 *
 * Resolution order:
 * 1. {@link ValidationError} → 400
 * 2. {@link AuthError} / {@link RPCError} subclasses → {@link resolveRpcError}
 * 3. {@link SourceError} subclasses → {@link resolveSourceError}
 * 4. {@link ArtifactError} subclasses → {@link resolveArtifactError}
 * 5. {@link ChatError} → 422
 * 6. {@link DefaultApplicationError} → uses `err.statusCode`
 * 7. Any `Error` → 500 with `details` set to the original message
 * 8. Non-Error values → generic 500
 *
 * @param err - The value thrown or passed to `next()`.
 * @returns A normalised {@link ErrorResponse}.
 */
const resolveErrorPayload = (err: unknown): ErrorResponse => {
  if (err instanceof ValidationError) {
    return buildErrorResponse(
      400,
      "ValidationError",
      t("errors.validation", { message: err.message }),
    );
  }

  if (err instanceof AuthError || err instanceof RPCError) {
    return resolveRpcError(err as RPCError);
  }

  if (err instanceof SourceError) {
    return resolveSourceError(err);
  }

  if (err instanceof ArtifactError) {
    return resolveArtifactError(err);
  }

  if (err instanceof ChatError) {
    return buildErrorResponse(422, "ChatError", err.message);
  }

  if (err instanceof DefaultApplicationError) {
    return buildErrorResponse(err.statusCode, err.name, err.messages[0] ?? err.message);
  }

  if (err instanceof Error) {
    return buildErrorResponse(500, "InternalError", t("errors.internal"), err.message);
  }

  return buildErrorResponse(500, "UnknownError", t("errors.internal"));
};

/**
 * Express 4-argument error-handling middleware.
 *
 * Receives any error forwarded via `next(err)`, resolves it to a structured
 * {@link ErrorResponse} via {@link resolveErrorPayload}, and sends the result
 * as a JSON response with the matching HTTP status code.
 *
 * The `_req` and `_next` parameters are intentionally unused — Express
 * requires all four arguments to recognise a function as an error handler.
 *
 * @param err  - The error or thrown value to handle.
 * @param _req - Express `Request` (unused).
 * @param res  - Express `Response` used to send the JSON error payload.
 * @param _next - Express `NextFunction` (unused, required by Express signature).
 *
 * @example
 * ```ts
 * // Register last in the Express app:
 * app.use(errorMiddleware);
 * ```
 */
export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const payload = resolveErrorPayload(err);
  res.status(payload.statusCode).json(payload);
};
