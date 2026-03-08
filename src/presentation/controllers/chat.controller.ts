import type { Request, Response, NextFunction } from "express";
import { ChatUseCase } from "../../application/use-cases/chat.use-case";
import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { createNotebookLMClientFromAuth } from "../../main/factories/notebooklm.factory";
import { sendSuccess } from "../responses/http.response";
import { t } from "../../i18n";
import type { ChatMode } from "../../domain/models/notebooklm.types";
import type {
  ChatGoal,
  ChatResponseLength,
} from "../../infrastructure/third-party/notebooklm/rpc/types";

const resolveUseCase = (req: Request): ChatUseCase => {
  const client = new NotebookLMClient(req.notebookLMAuth!);
  return createNotebookLMClientFromAuth(client).chat;
};

export const askQuestion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { question, sourceIds, conversationId } = req.body as {
      question: string;
      sourceIds?: string[];
      conversationId?: string | null;
    };
    const result = await resolveUseCase(req).ask(notebookId, question, {
      sourceIds,
      conversationId,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const getConversationId = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const conversationId = await resolveUseCase(req).getConversationId(notebookId);
    sendSuccess(res, { conversationId });
  } catch (err) {
    next(err);
  }
};

export const getConversationHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { limit, conversationId } = req.query as {
      limit?: string;
      conversationId?: string;
    };
    const history = await resolveUseCase(req).getHistory(notebookId, {
      limit: limit !== undefined ? parseInt(limit, 10) : undefined,
      conversationId: conversationId ?? null,
    });
    sendSuccess(res, history);
  } catch (err) {
    next(err);
  }
};

export const getCachedTurns = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { conversationId } = req.params as { conversationId: string };
    const turns = resolveUseCase(req).getCachedTurns(conversationId);
    sendSuccess(res, turns);
  } catch (err) {
    next(err);
  }
};

export const clearConversationCache = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { conversationId } = req.params as { conversationId?: string };
    resolveUseCase(req).clearCache(conversationId);
    sendSuccess(res, null, 200, t("chat.cache_cleared"));
  } catch (err) {
    next(err);
  }
};

export const configureChat = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { goal, responseLength, customPrompt } = req.body as {
      goal?: ChatGoal;
      responseLength?: ChatResponseLength;
      customPrompt?: string | null;
    };
    await resolveUseCase(req).configure(notebookId, {
      goal,
      responseLength,
      customPrompt,
    });
    sendSuccess(res, null, 200, t("chat.configured"));
  } catch (err) {
    next(err);
  }
};

export const setChatMode = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { mode } = req.body as { mode: ChatMode };
    await resolveUseCase(req).setMode(notebookId, mode);
    sendSuccess(res, null, 200, t("chat.mode_set"));
  } catch (err) {
    next(err);
  }
};
