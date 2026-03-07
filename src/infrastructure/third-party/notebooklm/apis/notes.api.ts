import { ClientCore } from "../core";
import { RPCMethod } from "../rpc/types";
import { Note } from "../../../../domain/models/notebooklm.types";

const mapNote = (raw: unknown[], notebookId: string): Note => {
  const id = typeof raw[0] === "string" ? raw[0] : String(raw[0] ?? "");
  const title = typeof raw[1] === "string" ? raw[1] : "";
  const content = typeof raw[2] === "string" ? raw[2] : "";

  let createdAt: Date | null = null;
  if (Array.isArray(raw[3]) && typeof (raw[3] as unknown[])[0] === "number") {
    try {
      createdAt = new Date((raw[3] as number[])[0] * 1000);
    } catch {
      createdAt = null;
    }
  }

  return { id, notebookId, title, content, createdAt };
};

export class NotesAPI {
  constructor(private readonly core: ClientCore) {}

  async list(notebookId: string): Promise<Note[]> {
    const result = await this.core.rpcCall(RPCMethod.GET_NOTES_AND_MIND_MAPS, [notebookId], {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result) || (result as unknown[]).length === 0) return [];

    const notesData = (result as unknown[][])[0];
    if (!Array.isArray(notesData)) return [];

    return (notesData as unknown[][])
      .filter((item) => Array.isArray(item) && item.length > 0)
      .map((item) => mapNote(item, notebookId));
  }

  async listMindMaps(notebookId: string): Promise<unknown[][]> {
    const result = await this.core.rpcCall(RPCMethod.GET_NOTES_AND_MIND_MAPS, [notebookId], {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result) || (result as unknown[]).length < 2) return [];

    const mindMapsData = (result as unknown[][])[1];
    if (!Array.isArray(mindMapsData)) return [];

    return (mindMapsData as unknown[][]).filter(
      (item) => Array.isArray(item) && item.length > 0
    );
  }

  async create(
    notebookId: string,
    options: { title?: string; content?: string } = {}
  ): Promise<Note> {
    const { title = "", content = "" } = options;

    const params = [notebookId, title, content];
    const result = await this.core.rpcCall(RPCMethod.CREATE_NOTE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result) || (result as unknown[]).length === 0) {
      return {
        id: "",
        notebookId,
        title,
        content,
        createdAt: new Date(),
      };
    }

    return mapNote(result as unknown[], notebookId);
  }

  async update(
    notebookId: string,
    noteId: string,
    options: { title?: string; content?: string } = {}
  ): Promise<Note> {
    const { title, content } = options;

    const params = [notebookId, noteId, title ?? null, content ?? null];
    const result = await this.core.rpcCall(RPCMethod.UPDATE_NOTE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result)) {
      return {
        id: noteId,
        notebookId,
        title: title ?? "",
        content: content ?? "",
        createdAt: null,
      };
    }

    return mapNote(result as unknown[], notebookId);
  }

  async delete(notebookId: string, noteId: string): Promise<boolean> {
    const params = [notebookId, noteId];
    await this.core.rpcCall(RPCMethod.DELETE_NOTE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return true;
  }
}
