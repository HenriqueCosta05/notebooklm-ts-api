import type { Response } from "express";

/**
 * Standard envelope for a successful API response.
 *
 * @template T - The shape of the response payload.
 */
export interface SuccessResponse<T> {
  statusCode: number;
  data: T;
  message?: string;
}

/**
 * Standard envelope for a paginated list response.
 *
 * @template T - The shape of a single item in the list.
 */
export interface PaginatedResponse<T> {
  statusCode: number;
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Sends a successful JSON response with the given data payload.
 *
 * Wraps `data` in a {@link SuccessResponse} envelope and sets the HTTP status
 * code to `statusCode` (defaults to `200`).
 *
 * @template T      - The shape of the response data.
 * @param res        - Express `Response` object.
 * @param data       - Payload to include under the `data` key.
 * @param statusCode - HTTP status code to send.  Defaults to `200`.
 * @param message    - Optional human-readable message included in the envelope.
 *
 * @example
 * ```ts
 * sendSuccess(res, notebooks);
 * sendSuccess(res, notebook, 200, t("notebooks.created"));
 * ```
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string,
): void => {
  const payload: SuccessResponse<T> = {
    statusCode,
    data,
    ...(message !== undefined ? { message } : {}),
  };
  res.status(statusCode).json(payload);
};

/**
 * Sends a `201 Created` JSON response.
 *
 * Convenience wrapper around {@link sendSuccess} that always uses status
 * code `201`.  Typically called after a resource has been successfully
 * created.
 *
 * @template T   - The shape of the created resource.
 * @param res     - Express `Response` object.
 * @param data    - The newly created resource payload.
 * @param message - Optional human-readable confirmation message.
 *
 * @example
 * ```ts
 * sendCreated(res, notebook, t("notebooks.created"));
 * ```
 */
export const sendCreated = <T>(res: Response, data: T, message?: string): void =>
  sendSuccess(res, data, 201, message);

/**
 * Sends a `204 No Content` response with an empty body.
 *
 * Use this after a successful delete or any operation that has no meaningful
 * response payload.
 *
 * @param res - Express `Response` object.
 *
 * @example
 * ```ts
 * sendNoContent(res);
 * ```
 */
export const sendNoContent = (res: Response): void => {
  res.status(204).send();
};

/**
 * Sends a `200 OK` paginated list response.
 *
 * Wraps the array in a {@link PaginatedResponse} envelope that includes
 * cursor metadata (`total`, `page`, `limit`) alongside the `data` array.
 *
 * @template T  - The shape of a single item in the list.
 * @param res    - Express `Response` object.
 * @param data   - The page of items to return.
 * @param total  - Total number of items across all pages.
 * @param page   - Current page number (1-based).
 * @param limit  - Maximum number of items per page.
 *
 * @example
 * ```ts
 * sendPaginated(res, notebooks, 42, 1, 10);
 * ```
 */
export const sendPaginated = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
): void => {
  const payload: PaginatedResponse<T> = {
    statusCode: 200,
    data,
    total,
    page,
    limit,
  };
  res.status(200).json(payload);
};
