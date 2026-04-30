import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { Source } from "../../domain/models/notebooklm.types";
import { ResearchMode, ResearchStatus } from "../../infrastructure/third-party/notebooklm/apis/research.api";

export class ResearchUseCase {
  constructor(private readonly client: NotebookLMClient) {}

  /**
   * Start a research task to automatically find and import sources.
   *
   * @param notebookId - The notebook ID
   * @param query - The research query
   * @param mode - "fast" or "deep" research
   * @returns Research status with task ID for polling
   */
  async startResearch(
    notebookId: string,
    query: string,
    mode: ResearchMode = "fast"
  ): Promise<ResearchStatus> {
    return this.client.research.startResearch(notebookId, query, mode);
  }

  /**
   * Get the current status of a research task.
   *
   * @param notebookId - The notebook ID
   * @param taskId - The research task ID
   * @returns Current research status
   */
  async getResearchStatus(notebookId: string, taskId: string): Promise<ResearchStatus> {
    return this.client.research.pollResearchStatus(notebookId, taskId);
  }

  /**
   * Import sources that were found during research.
   *
   * @param notebookId - The notebook ID
   * @param taskId - The research task ID
   * @returns Array of imported sources
   */
  async importResults(notebookId: string, taskId: string): Promise<Source[]> {
    return this.client.research.importResearchResults(notebookId, taskId);
  }

  /**
   * Wait for a research task to complete and import all found sources.
   *
   * @param notebookId - The notebook ID
   * @param taskId - The research task ID
   * @param timeoutMs - Maximum time to wait
   * @returns Array of imported sources
   */
  async waitForCompletion(
    notebookId: string,
    taskId: string,
    timeoutMs?: number
  ): Promise<Source[]> {
    return this.client.research.waitForResearch(notebookId, taskId, timeoutMs);
  }
}
