import * as os from "os";
import { ClientCore } from "../core";
import {
  RPCMethod,
  QUERY_URL,
  ChatGoal,
  ChatResponseLength,
} from "../rpc/types";
import { ChatError, NetworkError, ValidationError } from "../rpc/errors";
import {
  AskResult,
  ChatMode,
  ChatReference,
  ConversationTurn,
} from "../../../../domain/models/notebooklm.types";

const DEFAULT_BL = "boq_labs-tailwind-frontend_20260301.03_p0";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const generateUuid = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

const extractUuidFromNested = (data: unknown, maxDepth = 10): string | null => {
  if (maxDepth <= 0) return null;
  if (data === null || data === undefined) return null;
  if (typeof data === "string") return UUID_PATTERN.test(data) ? data : null;
  if (Array.isArray(data)) {
    for (const item of data as unknown[]) {
      const result = extractUuidFromNested(item, maxDepth - 1);
      if (result !== null) return result;
    }
  }
  return null;
};

const collectTextsFromNested = (nested: unknown, texts: string[]): void => {
  if (!Array.isArray(nested)) return;
  for (const nestedGroup of nested as unknown[]) {
    if (!Array.isArray(nestedGroup)) continue;
    for (const inner of nestedGroup as unknown[]) {
      if (!Array.isArray(inner) || inner.length < 3) continue;
      const textVal = inner[2];
      if (typeof textVal === "string" && textVal.trim()) {
        texts.push(textVal.trim());
      } else if (Array.isArray(textVal)) {
        for (const item of textVal as unknown[]) {
          if (typeof item === "string" && item.trim()) {
            texts.push(item.trim());
          }
        }
      }
    }
  }
};

const extractTextPassages = (
  citeInner: unknown[],
): {
  citedText: string | null;
  startChar: number | null;
  endChar: number | null;
} => {
  if (citeInner.length <= 4 || !Array.isArray(citeInner[4])) {
    return { citedText: null, startChar: null, endChar: null };
  }

  const texts: string[] = [];
  let startChar: number | null = null;
  let endChar: number | null = null;

  for (const passageWrapper of citeInner[4] as unknown[]) {
    if (
      !Array.isArray(passageWrapper) ||
      (passageWrapper as unknown[]).length === 0
    )
      continue;
    const passageData = (passageWrapper as unknown[])[0];
    if (!Array.isArray(passageData) || (passageData as unknown[]).length < 3)
      continue;

    if (
      startChar === null &&
      typeof (passageData as unknown[])[0] === "number"
    ) {
      startChar = (passageData as unknown[])[0] as number;
    }
    if (typeof (passageData as unknown[])[1] === "number") {
      endChar = (passageData as unknown[])[1] as number;
    }

    collectTextsFromNested((passageData as unknown[])[2], texts);
  }

  return {
    citedText: texts.length > 0 ? texts.join(" ") : null,
    startChar,
    endChar,
  };
};

const parseSingleCitation = (cite: unknown): ChatReference | null => {
  if (!Array.isArray(cite) || (cite as unknown[]).length < 2) return null;

  const citeInner = (cite as unknown[])[1];
  if (!Array.isArray(citeInner)) return null;

  const sourceIdData =
    (citeInner as unknown[]).length > 5 ? (citeInner as unknown[])[5] : null;
  const sourceId = extractUuidFromNested(sourceIdData);
  if (!sourceId) return null;

  let chunkId: string | null = null;
  const citeFirst = (cite as unknown[])[0];
  if (Array.isArray(citeFirst) && (citeFirst as unknown[]).length > 0) {
    const firstItem = (citeFirst as unknown[])[0];
    chunkId = typeof firstItem === "string" ? firstItem : null;
  }

  const { citedText, startChar, endChar } = extractTextPassages(
    citeInner as unknown[],
  );

  return {
    sourceId,
    citationNumber: null,
    citedText,
    startChar,
    endChar,
    chunkId,
  };
};

const parseCitations = (first: unknown[]): ChatReference[] => {
  try {
    if (first.length <= 4 || !Array.isArray(first[4])) return [];
    const typeInfo = first[4] as unknown[];
    if (typeInfo.length <= 3 || !Array.isArray(typeInfo[3])) return [];

    return (typeInfo[3] as unknown[])
      .map(parseSingleCitation)
      .filter((ref): ref is ChatReference => ref !== null);
  } catch {
    return [];
  }
};

