import {
  AuthError,
  ClientError,
  RateLimitError,
  RPCError,
  ServerError,
} from "./errors";

const stripAntiXssi = (response: string): string => {
  if (!response.startsWith(")]}'")) {
    return response;
  }
  const match = response.match(/^\)\]\}'\r?\n/);
  return match ? response.slice(match[0].length) : response;
};

const parseChunkedResponse = (response: string): unknown[] => {
  if (!response || !response.trim()) {
    return [];
  }

  const chunks: unknown[] = [];
  let skippedCount = 0;
  const lines = response.trim().split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    const maybeByteCount = Number(line);
    const isNumber = !isNaN(maybeByteCount) && Number.isInteger(maybeByteCount);

    if (isNumber) {
      i++;
      if (i < lines.length) {
        try {
          const chunk = JSON.parse(lines[i]);
          chunks.push(chunk);
        } catch {
          skippedCount++;
        }
      }
      i++;
    } else {
      try {
        const chunk = JSON.parse(line);
        chunks.push(chunk);
      } catch {
        skippedCount++;
      }
      i++;
    }
  }

  if (skippedCount > 0) {
    const errorRate = skippedCount / lines.length;
    if (errorRate > 0.1) {
      throw new RPCError(
        `Response parsing failed: ${skippedCount} of ${lines.length} chunks malformed.`,
        { rawResponse: response.slice(0, 500) }
      );
    }
  }

  return chunks;
};

const collectRpcIds = (chunks: unknown[]): string[] => {
  const found: string[] = [];

  for (const chunk of chunks) {
    if (!Array.isArray(chunk)) continue;

    const items = Array.isArray(chunk[0]) ? (chunk as unknown[][]) : [chunk as unknown[]];

    for (const item of items) {
      if (!Array.isArray(item) || item.length < 2) continue;
      if ((item[0] === "wrb.fr" || item[0] === "er") && typeof item[1] === "string") {
        found.push(item[1] as string);
      }
    }
  }

  return found;
};

const containsUserDisplayableError = (obj: unknown): boolean => {
  if (typeof obj === "string") return obj.includes("UserDisplayableError");
  if (Array.isArray(obj)) return obj.some(containsUserDisplayableError);
  if (obj !== null && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).some(containsUserDisplayableError);
  }
  return false;
};

const getErrorMessageForCode = (code: number | null): [string, boolean] => {
  const messages: Record<number, [string, boolean]> = {
    400: ["Invalid request parameters. Check your input and try again.", false],
    401: ["Authentication required. Run 'notebooklm login' to re-authenticate.", false],
    403: ["Insufficient permissions for this operation.", false],
    404: ["Requested resource not found.", false],
    429: ["API rate limit exceeded. Please wait before retrying.", true],
    500: ["Server error occurred. This is usually temporary - try again later.", true],
  };

  if (code === null) return ["Unknown error occurred.", false];
  if (messages[code]) return messages[code];
  if (code >= 400 && code < 500) return [`Client error ${code}. Check your request parameters.`, false];
  if (code >= 500 && code < 600) return [`Server error ${code}. This is usually temporary - try again later.`, true];
  return [`Error code: ${code}`, false];
};

const extractRpcResult = (chunks: unknown[], rpcId: string): unknown => {
  for (const chunk of chunks) {
    if (!Array.isArray(chunk)) continue;

    const items = Array.isArray(chunk[0]) ? (chunk as unknown[][]) : [chunk as unknown[]];

    for (const item of items) {
      if (!Array.isArray(item) || item.length < 3) continue;

      if (item[0] === "er" && item[1] === rpcId) {
        const errorCode = item[2] ?? null;

        if (typeof errorCode === "number") {
          const [errorMsg] = getErrorMessageForCode(errorCode);
          throw new RPCError(errorMsg, { methodId: rpcId, rpcCode: errorCode });
        }

        throw new RPCError(String(errorCode ?? "Unknown error"), {
          methodId: rpcId,
          rpcCode: errorCode as string | number | null,
        });
      }

      if (item[0] === "wrb.fr" && item[1] === rpcId) {
        const resultData = item[2];

        if (resultData === null || resultData === undefined) {
          if (item.length > 5 && item[5] !== null && item[5] !== undefined) {
            if (containsUserDisplayableError(item[5])) {
              throw new RateLimitError(
                "API rate limit or quota exceeded. Please wait before retrying.",
                { methodId: rpcId, rpcCode: "USER_DISPLAYABLE_ERROR" }
              );
            }
          }
          return null;
        }

        if (typeof resultData === "string") {
          try {
            return JSON.parse(resultData);
          } catch {
            return resultData;
          }
        }

        return resultData;
      }
    }
  }

  return undefined;
};

export const decodeResponse = (rawResponse: string, rpcId: string, allowNull = false): unknown => {
  const cleaned = stripAntiXssi(rawResponse);
  const chunks = parseChunkedResponse(cleaned);
  const responsePreview = cleaned.length > 500 ? cleaned.slice(0, 500) : cleaned;
  const foundIds = collectRpcIds(chunks);

  let result: unknown;

  try {
    result = extractRpcResult(chunks, rpcId);
  } catch (error) {
    if (error instanceof RPCError) {
      if (!error.foundIds.length) error.foundIds = foundIds;
      if (!error.rawResponse) error.rawResponse = responsePreview;
    }
    throw error;
  }

  if ((result === null || result === undefined) && !allowNull) {
    if (foundIds.length > 0 && !foundIds.includes(rpcId)) {
      throw new RPCError(
        `No result found for RPC ID '${rpcId}'. Response contains IDs: ${foundIds.join(", ")}.`,
        { methodId: rpcId, foundIds, rawResponse: responsePreview }
      );
    }

    if (foundIds.includes(rpcId)) {
      throw new RPCError(
        `RPC ${rpcId} returned null result data (possible server error or parameter mismatch)`,
        { methodId: rpcId, foundIds, rawResponse: responsePreview }
      );
    }

    throw new RPCError(
      `No result found for RPC ID: ${rpcId} (response contained no RPC data — ${chunks.length} chunks parsed)`,
      { methodId: rpcId, rawResponse: responsePreview }
    );
  }

  return result;
};

export const isAuthStatusCode = (statusCode: number): boolean =>
  statusCode === 401 || statusCode === 403;

export const mapHttpError = (
  statusCode: number,
  reason: string,
  methodName: string
): RPCError => {
  if (statusCode === 429) {
    return new RateLimitError(`API rate limit exceeded calling ${methodName}`, {
      methodId: methodName,
    });
  }

  if (statusCode >= 500 && statusCode < 600) {
    return new ServerError(
      `Server error ${statusCode} calling ${methodName}: ${reason}`,
      { methodId: methodName, statusCode }
    );
  }

  if (statusCode >= 400 && statusCode < 500 && statusCode !== 401 && statusCode !== 403) {
    return new ClientError(
      `Client error ${statusCode} calling ${methodName}: ${reason}`,
      { methodId: methodName, statusCode }
    );
  }

  return new RPCError(`HTTP ${statusCode} calling ${methodName}: ${reason}`, {
    methodId: methodName,
  });
};

export {
  stripAntiXssi,
  parseChunkedResponse,
  collectRpcIds,
  extractRpcResult,
  getErrorMessageForCode,
};
