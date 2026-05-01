import { ClientCore } from "../core";
import { RPCMethod } from "../rpc/types";
import { Source } from "../../../../domain/models/notebooklm.types";

export type ResearchMode = "fast" | "deep";

export interface ResearchStatus {
  taskId: string;
  status: "in_progress" | "completed" | "failed";
  progress: number;
  sourcesFound: number;
  sourcesImported: number;
}

const mapResearchStatus = (raw: unknown[]): ResearchStatus => {
  const taskId = typeof raw[0] === "string" ? raw[0] : String(raw[0] ?? "");
  let status: "in_progress" | "completed" | "failed" = "in_progress";

  if (typeof raw[1] === "number") {
    if (raw[1] === 1) status = "completed";
    else if (raw[1] === 2) status = "failed";
  }

  const progress = typeof raw[2] === "number" ? raw[2] : 0;
  const sourcesFound = typeof raw[3] === "number" ? raw[3] : 0;
  const sourcesImported = typeof raw[4] === "number" ? raw[4] : 0;

  return { taskId, status, progress, sourcesFound, sourcesImported };
};

const mapSourceFromResearch = (raw: unknown[], notebookId: string): Source => {
  const id = typeof raw[0] === "string" ? raw[0] : String(raw[0] ?? "");
  const title = typeof raw[1] === "string" ? raw[1] : null;
  const url = typeof raw[2] === "string" ? raw[2] : null;

  return {
    id,
    title,
    url,
    kind: "web_page",
    createdAt: null,
    status: 1,
    isReady: true,
    isProcessing: false,
    isError: false,
  };
};

export class ResearchAPI {
  constructor(private readonly core: ClientCore) {}

  /**
   * Start a web research task to find and import sources automatically.
   *
   * @param notebookId - The notebook ID to import sources into
   * @param query - The research query
   * @param mode - "fast" for quick search, "deep" for comprehensive search
   * @returns Research status with task ID for polling
   */
  async startResearch(
    notebookId: string,
    query: string,
    mode: ResearchMode = "fast"
  ): Promise<ResearchStatus> {
    const rpcMethod =
      mode === "deep" ? RPCMethod.START_DEEP_RESEARCH : RPCMethod.START_FAST_RESEARCH;

    // Structure params similar to source and artifact APIs
    const params: unknown[] = [
      query,           // [0] - research query
      notebookId,      // [1] - notebook ID
      null,            // [2] - placeholder
      null,            // [3] - placeholder
    ];

    const result = await this.core.rpcCall(rpcMethod, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    // Handle null result
    if (!result || !Array.isArray(result)) {
      throw new Error(`Failed to start research: API returned ${result === null ? "null" : "invalid data"}`);
    }

    return mapResearchStatus(result as unknown[]);
  }

  /**
   * Poll the status of a research task.
   *
   * @param notebookId - The notebook ID
   * @param taskId - The research task ID
   * @returns Current research status
   */
  async pollResearchStatus(notebookId: string, taskId: string): Promise<ResearchStatus> {
    // Wrap taskId in arrays similar to other RPC calls
    const params: unknown[] = [
      notebookId,      // [0] - notebook ID
      [[taskId]],      // [1] - task ID wrapped in arrays
    ];

    const result = await this.core.rpcCall(RPCMethod.POLL_RESEARCH, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!result || !Array.isArray(result)) {
      throw new Error(`Failed to poll research status: API returned ${result === null ? "null" : "invalid data"}`);
    }

    return mapResearchStatus(result as unknown[]);
  }

  /**
   * Import sources found during a research task.
   *
   * @param notebookId - The notebook ID
   * @param taskId - The research task ID
   * @returns Array of imported sources
   */
  async importResearchResults(
    notebookId: string,
    taskId: string
  ): Promise<Source[]> {
    // Wrap taskId in arrays similar to other RPC calls
    const params: unknown[] = [
      notebookId,      // [0] - notebook ID
      [[taskId]],      // [1] - task ID wrapped in arrays
    ];

    const result = await this.core.rpcCall(RPCMethod.IMPORT_RESEARCH, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!result || !Array.isArray(result)) {
      return [];
    }

    // Filter and map sources from the response
    return (result as unknown[][])
      .filter((item) => Array.isArray(item) && (item as unknown[]).length > 0)
      .map((item) => mapSourceFromResearch(item as unknown[], notebookId));
  }

  /**
   * Wait for a research task to complete and return the sources.
   *
   * @param notebookId - The notebook ID
   * @param taskId - The research task ID
   * @param timeoutMs - Maximum time to wait (default: 5 minutes)
   * @param pollIntervalMs - Polling interval (default: 2 seconds)
   * @returns Array of imported sources
   */
  async waitForResearch(
    notebookId: string,
    taskId: string,
    timeoutMs: number = 5 * 60 * 1000,
    pollIntervalMs: number = 2000
  ): Promise<Source[]> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.pollResearchStatus(notebookId, taskId);

      if (status.status === "completed") {
        return this.importResearchResults(notebookId, taskId);
      }

      if (status.status === "failed") {
        throw new Error(`Research task ${taskId} failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Research task ${taskId} timed out after ${timeoutMs}ms`);
  }
}
