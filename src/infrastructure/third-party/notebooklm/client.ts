import { AuthTokens } from "./auth";
import { ClientCore, DEFAULT_TIMEOUT, RefreshCallback } from "./core";
import { NotebooksAPI } from "./apis/notebooks.api";
import { SourcesAPI } from "./apis/sources.api";
import { NotesAPI } from "./apis/notes.api";
import { ArtifactsAPI } from "./apis/artifacts.api";
import { ChatAPI } from "./apis/chat.api";
import { SharingAPI } from "./apis/sharing.api";
import { SettingsAPI } from "./apis/settings.api";
import { ResearchAPI } from "./apis/research.api";
import { extractCsrfFromHtml, extractSessionIdFromHtml } from "./auth";

export interface NotebookLMClientOptions {
  timeoutMs?: number;
  storagePath?: string;
}

export class NotebookLMClient {
  private readonly core: ClientCore;

  readonly notebooks: NotebooksAPI;
  readonly sources: SourcesAPI;
  readonly notes: NotesAPI;
  readonly artifacts: ArtifactsAPI;
  readonly chat: ChatAPI;
  readonly sharing: SharingAPI;
  readonly settings: SettingsAPI;
  readonly research: ResearchAPI;

  constructor(auth: AuthTokens, options: NotebookLMClientOptions = {}) {
    const refreshCallback: RefreshCallback = () => this.refreshAuth();

    this.core = new ClientCore(auth, {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT,
      refreshCallback,
    });

    this.notebooks = new NotebooksAPI(this.core);
    this.sources = new SourcesAPI(this.core);
    this.notes = new NotesAPI(this.core);
    this.artifacts = new ArtifactsAPI(this.core, this.notes);
    this.chat = new ChatAPI(this.core);
    this.sharing = new SharingAPI(this.core);
    this.settings = new SettingsAPI(this.core);
    this.research = new ResearchAPI(this.core);
  }

  get auth(): AuthTokens {
    return this.core.authTokens;
  }

  /**
   * Create a NotebookLMClient from a Playwright storage state file.
   *
   * Loads cookies from the storage file and fetches fresh CSRF/session tokens
   * automatically. This is the recommended way to create a client.
   *
   * @param options - Optional configuration (storagePath, timeoutMs)
   * @returns Fully initialized NotebookLMClient
   *
   * @example
   * ```ts
   * const client = await NotebookLMClient.fromStorage();
   * const notebooks = await client.notebooks.list();
   * ```
   */
  static async fromStorage(options: NotebookLMClientOptions = {}): Promise<NotebookLMClient> {
    const auth = await AuthTokens.fromStorage(options.storagePath);
    return new NotebookLMClient(auth, options);
  }

  /**
   * Refresh authentication tokens by fetching the NotebookLM homepage.
   *
   * This prevents "Session Expired" errors by obtaining a fresh CSRF token
   * (SNlM0e) and session ID (FdrFJe). Called automatically on auth failures
   * when a refresh callback is configured.
   *
   * @returns Updated AuthTokens
   */
  async refreshAuth(): Promise<AuthTokens> {
    const cookieHeader = this.core.authTokens.cookieHeader;

    const response = await fetch("https://notebooklm.google.com/", {
      headers: { Cookie: cookieHeader },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh auth: HTTP ${response.status}`);
    }

    const finalUrl = response.url;
    const html = await response.text();

    this.core.authTokens.csrfToken = extractCsrfFromHtml(html, finalUrl);
    this.core.authTokens.sessionId = extractSessionIdFromHtml(html, finalUrl);

    return this.core.authTokens;
  }
}