const raiseIfRateLimited = (errorPayload: unknown[]): void => {
  try {
    if (errorPayload.length > 2 && Array.isArray(errorPayload[2])) {
      for (const entry of errorPayload[2] as unknown[]) {
        if (
          Array.isArray(entry) &&
          (entry as unknown[]).length > 0 &&
          typeof (entry as unknown[])[0] === "string" &&
          ((entry as unknown[])[0] as string).includes("UserDisplayableError")
        ) {
          throw new ChatError(
            "Chat request was rate limited or rejected by the API. Wait a few seconds and try again.",
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof ChatError) throw error;
  }
};

const extractAnswerAndRefsFromChunk = (
  jsonStr: string,
): {
  text: string | null;
  isAnswer: boolean;
  refs: ChatReference[];
  serverConvId: string | null;
} => {
  let data: unknown;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return { text: null, isAnswer: false, refs: [], serverConvId: null };
  }

  if (!Array.isArray(data)) {
    return { text: null, isAnswer: false, refs: [], serverConvId: null };
  }

  for (const item of data as unknown[]) {
    if (!Array.isArray(item) || (item as unknown[]).length < 3) continue;
    if ((item as unknown[])[0] !== "wrb.fr") continue;

    const innerJson = (item as unknown[])[2];
    if (typeof innerJson !== "string") {
      if (
        (item as unknown[]).length > 5 &&
        Array.isArray((item as unknown[])[5])
      ) {
        raiseIfRateLimited((item as unknown[])[5] as unknown[]);
      }
      continue;
    }

    try {
      const innerData = JSON.parse(innerJson) as unknown;
      if (!Array.isArray(innerData) || (innerData as unknown[]).length === 0)
        continue;

      const first = (innerData as unknown[][])[0];
      if (!Array.isArray(first) || first.length === 0) continue;

      const text = first[0];
      if (typeof text !== "string" || !text) continue;

      const isAnswer =
        first.length > 4 &&
        Array.isArray(first[4]) &&
        (first[4] as unknown[]).length > 0 &&
        (first[4] as unknown[])[(first[4] as unknown[]).length - 1] === 1;

      let serverConvId: string | null = null;
      if (
        first.length > 2 &&
        Array.isArray(first[2]) &&
        (first[2] as unknown[]).length > 0 &&
        typeof (first[2] as unknown[])[0] === "string"
      ) {
        serverConvId = (first[2] as string[])[0];
      }

      const refs = parseCitations(first as unknown[]);
      return { text, isAnswer, refs, serverConvId };
    } catch {
      continue;
    }
  }

  return { text: null, isAnswer: false, refs: [], serverConvId: null };
};

const parseAskResponse = (
  responseText: string,
): {
  answer: string;
  references: ChatReference[];
  serverConvId: string | null;
} => {
  let text = responseText;
  if (text.startsWith(")]}'")) text = text.slice(4);

  const lines = text.trim().split("\n");
  let bestMarkedAnswer = "";
  let bestUnmarkedAnswer = "";
  const allRefs: ChatReference[] = [];
  let serverConvId: string | null = null;

  const processChunk = (jsonStr: string): void => {
    const {
      text: chunkText,
      isAnswer,
      refs,
      serverConvId: convId,
    } = extractAnswerAndRefsFromChunk(jsonStr);

    if (chunkText) {
      if (isAnswer && chunkText.length > bestMarkedAnswer.length) {
        bestMarkedAnswer = chunkText;
      } else if (!isAnswer && chunkText.length > bestUnmarkedAnswer.length) {
        bestUnmarkedAnswer = chunkText;
      }
    }

    allRefs.push(...refs);
    if (convId) serverConvId = convId;
  };

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
      if (i < lines.length) processChunk(lines[i]);
      i++;
    } else {
      processChunk(line);
      i++;
    }
  }

  const answer = bestMarkedAnswer || bestUnmarkedAnswer;

  allRefs.forEach((ref, idx) => {
    if (ref.citationNumber === null) ref.citationNumber = idx + 1;
  });

  return { answer, references: allRefs, serverConvId };
};

