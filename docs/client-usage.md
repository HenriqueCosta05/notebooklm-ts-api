# Client Library Usage

This document covers how to use `notebooklm-ts-api` as a programmatic TypeScript/Node.js library — without running the Express HTTP server.

---

## Table of Contents

- [Installation & Setup](#installation--setup)
- [Creating a Client](#creating-a-client)
- [Notebooks](#notebooks)
- [Sources](#sources)
- [Artifacts](#artifacts)
- [Chat](#chat)
- [Notes](#notes)
- [Sharing](#sharing)
- [Settings](#settings)
- [Error Handling](#error-handling)
- [TypeScript Types Reference](#typescript-types-reference)

---

## Installation & Setup

```bash
npm install
```

Ensure you have a valid `storage_state.json` from a Playwright session (see [Authentication](./authentication.md)) and either:

- placed it at `~/.notebooklm/storage_state.json`, or
- set `NOTEBOOKLM_STORAGE_PATH=/path/to/storage_state.json`, or
- set `NOTEBOOKLM_AUTH_JSON` to the raw JSON string.

---

## Creating a Client

### Via factory (recommended)

The `createNotebookLMClient` factory loads auth from the environment and wires all use-case layers:

```typescript
import { createNotebookLMClient } from "./src/main/factories/notebooklm.factory";

const { client, notebooks, sources, artifacts, chat } = await createNotebookLMClient();
```

### Via `NotebookLMClient` directly

```typescript
import { NotebookLMClient } from "./src/infrastructure/third-party/notebooklm/client";

// Load from default storage path or NOTEBOOKLM_AUTH_JSON
const client = await NotebookLMClient.fromStorage();

// Or supply an explicit path
const client = await NotebookLMClient.fromStorage({
  storagePath: "/secrets/storage_state.json",
  timeoutMs: 90_000,
});
```

### With pre-built AuthTokens

If you already have cookies and tokens (e.g. from a custom auth flow):

```typescript
import { AuthTokens } from "./src/infrastructure/third-party/notebooklm/auth";
import { NotebookLMClient } from "./src/infrastructure/third-party/notebooklm/client";

const auth = new AuthTokens(
  { SID: "...", HSID: "...", SSID: "..." },
  "csrf-token-here",
  "session-id-here"
);

const client = new NotebookLMClient(auth, { timeoutMs: 60_000 });
```

---

## Notebooks

All notebook operations are available on `client.notebooks`.

### List all notebooks

```typescript
const notebooks = await client.notebooks.list();

notebooks.forEach((nb) => {
  console.log(`${nb.id}  ${nb.title}  (${nb.sourcesCount} sources)`);
});
```

### Get a single notebook

```typescript
const notebook = await client.notebooks.get("notebook-id");
console.log(notebook.title);
```

### Create a notebook

```typescript
const notebook = await client.notebooks.create("My Research Project");
console.log("Created:", notebook.id);
```

### Rename a notebook

```typescript
const updated = await client.notebooks.rename("notebook-id", "New Title");
```

### Delete a notebook

```typescript
await client.notebooks.delete("notebook-id");
```

### Get notebook description

Returns an AI-generated summary and a list of suggested questions.

```typescript
const description = await client.notebooks.getDescription("notebook-id");

console.log(description.summary);
description.suggestedTopics.forEach((topic) => {
  console.log(`Q: ${topic.question}`);
  console.log(`Prompt: ${topic.prompt}`);
});
```

### Share a notebook

```typescript
const result = await client.notebooks.share("notebook-id", true);
console.log("Share URL:", result.url);

// Make private again
await client.notebooks.share("notebook-id", false);
```

---

## Sources

All source operations are available on `client.sources`.

### List sources in a notebook

```typescript
const sources = await client.sources.list("notebook-id");

sources.forEach((src) => {
  console.log(`${src.id}  ${src.title}  [${src.kind}]  ready=${src.isReady}`);
});
```

### Get a single source

```typescript
const source = await client.sources.get("notebook-id", "source-id");
```

### Add a URL source

```typescript
const source = await client.sources.addUrl("notebook-id", "https://example.com/article", {
  wait: true,         // wait for processing before returning
  waitTimeoutMs: 60_000,
});

console.log("Source ready:", source.isReady);
```

### Add pasted text

```typescript
const source = await client.sources.addText(
  "notebook-id",
  "My Meeting Notes",          // title
  "Full content of the notes...",  // content
  { wait: true }
);
```

### Add a Google Drive file

```typescript
import { DriveMimeType } from "./src/infrastructure/third-party/notebooklm/rpc/types";

const source = await client.sources.addDrive(
  "notebook-id",
  "google-drive-file-id",
  "My Google Doc",
  DriveMimeType.GOOGLE_DOC,
  { wait: true }
);
```

### Delete a source

```typescript
await client.sources.delete("notebook-id", "source-id");
```

### Rename a source

```typescript
const updated = await client.sources.rename("notebook-id", "source-id", "New Title");
```

### Refresh a source

Re-indexes a web page source with its latest content:

```typescript
await client.sources.refresh("notebook-id", "source-id");
```

### Get source full text

Retrieve the complete indexed text of a source:

```typescript
const fulltext = await client.sources.getFulltext("notebook-id", "source-id");

console.log(`${fulltext.charCount} characters`);
console.log(fulltext.content.slice(0, 500));
```

### Get source guide

Returns an AI-generated summary and keyword list for a source:

```typescript
const guide = await client.sources.getGuide("notebook-id", "source-id");

console.log(guide.summary);
console.log("Keywords:", guide.keywords.join(", "));
```

### Wait for source to be ready

Polls until `status === READY` or the timeout is reached:

```typescript
const readySource = await client.sources.waitForReady("notebook-id", "source-id", {
  waitTimeoutMs: 120_000,
  pollIntervalMs: 3_000,
});
```

---

## Artifacts

All artifact operations are available on `client.artifacts`. Generation is **asynchronous** — generate endpoints return a `GenerationStatus` with a `taskId`. Poll `pollStatus` until `isComplete` or `isFailed`.

### List artifacts

```typescript
const allArtifacts = await client.artifacts.list("notebook-id");

// Filter by kind
import type { ArtifactKind } from "./src/domain/models/notebooklm.types";

const audioArtifacts = await client.artifacts.list("notebook-id", "audio" as ArtifactKind);
```

### Get a single artifact

```typescript
const artifact = await client.artifacts.get("notebook-id", "artifact-id");
console.log(artifact.statusStr); // "completed" | "in_progress" | "pending" | "failed"
```

### Poll generation status

```typescript
const status = await client.artifacts.pollStatus("notebook-id", "task-id");

if (status.isComplete) {
  console.log("Done! URL:", status.url);
} else if (status.isFailed) {
  console.error("Failed:", status.error);
}
```

### Wait for artifact completion

Polls in a loop until complete or failed:

```typescript
const finalStatus = await client.artifacts.waitForCompletion("notebook-id", "task-id", {
  waitTimeoutMs: 300_000,  // 5 minutes
  pollIntervalMs: 5_000,
});

console.log("URL:", finalStatus.url);
```

### Generate an Audio Overview

```typescript
import {
  AudioFormat,
  AudioLength,
} from "./src/infrastructure/third-party/notebooklm/rpc/types";

const task = await client.artifacts.generateAudio("notebook-id", {
  sourceIds: ["src_a", "src_b"],  // omit to use all sources
  language: "en",
  instructions: "Focus on practical takeaways",
  audioFormat: AudioFormat.DEEP_DIVE,
  audioLength: AudioLength.DEFAULT,
});

const result = await client.artifacts.waitForCompletion("notebook-id", task.taskId);
console.log("Audio URL:", result.url);
```

### Generate a Video

```typescript
import { VideoFormat, VideoStyle } from "./src/infrastructure/third-party/notebooklm/rpc/types";

const task = await client.artifacts.generateVideo("notebook-id", {
  videoFormat: VideoFormat.EXPLAINER,
  videoStyle: VideoStyle.WHITEBOARD,
});
```

### Generate a Report

```typescript
import { ReportFormat } from "./src/infrastructure/third-party/notebooklm/rpc/types";

const task = await client.artifacts.generateReport("notebook-id", {
  reportFormat: ReportFormat.BRIEFING_DOC,
  language: "en",
});

// For a custom report
const customTask = await client.artifacts.generateReport("notebook-id", {
  reportFormat: ReportFormat.CUSTOM,
  customPrompt: "Write a technical deep-dive for senior engineers",
  extraInstructions: "Include code examples where relevant",
});
```

### Generate a Quiz

```typescript
import {
  QuizQuantity,
  QuizDifficulty,
} from "./src/infrastructure/third-party/notebooklm/rpc/types";

const task = await client.artifacts.generateQuiz("notebook-id", {
  quantity: QuizQuantity.STANDARD,
  difficulty: QuizDifficulty.MEDIUM,
  instructions: "Focus on definitions and key concepts",
});
```

### Generate Flashcards

```typescript
const task = await client.artifacts.generateFlashcards("notebook-id", {
  quantity: QuizQuantity.STANDARD,
  difficulty: QuizDifficulty.EASY,
});
```

### Generate an Infographic

```typescript
import {
  InfographicOrientation,
  InfographicDetail,
} from "./src/infrastructure/third-party/notebooklm/rpc/types";

const task = await client.artifacts.generateInfographic("notebook-id", {
  orientation: InfographicOrientation.PORTRAIT,
  detailLevel: InfographicDetail.STANDARD,
  language: "en",
});
```

### Generate a Slide Deck

```typescript
import {
  SlideDeckFormat,
  SlideDeckLength,
} from "./src/infrastructure/third-party/notebooklm/rpc/types";

const task = await client.artifacts.generateSlideDeck("notebook-id", {
  slideFormat: SlideDeckFormat.DETAILED_DECK,
  slideLength: SlideDeckLength.DEFAULT,
});
```

### Generate a Data Table

```typescript
const task = await client.artifacts.generateDataTable("notebook-id", {
  instructions: "Extract all statistics and figures mentioned",
});
```

### Generate a Mind Map

```typescript
const result = await client.artifacts.generateMindMap("notebook-id", {
  sourceIds: ["src_a"],
});
```

### Delete an artifact

```typescript
await client.artifacts.delete("notebook-id", "artifact-id");
```

### Rename an artifact

```typescript
await client.artifacts.rename("notebook-id", "artifact-id", "New Title");
```

### Export an artifact

Export a report or data table to Google Docs or Sheets:

```typescript
import { ExportType } from "./src/infrastructure/third-party/notebooklm/rpc/types";

const exported = await client.artifacts.export(
  "notebook-id",
  "artifact-id",
  "My Exported Report",
  ExportType.DOCS
);

console.log("Google Doc URL:", exported.url);
```

### Get suggested reports

```typescript
const suggestions = await client.artifacts.suggestReports("notebook-id");

suggestions.forEach((s) => {
  console.log(`${s.title}: ${s.description}`);
});
```

### Revise a slide

```typescript
const status = await client.artifacts.reviseSlide(
  "notebook-id",
  "artifact-id",
  2,                          // zero-based slide index
  "Make this slide more concise and add a bullet-point summary"
);
```

---

## Chat

All chat operations are available on `client.chat`.

### Ask a question

```typescript
const result = await client.chat.ask(
  "notebook-id",
  "What are the main arguments presented in these sources?"
);

console.log(result.answer);
console.log("Conversation ID:", result.conversationId);
console.log("Turn:", result.turnNumber);
console.log("Is follow-up:", result.isFollowUp);

result.references.forEach((ref) => {
  console.log(`[${ref.citationNumber}] Source: ${ref.sourceId}`);
  console.log(`  "${ref.citedText}"`);
});
```

### Continue a conversation

```typescript
const first = await client.chat.ask("notebook-id", "Summarise the key findings.");

const followUp = await client.chat.ask(
  "notebook-id",
  "Can you elaborate on the third finding?",
  { conversationId: first.conversationId }
);
```

### Limit context to specific sources

```typescript
const result = await client.chat.ask(
  "notebook-id",
  "What does this source say about climate change?",
  { sourceIds: ["src_xyz"] }
);
```

### Get the current conversation ID

```typescript
const conversationId = await client.chat.getConversationId("notebook-id");
```

### Get conversation history

```typescript
const history = await client.chat.getHistory("notebook-id", {
  conversationId: "conv_abc",
  limit: 20,
});

history.forEach((turn) => {
  console.log(`[${turn.turnNumber}] Q: ${turn.query}`);
  console.log(`       A: ${turn.answer}`);
});
```

### Work with the local conversation cache

The client keeps an in-memory LRU cache of up to 100 conversations to avoid redundant network calls.

```typescript
// Retrieve cached turns for a conversation
const turns = client.chat.getCachedTurns("conv_abc");

// Clear a specific conversation from cache
client.chat.clearCache("conv_abc");

// Clear all cached conversations
client.chat.clearCache();
```

### Configure chat settings

```typescript
import {
  ChatGoal,
  ChatResponseLength,
} from "./src/infrastructure/third-party/notebooklm/rpc/types";

// Set a custom persona / goal
await client.chat.configure("notebook-id", {
  goal: ChatGoal.CUSTOM,
  customPrompt: "You are a Socratic tutor. Answer only with questions.",
  responseLength: ChatResponseLength.LONGER,
});

// Reset to defaults
await client.chat.configure("notebook-id", {
  goal: ChatGoal.DEFAULT,
  responseLength: ChatResponseLength.DEFAULT,
  customPrompt: null,
});
```

### Set chat mode

```typescript
import type { ChatMode } from "./src/domain/models/notebooklm.types";

await client.chat.setMode("notebook-id", "learning_guide" as ChatMode);
// Modes: "default" | "learning_guide" | "concise" | "detailed"
```

---

## Notes

All notes operations are available on `client.notes`.

### List notes and mind maps

```typescript
const { notes, mindMaps } = await client.notes.listNotesAndMindMaps("notebook-id");

notes.forEach((note) => {
  console.log(`${note.id}: ${note.title}`);
});
```

### Create a note

```typescript
const note = await client.notes.create("notebook-id", "My Note Title", "Note content here...");
```

### Update a note

```typescript
const updated = await client.notes.update("notebook-id", "note-id", {
  title: "Updated Title",
  content: "Updated content...",
});
```

### Delete a note

```typescript
await client.notes.delete("notebook-id", "note-id");
```

---

## Sharing

All sharing operations are available on `client.sharing`.

### Get share status

```typescript
const status = await client.sharing.getStatus("notebook-id");

console.log("Public:", status.isPublic);
console.log("Share URL:", status.shareUrl);
status.sharedUsers.forEach((u) => {
  console.log(`${u.email} — ${u.permission}`);
});
```

---

## Settings

User-level settings are available on `client.settings`.

### Get settings

```typescript
const settings = await client.settings.get();
console.log("Output language:", settings.outputLanguage);
```

### Set output language

```typescript
await client.settings.setLanguage("fr");
```

---

## Error Handling

All errors thrown by the client extend `RPCError`. Import the specific classes to handle them selectively:

```typescript
import {
  AuthError,
  RateLimitError,
  ServerError,
  NetworkError,
  RPCTimeoutError,
  RPCError,
} from "./src/infrastructure/third-party/notebooklm/rpc/errors";

try {
  const notebooks = await client.notebooks.list();
} catch (err) {
  if (err instanceof AuthError) {
    // Session expired — re-capture storage_state.json
    console.error("Auth expired:", err.message);
  } else if (err instanceof RateLimitError) {
    // Back off and retry
    console.warn("Rate limited — retrying in 60s");
    await new Promise((r) => setTimeout(r, 60_000));
  } else if (err instanceof RPCTimeoutError) {
    console.error(`Timed out after ${err.context.timeoutSeconds}s`);
  } else if (err instanceof ServerError) {
    console.error("Transient server error — try again shortly");
  } else if (err instanceof NetworkError) {
    console.error("Network failure:", err.message);
  } else if (err instanceof RPCError) {
    // Catch-all for RPC-layer errors
    console.error("RPC error:", err.message, err.context);
  } else {
    throw err;
  }
}
```

### Error context

Every `RPCError` carries a typed `context` object useful for structured logging:

```typescript
catch (err) {
  if (err instanceof RPCError) {
    console.error({
      message: err.message,
      methodId: err.context.methodId,
      rpcCode: err.context.rpcCode,
      statusCode: err.context.statusCode,
      foundIds: err.context.foundIds,
    });
  }
}
```

---

## TypeScript Types Reference

All domain types are exported from `src/domain/models/notebooklm.types.ts`.

```typescript
import type {
  Notebook,
  NotebookDescription,
  SuggestedTopic,
  Source,
  SourceKind,
  SourceFulltext,
  SourceGuide,
  Artifact,
  ArtifactKind,
  GenerationStatus,
  ReportSuggestion,
  Note,
  ConversationTurn,
  ChatReference,
  AskResult,
  ChatMode,
  SharedUser,
  ShareStatus,
  UserSettings,
} from "./src/domain/models/notebooklm.types";
```

All RPC enums (format/style/difficulty options) are exported from `src/infrastructure/third-party/notebooklm/rpc/types.ts`:

```typescript
import {
  RPCMethod,
  ArtifactTypeCode,
  ArtifactStatus,
  AudioFormat,
  AudioLength,
  VideoFormat,
  VideoStyle,
  QuizQuantity,
  QuizDifficulty,
  InfographicOrientation,
  InfographicDetail,
  SlideDeckFormat,
  SlideDeckLength,
  ReportFormat,
  ChatGoal,
  ChatResponseLength,
  DriveMimeType,
  ExportType,
  ShareAccess,
  ShareViewLevel,
  SharePermission,
  SourceStatus,
  SourceTypeCode,
} from "./src/infrastructure/third-party/notebooklm/rpc/types";
```

---

## Complete Example

A full workflow — create a notebook, add a source, generate an audio overview, ask a follow-up question, then clean up:

```typescript
import { createNotebookLMClient } from "./src/main/factories/notebooklm.factory";
import { AudioFormat, AudioLength } from "./src/infrastructure/third-party/notebooklm/rpc/types";
import { RateLimitError } from "./src/infrastructure/third-party/notebooklm/rpc/errors";

async function main(): Promise<void> {
  const { client, notebooks, sources, artifacts, chat } = await createNotebookLMClient();

  // 1. Create a notebook
  const notebook = await notebooks.createNotebook("TypeScript Deep Dive");
  console.log("Created notebook:", notebook.id);

  try {
    // 2. Add a web source and wait for indexing
    const source = await client.sources.addUrl(
      notebook.id,
      "https://www.typescriptlang.org/docs/handbook/2/types-from-types.html",
      { wait: true, waitTimeoutMs: 120_000 }
    );
    console.log("Source indexed:", source.id, source.kind);

    // 3. Generate an audio overview
    const task = await client.artifacts.generateAudio(notebook.id, {
      sourceIds: [source.id],
      audioFormat: AudioFormat.BRIEF,
      audioLength: AudioLength.SHORT,
    });
    console.log("Generation started, task:", task.taskId);

    // 4. Poll until done
    const audio = await client.artifacts.waitForCompletion(notebook.id, task.taskId, {
      waitTimeoutMs: 300_000,
    });
    console.log("Audio ready at:", audio.url);

    // 5. Ask a question
    const answer = await chat.ask(
      notebook.id,
      "What is the difference between a mapped type and a conditional type in TypeScript?"
    );
    console.log("Answer:", answer.answer);
    console.log("Citations:", answer.references.length);

    // 6. Follow-up
    const followUp = await chat.ask(
      notebook.id,
      "Can you give a practical example of each?",
      { conversationId: answer.conversationId }
    );
    console.log("Follow-up:", followUp.answer);

  } finally {
    // 7. Clean up
    await notebooks.deleteNotebook(notebook.id);
    console.log("Notebook deleted.");
  }
}

main().catch(console.error);
```
