import type { Request, Response, NextFunction } from "express";
import { ArtifactsUseCase } from "../../application/use-cases/artifacts.use-case";
import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { createNotebookLMClientFromAuth } from "../../main/factories/notebooklm.factory";
import { sendSuccess, sendCreated, sendNoContent } from "../responses/http.response";
import { t } from "../../i18n";
import type {
  AudioFormat,
  AudioLength,
  VideoFormat,
  VideoStyle,
  ReportFormat,
  QuizQuantity,
  QuizDifficulty,
  InfographicOrientation,
  InfographicDetail,
  SlideDeckFormat,
  SlideDeckLength,
  ExportType,
} from "../../infrastructure/third-party/notebooklm/rpc/types";
import type { ArtifactKind } from "../../domain/models/notebooklm.types";

const resolveUseCase = (req: Request): ArtifactsUseCase => {
  const client = new NotebookLMClient(req.notebookLMAuth!);
  return createNotebookLMClientFromAuth(client).artifacts;
};

export const listArtifacts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { kind } = req.query as { kind?: ArtifactKind };
    const artifacts = await resolveUseCase(req).listArtifacts(notebookId, kind);
    sendSuccess(res, artifacts);
  } catch (err) {
    next(err);
  }
};

export const getArtifact = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, artifactId } = req.params as {
      notebookId: string;
      artifactId: string;
    };
    const artifact = await resolveUseCase(req).getArtifact(notebookId, artifactId);
    sendSuccess(res, artifact);
  } catch (err) {
    next(err);
  }
};

export const generateAudio = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds, language, instructions, audioFormat, audioLength } =
      req.body as {
        sourceIds?: string[];
        language?: string;
        instructions?: string | null;
        audioFormat?: AudioFormat | null;
        audioLength?: AudioLength | null;
      };
    const status = await resolveUseCase(req).generateAudio(notebookId, {
      sourceIds,
      language,
      instructions,
      audioFormat,
      audioLength,
    });
    sendCreated(res, status, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const generateVideo = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds, language, instructions, videoFormat, videoStyle } =
      req.body as {
        sourceIds?: string[];
        language?: string;
        instructions?: string | null;
        videoFormat?: VideoFormat | null;
        videoStyle?: VideoStyle | null;
      };
    const status = await resolveUseCase(req).generateVideo(notebookId, {
      sourceIds,
      language,
      instructions,
      videoFormat,
      videoStyle,
    });
    sendCreated(res, status, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const generateReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds, language, reportFormat, customPrompt, extraInstructions } =
      req.body as {
        sourceIds?: string[];
        language?: string;
        reportFormat?: ReportFormat;
        customPrompt?: string | null;
        extraInstructions?: string | null;
      };
    const status = await resolveUseCase(req).generateReport(notebookId, {
      sourceIds,
      language,
      reportFormat,
      customPrompt,
      extraInstructions,
    });
    sendCreated(res, status, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const generateQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds, instructions, quantity, difficulty } = req.body as {
      sourceIds?: string[];
      instructions?: string | null;
      quantity?: QuizQuantity | null;
      difficulty?: QuizDifficulty | null;
    };
    const status = await resolveUseCase(req).generateQuiz(notebookId, {
      sourceIds,
      instructions,
      quantity,
      difficulty,
    });
    sendCreated(res, status, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const generateFlashcards = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds, instructions, quantity, difficulty } = req.body as {
      sourceIds?: string[];
      instructions?: string | null;
      quantity?: QuizQuantity | null;
      difficulty?: QuizDifficulty | null;
    };
    const status = await resolveUseCase(req).generateFlashcards(notebookId, {
      sourceIds,
      instructions,
      quantity,
      difficulty,
    });
    sendCreated(res, status, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const generateInfographic = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds, language, instructions, orientation, detailLevel } =
      req.body as {
        sourceIds?: string[];
        language?: string;
        instructions?: string | null;
        orientation?: InfographicOrientation | null;
        detailLevel?: InfographicDetail | null;
      };
    const status = await resolveUseCase(req).generateInfographic(notebookId, {
      sourceIds,
      language,
      instructions,
      orientation,
      detailLevel,
    });
    sendCreated(res, status, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const generateSlideDeck = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds, language, instructions, slideFormat, slideLength } =
      req.body as {
        sourceIds?: string[];
        language?: string;
        instructions?: string | null;
        slideFormat?: SlideDeckFormat | null;
        slideLength?: SlideDeckLength | null;
      };
    const status = await resolveUseCase(req).generateSlideDeck(notebookId, {
      sourceIds,
      language,
      instructions,
      slideFormat,
      slideLength,
    });
    sendCreated(res, status, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const generateDataTable = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds, language, instructions } = req.body as {
      sourceIds?: string[];
      language?: string;
      instructions?: string | null;
    };
    const status = await resolveUseCase(req).generateDataTable(notebookId, {
      sourceIds,
      language,
      instructions,
    });
    sendCreated(res, status, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const generateMindMap = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const { sourceIds } = req.body as { sourceIds?: string[] };
    const result = await resolveUseCase(req).generateMindMap(notebookId, {
      sourceIds,
    });
    sendCreated(res, result, t("artifacts.generation_started"));
  } catch (err) {
    next(err);
  }
};

export const pollArtifactStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, taskId } = req.params as {
      notebookId: string;
      taskId: string;
    };
    const status = await resolveUseCase(req).pollStatus(notebookId, taskId);
    sendSuccess(res, status);
  } catch (err) {
    next(err);
  }
};

export const deleteArtifact = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, artifactId } = req.params as {
      notebookId: string;
      artifactId: string;
    };
    await resolveUseCase(req).deleteArtifact(notebookId, artifactId);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
};

export const renameArtifact = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, artifactId } = req.params as {
      notebookId: string;
      artifactId: string;
    };
    const { title } = req.body as { title: string };
    await resolveUseCase(req).renameArtifact(notebookId, artifactId, title);
    sendSuccess(res, null, 200, t("artifacts.renamed"));
  } catch (err) {
    next(err);
  }
};

export const exportArtifact = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, artifactId } = req.params as {
      notebookId: string;
      artifactId: string;
    };
    const { title, exportType } = req.body as {
      title?: string;
      exportType?: ExportType;
    };
    const result = await resolveUseCase(req).exportArtifact(
      notebookId,
      artifactId,
      title,
      exportType,
    );
    sendSuccess(res, result, 200, t("artifacts.exported"));
  } catch (err) {
    next(err);
  }
};

export const suggestReports = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const suggestions = await resolveUseCase(req).suggestReports(notebookId);
    sendSuccess(res, suggestions);
  } catch (err) {
    next(err);
  }
};

export const reviseSlide = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId, artifactId } = req.params as {
      notebookId: string;
      artifactId: string;
    };
    const { slideIndex, prompt } = req.body as {
      slideIndex: number;
      prompt: string;
    };
    const status = await resolveUseCase(req).reviseSlide(
      notebookId,
      artifactId,
      slideIndex,
      prompt,
    );
    sendSuccess(res, status);
  } catch (err) {
    next(err);
  }
};
