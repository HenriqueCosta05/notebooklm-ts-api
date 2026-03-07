import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { Artifact, ArtifactKind, GenerationStatus, ReportSuggestion } from "../../domain/models/notebooklm.types";
import {
  AudioFormat,
  AudioLength,
  ExportType,
  InfographicDetail,
  InfographicOrientation,
  QuizDifficulty,
  QuizQuantity,
  ReportFormat,
  SlideDeckFormat,
  SlideDeckLength,
  VideoFormat,
  VideoStyle,
} from "../../infrastructure/third-party/notebooklm/rpc/types";

export class ArtifactsUseCase {
  constructor(private readonly client: NotebookLMClient) {}

  async listArtifacts(notebookId: string, filterKind?: ArtifactKind): Promise<Artifact[]> {
    return this.client.artifacts.list(notebookId, filterKind);
  }

  async getArtifact(notebookId: string, artifactId: string): Promise<Artifact | null> {
    return this.client.artifacts.get(notebookId, artifactId);
  }

  async generateAudio(
    notebookId: string,
    options: {
      sourceIds?: string[];
      language?: string;
      instructions?: string | null;
      audioFormat?: AudioFormat | null;
      audioLength?: AudioLength | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateAudio(notebookId, options);
  }

  async generateVideo(
    notebookId: string,
    options: {
      sourceIds?: string[];
      language?: string;
      instructions?: string | null;
      videoFormat?: VideoFormat | null;
      videoStyle?: VideoStyle | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateVideo(notebookId, options);
  }

  async generateReport(
    notebookId: string,
    options: {
      reportFormat?: ReportFormat;
      sourceIds?: string[];
      language?: string;
      customPrompt?: string | null;
      extraInstructions?: string | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateReport(notebookId, options);
  }

  async generateStudyGuide(
    notebookId: string,
    options: {
      sourceIds?: string[];
      language?: string;
      extraInstructions?: string | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateStudyGuide(notebookId, options);
  }

  async generateQuiz(
    notebookId: string,
    options: {
      sourceIds?: string[];
      instructions?: string | null;
      quantity?: QuizQuantity | null;
      difficulty?: QuizDifficulty | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateQuiz(notebookId, options);
  }

  async generateFlashcards(
    notebookId: string,
    options: {
      sourceIds?: string[];
      instructions?: string | null;
      quantity?: QuizQuantity | null;
      difficulty?: QuizDifficulty | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateFlashcards(notebookId, options);
  }

  async generateInfographic(
    notebookId: string,
    options: {
      sourceIds?: string[];
      language?: string;
      instructions?: string | null;
      orientation?: InfographicOrientation | null;
      detailLevel?: InfographicDetail | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateInfographic(notebookId, options);
  }

  async generateSlideDeck(
    notebookId: string,
    options: {
      sourceIds?: string[];
      language?: string;
      instructions?: string | null;
      slideFormat?: SlideDeckFormat | null;
      slideLength?: SlideDeckLength | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateSlideDeck(notebookId, options);
  }

  async generateDataTable(
    notebookId: string,
    options: {
      sourceIds?: string[];
      language?: string;
      instructions?: string | null;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.generateDataTable(notebookId, options);
  }

  async generateMindMap(
    notebookId: string,
    options: { sourceIds?: string[] } = {}
  ): Promise<{ mindMap: unknown; noteId: string | null }> {
    return this.client.artifacts.generateMindMap(notebookId, options);
  }

  async reviseSlide(
    notebookId: string,
    artifactId: string,
    slideIndex: number,
    prompt: string
  ): Promise<GenerationStatus> {
    return this.client.artifacts.reviseSlide(notebookId, artifactId, slideIndex, prompt);
  }

  async pollStatus(notebookId: string, taskId: string): Promise<GenerationStatus> {
    return this.client.artifacts.pollStatus(notebookId, taskId);
  }

  async waitForCompletion(
    notebookId: string,
    taskId: string,
    options: {
      initialIntervalMs?: number;
      maxIntervalMs?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<GenerationStatus> {
    return this.client.artifacts.waitForCompletion(notebookId, taskId, options);
  }

  async downloadAudio(notebookId: string, outputPath: string, artifactId?: string): Promise<string> {
    return this.client.artifacts.downloadAudio(notebookId, outputPath, artifactId);
  }

  async downloadVideo(notebookId: string, outputPath: string, artifactId?: string): Promise<string> {
    return this.client.artifacts.downloadVideo(notebookId, outputPath, artifactId);
  }

  async downloadReport(notebookId: string, outputPath: string, artifactId?: string): Promise<string> {
    return this.client.artifacts.downloadReport(notebookId, outputPath, artifactId);
  }

  async downloadQuiz(
    notebookId: string,
    outputPath: string,
    options: { artifactId?: string; outputFormat?: "json" | "markdown" | "html" } = {}
  ): Promise<string> {
    return this.client.artifacts.downloadQuiz(notebookId, outputPath, options);
  }

  async downloadFlashcards(
    notebookId: string,
    outputPath: string,
    options: { artifactId?: string; outputFormat?: "json" | "markdown" | "html" } = {}
  ): Promise<string> {
    return this.client.artifacts.downloadFlashcards(notebookId, outputPath, options);
  }

  async downloadSlideDeck(
    notebookId: string,
    outputPath: string,
    options: { artifactId?: string; outputFormat?: "pdf" | "pptx" } = {}
  ): Promise<string> {
    return this.client.artifacts.downloadSlideDeck(notebookId, outputPath, options);
  }

  async downloadInfographic(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    return this.client.artifacts.downloadInfographic(notebookId, outputPath, artifactId);
  }

  async downloadMindMap(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    return this.client.artifacts.downloadMindMap(notebookId, outputPath, artifactId);
  }

  async downloadDataTable(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    return this.client.artifacts.downloadDataTable(notebookId, outputPath, artifactId);
  }

  async deleteArtifact(notebookId: string, artifactId: string): Promise<boolean> {
    return this.client.artifacts.delete(notebookId, artifactId);
  }

  async renameArtifact(notebookId: string, artifactId: string, newTitle: string): Promise<void> {
    return this.client.artifacts.rename(notebookId, artifactId, newTitle);
  }

  async exportArtifact(
    notebookId: string,
    artifactId: string,
    title?: string,
    exportType?: ExportType
  ): Promise<unknown> {
    return this.client.artifacts.export(notebookId, artifactId, title, exportType);
  }

  async suggestReports(notebookId: string): Promise<ReportSuggestion[]> {
    return this.client.artifacts.suggestReports(notebookId);
  }
}
