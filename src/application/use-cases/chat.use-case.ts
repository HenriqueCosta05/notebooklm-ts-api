import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { AskResult, ChatMode, ConversationTurn } from "../../domain/models/notebooklm.types";
import { ChatGoal, ChatResponseLength } from "../../infrastructure/third-party/notebooklm/rpc/types";

export class ChatUseCase {
  constructor(private readonly client: NotebookLMClient) {}

  async ask(
    notebookId: string,
    question: string,
    options: {
      sourceIds?: string[];
      conversationId?: string | null;
    } = {}
  ): Promise<AskResult> {
    return this.client.chat.ask(notebookId, question, options);
  }

  async getConversationId(notebookId: string): Promise<string | null> {
    return this.client.chat.getConversationId(notebookId);
  }

  async getConversationTurns(
    notebookId: string,
    conversationId: string,
    limit?: number
  ): Promise<unknown> {
    return this.client.chat.getConversationTurns(notebookId, conversationId, limit);
  }

  async getHistory(
    notebookId: string,
    options: { limit?: number; conversationId?: string | null } = {}
  ): Promise<Array<[string, string]>> {
    return this.client.chat.getHistory(notebookId, options);
  }

  getCachedTurns(conversationId: string): ConversationTurn[] {
    return this.client.chat.getCachedTurns(conversationId);
  }

  clearCache(conversationId?: string): boolean {
    return this.client.chat.clearCache(conversationId);
  }

  async configure(
    notebookId: string,
    options: {
      goal?: ChatGoal;
      responseLength?: ChatResponseLength;
      customPrompt?: string | null;
    } = {}
  ): Promise<void> {
    return this.client.chat.configure(notebookId, options);
  }

  async setMode(notebookId: string, mode: ChatMode): Promise<void> {
    return this.client.chat.setMode(notebookId, mode);
  }
}
