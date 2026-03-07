import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { Source, SourceFulltext, SourceGuide } from "../../domain/models/notebooklm.types";

export class SourcesUseCase {
  constructor(private readonly client: NotebookLMClient) {}

  async listSources(notebookId: string): Promise<Source[]> {
    return this.client.sources.list(notebookId);
  }

  async getSource(notebookId: string, sourceId: string): Promise<Source | null> {
    return this.client.sources.get(notebookId, sourceId);
  }

  async addUrlSource(
    notebookId: string,
    url: string,
    options: { wait?: boolean; waitTimeoutMs?: number } = {}
  ): Promise<Source> {
    return this.client.sources.addUrl(notebookId, url, options);
  }

  async addTextSource(
    notebookId: string,
    title: string,
    content: string,
    options: { wait?: boolean; waitTimeoutMs?: number } = {}
  ): Promise<Source> {
    return this.client.sources.addText(notebookId, title, content, options);
  }

  async addFileSource(
    notebookId: string,
    filePath: string,
    options: { wait?: boolean; waitTimeoutMs?: number } = {}
  ): Promise<Source> {
    return this.client.sources.addFile(notebookId, filePath, options);
  }

  async addDriveSource(
    notebookId: string,
    fileId: string,
    title: string,
    mimeType?: string,
    options: { wait?: boolean; waitTimeoutMs?: number } = {}
  ): Promise<Source> {
    return this.client.sources.addDrive(notebookId, fileId, title, mimeType, options);
  }

  async deleteSource(notebookId: string, sourceId: string): Promise<boolean> {
    return this.client.sources.delete(notebookId, sourceId);
  }

  async renameSource(notebookId: string, sourceId: string, newTitle: string): Promise<Source> {
    return this.client.sources.rename(notebookId, sourceId, newTitle);
  }

  async refreshSource(notebookId: string, sourceId: string): Promise<boolean> {
    return this.client.sources.refresh(notebookId, sourceId);
  }

  async checkSourceFreshness(notebookId: string, sourceId: string): Promise<boolean> {
    return this.client.sources.checkFreshness(notebookId, sourceId);
  }

  async getSourceGuide(notebookId: string, sourceId: string): Promise<SourceGuide> {
    return this.client.sources.getGuide(notebookId, sourceId);
  }

  async getSourceFulltext(notebookId: string, sourceId: string): Promise<SourceFulltext> {
    return this.client.sources.getFulltext(notebookId, sourceId);
  }

  async waitUntilSourceReady(
    notebookId: string,
    sourceId: string,
    options: {
      timeoutMs?: number;
      initialIntervalMs?: number;
      maxIntervalMs?: number;
      backoffFactor?: number;
    } = {}
  ): Promise<Source> {
    return this.client.sources.waitUntilReady(notebookId, sourceId, options);
  }

  async waitForSources(
    notebookId: string,
    sourceIds: string[],
    options: Parameters<NotebookLMClient["sources"]["waitUntilReady"]>[2] = {}
  ): Promise<Source[]> {
    return this.client.sources.waitForSources(notebookId, sourceIds, options);
  }
}
