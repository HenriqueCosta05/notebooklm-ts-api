import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { Notebook, NotebookDescription } from "../../domain/models/notebooklm.types";

export class NotebooksUseCase {
  constructor(private readonly client: NotebookLMClient) {}

  async listNotebooks(): Promise<Notebook[]> {
    return this.client.notebooks.list();
  }

  async getNotebook(notebookId: string): Promise<Notebook> {
    return this.client.notebooks.get(notebookId);
  }

  async createNotebook(title: string): Promise<Notebook> {
    return this.client.notebooks.create(title);
  }

  async deleteNotebook(notebookId: string): Promise<boolean> {
    return this.client.notebooks.delete(notebookId);
  }

  async renameNotebook(notebookId: string, newTitle: string): Promise<Notebook> {
    return this.client.notebooks.rename(notebookId, newTitle);
  }

  async getNotebookDescription(notebookId: string): Promise<NotebookDescription> {
    return this.client.notebooks.getDescription(notebookId);
  }

  async shareNotebook(
    notebookId: string,
    isPublic: boolean,
    artifactId?: string
  ): Promise<{ public: boolean; url: string | null; artifactId: string | null }> {
    return this.client.notebooks.share(notebookId, isPublic, artifactId);
  }
}
