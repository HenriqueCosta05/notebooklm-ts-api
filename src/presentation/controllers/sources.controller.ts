import type { Request, Response, NextFunction } from "express";
import { SourcesUseCase } from "../../application/use-cases/sources.use-case";
import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { createNotebookLMClientFromAuth } from "../../main/factories/notebooklm.factory";
import { sendSuccess, sendCreated, sendNoContent } from "../responses/http.response";
import { t } from "../../i18n";

const resolveUseCase = (req: Request): SourcesUseCase => {
  const client = new NotebookLMClient(req.notebookLMAuth!);
  return createNotebookLMClientFromAuth(client).sources;
};

export const listSources = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const sources = await resolveUseCase(req).listSources(notebookId);
    sendSuccess(res, sources);
  } catch (err) {
    next(err);
  }
};

export const getSource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { notebookId, sourceId } = req.params as {
      notebookId: string;
      sourceId: string;
    };
    const source = await resolveUseCase(req).getSource(notebookId, sourceId);
    sendSuccess(res, source);
  } catch (err) {
    next(err);
  }
};

export const addUrlSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { url, wait, waitTimeoutMs } = req.body as {
      url: string;
      wait?: boolean;
      waitTimeoutMs?: number;
    };
    const source = await resolveUseCase(req).addUrlSource(notebookId, url, {
      wait,
      waitTimeoutMs,
    });
    sendCreated(res, source, t("sources.added"));
  } catch (err) {
    next(err);
  }
};

export const addTextSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { title, content, wait, waitTimeoutMs } = req.body as {
      title: string;
      content: string;
      wait?: boolean;
      waitTimeoutMs?: number;
    };
    const source = await resolveUseCase(req).addTextSource(notebookId, title, content, {
      wait,
      waitTimeoutMs,
    });
    sendCreated(res, source, t("sources.added"));
  } catch (err) {
    next(err);
  }
};

export const addDriveSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { fileId, title, mimeType, wait, waitTimeoutMs } = req.body as {
      fileId: string;
      title: string;
      mimeType?: string;
      wait?: boolean;
      waitTimeoutMs?: number;
    };
    const source = await resolveUseCase(req).addDriveSource(notebookId, fileId, title, mimeType, {
      wait,
      waitTimeoutMs,
    });
    sendCreated(res, source, t("sources.added"));
  } catch (err) {
    next(err);
  }
};

export const deleteSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, sourceId } = req.params as {
      notebookId: string;
      sourceId: string;
    };
    await resolveUseCase(req).deleteSource(notebookId, sourceId);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
};

export const renameSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, sourceId } = req.params as {
      notebookId: string;
      sourceId: string;
    };
    const { title } = req.body as { title: string };
    const source = await resolveUseCase(req).renameSource(notebookId, sourceId, title);
    sendSuccess(res, source, 200, t("sources.renamed"));
  } catch (err) {
    next(err);
  }
};

export const refreshSource = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, sourceId } = req.params as {
      notebookId: string;
      sourceId: string;
    };
    await resolveUseCase(req).refreshSource(notebookId, sourceId);
    sendSuccess(res, null, 200, t("sources.refreshed"));
  } catch (err) {
    next(err);
  }
};

export const getSourceGuide = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, sourceId } = req.params as {
      notebookId: string;
      sourceId: string;
    };
    const guide = await resolveUseCase(req).getSourceGuide(notebookId, sourceId);
    sendSuccess(res, guide);
  } catch (err) {
    next(err);
  }
};

export const getSourceFulltext = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, sourceId } = req.params as {
      notebookId: string;
      sourceId: string;
    };
    const fulltext = await resolveUseCase(req).getSourceFulltext(notebookId, sourceId);
    sendSuccess(res, fulltext);
  } catch (err) {
    next(err);
  }
};
