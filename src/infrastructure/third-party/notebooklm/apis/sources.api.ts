import * as fs from "fs";
import * as path from "path";
import { ClientCore } from "../core";
import { RPCMethod, SourceStatus, UPLOAD_URL } from "../rpc/types";
import {
  SourceAddError,
  SourceNotFoundError,
  SourceProcessingError,
  SourceTimeoutError,
  ValidationError,
} from "../rpc/errors";
import {
  Source,
  SourceFulltext,
  SourceGuide,
  mapSourceKind,
} from "../../../../domain/models/notebooklm.types";

const YOUTUBE_DOMAINS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const isValidVideoId = (id: string): boolean => /^[a-zA-Z0-9_-]+$/.test(id);

const extractYoutubeVideoId = (url: string): string | null => {
  try {
    const parsed = new URL(url.trim());
    const hostname = parsed.hostname.toLowerCase();

    if (!YOUTUBE_DOMAINS.has(hostname)) return null;

    if (hostname === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id && isValidVideoId(id) ? id : null;
    }

    const pathPrefixes = ["shorts", "embed", "live", "v"];
    const segments = parsed.pathname.slice(1).split("/");
    if (segments.length >= 2 && pathPrefixes.includes(segments[0].toLowerCase())) {
      const id = segments[1];
      return id && isValidVideoId(id) ? id : null;
    }

    const vParam = parsed.searchParams.get("v");
    return vParam && isValidVideoId(vParam) ? vParam : null;
  } catch {
    return null;
  }
};

const parseSourceFromRaw = (src: unknown[]): Source => {
  const srcId =
    Array.isArray(src[0]) && typeof (src[0] as unknown[])[0] === "string"
      ? (src[0] as unknown[])[0]
      : String(src[0] ?? "");

  const title = typeof src[1] === "string" ? src[1] : null;

  let url: string | null = null;
  if (
    Array.isArray(src[2]) &&
    Array.isArray((src[2] as unknown[])[7]) &&
    (src[2] as unknown[][])[7].length > 0
  ) {
    const urlVal = (src[2] as unknown[][])[7][0];
    url = typeof urlVal === "string" ? urlVal : null;
  }

  let createdAt: Date | null = null;
  if (Array.isArray(src[2]) && Array.isArray((src[2] as unknown[])[2])) {
    const tsList = (src[2] as unknown[][])[2] as unknown[];
    if (typeof tsList[0] === "number") {
      try {
        createdAt = new Date(tsList[0] * 1000);
      } catch {
        createdAt = null;
      }
    }
  }

  let status: SourceStatus = SourceStatus.READY;
  if (Array.isArray(src[3]) && (src[3] as unknown[]).length > 1) {
    const rawStatus = (src[3] as unknown[])[1];
    if (
      rawStatus === SourceStatus.PROCESSING ||
      rawStatus === SourceStatus.READY ||
      rawStatus === SourceStatus.ERROR ||
      rawStatus === SourceStatus.PREPARING
    ) {
      status = rawStatus as SourceStatus;
    }
  }

  let typeCode: number | null = null;
  if (Array.isArray(src[2]) && (src[2] as unknown[]).length > 4) {
    const tc = (src[2] as unknown[])[4];
    typeCode = typeof tc === "number" ? tc : null;
  }

  return {
    id: srcId,
    title,
    url,
    kind: mapSourceKind(typeCode),
    createdAt,
    status,
    isReady: status === SourceStatus.READY,
    isProcessing: status === SourceStatus.PROCESSING,
    isError: status === SourceStatus.ERROR,
  };
};

const extractAllText = (data: unknown[], maxDepth = 100): string[] => {
  if (maxDepth <= 0) return [];

  const texts: string[] = [];
  for (const item of data) {
    if (typeof item === "string" && item.length > 0) {
      texts.push(item);
    } else if (Array.isArray(item)) {
      texts.push(...extractAllText(item as unknown[], maxDepth - 1));
    }
  }
  return texts;
};

export class SourcesAPI {
  constructor(private readonly core: ClientCore) {}

  async list(notebookId: string): Promise<Source[]> {
    const params = [notebookId, null, [2], null, 0];
    const notebook = await this.core.rpcCall(RPCMethod.GET_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
    });

    if (!Array.isArray(notebook) || notebook.length === 0) return [];

    const nbInfo = (notebook as unknown[][])[0];
    if (!Array.isArray(nbInfo) || nbInfo.length <= 1) return [];

