import { ArtifactStatus, ArtifactTypeCode, SharePermission, SourceStatus, SourceTypeCode } from "../../infrastructure/third-party/notebooklm/rpc/types";

export interface Notebook {
  id: string;
  title: string;
  createdAt: Date | null;
  sourcesCount: number;
  isOwner: boolean;
}

export interface NotebookDescription {
  summary: string;
  suggestedTopics: SuggestedTopic[];
}

export interface SuggestedTopic {
  question: string;
  prompt: string;
}

export type SourceKind =
  | "google_docs"
  | "google_slides"
  | "google_spreadsheet"
  | "pdf"
  | "pasted_text"
  | "web_page"
  | "google_drive_audio"
  | "google_drive_video"
  | "youtube"
  | "markdown"
  | "docx"
  | "csv"
  | "image"
  | "media"
  | "unknown";

export type ArtifactKind =
  | "audio"
  | "video"
  | "report"
  | "quiz"
  | "flashcards"
  | "mind_map"
  | "infographic"
  | "slide_deck"
  | "data_table"
  | "unknown";

export interface Source {
  id: string;
  title: string | null;
  url: string | null;
  kind: SourceKind;
  createdAt: Date | null;
  status: SourceStatus;
  isReady: boolean;
  isProcessing: boolean;
  isError: boolean;
}

export interface SourceFulltext {
  sourceId: string;
  title: string;
  content: string;
  kind: SourceKind;
  url: string | null;
  charCount: number;
}

export interface SourceGuide {
  summary: string;
  keywords: string[];
}

export interface Artifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  artifactTypeCode: ArtifactTypeCode;
  variant: number | null;
  status: ArtifactStatus;
  createdAt: Date | null;
  url: string | null;
  isCompleted: boolean;
  isProcessing: boolean;
  isPending: boolean;
  isFailed: boolean;
  statusStr: string;
  isQuiz: boolean;
  isFlashcards: boolean;
}

export interface GenerationStatus {
  taskId: string;
  status: "pending" | "in_progress" | "completed" | "failed" | string;
  url: string | null;
  error: string | null;
  errorCode: string | null;
  isComplete: boolean;
  isFailed: boolean;
  isPending: boolean;
  isInProgress: boolean;
  isRateLimited: boolean;
}

export interface ReportSuggestion {
  title: string;
  description: string;
  prompt: string;
  audienceLevel: number;
}

export interface Note {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  createdAt: Date | null;
}

export interface ConversationTurn {
  query: string;
  answer: string;
  turnNumber: number;
}

export interface ChatReference {
  sourceId: string;
  citationNumber: number | null;
  citedText: string | null;
  startChar: number | null;
  endChar: number | null;
  chunkId: string | null;
}

export interface AskResult {
  answer: string;
  conversationId: string;
  turnNumber: number;
  isFollowUp: boolean;
  references: ChatReference[];
  rawResponse: string;
}

export type ChatMode = "default" | "learning_guide" | "concise" | "detailed";

export interface SharedUser {
  email: string;
  permission: SharePermission;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ShareStatus {
  notebookId: string;
  isPublic: boolean;
  sharedUsers: SharedUser[];
  shareUrl: string | null;
}

export interface UserSettings {
  outputLanguage: string | null;
}

const SOURCE_TYPE_CODE_MAP: Partial<Record<SourceTypeCode, SourceKind>> = {
  [SourceTypeCode.GOOGLE_DOCS]: "google_docs",
  [SourceTypeCode.GOOGLE_SLIDES]: "google_slides",
  [SourceTypeCode.PDF]: "pdf",
  [SourceTypeCode.PASTED_TEXT]: "pasted_text",
  [SourceTypeCode.WEB_PAGE]: "web_page",
  [SourceTypeCode.MARKDOWN]: "markdown",
  [SourceTypeCode.YOUTUBE]: "youtube",
  [SourceTypeCode.MEDIA]: "media",
  [SourceTypeCode.DOCX]: "docx",
  [SourceTypeCode.IMAGE]: "image",
  [SourceTypeCode.GOOGLE_SPREADSHEET]: "google_spreadsheet",
  [SourceTypeCode.CSV]: "csv",
};

const ARTIFACT_TYPE_MAP: Partial<Record<ArtifactTypeCode, ArtifactKind>> = {
  [ArtifactTypeCode.AUDIO]: "audio",
  [ArtifactTypeCode.REPORT]: "report",
  [ArtifactTypeCode.VIDEO]: "video",
  [ArtifactTypeCode.MIND_MAP]: "mind_map",
  [ArtifactTypeCode.INFOGRAPHIC]: "infographic",
  [ArtifactTypeCode.SLIDE_DECK]: "slide_deck",
  [ArtifactTypeCode.DATA_TABLE]: "data_table",
};

export const mapSourceKind = (typeCode: number | null | undefined): SourceKind =>
  typeCode !== null && typeCode !== undefined
    ? (SOURCE_TYPE_CODE_MAP[typeCode as SourceTypeCode] ?? "unknown")
    : "unknown";

export const mapArtifactKind = (artifactType: number, variant: number | null): ArtifactKind => {
  if (artifactType === ArtifactTypeCode.QUIZ) {
    return variant === 1 ? "flashcards" : variant === 2 ? "quiz" : "unknown";
  }
  return ARTIFACT_TYPE_MAP[artifactType as ArtifactTypeCode] ?? "unknown";
};
