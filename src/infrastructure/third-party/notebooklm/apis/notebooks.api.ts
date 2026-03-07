import { ClientCore } from "../core";
import { RPCMethod } from "../rpc/types";
import { Notebook, NotebookDescription, SuggestedTopic } from "../../../../domain/models/notebooklm.types";

const mapNotebook = (raw: unknown[]): Notebook => {
  const rawTitle = typeof raw[0] === "string" ? raw[0] : "";
  const title = rawTitle.replace("thought\n", "").trim();
  const id = typeof raw[2] === "string" ? raw[2] : "";

  let createdAt: Date | null = null;
  if (Array.isArray(raw[5]) && Array.isArray((raw[5] as unknown[])[5])) {
    const tsData = (raw[5] as unknown[][])[5] as unknown[];
    if (Array.isArray(tsData) && typeof tsData[0] === "number") {
      try {
        createdAt = new Date(tsData[0] * 1000);
      } catch {
        createdAt = null;
      }
    }
  }

  let isOwner = true;
  if (Array.isArray(raw[5]) && (raw[5] as unknown[]).length > 1) {
    isOwner = (raw[5] as unknown[])[1] === false;
  }

  return { id, title, createdAt, sourcesCount: 0, isOwner };
};

export class NotebooksAPI {
  constructor(private readonly core: ClientCore) {}

  async list(): Promise<Notebook[]> {
    const params = [null, 1, null, [2]];
    const result = await this.core.rpcCall(RPCMethod.LIST_NOTEBOOKS, params);

    if (!Array.isArray(result) || result.length === 0) return [];

    const rawNotebooks = Array.isArray(result[0]) ? (result[0] as unknown[][]) : (result as unknown[][]);
    return rawNotebooks.map((nb) => mapNotebook(nb));
  }

  async create(title: string): Promise<Notebook> {
    const params = [title, null, null, [2], [1]];
    const result = await this.core.rpcCall(RPCMethod.CREATE_NOTEBOOK, params);
    return mapNotebook(result as unknown[]);
  }

  async get(notebookId: string): Promise<Notebook> {
    const params = [notebookId, null, [2], null, 0];
    const result = await this.core.rpcCall(RPCMethod.GET_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
    });

    const nbInfo = Array.isArray(result) && Array.isArray((result as unknown[][])[0])
      ? (result as unknown[][])[0]
      : (result as unknown[]);

    return mapNotebook(nbInfo);
  }

  async delete(notebookId: string): Promise<boolean> {
    const params = [[notebookId], [2]];
    await this.core.rpcCall(RPCMethod.DELETE_NOTEBOOK, params);
    return true;
  }

  async rename(notebookId: string, newTitle: string): Promise<Notebook> {
    const params = [notebookId, [[null, null, null, [null, newTitle]]]];
    await this.core.rpcCall(RPCMethod.RENAME_NOTEBOOK, params, {
      sourcePath: "/",
      allowNull: true,
    });
    return this.get(notebookId);
  }

  async getSummary(notebookId: string): Promise<string> {
    const params = [notebookId, [2]];
    const result = await this.core.rpcCall(RPCMethod.SUMMARIZE, params, {
      sourcePath: `/notebook/${notebookId}`,
    });

    try {
      if (Array.isArray(result)) {
        const summary = (result as unknown[][][])[0][0][0];
        return typeof summary === "string" ? summary : "";
      }
    } catch {
      // Defensive: return empty on unexpected structure
    }
    return "";
  }

  async getDescription(notebookId: string): Promise<NotebookDescription> {
    const params = [notebookId, [2]];
    const result = await this.core.rpcCall(RPCMethod.SUMMARIZE, params, {
      sourcePath: `/notebook/${notebookId}`,
    });

    let summary = "";
    const suggestedTopics: SuggestedTopic[] = [];

    if (Array.isArray(result)) {
      try {
        const outer = (result as unknown[][])[0];
        if (Array.isArray(outer)) {
          const summaryVal = (outer as unknown[][])[0]?.[0];
          summary = typeof summaryVal === "string" ? summaryVal : "";

          const topicsList = (outer as unknown[][])[1]?.[0];
          if (Array.isArray(topicsList)) {
            for (const topic of topicsList as unknown[][]) {
              if (Array.isArray(topic) && topic.length >= 2) {
                suggestedTopics.push({
                  question: typeof topic[0] === "string" ? topic[0] : "",
                  prompt: typeof topic[1] === "string" ? topic[1] : "",
                });
              }
            }
          }
        }
      } catch {
        // Defensive: partial results are acceptable
      }
    }

    return { summary, suggestedTopics };
  }

  async removeFromRecent(notebookId: string): Promise<void> {
    const params = [notebookId];
    await this.core.rpcCall(RPCMethod.REMOVE_RECENTLY_VIEWED, params, { allowNull: true });
  }

  async getRaw(notebookId: string): Promise<unknown> {
    const params = [notebookId, null, [2], null, 0];
    return this.core.rpcCall(RPCMethod.GET_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
    });
  }

  async share(
    notebookId: string,
    isPublic: boolean,
    artifactId?: string
  ): Promise<{ public: boolean; url: string | null; artifactId: string | null }> {
    const shareOptions = [isPublic ? 1 : 0];
    const params = artifactId
      ? [shareOptions, notebookId, artifactId]
      : [shareOptions, notebookId];

    await this.core.rpcCall(RPCMethod.SHARE_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    const base = `https://notebooklm.google.com/notebook/${notebookId}`;
    const url = isPublic
      ? artifactId
        ? `${base}?artifactId=${artifactId}`
        : base
      : null;

    return { public: isPublic, url, artifactId: artifactId ?? null };
  }

  getShareUrl(notebookId: string, artifactId?: string): string {
    const base = `https://notebooklm.google.com/notebook/${notebookId}`;
    return artifactId ? `${base}?artifactId=${artifactId}` : base;
  }
}