    const sourcesList = nbInfo[1];
    if (!Array.isArray(sourcesList)) return [];

    return (sourcesList as unknown[][])
      .filter((src) => Array.isArray(src) && src.length > 0)
      .map((src) => parseSourceFromRaw(src));
  }

  async get(notebookId: string, sourceId: string): Promise<Source | null> {
    const sources = await this.list(notebookId);
    return sources.find((s) => s.id === sourceId) ?? null;
  }

  async waitUntilReady(
    notebookId: string,
    sourceId: string,
    options: {
      timeoutMs?: number;
      initialIntervalMs?: number;
      maxIntervalMs?: number;
      backoffFactor?: number;
    } = {}
  ): Promise<Source> {
    const {
      timeoutMs = 120_000,
      initialIntervalMs = 1_000,
      maxIntervalMs = 10_000,
      backoffFactor = 1.5,
    } = options;

    const start = Date.now();
    let interval = initialIntervalMs;
    let lastStatus: SourceStatus | null = null;

    while (true) {
      const elapsed = Date.now() - start;
      if (elapsed >= timeoutMs) {
        throw new SourceTimeoutError(sourceId, timeoutMs / 1000, lastStatus);
      }

      const source = await this.get(notebookId, sourceId);

      if (!source) throw new SourceNotFoundError(sourceId);

      lastStatus = source.status;

      if (source.isReady) return source;
      if (source.isError) throw new SourceProcessingError(sourceId, source.status);

      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) throw new SourceTimeoutError(sourceId, timeoutMs / 1000, lastStatus);

      const sleepMs = Math.min(interval, remaining);
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      interval = Math.min(interval * backoffFactor, maxIntervalMs);
    }
  }

  async waitForSources(
    notebookId: string,
    sourceIds: string[],
    options: Parameters<SourcesAPI["waitUntilReady"]>[2] = {}
  ): Promise<Source[]> {
    return Promise.all(
      sourceIds.map((id) => this.waitUntilReady(notebookId, id, options))
    );
  }

  async addUrl(
    notebookId: string,
    url: string,
    options: { wait?: boolean; waitTimeoutMs?: number } = {}
  ): Promise<Source> {
    const { wait = false, waitTimeoutMs = 120_000 } = options;
    const videoId = extractYoutubeVideoId(url);

    let result: unknown;
    try {
      result = videoId
        ? await this.addYoutubeSource(notebookId, url)
        : await this.addUrlSource(notebookId, url);
    } catch (error) {
      throw new SourceAddError(url, { cause: error as Error });
    }

    if (!result) {
      throw new SourceAddError(url, { message: `API returned no data for URL: ${url}` });
    }

    const source = this.parseSourceFromApiResponse(result as unknown[]);

    return wait
      ? this.waitUntilReady(notebookId, source.id, { timeoutMs: waitTimeoutMs })
      : source;
  }

  async addText(
    notebookId: string,
    title: string,
    content: string,
    options: { wait?: boolean; waitTimeoutMs?: number } = {}
  ): Promise<Source> {
    const { wait = false, waitTimeoutMs = 120_000 } = options;

    const params = [
      [[null, [title, content], null, null, null, null, null, null]],
      notebookId,
      [2],
      null,
      null,
    ];

    let result: unknown;
    try {
      result = await this.core.rpcCall(RPCMethod.ADD_SOURCE, params, {
        sourcePath: `/notebook/${notebookId}`,
      });
    } catch (error) {
      throw new SourceAddError(title, {
        message: `Failed to add text source '${title}'`,
        cause: error as Error,
      });
    }

    if (!result) {
      throw new SourceAddError(title, { message: `API returned no data for text source: ${title}` });
    }

    const source = this.parseSourceFromApiResponse(result as unknown[]);

    return wait
      ? this.waitUntilReady(notebookId, source.id, { timeoutMs: waitTimeoutMs })
      : source;
  }

  async addFile(
    notebookId: string,
    filePath: string,
    options: { wait?: boolean; waitTimeoutMs?: number } = {}
  ): Promise<Source> {
    const { wait = false, waitTimeoutMs = 120_000 } = options;

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new ValidationError(`Not a regular file: ${resolvedPath}`);
    }

    const filename = path.basename(resolvedPath);
    const fileSize = stat.size;

    const sourceId = await this.registerFileSource(notebookId, filename);
    const uploadUrl = await this.startResumableUpload(notebookId, filename, fileSize, sourceId);
    await this.uploadFileStreaming(uploadUrl, resolvedPath);

    const source: Source = {
      id: sourceId,
      title: filename,
      url: null,
      kind: "unknown",
      createdAt: null,
      status: SourceStatus.PROCESSING,
      isReady: false,
      isProcessing: true,
      isError: false,
    };

    return wait
      ? this.waitUntilReady(notebookId, source.id, { timeoutMs: waitTimeoutMs })
      : source;
  }

  async addDrive(
    notebookId: string,
    fileId: string,
    title: string,
    mimeType = "application/vnd.google-apps.document",
    options: { wait?: boolean; waitTimeoutMs?: number } = {}
  ): Promise<Source> {
    const { wait = false, waitTimeoutMs = 120_000 } = options;

    const sourceData = [
      [fileId, mimeType, 1, title],
      null, null, null, null, null, null, null, null, null, 1,
    ];

    const params = [
      [sourceData],
      notebookId,
      [2],
      [1, null, null, null, null, null, null, null, null, null, [1]],
    ];

    const result = await this.core.rpcCall(RPCMethod.ADD_SOURCE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    const source = this.parseSourceFromApiResponse(result as unknown[]);

    return wait
      ? this.waitUntilReady(notebookId, source.id, { timeoutMs: waitTimeoutMs })
      : source;
  }

  async delete(notebookId: string, sourceId: string): Promise<boolean> {
    const params = [[[sourceId]]];
    await this.core.rpcCall(RPCMethod.DELETE_SOURCE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return true;
  }

  async rename(notebookId: string, sourceId: string, newTitle: string): Promise<Source> {
    const params = [null, [sourceId], [[[newTitle]]]];
    const result = await this.core.rpcCall(RPCMethod.UPDATE_SOURCE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    return result
      ? this.parseSourceFromApiResponse(result as unknown[])
      : {
          id: sourceId,
          title: newTitle,
          url: null,
          kind: "unknown",
          createdAt: null,
          status: SourceStatus.READY,
          isReady: true,
          isProcessing: false,
          isError: false,
        };
  }

  async refresh(notebookId: string, sourceId: string): Promise<boolean> {
    const params = [null, [sourceId], [2]];
    await this.core.rpcCall(RPCMethod.REFRESH_SOURCE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return true;
  }

  async checkFreshness(notebookId: string, sourceId: string): Promise<boolean> {
    const params = [null, [sourceId], [2]];
    const result = await this.core.rpcCall(RPCMethod.CHECK_SOURCE_FRESHNESS, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (result === true) return true;
    if (result === false) return false;
    if (Array.isArray(result)) {
      if ((result as unknown[]).length === 0) return true;
      const first = (result as unknown[][])[0];
      if (Array.isArray(first) && first.length > 1 && first[1] === true) return true;
    }
    return false;
  }

  async getGuide(notebookId: string, sourceId: string): Promise<SourceGuide> {
    const params = [[[[sourceId]]]];
    const result = await this.core.rpcCall(RPCMethod.GET_SOURCE_GUIDE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    let summary = "";
    let keywords: string[] = [];

    if (Array.isArray(result) && (result as unknown[]).length > 0) {
      const outer = (result as unknown[][])[0];
      if (Array.isArray(outer) && outer.length > 0) {
        const inner = (outer as unknown[][])[0];
        if (Array.isArray(inner)) {
          const summaryArr = (inner as unknown[][])[1];
          if (Array.isArray(summaryArr) && summaryArr.length > 0) {
            summary = typeof summaryArr[0] === "string" ? summaryArr[0] : "";
          }
          const keywordsArr = (inner as unknown[][])[2];
          if (Array.isArray(keywordsArr) && keywordsArr.length > 0) {
            const kw = keywordsArr[0];
            keywords = Array.isArray(kw) ? (kw as unknown[]).filter((k): k is string => typeof k === "string") : [];
          }
        }
      }
    }

    return { summary, keywords };
  }

  async getFulltext(notebookId: string, sourceId: string): Promise<SourceFulltext> {
    const params = [[sourceId], [2], [2]];
    const result = await this.core.rpcCall(RPCMethod.GET_SOURCE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result)) {
      throw new SourceNotFoundError(sourceId);
    }

    let title = "";
    let typeCode: number | null = null;
    let url: string | null = null;
    let content = "";

    const res = result as unknown[][];

    if (Array.isArray(res[0]) && (res[0] as unknown[]).length > 1) {
      const first = res[0] as unknown[];
      title = typeof first[1] === "string" ? first[1] : "";

      if (Array.isArray(first[2])) {
        const meta = first[2] as unknown[];
        typeCode = typeof meta[4] === "number" ? meta[4] : null;
        if (Array.isArray(meta[7]) && (meta[7] as unknown[]).length > 0) {
          const urlVal = (meta[7] as unknown[])[0];
          url = typeof urlVal === "string" ? urlVal : null;
        }
      }
    }

    if (Array.isArray(res[3]) && (res[3] as unknown[]).length > 0) {
      const contentBlocks = (res[3] as unknown[][])[0];
      if (Array.isArray(contentBlocks)) {
        content = extractAllText(contentBlocks as unknown[]).join("\n");
      }
    }

    return {
      sourceId,
      title,
      content,
      kind: mapSourceKind(typeCode),
      url,
      charCount: content.length,
    };
  }

  private parseSourceFromApiResponse(data: unknown[]): Source {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Invalid source API response");
    }

    const first = data[0];
    if (Array.isArray(first) && first.length > 0) {
      const inner = first[0];
      if (Array.isArray(inner) && inner.length > 0 && Array.isArray(inner[0])) {
        return parseSourceFromRaw(inner as unknown[]);
      }
      if (Array.isArray(inner)) {
        return parseSourceFromRaw(first as unknown[]);
      }
    }

    return parseSourceFromRaw(data);
  }

  private async addYoutubeSource(notebookId: string, url: string): Promise<unknown> {
    const params = [
      [[null, null, null, null, null, null, null, [url], null, null, 1]],
      notebookId,
      [2],
      [1, null, null, null, null, null, null, null, null, null, [1]],
    ];
    return this.core.rpcCall(RPCMethod.ADD_SOURCE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
  }

  private async addUrlSource(notebookId: string, url: string): Promise<unknown> {
    const params = [
      [[null, null, [url], null, null, null, null, null]],
      notebookId,
      [2],
      null,
      null,
    ];
    return this.core.rpcCall(RPCMethod.ADD_SOURCE, params, {
      sourcePath: `/notebook/${notebookId}`,
    });
  }

  private async registerFileSource(notebookId: string, filename: string): Promise<string> {
    const params = [
      [[filename]],
      notebookId,
      [2],
      [1, null, null, null, null, null, null, null, null, null, [1]],
    ];

    const result = await this.core.rpcCall(RPCMethod.ADD_SOURCE_FILE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    const extractId = (d: unknown): string | null => {
      if (typeof d === "string") return d;
      if (Array.isArray(d) && d.length > 0) return extractId(d[0]);
      return null;
    };

    const sourceId = extractId(result);
    if (!sourceId) {
      throw new SourceAddError(filename, {
        message: "Failed to get SOURCE_ID from registration response",
      });
    }
    return sourceId;
  }

  private async startResumableUpload(
    notebookId: string,
    filename: string,
    fileSize: number,
    sourceId: string
  ): Promise<string> {
    const url = `${UPLOAD_URL}?authuser=0`;

    const body = JSON.stringify({
      PROJECT_ID: notebookId,
      SOURCE_NAME: filename,
      SOURCE_ID: sourceId,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Cookie: this.core.authTokens.cookieHeader,
        Origin: "https://notebooklm.google.com",
        Referer: "https://notebooklm.google.com/",
        "x-goog-authuser": "0",
        "x-goog-upload-command": "start",
        "x-goog-upload-header-content-length": String(fileSize),
        "x-goog-upload-protocol": "resumable",
      },
      body,
    });

    if (!response.ok) {
      throw new SourceAddError(filename, {
        message: `Failed to start resumable upload: HTTP ${response.status}`,
      });
    }

    const uploadUrl = response.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new SourceAddError(filename, {
        message: "Failed to get upload URL from response headers",
      });
    }

    return uploadUrl;
  }

  private async uploadFileStreaming(uploadUrl: string, filePath: string): Promise<void> {
    const fileBuffer = fs.readFileSync(filePath);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        Cookie: this.core.authTokens.cookieHeader,
        Origin: "https://notebooklm.google.com",
        Referer: "https://notebooklm.google.com/",
        "x-goog-authuser": "0",
        "x-goog-upload-command": "upload, finalize",
        "x-goog-upload-offset": "0",
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      throw new SourceAddError(filePath, {
        message: `File upload failed: HTTP ${response.status}`,
      });
    }
  }
}
