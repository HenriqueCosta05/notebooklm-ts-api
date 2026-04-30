import { NotebookLMClient, NotebookLMClientOptions } from "../../infrastructure/third-party/notebooklm/client";
import { NotebooksUseCase } from "../../application/use-cases/notebooks.use-case";
import { SourcesUseCase } from "../../application/use-cases/sources.use-case";
import { ArtifactsUseCase } from "../../application/use-cases/artifacts.use-case";
import { ChatUseCase } from "../../application/use-cases/chat.use-case";
import { ResearchUseCase } from "../../application/use-cases/research.use-case";
import { SharingUseCase } from "../../application/use-cases/sharing.use-case";

export interface NotebookLMFacade {
  client: NotebookLMClient;
  notebooks: NotebooksUseCase;
  sources: SourcesUseCase;
  artifacts: ArtifactsUseCase;
  chat: ChatUseCase;
  research: ResearchUseCase;
  sharing: SharingUseCase;
}

export const createNotebookLMClient = async (
  options: NotebookLMClientOptions = {}
): Promise<NotebookLMFacade> => {
  const client = await NotebookLMClient.fromStorage(options);

  return {
    client,
    notebooks: new NotebooksUseCase(client),
    sources: new SourcesUseCase(client),
    artifacts: new ArtifactsUseCase(client),
    chat: new ChatUseCase(client),
    research: new ResearchUseCase(client),
    sharing: new SharingUseCase(client),
  };
};

export const createNotebookLMClientFromAuth = (
  client: NotebookLMClient
): NotebookLMFacade => ({
  client,
  notebooks: new NotebooksUseCase(client),
  sources: new SourcesUseCase(client),
  artifacts: new ArtifactsUseCase(client),
  chat: new ChatUseCase(client),
  research: new ResearchUseCase(client),
  sharing: new SharingUseCase(client),
});
