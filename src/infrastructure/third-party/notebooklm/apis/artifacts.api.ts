import * as fs from "fs";
import * as path from "path";
import { ClientCore } from "../core";
import {
  ArtifactStatus,
  ArtifactTypeCode,
  AudioFormat,
  AudioLength,
  ExportType,
  InfographicDetail,
  InfographicOrientation,
  QuizDifficulty,
  QuizQuantity,
  ReportFormat,
  RPCMethod,
  SlideDeckFormat,
  SlideDeckLength,
  VideoFormat,
  VideoStyle,
  artifactStatusToStr,
} from "../rpc/types";
import {
  ArtifactDownloadError,
  ArtifactNotFoundError,
  ArtifactNotReadyError,
  ArtifactParseError,
  ValidationError,
} from "../rpc/errors";
import {
  Artifact,
  ArtifactKind,
  GenerationStatus,
  ReportSuggestion,
  mapArtifactKind,
} from "../../../../domain/models/notebooklm.types";
import { NotesAPI } from "./notes.api";

const MEDIA_ARTIFACT_TYPES = new Set([
  ArtifactTypeCode.AUDIO,
  ArtifactTypeCode.VIDEO,
  ArtifactTypeCode.INFOGRAPHIC,
  ArtifactTypeCode.SLIDE_DECK,
]);

const TRUSTED_DOWNLOAD_DOMAINS = [".google.com", ".googleusercontent.com", ".googleapis.com"];

const isTrustedUrl = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    return TRUSTED_DOWNLOAD_DOMAINS.some(
      (d) => parsed.hostname === d.replace(/^\./, "") || parsed.hostname.endsWith(d)
    );
  } catch {
    return false;
  }
};

const isValidMediaUrl = (value: unknown): value is string =>
  typeof value === "string" && (value.startsWith("http://") || value.startsWith("https://"));

const mapArtifact = (raw: unknown[]): Artifact => {
  const id = typeof raw[0] === "string" ? raw[0] : String(raw[0] ?? "");
  const title = typeof raw[1] === "string" ? raw[1] : "";
  const artifactTypeCode: number = typeof raw[2] === "number" ? raw[2] : 0;
  const status: ArtifactStatus = typeof raw[4] === "number" ? raw[4] : ArtifactStatus.PENDING;

  let createdAt: Date | null = null;
  if (Array.isArray(raw[15]) && typeof (raw[15] as unknown[])[0] === "number") {
    try {
      createdAt = new Date((raw[15] as number[])[0] * 1000);
    } catch {
      createdAt = null;
    }
  }

  let variant: number | null = null;
  if (
    Array.isArray(raw[9]) &&
    Array.isArray((raw[9] as unknown[])[1]) &&
    (raw[9] as unknown[][])[1].length > 0
  ) {
    const v = (raw[9] as unknown[][])[1][0];
    variant = typeof v === "number" ? v : null;
  }

  const kind: ArtifactKind = mapArtifactKind(artifactTypeCode, variant);
  const statusStr = artifactStatusToStr(status);

  return {
    id,
    title,
    kind,
    artifactTypeCode,
    variant,
    status,
    createdAt,
    url: null,
    isCompleted: status === ArtifactStatus.COMPLETED,
    isProcessing: status === ArtifactStatus.PROCESSING,
    isPending: status === ArtifactStatus.PENDING,
    isFailed: status === ArtifactStatus.FAILED,
    statusStr,
    isQuiz: artifactTypeCode === ArtifactTypeCode.QUIZ && variant === 2,
    isFlashcards: artifactTypeCode === ArtifactTypeCode.QUIZ && variant === 1,
  };
};

const mapArtifactFromMindMap = (raw: unknown[]): Artifact | null => {
  if (!Array.isArray(raw) || raw.length < 1) return null;

  const id = typeof raw[0] === "string" ? raw[0] : "";

  if (raw.length >= 3 && raw[1] === null && raw[2] === 2) return null;

  let title = "";
  let createdAt: Date | null = null;

  if (Array.isArray(raw[1])) {
    const inner = raw[1] as unknown[];
    if (typeof inner[4] === "string") title = inner[4];
    if (
      Array.isArray(inner[2]) &&
      Array.isArray((inner[2] as unknown[])[2]) &&
      typeof ((inner[2] as unknown[][])[2] as unknown[])[0] === "number"
    ) {
      try {
        createdAt = new Date(((inner[2] as unknown[][])[2] as number[])[0] * 1000);
      } catch {
        createdAt = null;
      }
    }
  }

  return {
    id,
    title,
    kind: "mind_map",
    artifactTypeCode: ArtifactTypeCode.MIND_MAP,
    variant: null,
    status: ArtifactStatus.COMPLETED,
    createdAt,
    url: null,
    isCompleted: true,
    isProcessing: false,
    isPending: false,
    isFailed: false,
    statusStr: "completed",
    isQuiz: false,
    isFlashcards: false,
  };
};

const parseGenerationResult = (result: unknown): GenerationStatus => {
  if (Array.isArray(result) && (result as unknown[]).length > 0) {
    const artifactData = (result as unknown[][])[0];
    if (Array.isArray(artifactData) && artifactData.length > 0) {
      const taskId = typeof artifactData[0] === "string" ? artifactData[0] : "";
      const statusCode = typeof artifactData[4] === "number" ? artifactData[4] : null;
      const status = statusCode !== null ? artifactStatusToStr(statusCode) : "pending";

      if (taskId) {
        return buildGenerationStatus(taskId, status, null, null);
      }
    }
  }

  return buildGenerationStatus("", "failed", "Generation failed - no artifact_id returned", null);
};

