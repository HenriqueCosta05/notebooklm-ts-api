import type { Request, Response, NextFunction } from "express";
import { ResearchUseCase } from "../../application/use-cases/research.use-case";
import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { createNotebookLMClientFromAuth } from "../../main/factories/notebooklm.factory";
import { sendSuccess, sendCreated } from "../responses/http.response";
import { t } from "../../i18n";
import { ResearchMode } from "../../infrastructure/third-party/notebooklm/apis/research.api";

const resolveUseCase = (req: Request): ResearchUseCase => {
  const client = new NotebookLMClient(req.notebookLMAuth!);
  return createNotebookLMClientFromAuth(client).research;
};

export const startResearch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { query, mode } = req.body as { query: string; mode?: ResearchMode };

    const status = await resolveUseCase(req).startResearch(notebookId, query, mode);
    sendCreated(res, status, t("research.started"));
  } catch (err) {
    next(err);
  }
};

export const getResearchStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { notebookId, taskId } = req.params as {
      notebookId: string;
      taskId: string;
    };

    const status = await resolveUseCase(req).getResearchStatus(notebookId, taskId);
    sendSuccess(res, status);
  } catch (err) {
    next(err);
  }
};

export const importResearchResults = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { notebookId, taskId } = req.params as {
      notebookId: string;
      taskId: string;
    };

    const sources = await resolveUseCase(req).importResults(notebookId, taskId);
    sendSuccess(res, sources);
  } catch (err) {
    next(err);
  }
};

export const waitForResearchCompletion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { notebookId, taskId } = req.params as {
      notebookId: string;
      taskId: string;
    };
    const { timeoutMs } = req.query as { timeoutMs?: string };

    const timeout = timeoutMs ? parseInt(timeoutMs, 10) : undefined;
    const sources = await resolveUseCase(req).waitForCompletion(
      notebookId,
      taskId,
      timeout
    );
    sendSuccess(res, sources);
  } catch (err) {
    next(err);
  }
};
