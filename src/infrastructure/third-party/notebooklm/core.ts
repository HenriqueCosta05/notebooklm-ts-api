import { buildRequestBody, buildUrlParams, encodeRpcRequest } from "./rpc/encoder";
import { decodeResponse, isAuthStatusCode, mapHttpError } from "./rpc/decoder";
import {
  AuthError,
  NetworkError,
  RateLimitError,
  RPCError,
  RPCTimeoutError,
  ServerError,
  ClientError,
} from "./rpc/errors";
import { BATCHEXECUTE_URL, RPCMethod } from "./rpc/types";
import { AuthTokens } from "./auth";

export const DEFAULT_TIMEOUT = 30_000;
export const DEFAULT_CONNECT_TIMEOUT = 10_000;
const MAX_CONVERSATION_CACHE_SIZE = 100;

export type RefreshCallback = () => Promise<AuthTokens>;

interface ConversationTurnCache {
  query: string;
  answer: string;
  turnNumber: number;
}

const isAuthError = (error: unknown): boolean => {
  if (error instanceof AuthError) return true;
  if (
    error instanceof NetworkError ||
    error instanceof RPCTimeoutError ||
    error instanceof RateLimitError ||
    error instanceof ServerError ||
    error instanceof ClientError
  ) {
    return false;
  }
  if (error instanceof RPCError) {
    const message = error.message.toLowerCase();
    const authPatterns = ["authentication", "expired", "unauthorized", "login", "re-authenticate"];
    return authPatterns.some((p) => message.includes(p));
  }
  return false;
};

export class ClientCore {
  private readonly auth: AuthTokens;
  private readonly timeoutMs: number;
  private readonly refreshCallback: RefreshCallback | null;
  private refreshPromise: Promise<AuthTokens> | null = null;
  private reqIdCounter = 100_000;
  private readonly conversationCache = new Map<string, ConversationTurnCache[]>();
  private readonly conversationOrder: string[] = [];

  constructor(
    auth: AuthTokens,
    options: {
      timeoutMs?: number;
      refreshCallback?: RefreshCallback;
    } = {}
  ) {
    this.auth = auth;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    this.refreshCallback = options.refreshCallback ?? null;
  }

  get authTokens(): AuthTokens {
    return this.auth;
  }

  incrementReqId(): number {
    this.reqIdCounter += 100_000;
    return this.reqIdCounter;
  }

  private buildUrl(method: RPCMethod, sourcePath = "/"): string {
    const params = buildUrlParams(method, sourcePath, this.auth.sessionId);
    const qs = new URLSearchParams(params).toString();
    return `${BATCHEXECUTE_URL}?${qs}`;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Cookie: this.auth.cookieHeader,
    };
  }

  private async fetchWithTimeout(url: string, body: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(),
        body,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new RPCTimeoutError(`Request timed out after ${this.timeoutMs}ms`, {
          timeoutSeconds: this.timeoutMs / 1000,
          originalError: error,
        });
      }
      if (error instanceof TypeError) {
        throw new NetworkError(`Network request failed: ${error.message}`, {
          originalError: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async rpcCall(
    method: RPCMethod,
    params: unknown[],
    options: { sourcePath?: string; allowNull?: boolean; isRetry?: boolean } = {}
  ): Promise<unknown> {
    const { sourcePath = "/", allowNull = false, isRetry = false } = options;

    const url = this.buildUrl(method, sourcePath);
    const rpcRequest = encodeRpcRequest(method, params);
    const body = buildRequestBody(rpcRequest, this.auth.csrfToken);

    let response: Response;

    try {
      response = await this.fetchWithTimeout(url, body);
    } catch (error) {
      if (!isRetry && this.refreshCallback && isAuthError(error)) {
        const retried = await this.tryRefreshAndRetry(method, params, options, error as Error);
        if (retried !== null) return retried;
      }
      throw error;
    }

    if (!response.ok) {
      const statusCode = response.status;
      const reason = response.statusText ?? "";

      if (!isRetry && this.refreshCallback && isAuthStatusCode(statusCode)) {
        const retried = await this.tryRefreshAndRetry(method, params, options, null);
        if (retried !== null) return retried;
      }

      const httpError = mapHttpError(statusCode, reason, method);
      throw httpError;
    }

    const rawText = await response.text();

    try {
      const result = decodeResponse(rawText, method, allowNull);
      return result;
    } catch (error) {
      if (!isRetry && this.refreshCallback && isAuthError(error)) {
        const retried = await this.tryRefreshAndRetry(method, params, options, error as Error);
        if (retried !== null) return retried;
      }
      throw error;
    }
  }

  private async tryRefreshAndRetry(
    method: RPCMethod,
    params: unknown[],
    options: { sourcePath?: string; allowNull?: boolean },
    originalError: Error | null
  ): Promise<unknown | null> {
    if (!this.refreshCallback) return null;

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshCallback().finally(() => {
        this.refreshPromise = null;
      });
    }

    try {
      await this.refreshPromise;
    } catch (refreshError) {
      if (originalError) throw originalError;
      throw refreshError;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    return this.rpcCall(method, params, { ...options, isRetry: true });
  }

  async getSourceIds(notebookId: string): Promise<string[]> {
    const params = [notebookId, null, [2], null, 0];
    const notebookData = await this.rpcCall(RPCMethod.GET_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
    });

    const sourceIds: string[] = [];

    if (!Array.isArray(notebookData)) return sourceIds;

    try {
      const notebookInfo = (notebookData as unknown[][])[0];
      if (!Array.isArray(notebookInfo)) return sourceIds;

      const sources = (notebookInfo as unknown[][])[1];
      if (!Array.isArray(sources)) return sourceIds;

      for (const source of sources as unknown[][]) {
        if (!Array.isArray(source) || source.length === 0) continue;
        const first = source[0];
        if (Array.isArray(first) && first.length > 0 && typeof first[0] === "string") {
          sourceIds.push(first[0]);
        }
      }
    } catch {
      // Defensive: return partial results on unexpected structure
    }

    return sourceIds;
  }

  cacheConversationTurn(
    conversationId: string,
    query: string,
    answer: string,
    turnNumber: number
  ): void {
    const isNew = !this.conversationCache.has(conversationId);

    if (isNew) {
      while (this.conversationOrder.length >= MAX_CONVERSATION_CACHE_SIZE) {
        const oldest = this.conversationOrder.shift();
        if (oldest) this.conversationCache.delete(oldest);
      }
      this.conversationCache.set(conversationId, []);
      this.conversationOrder.push(conversationId);
    }

    this.conversationCache.get(conversationId)!.push({ query, answer, turnNumber });
  }

  getCachedConversation(conversationId: string): ConversationTurnCache[] {
    return this.conversationCache.get(conversationId) ?? [];
  }

  clearConversationCache(conversationId?: string): boolean {
    if (conversationId) {
      if (!this.conversationCache.has(conversationId)) return false;
      this.conversationCache.delete(conversationId);
      const idx = this.conversationOrder.indexOf(conversationId);
      if (idx !== -1) this.conversationOrder.splice(idx, 1);
      return true;
    }
    this.conversationCache.clear();
    this.conversationOrder.length = 0;
    return true;
  }
}