const buildGenerationStatus = (
  taskId: string,
  status: string,
  error: string | null,
  errorCode: string | null
): GenerationStatus => ({
  taskId,
  status,
  url: null,
  error,
  errorCode,
  isComplete: status === "completed",
  isFailed: status === "failed",
  isPending: status === "pending",
  isInProgress: status === "in_progress",
  isRateLimited:
    status === "failed" &&
    (errorCode === "USER_DISPLAYABLE_ERROR" ||
      (typeof error === "string" &&
        (error.toLowerCase().includes("rate limit") || error.toLowerCase().includes("quota")))),
});

const extractAppData = (htmlContent: string): Record<string, unknown> => {
  const match = htmlContent.match(/data-app-data="([^"]+)"/);
  if (!match) {
    throw new ArtifactParseError("quiz/flashcard", {
      details: "No data-app-data attribute found in HTML",
    });
  }

  const decodedJson = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");

  return JSON.parse(decodedJson) as Record<string, unknown>;
};

const formatQuizMarkdown = (title: string, questions: unknown[]): string => {
  const lines: string[] = [`# ${title}`, ""];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Record<string, unknown>;
    lines.push(`## Question ${i + 1}`);
    lines.push(String(q["question"] ?? ""));
    lines.push("");
    const opts = q["answerOptions"];
    if (Array.isArray(opts)) {
      for (const opt of opts as Array<Record<string, unknown>>) {
        const marker = opt["isCorrect"] ? "[x]" : "[ ]";
        lines.push(`- ${marker} ${String(opt["text"] ?? "")}`);
      }
    }
    if (q["hint"]) {
      lines.push("");
      lines.push(`**Hint:** ${String(q["hint"])}`);
    }
    lines.push("");
  }
  return lines.join("\n");
};

const formatFlashcardsMarkdown = (title: string, cards: unknown[]): string => {
  const lines: string[] = [`# ${title}`, ""];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i] as Record<string, unknown>;
    lines.push(`## Card ${i + 1}`, "", `**Q:** ${String(card["f"] ?? "")}`, "", `**A:** ${String(card["b"] ?? "")}`, "", "---", "");
  }
  return lines.join("\n");
};

const extractCellText = (cell: unknown): string => {
  if (typeof cell === "string") return cell;
  if (typeof cell === "number") return "";
  if (Array.isArray(cell)) {
    return (cell as unknown[]).map(extractCellText).join("");
  }
  return "";
};

const parseDataTable = (rawData: unknown[]): { headers: string[]; rows: string[][] } => {
  try {
    const rowsArray = (rawData as unknown[][][][][])[0][0][0][0][4][2] as unknown[][];

    if (!rowsArray || rowsArray.length === 0) {
      throw new ArtifactParseError("data_table", { details: "Empty data table" });
    }

    const headers: string[] = [];
    const rows: string[][] = [];

    for (let i = 0; i < rowsArray.length; i++) {
      const rowSection = rowsArray[i];
      if (!Array.isArray(rowSection) || rowSection.length < 3) continue;

      const cellArray = rowSection[2];
      if (!Array.isArray(cellArray)) continue;

      const rowValues = (cellArray as unknown[]).map(extractCellText);

      i === 0 ? headers.push(...rowValues) : rows.push(rowValues);
    }

    if (!headers.length) {
      throw new ArtifactParseError("data_table", { details: "Failed to extract headers" });
    }

    return { headers, rows };
  } catch (error) {
    if (error instanceof ArtifactParseError) throw error;
    throw new ArtifactParseError("data_table", {
      details: `Failed to parse data table structure: ${String(error)}`,
      cause: error as Error,
    });
  }
};

export class ArtifactsAPI {
  constructor(
    private readonly core: ClientCore,
    private readonly notes: NotesAPI
  ) {}