const parseTurnsToQAPairs = (turnsData: unknown): Array<[string, string]> => {
  if (!Array.isArray(turnsData)) return [];
  const first = (turnsData as unknown[][])[0];
  if (!Array.isArray(first)) return [];

  const pairs: Array<[string, string]> = [];
  let i = 0;

  while (i < (first as unknown[]).length) {
    const turn = (first as unknown[])[i];
    if (!Array.isArray(turn) || (turn as unknown[]).length < 3) {
      i++;
      continue;
    }

    if ((turn as unknown[])[2] === 1 && (turn as unknown[]).length > 3) {
      const q = String((turn as unknown[])[3] ?? "");
      let a = "";

      if (i + 1 < (first as unknown[]).length) {
        const next = (first as unknown[])[i + 1];
        if (
          Array.isArray(next) &&
          (next as unknown[]).length > 4 &&
          (next as unknown[])[2] === 2
        ) {
          try {
            a = String(((next as unknown[][])[4] as unknown[][])[0][0] ?? "");
          } catch {
            a = "";
          }
          i++;
        }
      }

      pairs.push([q, a]);
    }

    i++;
  }

  return pairs;
};

const CHAT_MODE_CONFIGS: Record<
  ChatMode,
  {
    goal: ChatGoal;
    responseLength: ChatResponseLength;
    customPrompt: string | null;
  }
> = {
  default: {
    goal: ChatGoal.DEFAULT,
    responseLength: ChatResponseLength.DEFAULT,
    customPrompt: null,
  },
  learning_guide: {
    goal: ChatGoal.LEARNING_GUIDE,
    responseLength: ChatResponseLength.LONGER,
    customPrompt: null,
  },
  concise: {
    goal: ChatGoal.DEFAULT,
    responseLength: ChatResponseLength.SHORTER,
    customPrompt: null,
  },
  detailed: {
    goal: ChatGoal.DEFAULT,
    responseLength: ChatResponseLength.LONGER,
    customPrompt: null,
  },
};

export class ChatAPI {
  constructor(private readonly core: ClientCore) {}

