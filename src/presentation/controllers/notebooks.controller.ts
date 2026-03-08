import type { Request, Response, NextFunction } from "express";
import { NotebooksUseCase } from "../../application/use-cases/notebooks.use-case";
import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { createNotebookLMClientFromAuth } from "../../main/factories/notebooklm.factory";
import { sendSuccess, sendCreated, sendNoContent } from "../responses/http.response";
import { t } from "../../i18n";

const resolveUseCase = (req: Request): NotebooksUseCase => {
  const client = new NotebookLMClient(req.notebookLMAuth!);
  return createNotebookLMClientFromAuth(client).notebooks;
};

export const listNotebooks = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const notebooks = await resolveUseCase(req).listNotebooks();
    sendSuccess(res, notebooks);
  } catch (err) {
    next(err);
  }
};

export const getNotebook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const notebook = await resolveUseCase(req).getNotebook(id);
    sendSuccess(res, notebook);
  } catch (err) {
    next(err);
  }
};

export const createNotebook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { title } = req.body as { title: string };
    const notebook = await resolveUseCase(req).createNotebook(title);
    sendCreated(res, notebook, t("notebooks.created"));
  } catch (err) {
    next(err);
  }
};

export const deleteNotebook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    await resolveUseCase(req).deleteNotebook(id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
};

export const renameNotebook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { title } = req.body as { title: string };
    const notebook = await resolveUseCase(req).renameNotebook(id, title);
    sendSuccess(res, notebook, 200, t("notebooks.renamed"));
  } catch (err) {
    next(err);
  }
};

export const getNotebookDescription = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const description = await resolveUseCase(req).getNotebookDescription(id);
    sendSuccess(res, description);
  } catch (err) {
    next(err);
  }
};

export const shareNotebook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { isPublic, artifactId } = req.body as {
      isPublic: boolean;
      artifactId?: string;
    };
    const result = await resolveUseCase(req).shareNotebook(id, isPublic, artifactId);
    sendSuccess(res, result, 200, t("notebooks.share_updated"));
  } catch (err) {
    next(err);
  }
};