  async list(notebookId: string, filterKind?: ArtifactKind): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];

    const params = [
      [2],
      notebookId,
      'NOT artifact.status = "ARTIFACT_STATUS_SUGGESTED"',
    ];

    const result = await this.core.rpcCall(RPCMethod.LIST_ARTIFACTS, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    const artifactsData: unknown[][] =
      Array.isArray(result) && Array.isArray((result as unknown[][])[0])
        ? (result as unknown[][][])[0]
        : (result as unknown[][]) ?? [];

    for (const artData of artifactsData) {
      if (Array.isArray(artData) && artData.length > 0) {
        const artifact = mapArtifact(artData);
        if (!filterKind || artifact.kind === filterKind) {
          artifacts.push(artifact);
        }
      }
    }

    if (!filterKind || filterKind === "mind_map") {
      try {
        const mindMaps = await this.notes.listMindMaps(notebookId);
        for (const mm of mindMaps) {
          const mmArtifact = mapArtifactFromMindMap(mm);
          if (mmArtifact && (!filterKind || mmArtifact.kind === filterKind)) {
            artifacts.push(mmArtifact);
          }
        }
      } catch {
        // Non-fatal: log would go here in production
      }
    }

    return artifacts;
  }

  async get(notebookId: string, artifactId: string): Promise<Artifact | null> {
    const artifacts = await this.list(notebookId);
    return artifacts.find((a) => a.id === artifactId) ?? null;
  }

  async listAudio(notebookId: string): Promise<Artifact[]> {
    return this.list(notebookId, "audio");
  }

  async listVideo(notebookId: string): Promise<Artifact[]> {
    return this.list(notebookId, "video");
  }

  async listReports(notebookId: string): Promise<Artifact[]> {
    return this.list(notebookId, "report");
  }

  async listQuizzes(notebookId: string): Promise<Artifact[]> {
    return this.list(notebookId, "quiz");
  }

  async listFlashcards(notebookId: string): Promise<Artifact[]> {
    return this.list(notebookId, "flashcards");
  }

  async listSlideDenks(notebookId: string): Promise<Artifact[]> {
    return this.list(notebookId, "slide_deck");
  }

  async listDataTables(notebookId: string): Promise<Artifact[]> {
    return this.list(notebookId, "data_table");
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
    const { language = "en", instructions = null, audioFormat = null, audioLength = null } = options;
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));

    const sourceIdsTriple = sourceIds.map((sid) => [[[sid]]]);
    const sourceIdsDouble = sourceIds.map((sid) => [[sid]]);

    const params = [
      [2],
      notebookId,
      [
        null, null,
        ArtifactTypeCode.AUDIO,
        sourceIdsTriple,
        null, null,
        [
          null,
          [
            instructions,
            audioLength ?? null,
            null,
            sourceIdsDouble,
            language,
            null,
            audioFormat ?? null,
          ],
        ],
      ],
    ];

    return this.callGenerate(notebookId, params);
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
    const { language = "en", instructions = null, videoFormat = null, videoStyle = null } = options;
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));

    const sourceIdsTriple = sourceIds.map((sid) => [[[sid]]]);
    const sourceIdsDouble = sourceIds.map((sid) => [[sid]]);

    const params = [
      [2],
      notebookId,
      [
        null, null,
        ArtifactTypeCode.VIDEO,
        sourceIdsTriple,
        null, null, null, null,
        [
          null, null,
          [
            sourceIdsDouble,
            language,
            instructions,
            null,
            videoFormat ?? null,
            videoStyle ?? null,
          ],
        ],
      ],
    ];

    return this.callGenerate(notebookId, params);
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
    const {
      reportFormat = ReportFormat.BRIEFING_DOC,
      language = "en",
      customPrompt = null,
      extraInstructions = null,
    } = options;
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));

    const formatConfigs: Record<ReportFormat, { title: string; description: string; prompt: string }> = {
      [ReportFormat.BRIEFING_DOC]: {
        title: "Briefing Doc",
        description: "Key insights and important quotes",
        prompt:
          "Create a comprehensive briefing document that includes an Executive Summary, detailed analysis of key themes, important quotes with context, and actionable insights.",
      },
      [ReportFormat.STUDY_GUIDE]: {
        title: "Study Guide",
        description: "Short-answer quiz, essay questions, glossary",
        prompt:
          "Create a comprehensive study guide that includes key concepts, short-answer practice questions, essay prompts for deeper exploration, and a glossary of important terms.",
      },
      [ReportFormat.BLOG_POST]: {
        title: "Blog Post",
        description: "Insightful takeaways in readable article format",
        prompt:
          "Write an engaging blog post that presents the key insights in an accessible, reader-friendly format. Include an attention-grabbing introduction, well-organized sections, and a compelling conclusion with takeaways.",
      },
      [ReportFormat.CUSTOM]: {
        title: "Custom Report",
        description: "Custom format",
        prompt: customPrompt ?? "Create a report based on the provided sources.",
      },
    };

    const config = { ...formatConfigs[reportFormat] };
    if (extraInstructions && reportFormat !== ReportFormat.CUSTOM) {
      config.prompt = `${config.prompt}\n\n${extraInstructions}`;
    }

    const sourceIdsTriple = sourceIds.map((sid) => [[[sid]]]);
    const sourceIdsDouble = sourceIds.map((sid) => [[sid]]);

    const params = [
      [2],
      notebookId,
      [
        null, null,
        ArtifactTypeCode.REPORT,
        sourceIdsTriple,
        null, null, null,
        [
          null,
          [
            config.title,
            config.description,
            null,
            sourceIdsDouble,
            language,
            config.prompt,
            null,
            true,
          ],
        ],
      ],
    ];

    return this.callGenerate(notebookId, params);
  }

  async generateStudyGuide(
    notebookId: string,
    options: { sourceIds?: string[]; language?: string; extraInstructions?: string | null } = {}
  ): Promise<GenerationStatus> {
    return this.generateReport(notebookId, {
      reportFormat: ReportFormat.STUDY_GUIDE,
      ...options,
    });
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
    const { instructions = null, quantity = null, difficulty = null } = options;
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));
    const sourceIdsTriple = sourceIds.map((sid) => [[[sid]]]);

    const params = [
      [2],
      notebookId,
      [
        null, null,
        ArtifactTypeCode.QUIZ,
        sourceIdsTriple,
        null, null, null, null, null,
        [
          null,
          [2, null, instructions, null, null, null, null, [quantity ?? null, difficulty ?? null]],
        ],
      ],
    ];

    return this.callGenerate(notebookId, params);
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
    const { instructions = null, quantity = null, difficulty = null } = options;
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));
    const sourceIdsTriple = sourceIds.map((sid) => [[[sid]]]);

    const params = [
      [2],
      notebookId,
      [
        null, null,
        ArtifactTypeCode.QUIZ,
        sourceIdsTriple,
        null, null, null, null, null,
        [
          null,
          [1, null, instructions, null, null, null, [difficulty ?? null, quantity ?? null]],
        ],
      ],
    ];

    return this.callGenerate(notebookId, params);
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
    const { language = "en", instructions = null, orientation = null, detailLevel = null } = options;
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));
    const sourceIdsTriple = sourceIds.map((sid) => [[[sid]]]);

    const params = [
      [2],
      notebookId,
      [
        null, null,
        ArtifactTypeCode.INFOGRAPHIC,
        sourceIdsTriple,
        null, null, null, null, null, null, null, null, null, null,
        [[instructions, language, null, orientation ?? null, detailLevel ?? null]],
      ],
    ];

    return this.callGenerate(notebookId, params);
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
    const { language = "en", instructions = null, slideFormat = null, slideLength = null } = options;
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));
    const sourceIdsTriple = sourceIds.map((sid) => [[[sid]]]);

    const params = [
      [2],
      notebookId,
      [
        null, null,
        ArtifactTypeCode.SLIDE_DECK,
        sourceIdsTriple,
        null, null, null, null, null, null, null, null, null, null, null, null,
        [[instructions, language, slideFormat ?? null, slideLength ?? null]],
      ],
    ];

    return this.callGenerate(notebookId, params);
  }

  async generateDataTable(
    notebookId: string,
    options: {
      sourceIds?: string[];
      language?: string;
      instructions?: string | null;
    } = {}
  ): Promise<GenerationStatus> {
    const { language = "en", instructions = null } = options;
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));
    const sourceIdsTriple = sourceIds.map((sid) => [[[sid]]]);

    const params = [
      [2],
      notebookId,
      [
        null, null,
        ArtifactTypeCode.DATA_TABLE,
        sourceIdsTriple,
        null, null, null, null, null, null, null, null, null, null, null, null, null, null,
        [null, [instructions, language]],
      ],
    ];

    return this.callGenerate(notebookId, params);
  }

  async generateMindMap(
    notebookId: string,
    options: { sourceIds?: string[] } = {}
  ): Promise<{ mindMap: unknown; noteId: string | null }> {
    const sourceIds = options.sourceIds ?? (await this.core.getSourceIds(notebookId));
    const sourceIdsNested = sourceIds.map((sid) => [[[sid]]]);

    const params = [
      sourceIdsNested,
      null, null, null, null,
      ["interactive_mindmap", [["[CONTEXT]", ""]], ""],
      null,
      [2, null, [1]],
    ];

    const result = await this.core.rpcCall(RPCMethod.GENERATE_MIND_MAP, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (Array.isArray(result) && (result as unknown[]).length > 0) {
      const inner = (result as unknown[][])[0];
      if (Array.isArray(inner) && inner.length > 0) {
        const mindMapJson = inner[0];

        let mindMapData: unknown = mindMapJson;
        let mindMapStr: string;

        if (typeof mindMapJson === "string") {
          try {
            mindMapData = JSON.parse(mindMapJson);
            mindMapStr = mindMapJson;
          } catch {
            mindMapStr = String(mindMapJson);
          }
        } else {
          mindMapStr = JSON.stringify(mindMapJson);
        }

        const title =
          mindMapData !== null &&
          typeof mindMapData === "object" &&
          "name" in (mindMapData as object)
            ? String((mindMapData as Record<string, unknown>)["name"])
            : "Mind Map";

        const note = await this.notes.create(notebookId, { title, content: mindMapStr });

        return { mindMap: mindMapData, noteId: note.id || null };
      }
    }

    return { mindMap: null, noteId: null };
  }

  async reviseSlide(
    notebookId: string,
    artifactId: string,
    slideIndex: number,
    prompt: string
  ): Promise<GenerationStatus> {
    if (slideIndex < 0) {
      throw new ValidationError(`slideIndex must be >= 0, got ${slideIndex}`);
    }

    const params = [[2], artifactId, [[[slideIndex, prompt]]]];

    try {
      const result = await this.core.rpcCall(RPCMethod.REVISE_SLIDE, params, {
        sourcePath: `/notebook/${notebookId}`,
        allowNull: true,
      });
      return parseGenerationResult(result);
    } catch (error) {
      if (
        error instanceof Error &&
        "rpcCode" in error &&
        (error as { rpcCode: unknown }).rpcCode === "USER_DISPLAYABLE_ERROR"
      ) {
        return buildGenerationStatus("", "failed", error.message, "USER_DISPLAYABLE_ERROR");
      }
      throw error;
    }
  }

  async pollStatus(notebookId: string, taskId: string): Promise<GenerationStatus> {
    const artifactsData = await this.listRaw(notebookId);

    for (const art of artifactsData) {
      if (!Array.isArray(art) || art.length === 0 || art[0] !== taskId) continue;

      const statusCode: number = typeof art[4] === "number" ? art[4] : 0;
      const artifactType: number = typeof art[2] === "number" ? art[2] : 0;

      const effectiveStatus =
        statusCode === ArtifactStatus.COMPLETED && !this.isMediaReady(art, artifactType)
          ? ArtifactStatus.PROCESSING
          : statusCode;

      const status = artifactStatusToStr(effectiveStatus);
      return buildGenerationStatus(taskId, status, null, null);
    }

    return buildGenerationStatus(taskId, "pending", null, null);
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
    const {
      initialIntervalMs = 2_000,
      maxIntervalMs = 10_000,
      timeoutMs = 300_000,
    } = options;

    const start = Date.now();
    let current = initialIntervalMs;

    while (true) {
      const status = await this.pollStatus(notebookId, taskId);

      if (status.isComplete || status.isFailed) return status;

      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        throw new Error(`Task ${taskId} timed out after ${timeoutMs}ms`);
      }

      const remaining = timeoutMs - elapsed;
      const sleep = Math.min(current, remaining);
      if (sleep > 0) await new Promise((resolve) => setTimeout(resolve, sleep));
      current = Math.min(current * 2, maxIntervalMs);
    }
  }

  async downloadAudio(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    const artifactsData = await this.listRaw(notebookId);

    const candidates = artifactsData.filter(
      (a) =>
        Array.isArray(a) &&
        a.length > 4 &&
        a[2] === ArtifactTypeCode.AUDIO &&
        a[4] === ArtifactStatus.COMPLETED
    );

    const art = artifactId
      ? candidates.find((a) => a[0] === artifactId)
      : candidates[0];

    if (!art) {
      throw new ArtifactNotReadyError("audio", artifactId ? { artifactId } : {});
    }

    try {
      const metadata = art[6] as unknown[];
      if (!Array.isArray(metadata) || metadata.length <= 5) {
        throw new ArtifactParseError("audio", { details: "Invalid audio metadata structure" });
      }

      const mediaList = metadata[5] as unknown[];
      if (!Array.isArray(mediaList) || mediaList.length === 0) {
        throw new ArtifactParseError("audio", { details: "No media URLs found" });
      }

      let url: string | null = null;
      for (const item of mediaList as unknown[][]) {
        if (Array.isArray(item) && item.length > 2 && item[2] === "audio/mp4") {
          url = typeof item[0] === "string" ? item[0] : null;
          break;
        }
      }

      if (!url && Array.isArray(mediaList[0])) {
        url = typeof (mediaList[0] as unknown[])[0] === "string"
          ? (mediaList[0] as string[])[0]
          : null;
      }

      if (!url) {
        throw new ArtifactDownloadError("audio", { details: "Could not extract download URL" });
      }

      return this.downloadUrl(url, outputPath);
    } catch (error) {
      if (error instanceof ArtifactParseError || error instanceof ArtifactDownloadError) throw error;
      throw new ArtifactParseError("audio", {
        details: `Failed to parse audio artifact: ${String(error)}`,
        cause: error as Error,
      });
    }
  }

  async downloadVideo(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    const artifactsData = await this.listRaw(notebookId);

    const candidates = artifactsData.filter(
      (a) =>
        Array.isArray(a) &&
        a.length > 4 &&
        a[2] === ArtifactTypeCode.VIDEO &&
        a[4] === ArtifactStatus.COMPLETED
    );

    const art = artifactId
      ? candidates.find((a) => a[0] === artifactId)
      : candidates[0];

    if (!art) {
      throw new ArtifactNotReadyError("video", artifactId ? { artifactId } : {});
    }

    try {
      if (art.length <= 8) {
        throw new ArtifactParseError("video", { details: "Invalid structure" });
      }

      const metadata = art[8] as unknown[];
      if (!Array.isArray(metadata)) {
        throw new ArtifactParseError("video_metadata", { details: "Invalid structure" });
      }

      let mediaList: unknown[] | null = null;
      for (const item of metadata as unknown[][]) {
        if (
          Array.isArray(item) &&
          item.length > 0 &&
          Array.isArray(item[0]) &&
          (item[0] as unknown[]).length > 0 &&
          typeof (item[0] as unknown[])[0] === "string" &&
          ((item[0] as string[])[0]).startsWith("http")
        ) {
          mediaList = item;
          break;
        }
      }

      if (!mediaList) {
        throw new ArtifactParseError("video", { details: "No media URLs found" });
      }

      let url: string | null = null;
      for (const item of mediaList as unknown[][]) {
        if (Array.isArray(item) && item.length > 2 && item[2] === "video/mp4") {
          url = typeof item[0] === "string" ? item[0] : null;
          if (item[1] === 4) break;
        }
      }

      if (!url && mediaList.length > 0) {
        url = typeof (mediaList[0] as unknown[])[0] === "string"
          ? (mediaList[0] as string[])[0]
          : null;
      }

      if (!url) {
        throw new ArtifactDownloadError("video", { details: "Could not extract download URL" });
      }

      return this.downloadUrl(url, outputPath);
    } catch (error) {
      if (error instanceof ArtifactParseError || error instanceof ArtifactDownloadError) throw error;
      throw new ArtifactParseError("video", {
        details: `Failed to parse video artifact: ${String(error)}`,
        cause: error as Error,
      });
    }
  }

  async downloadReport(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    const artifactsData = await this.listRaw(notebookId);

    const candidates = artifactsData.filter(
      (a) =>
        Array.isArray(a) &&
        a.length > 7 &&
        a[2] === ArtifactTypeCode.REPORT &&
        a[4] === ArtifactStatus.COMPLETED
    );

    const art = this.selectArtifact(candidates, artifactId, "report");

    try {
      const contentWrapper = art[7] as unknown;
      const markdownContent = Array.isArray(contentWrapper) && contentWrapper.length > 0
        ? contentWrapper[0]
        : contentWrapper;

      if (typeof markdownContent !== "string") {
        throw new ArtifactParseError("report", { details: "Invalid structure" });
      }

      const output = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, markdownContent, "utf-8");
      return output;
    } catch (error) {
      if (error instanceof ArtifactParseError) throw error;
      throw new ArtifactParseError("report", {
        details: `Failed to parse structure: ${String(error)}`,
        cause: error as Error,
      });
    }
  }

  async downloadQuiz(
    notebookId: string,
    outputPath: string,
    options: { artifactId?: string; outputFormat?: "json" | "markdown" | "html" } = {}
  ): Promise<string> {
    return this.downloadInteractiveArtifact(notebookId, outputPath, "quiz", options);
  }

  async downloadFlashcards(
    notebookId: string,
    outputPath: string,
    options: { artifactId?: string; outputFormat?: "json" | "markdown" | "html" } = {}
  ): Promise<string> {
    return this.downloadInteractiveArtifact(notebookId, outputPath, "flashcards", options);
  }

  async downloadSlideDeck(
    notebookId: string,
    outputPath: string,
    options: { artifactId?: string; outputFormat?: "pdf" | "pptx" } = {}
  ): Promise<string> {
    const { artifactId, outputFormat = "pdf" } = options;

    if (outputFormat !== "pdf" && outputFormat !== "pptx") {
      throw new ValidationError(`Invalid format '${outputFormat}'. Must be 'pdf' or 'pptx'.`);
    }

    const artifactsData = await this.listRaw(notebookId);
    const candidates = artifactsData.filter(
      (a) =>
        Array.isArray(a) &&
        a.length > 4 &&
        a[2] === ArtifactTypeCode.SLIDE_DECK &&
        a[4] === ArtifactStatus.COMPLETED
    );

    const art = this.selectArtifact(candidates, artifactId, "slide_deck");

    try {
      if (art.length <= 16) {
        throw new ArtifactParseError("slide_deck", { details: "Invalid structure" });
      }

      const metadata = art[16] as unknown[];
      if (!Array.isArray(metadata)) {
        throw new ArtifactParseError("slide_deck_metadata", { details: "Invalid structure" });
      }

      const url = outputFormat === "pptx"
        ? (metadata.length >= 5 ? metadata[4] : null)
        : (metadata.length >= 4 ? metadata[3] : null);

      if (typeof url !== "string" || !url.startsWith("http")) {
        throw new ArtifactDownloadError("slide_deck", {
          details: `Could not find ${outputFormat.toUpperCase()} download URL`,
        });
      }

      return this.downloadUrl(url, outputPath);
    } catch (error) {
      if (error instanceof ArtifactParseError || error instanceof ArtifactDownloadError) throw error;
      throw new ArtifactParseError("slide_deck", {
        details: `Failed to parse structure: ${String(error)}`,
        cause: error as Error,
      });
    }
  }

  async downloadInfographic(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    const artifactsData = await this.listRaw(notebookId);
    const candidates = artifactsData.filter(
      (a) =>
        Array.isArray(a) &&
        a.length > 4 &&
        a[2] === ArtifactTypeCode.INFOGRAPHIC &&
        a[4] === ArtifactStatus.COMPLETED
    );

    const art = artifactId
      ? candidates.find((a) => a[0] === artifactId)
      : candidates[0];

    if (!art) {
      throw new ArtifactNotReadyError("infographic", artifactId ? { artifactId } : {});
    }

    const url = this.findInfographicUrl(art);
    if (!url) {
      throw new ArtifactDownloadError("infographic", { details: "Could not find image URL" });
    }

    return this.downloadUrl(url, outputPath);
  }

  async downloadMindMap(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    const mindMaps = await this.notes.listMindMaps(notebookId);

    if (mindMaps.length === 0) {
      throw new ArtifactNotReadyError("mind_map");
    }

    const mindMap = artifactId
      ? mindMaps.find((mm) => mm[0] === artifactId)
      : mindMaps[0];

    if (!mindMap) {
      throw new ArtifactNotFoundError(artifactId!, { artifactType: "mind_map" });
    }

    try {
      const jsonString = (mindMap[1] as unknown[])[1];
      if (typeof jsonString !== "string") {
        throw new ArtifactParseError("mind_map", { details: "Invalid structure" });
      }

      const jsonData = JSON.parse(jsonString) as unknown;
      const output = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(jsonData, null, 2), "utf-8");
      return output;
    } catch (error) {
      if (error instanceof ArtifactParseError) throw error;
      throw new ArtifactParseError("mind_map", {
        details: `Failed to parse structure: ${String(error)}`,
        cause: error as Error,
      });
    }
  }

  async downloadDataTable(
    notebookId: string,
    outputPath: string,
    artifactId?: string
  ): Promise<string> {
    const artifactsData = await this.listRaw(notebookId);
    const candidates = artifactsData.filter(
      (a) =>
        Array.isArray(a) &&
        a.length > 18 &&
        a[2] === ArtifactTypeCode.DATA_TABLE &&
        a[4] === ArtifactStatus.COMPLETED
    );

    const art = this.selectArtifact(candidates, artifactId, "data_table");

    try {
      const rawData = art[18] as unknown[];
      const { headers, rows } = parseDataTable(rawData);

      const csvLines = [
        headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
        ...rows.map((row) =>
          row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
        ),
      ];

      const output = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, "\uFEFF" + csvLines.join("\n"), "utf-8");
      return output;
    } catch (error) {
      if (error instanceof ArtifactParseError) throw error;
      throw new ArtifactParseError("data_table", {
        details: `Failed to parse structure: ${String(error)}`,
        cause: error as Error,
      });
    }
  }

  async delete(notebookId: string, artifactId: string): Promise<boolean> {
    const params = [[2], artifactId];
    await this.core.rpcCall(RPCMethod.DELETE_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return true;
  }

  async rename(notebookId: string, artifactId: string, newTitle: string): Promise<void> {
    const params = [[artifactId, newTitle], [["title"]]];
    await this.core.rpcCall(RPCMethod.RENAME_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
  }

  async export(
    notebookId: string,
    artifactId: string,
    title = "Export",
    exportType: ExportType = ExportType.DOCS
  ): Promise<unknown> {
    const params = [null, artifactId, null, title, Number(exportType)];
    return this.core.rpcCall(RPCMethod.EXPORT_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
  }

  async suggestReports(notebookId: string): Promise<ReportSuggestion[]> {
    const params = [[2], notebookId];
    const result = await this.core.rpcCall(RPCMethod.GET_SUGGESTED_REPORTS, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result)) return [];

    const items = Array.isArray((result as unknown[][])[0])
      ? (result as unknown[][][])[0]
      : (result as unknown[][]);

    return items
      .filter((item): item is unknown[] => Array.isArray(item) && item.length >= 5)
      .map((item) => ({
        title: typeof item[0] === "string" ? item[0] : "",
        description: typeof item[1] === "string" ? item[1] : "",
        prompt: typeof item[4] === "string" ? item[4] : "",
        audienceLevel: typeof item[5] === "number" ? item[5] : 2,
      }));
  }

  private async callGenerate(notebookId: string, params: unknown[]): Promise<GenerationStatus> {
    try {
      const result = await this.core.rpcCall(RPCMethod.CREATE_ARTIFACT, params, {
        sourcePath: `/notebook/${notebookId}`,
        allowNull: true,
      });
      return parseGenerationResult(result);
    } catch (error) {
      if (
        error instanceof Error &&
        "rpcCode" in error &&
        (error as { rpcCode: unknown }).rpcCode === "USER_DISPLAYABLE_ERROR"
      ) {
        return buildGenerationStatus("", "failed", error.message, "USER_DISPLAYABLE_ERROR");
      }
      throw error;
    }
  }

  private async listRaw(notebookId: string): Promise<unknown[][]> {
    const params = [
      [2],
      notebookId,
      'NOT artifact.status = "ARTIFACT_STATUS_SUGGESTED"',
    ];
    const result = await this.core.rpcCall(RPCMethod.LIST_ARTIFACTS, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result)) return [];
    return Array.isArray((result as unknown[][])[0])
      ? (result as unknown[][][])[0]
      : (result as unknown[][]);
  }

  private selectArtifact(
    candidates: unknown[][],
    artifactId: string | undefined,
    typeName: string
  ): unknown[] {
    if (artifactId) {
      const found = candidates.find((a) => a[0] === artifactId);
      if (!found) throw new ArtifactNotReadyError(typeName, { artifactId });
      return found;
    }

    if (candidates.length === 0) throw new ArtifactNotReadyError(typeName);

    return [...candidates].sort((a, b) => {
      const tsA = Array.isArray(a[15]) && typeof (a[15] as number[])[0] === "number"
        ? (a[15] as number[])[0]
        : 0;
      const tsB = Array.isArray(b[15]) && typeof (b[15] as number[])[0] === "number"
        ? (b[15] as number[])[0]
        : 0;
      return tsB - tsA;
    })[0];
  }

  private async getArtifactContent(notebookId: string, artifactId: string): Promise<string | null> {
    const result = await this.core.rpcCall(RPCMethod.GET_INTERACTIVE_HTML, [artifactId], {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result) || (result as unknown[]).length === 0) return null;

    const data = (result as unknown[][])[0];
    if (
      Array.isArray(data) &&
      data.length > 9 &&
      data[9] !== null &&
      data[9] !== undefined
    ) {
      const htmlContent = (data[9] as unknown[])[0];
      return typeof htmlContent === "string" ? htmlContent : null;
    }

    return null;
  }

  private async downloadInteractiveArtifact(
    notebookId: string,
    outputPath: string,
    artifactType: "quiz" | "flashcards",
    options: { artifactId?: string; outputFormat?: "json" | "markdown" | "html" }
  ): Promise<string> {
    const { artifactId, outputFormat = "json" } = options;
    const validFormats = ["json", "markdown", "html"];

    if (!validFormats.includes(outputFormat)) {
      throw new ValidationError(
        `Invalid outputFormat: '${outputFormat}'. Use one of: ${validFormats.join(", ")}`
      );
    }

    const isQuiz = artifactType === "quiz";
    const artifacts = isQuiz
      ? await this.listQuizzes(notebookId)
      : await this.listFlashcards(notebookId);

    const completed = artifacts
      .filter((a) => a.isCompleted)
      .sort((a, b) => {
        const tA = a.createdAt?.getTime() ?? 0;
        const tB = b.createdAt?.getTime() ?? 0;
        return tB - tA;
      });

    if (completed.length === 0) throw new ArtifactNotReadyError(artifactType);

    const artifact = artifactId
      ? completed.find((a) => a.id === artifactId) ?? (() => { throw new ArtifactNotFoundError(artifactId, { artifactType }); })()
      : completed[0];

    const htmlContent = await this.getArtifactContent(notebookId, artifact.id);
    if (!htmlContent) {
      throw new ArtifactDownloadError(artifactType, { details: "Failed to fetch content" });
    }

    let appData: Record<string, unknown>;
    try {
      appData = extractAppData(htmlContent);
    } catch (error) {
      throw new ArtifactParseError(artifactType, {
        details: `Failed to parse content: ${String(error)}`,
        cause: error as Error,
      });
    }

    const title = artifact.title || (isQuiz ? "Untitled Quiz" : "Untitled Flashcards");
    const content = this.formatInteractiveContent(appData, title, outputFormat, htmlContent, isQuiz);

    const output = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, content, "utf-8");
    return output;
  }

  private formatInteractiveContent(
    appData: Record<string, unknown>,
    title: string,
    outputFormat: string,
    htmlContent: string,
    isQuiz: boolean
  ): string {
    if (outputFormat === "html") return htmlContent;

    if (isQuiz) {
      const questions = (appData["quiz"] as unknown[]) ?? [];
      return outputFormat === "markdown"
        ? formatQuizMarkdown(title, questions)
        : JSON.stringify({ title, questions }, null, 2);
    }

    const cards = (appData["flashcards"] as unknown[]) ?? [];
    if (outputFormat === "markdown") return formatFlashcardsMarkdown(title, cards);

    const normalized = (cards as Array<Record<string, unknown>>).map((c) => ({
      front: String(c["f"] ?? ""),
      back: String(c["b"] ?? ""),
    }));

    return JSON.stringify({ title, cards: normalized }, null, 2);
  }

  private async downloadUrl(url: string, outputPath: string): Promise<string> {
    if (!isTrustedUrl(url)) {
      throw new ArtifactDownloadError("media", {
        details: `Untrusted or non-HTTPS download URL: ${url.slice(0, 80)}`,
      });
    }

    const output = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const cookieHeader = this.core.authTokens.cookieHeader;
    const response = await fetch(url, {
      headers: { Cookie: cookieHeader },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new ArtifactDownloadError("media", {
        details: `Download failed: HTTP ${response.status}`,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      throw new ArtifactDownloadError("media", {
        details:
          "Download failed: received HTML instead of media file. Authentication may have expired.",
      });
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(output, Buffer.from(buffer));
    return output;
  }

  private findInfographicUrl(art: unknown[]): string | null {
    for (let i = art.length - 1; i >= 0; i--) {
      const item = art[i];
      if (!Array.isArray(item) || item.length <= 2) continue;

      const content = item[2];
      if (!Array.isArray(content) || (content as unknown[]).length === 0) continue;

      const firstContent = (content as unknown[][])[0];
      if (!Array.isArray(firstContent) || firstContent.length <= 1) continue;

      const imgData = firstContent[1];
      if (Array.isArray(imgData) && imgData.length > 0) {
        const url = (imgData as unknown[])[0];
        if (isValidMediaUrl(url)) return url;
      }
    }
    return null;
  }

  private isMediaReady(art: unknown[], artifactType: number): boolean {
    try {
      if (artifactType === ArtifactTypeCode.AUDIO) {
        if (art.length > 6 && Array.isArray(art[6]) && (art[6] as unknown[]).length > 5) {
          const mediaList = (art[6] as unknown[][])[5];
          if (Array.isArray(mediaList) && mediaList.length > 0) {
            const first = (mediaList as unknown[][])[0];
            return Array.isArray(first) && first.length > 0 && isValidMediaUrl(first[0]);
          }
        }
        return false;
      }

      if (artifactType === ArtifactTypeCode.VIDEO) {
        if (art.length > 8 && Array.isArray(art[8])) {
          return (art[8] as unknown[][]).some(
            (item) => Array.isArray(item) && item.length > 0 && isValidMediaUrl(item[0])
          );
        }
        return false;
      }

      if (artifactType === ArtifactTypeCode.INFOGRAPHIC) {
        return this.findInfographicUrl(art) !== null;
      }

      if (artifactType === ArtifactTypeCode.SLIDE_DECK) {
        return (
          art.length > 16 &&
          Array.isArray(art[16]) &&
          (art[16] as unknown[]).length > 3 &&
          isValidMediaUrl((art[16] as unknown[])[3])
        );
      }

      return true;
    } catch {
      return !MEDIA_ARTIFACT_TYPES.has(artifactType);
    }
  }
}
