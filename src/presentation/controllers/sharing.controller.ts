import type { Request, Response, NextFunction } from "express";
import { SharingUseCase } from "../../application/use-cases/sharing.use-case";
import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { createNotebookLMClientFromAuth } from "../../main/factories/notebooklm.factory";
import { sendSuccess, sendNoContent } from "../responses/http.response";
import { t } from "../../i18n";
import { SharePermission } from "../../infrastructure/third-party/notebooklm/rpc/types";

const resolveUseCase = (req: Request): SharingUseCase => {
  const client = new NotebookLMClient(req.notebookLMAuth!);
  return createNotebookLMClientFromAuth(client).sharing;
};

export const getShareStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const status = await resolveUseCase(req).getShareStatus(id);
    sendSuccess(res, status);
  } catch (err) {
    next(err);
  }
};

export const setPublic = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { isPublic } = req.body as { isPublic: boolean };

    const status = await resolveUseCase(req).setPublic(id, isPublic);
    sendSuccess(res, status, 200, t("sharing.updated"));
  } catch (err) {
    next(err);
  }
};

export const addUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { email, permission } = req.body as {
      email: string;
      permission?: SharePermission;
    };

    const status = await resolveUseCase(req).addUser(id, email, permission);
    sendSuccess(res, status, 200, t("sharing.user_added"));
  } catch (err) {
    next(err);
  }
};

export const removeUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { email } = req.body as { email: string };

    await resolveUseCase(req).removeUser(id, email);
    sendSuccess(res, null, 200, t("sharing.user_removed"));
  } catch (err) {
    next(err);
  }
};

export const updatePermission = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { email, permission } = req.body as {
      email: string;
      permission: SharePermission;
    };

    const status = await resolveUseCase(req).updateUserPermission(id, email, permission);
    sendSuccess(res, status, 200, t("sharing.permission_updated"));
  } catch (err) {
    next(err);
  }
};

export const getSharedUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const users = await resolveUseCase(req).getSharedUsers(id);
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};

export const getShareUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const url = await resolveUseCase(req).getShareUrl(id);
    sendSuccess(res, { url });
  } catch (err) {
    next(err);
  }
};