  async ask(
    notebookId: string,
    question: string,
    options: {
      sourceIds?: string[];
      conversationId?: string | null;
    } = {},
  ): Promise<AskResult> {
    const { conversationId: existingConvId = null } = options;
    const sourceIds =
      options.sourceIds ?? (await this.core.getSourceIds(notebookId));

    const isNewConversation = existingConvId === null;
    const conversationId = isNewConversation ? generateUuid() : existingConvId;

    const conversationHistory = isNewConversation
      ? null
      : this.buildConversationHistory(conversationId);

    const sourcesArray = sourceIds.map((sid) => [[[sid]]]);

    const params: unknown[] = [
      sourcesArray,
      question,
      conversationHistory,
      [2, null, [1], [1]],
      conversationId,
      null,
      null,
      notebookId,
      1,
    ];

    const paramsJson = JSON.stringify(params);
    const fReq = JSON.stringify([null, paramsJson]);
    const encodedReq = encodeURIComponent(fReq);

    const bodyParts = [`f.req=${encodedReq}`];
    if (this.core.authTokens.csrfToken) {
      bodyParts.push(
        `at=${encodeURIComponent(this.core.authTokens.csrfToken)}`,
      );
    }
    const body = bodyParts.join("&") + "&";

    const reqId = this.core.incrementReqId();
    const urlParams = new URLSearchParams({
      bl: process.env["NOTEBOOKLM_BL"] ?? DEFAULT_BL,
      hl: "en",
      _reqid: String(reqId),
      rt: "c",
    });

    if (this.core.authTokens.sessionId) {
      urlParams.set("f.sid", this.core.authTokens.sessionId);
    }

    const url = `${QUERY_URL}?${urlParams.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Cookie: this.core.authTokens.cookieHeader,
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === "AbortError") {
        throw new NetworkError("Chat request timed out", {
          originalError: error,
        });
      }
      throw new NetworkError(`Chat request failed: ${String(error)}`, {
        originalError: error as Error,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new ChatError(`Chat request failed with HTTP ${response.status}`);
    }

    const rawText = await response.text();
    const { answer, references, serverConvId } = parseAskResponse(rawText);

    const finalConvId = serverConvId ?? conversationId;
    const cachedTurns = this.core.getCachedConversation(finalConvId);

    if (answer) {
      const turnNumber = cachedTurns.length + 1;
      this.core.cacheConversationTurn(
        finalConvId,
        question,
        answer,
        turnNumber,
      );
    }

    const turnNumber = this.core.getCachedConversation(finalConvId).length;

    return {
      answer,
      conversationId: finalConvId,
      turnNumber,
      isFollowUp: !isNewConversation,
      references,
      rawResponse: rawText.slice(0, 1000),
    };
  }

  async getConversationTurns(
    notebookId: string,
    conversationId: string,
    limit = 2,
  ): Promise<unknown> {
    const params: unknown[] = [[], null, null, conversationId, limit];
    return this.core.rpcCall(RPCMethod.GET_CONVERSATION_TURNS, params, {
      sourcePath: `/notebook/${notebookId}`,
    });
  }

  async getConversationId(notebookId: string): Promise<string | null> {
    const params: unknown[] = [[], null, notebookId, 1];
    const raw = await this.core.rpcCall(
      RPCMethod.GET_LAST_CONVERSATION_ID,
      params,
      {
        sourcePath: `/notebook/${notebookId}`,
      },
    );

    if (!Array.isArray(raw)) return null;

    for (const group of raw as unknown[]) {
      if (!Array.isArray(group)) continue;
      for (const conv of group as unknown[]) {
        if (
          Array.isArray(conv) &&
          (conv as unknown[]).length > 0 &&
          typeof (conv as unknown[])[0] === "string"
        ) {
          return (conv as string[])[0];
        }
      }
    }

    return null;
  }

  async getHistory(
    notebookId: string,
    options: { limit?: number; conversationId?: string | null } = {},
  ): Promise<Array<[string, string]>> {
    const { limit = 100, conversationId: convIdOverride = null } = options;

    const convId = convIdOverride ?? (await this.getConversationId(notebookId));
    if (!convId) return [];

    let turnsData: unknown;
    try {
      turnsData = await this.getConversationTurns(notebookId, convId, limit);
    } catch {
      return [];
    }

    if (
      Array.isArray(turnsData) &&
      (turnsData as unknown[]).length > 0 &&
      Array.isArray((turnsData as unknown[][])[0])
    ) {
      turnsData = [
        [(turnsData as unknown[][])[0]]
          .map((arr) => (arr as unknown[]).slice().reverse())
          .flat(),
      ];
    }

    return parseTurnsToQAPairs(turnsData);
  }

  getCachedTurns(conversationId: string): ConversationTurn[] {
    return this.core.getCachedConversation(conversationId).map((turn) => ({
      query: turn.query,
      answer: turn.answer,
      turnNumber: turn.turnNumber,
    }));
  }

  clearCache(conversationId?: string): boolean {
    return this.core.clearConversationCache(conversationId);
  }

  async configure(
    notebookId: string,
    options: {
      goal?: ChatGoal;
      responseLength?: ChatResponseLength;
      customPrompt?: string | null;
    } = {},
  ): Promise<void> {
    const {
      goal = ChatGoal.DEFAULT,
      responseLength = ChatResponseLength.DEFAULT,
      customPrompt = null,
    } = options;

    if (goal === ChatGoal.CUSTOM && !customPrompt) {
      throw new ValidationError("customPrompt is required when goal is CUSTOM");
    }

    const goalArray = goal === ChatGoal.CUSTOM ? [goal, customPrompt] : [goal];

    const chatSettings = [goalArray, [responseLength]];
    const params = [
      notebookId,
      [[null, null, null, null, null, null, null, chatSettings]],
    ];

    await this.core.rpcCall(RPCMethod.RENAME_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
  }

  async setMode(notebookId: string, mode: ChatMode): Promise<void> {
    const { goal, responseLength, customPrompt } = CHAT_MODE_CONFIGS[mode];
    await this.configure(notebookId, { goal, responseLength, customPrompt });
  }

  private buildConversationHistory(conversationId: string): unknown[] | null {
    const turns = this.core.getCachedConversation(conversationId);
    if (turns.length === 0) return null;

    const history: unknown[] = [];
    for (const turn of turns) {
      history.push([turn.answer, null, 2]);
      history.push([turn.query, null, 1]);
    }
    return history;
  }
}
