# notebooklm-ts-api

An **unofficial** Node.js / TypeScript wrapper for [NotebookLM](https://notebooklm.google.com/), providing both a programmatic client library and a self-hosted REST API server.

> ⚠️ This project uses undocumented Google RPC endpoints. It may break without notice if Google changes its internal API. Use it at your own risk.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Authentication](#authentication)
  - [Option 1 — Storage file](#option-1--storage-file)
  - [Option 2 — Environment variable](#option-2--environment-variable)
- [Quick Start](#quick-start)
  - [As a library](#as-a-library)
  - [As an HTTP API server](#as-an-http-api-server)
- [Environment Variables](#environment-variables)
- [REST API Reference](#rest-api-reference)
  - [Authentication header](#authentication-header)
  - [Health](#health)
  - [Notebooks](#notebooks)
  - [Sources](#sources)
  - [Artifacts](#artifacts)
  - [Chat](#chat)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Running with Docker](#running-with-docker)
- [Development](#development)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)

---

## Features

- 📓 **Notebooks** — list, create, get, rename, delete, describe, share
- 📄 **Sources** — add URLs, pasted text, Google Drive files; list, rename, delete, refresh, get full text and source guide
- 🎙️ **Artifacts** — generate Audio overviews, Videos, Reports, Quizzes, Flashcards, Infographics, Slide Decks, Data Tables and Mind Maps; poll status, rename, delete, export
- 💬 **Chat** — ask questions with streaming response parsing, conversation history, cache management, configure chat goal and response length
- 🔐 **Cookie-based auth** — reads a Playwright `storage_state.json` or an inline JSON env var; auto-refresh on session expiry
- 🌐 **Express REST API** — self-hostable HTTP layer on top of the client library
- 🐳 **Docker** — multi-stage Dockerfile and `docker-compose.yml` for local development
- 🧪 **Tests** — 132 unit tests with Jest (TypeScript)
- 🔁 **CI** — GitHub Actions workflow for lint → type-check → test → coverage

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 20 |
| npm | 9+ |
| TypeScript | 5+ |

---

## Installation

```bash
# Clone the repository
git clone https://github.com/HenriqueCosta05/notebooklm-ts-api.git
cd notebooklm-ts-api

# Install dependencies
npm install

# Copy environment config
cp .env.example .env
```

---

## Authentication

NotebookLM does not have a public API. Authentication is **cookie-based**: you must supply a valid Playwright `storage_state.json` containing a live Google session.

### Obtaining a storage state

The recommended way to capture a session is with [Playwright](https://playwright.dev/):

```bash
npx playwright codegen --save-storage=storage_state.json https://notebooklm.google.com/
```

Log in to your Google account in the browser window that opens, navigate to NotebookLM, then close the browser. The file `storage_state.json` now contains your session cookies.

### Option 1 — Storage file

Place `storage_state.json` in the default location or point to it via an environment variable:

```bash
# Default location (auto-detected)
mkdir -p ~/.notebooklm
cp storage_state.json ~/.notebooklm/storage_state.json

# Or set an explicit path
NOTEBOOKLM_STORAGE_PATH=/path/to/storage_state.json
```

### Option 2 — Environment variable

Inline the entire JSON as a single-line string (useful for CI/CD or container secrets):

```bash
NOTEBOOKLM_AUTH_JSON='{"cookies":[...],"origins":[]}'
```

---

## Quick Start

### As a library

```typescript
import { NotebookLMClient } from "./src/infrastructure/third-party/notebooklm/client";

// Load auth from ~/.notebooklm/storage_state.json (or NOTEBOOKLM_AUTH_JSON)
const client = await NotebookLMClient.fromStorage();

// List all notebooks
const notebooks = await client.notebooks.list();
console.log(notebooks);

// Create a notebook
const notebook = await client.notebooks.create("My Research");

// Add a URL source and wait for processing
const source = await client.sources.add(notebook.id, {
  type: "url",
  url: "https://example.com/article",
  wait: true,
});

// Generate an audio overview
const task = await client.artifacts.generateAudio(notebook.id, {
  sourceIds: [source.id],
});

// Poll until complete
const status = await client.artifacts.waitForCompletion(notebook.id, task.taskId);
console.log("Audio URL:", status.url);

// Ask a question
const result = await client.chat.ask(notebook.id, "What is this article about?");
console.log(result.answer);
```

Using the factory (recommended for use-case layer):

```typescript
import { createNotebookLMClient } from "./src/main/factories/notebooklm.factory";

const { notebooks, sources, artifacts, chat } = await createNotebookLMClient();

const list = await notebooks.listNotebooks();
```

### As an HTTP API server

```bash
# Development (hot-reload)
npm run dev

# Production build then serve
npm run build && npm start
```

The server starts on `http://0.0.0.0:3000/api/v1` by default.

Verify it is running:

```bash
curl http://localhost:3000/api/v1/health
# {"statusCode":200,"message":"Service is healthy."}
```

---

## Environment Variables

Copy `.env.example` to `.env` and adjust to your needs.

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Runtime environment (`development` \| `production` \| `test`) |
| `PORT` | `3000` | TCP port the HTTP server binds to |
| `HOST` | `0.0.0.0` | Network interface the server binds to |
| `API_PREFIX` | `/api/v1` | URL prefix applied to all API routes |
| `CORS_ORIGIN` | `*` | Allowed CORS origin(s) |
| `REQUEST_TIMEOUT_MS` | `30000` | Global HTTP request timeout in milliseconds |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Sliding window for the rate limiter (ms) |
| `RATE_LIMIT_MAX` | `60` | Maximum requests per window per IP |
| `NOTEBOOKLM_STORAGE_PATH` | _(unset)_ | Absolute path to `storage_state.json` |
| `NOTEBOOKLM_AUTH_JSON` | _(unset)_ | Inline Playwright storage state JSON string |
| `NOTEBOOKLM_TIMEOUT_MS` | `60000` | Timeout for individual NotebookLM RPC calls |
| `LOG_LEVEL` | `info` | Minimum log level (`debug` \| `info` \| `warn` \| `error`) |

---

## REST API Reference

### Authentication header

Every request to `/api/v1/**` (except `/api/v1/health`) must include:

```
x-notebooklm-auth: <base64(JSON.stringify(playwrightStorageState))>
```

Generate the header value with:

```bash
AUTH=$(cat storage_state.json | base64 -w 0)
curl -H "x-notebooklm-auth: $AUTH" http://localhost:3000/api/v1/notebooks
```

All error responses follow this envelope:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Authentication is required to access this resource."
}
```

All success responses follow this envelope:

```json
{
  "statusCode": 200,
  "data": { ... },
  "message": "Optional human-readable message."
}
```

---

### Health

#### `GET /api/v1/health`

No authentication required.

**Response `200`**
```json
{
  "statusCode": 200,
  "message": "Service is healthy."
}
```

---

### Notebooks

Base path: `/api/v1/notebooks`

---

#### `GET /api/v1/notebooks`

List all notebooks for the authenticated user.

**Response `200`**
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": "abc123",
      "title": "My Research",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "sourcesCount": 3,
      "isOwner": true
    }
  ]
}
```

---

#### `POST /api/v1/notebooks`

Create a new notebook.

**Body**
```json
{
  "title": "My Research"
}
```

**Response `201`**
```json
{
  "statusCode": 201,
  "data": {
    "id": "abc123",
    "title": "My Research",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "sourcesCount": 0,
    "isOwner": true
  },
  "message": "Notebook created successfully."
}
```

---

#### `GET /api/v1/notebooks/:id`

Get a single notebook by ID.

**Response `200`** — same shape as individual item from list.

---

#### `DELETE /api/v1/notebooks/:id`

Delete a notebook permanently.

**Response `204`** — no body.

---

#### `PATCH /api/v1/notebooks/:id`

Rename a notebook.

**Body**
```json
{
  "title": "Updated Title"
}
```

**Response `200`**
```json
{
  "statusCode": 200,
  "data": { "id": "abc123", "title": "Updated Title", ... },
  "message": "Notebook renamed successfully."
}
```

---

#### `GET /api/v1/notebooks/:id/description`

Get an AI-generated description and suggested topics for the notebook.

**Response `200`**
```json
{
  "statusCode": 200,
  "data": {
    "summary": "This notebook covers ...",
    "suggestedTopics": [
      { "question": "What is X?", "prompt": "Explain X in detail." }
    ]
  }
}
```

---

#### `POST /api/v1/notebooks/:id/share`

Update sharing settings for a notebook.

**Body**
```json
{
  "isPublic": true,
  "artifactId": "optional-artifact-id"
}
```

**Response `200`**
```json
{
  "statusCode": 200,
  "data": {
    "public": true,
    "url": "https://notebooklm.google.com/notebook/abc123",
    "artifactId": null
  },
  "message": "Notebook sharing settings updated."
}
```

---

### Sources

Base path: `/api/v1/notebooks/:notebookId/sources`

---

#### `GET /api/v1/notebooks/:notebookId/sources`

List all sources in a notebook.

**Response `200`**
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": "src_xyz",
      "title": "My Article",
      "url": "https://example.com/article",
      "kind": "web_page",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "status": 2,
      "isReady": true,
      "isProcessing": false,
      "isError": false
    }
  ]
}
```

**Source `kind` values:** `google_docs`, `google_slides`, `google_spreadsheet`, `pdf`, `pasted_text`, `web_page`, `youtube`, `markdown`, `docx`, `csv`, `image`, `media`, `unknown`

---

#### `GET /api/v1/notebooks/:notebookId/sources/:sourceId`

Get a single source by ID.

---

#### `POST /api/v1/notebooks/:notebookId/sources/url`

Add a URL as a source.

**Body**
```json
{
  "url": "https://example.com/article",
  "wait": true,
  "waitTimeoutMs": 60000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | ✅ | Public URL to index |
| `wait` | `boolean` | ❌ | Wait for processing to complete before responding |
| `waitTimeoutMs` | `number` | ❌ | Timeout while waiting (default: `60000`) |

**Response `201`**
```json
{
  "statusCode": 201,
  "data": { "id": "src_xyz", "kind": "web_page", "isReady": true, ... },
  "message": "Source added successfully."
}
```

---

#### `POST /api/v1/notebooks/:notebookId/sources/text`

Add pasted text as a source.

**Body**
```json
{
  "title": "My Notes",
  "content": "Full text content here...",
  "wait": true,
  "waitTimeoutMs": 60000
}
```

---

#### `POST /api/v1/notebooks/:notebookId/sources/drive`

Add a Google Drive file as a source.

**Body**
```json
{
  "fileId": "google-drive-file-id",
  "title": "My Google Doc",
  "mimeType": "application/vnd.google-apps.document",
  "wait": true
}
```

**Supported `mimeType` values:** `application/vnd.google-apps.document`, `application/vnd.google-apps.presentation`, `application/vnd.google-apps.spreadsheet`, `application/pdf`

---

#### `DELETE /api/v1/notebooks/:notebookId/sources/:sourceId`

Delete a source from a notebook.

**Response `204`** — no body.

---

#### `PATCH /api/v1/notebooks/:notebookId/sources/:sourceId`

Rename a source.

**Body**
```json
{ "title": "New Title" }
```

**Response `200`** with updated source object.

---

#### `POST /api/v1/notebooks/:notebookId/sources/:sourceId/refresh`

Trigger a content refresh for a web-page source.

**Response `200`**
```json
{ "statusCode": 200, "data": null, "message": "Source refreshed successfully." }
```

---

#### `GET /api/v1/notebooks/:notebookId/sources/:sourceId/fulltext`

Retrieve the full indexed text of a source.

**Response `200`**
```json
{
  "statusCode": 200,
  "data": {
    "sourceId": "src_xyz",
    "title": "My Article",
    "content": "Full text...",
    "kind": "web_page",
    "url": "https://example.com/article",
    "charCount": 4821
  }
}
```

---

#### `GET /api/v1/notebooks/:notebookId/sources/:sourceId/guide`

Get an AI-generated guide (summary + keywords) for a source.

**Response `200`**
```json
{
  "statusCode": 200,
  "data": {
    "summary": "This source covers ...",
    "keywords": ["machine learning", "neural networks"]
  }
}
```

---

### Artifacts

Base path: `/api/v1/notebooks/:notebookId/artifacts`

Artifacts are AI-generated outputs (audio overviews, videos, quizzes, etc.). Generation is asynchronous — the generate endpoints return a task ID that you poll for completion.

**Artifact `kind` values:** `audio`, `video`, `report`, `quiz`, `flashcards`, `mind_map`, `infographic`, `slide_deck`, `data_table`, `unknown`

---

#### `GET /api/v1/notebooks/:notebookId/artifacts`

List all artifacts in a notebook.

**Query parameters**

| Param | Type | Description |
|-------|------|-------------|
| `kind` | `string` | Filter by artifact kind (e.g. `audio`, `quiz`) |

**Response `200`**
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": "art_abc",
      "title": "Audio Overview",
      "kind": "audio",
      "status": 3,
      "statusStr": "completed",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "url": "https://...",
      "isCompleted": true,
      "isProcessing": false,
      "isPending": false,
      "isFailed": false
    }
  ]
}
```

---

#### `GET /api/v1/notebooks/:notebookId/artifacts/:artifactId`

Get a single artifact by ID.

---

#### `DELETE /api/v1/notebooks/:notebookId/artifacts/:artifactId`

Delete an artifact permanently.

**Response `204`** — no body.

---

#### `PATCH /api/v1/notebooks/:notebookId/artifacts/:artifactId`

Rename an artifact.

**Body**
```json
{ "title": "New Name" }
```

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/:artifactId/export`

Export an artifact to Google Docs or Sheets.

**Body**
```json
{
  "title": "My Export",
  "exportType": 1
}
```

`exportType`: `1` = Google Docs, `2` = Google Sheets

---

#### `GET /api/v1/notebooks/:notebookId/artifacts/status/:taskId`

Poll the generation status of an artifact task.

**Response `200`**
```json
{
  "statusCode": 200,
  "data": {
    "taskId": "task_xyz",
    "status": "completed",
    "url": "https://...",
    "error": null,
    "errorCode": null,
    "isComplete": true,
    "isFailed": false,
    "isPending": false,
    "isInProgress": false,
    "isRateLimited": false
  }
}
```

---

#### `GET /api/v1/notebooks/:notebookId/artifacts/suggest-reports`

Get AI-suggested report topics for the notebook.

**Response `200`**
```json
{
  "statusCode": 200,
  "data": [
    {
      "title": "Executive Summary",
      "description": "A concise overview...",
      "prompt": "Write a briefing document...",
      "audienceLevel": 2
    }
  ]
}
```

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/audio`

Generate an Audio Overview.

**Body**
```json
{
  "sourceIds": ["src_xyz"],
  "language": "en",
  "instructions": "Focus on key takeaways",
  "audioFormat": 1,
  "audioLength": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sourceIds` | `string[]` | ❌ | Specific sources to include (all if omitted) |
| `language` | `string` | ❌ | BCP-47 language code (e.g. `"en"`) |
| `instructions` | `string` | ❌ | Custom instructions for the generation |
| `audioFormat` | `number` | ❌ | `1`=Deep dive, `2`=Brief, `3`=Critique, `4`=Debate |
| `audioLength` | `number` | ❌ | `1`=Short, `2`=Default, `3`=Long |

**Response `201`** — returns a `GenerationStatus` object with `taskId` to poll.

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/video`

Generate a Video overview.

**Body**
```json
{
  "sourceIds": ["src_xyz"],
  "language": "en",
  "instructions": null,
  "videoFormat": 1,
  "videoStyle": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `videoFormat` | `number` | `1`=Explainer, `2`=Brief |
| `videoStyle` | `number` | `1`=Auto, `2`=Custom, `3`=Classic, `4`=Whiteboard, `5`=Kawaii, `6`=Anime, `7`=Watercolor, `8`=Retro Print, `9`=Heritage, `10`=Paper Craft |

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/report`

Generate a written Report.

**Body**
```json
{
  "sourceIds": ["src_xyz"],
  "language": "en",
  "reportFormat": "briefing_doc",
  "customPrompt": null,
  "extraInstructions": null
}
```

`reportFormat` values: `"briefing_doc"`, `"study_guide"`, `"blog_post"`, `"custom"`

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/quiz`

Generate a Quiz.

**Body**
```json
{
  "sourceIds": ["src_xyz"],
  "instructions": null,
  "quantity": 2,
  "difficulty": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `quantity` | `number` | `1`=Fewer, `2`=Standard |
| `difficulty` | `number` | `1`=Easy, `2`=Medium, `3`=Hard |

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/flashcards`

Generate Flashcards (same body shape as quiz).

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/infographic`

Generate an Infographic.

**Body**
```json
{
  "sourceIds": ["src_xyz"],
  "language": "en",
  "instructions": null,
  "orientation": 2,
  "detailLevel": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `orientation` | `number` | `1`=Landscape, `2`=Portrait, `3`=Square |
| `detailLevel` | `number` | `1`=Concise, `2`=Standard, `3`=Detailed |

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/slide-deck`

Generate a Slide Deck.

**Body**
```json
{
  "sourceIds": ["src_xyz"],
  "language": "en",
  "instructions": null,
  "slideFormat": 1,
  "slideLength": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `slideFormat` | `number` | `1`=Detailed deck, `2`=Presenter slides |
| `slideLength` | `number` | `1`=Default, `2`=Short |

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/data-table`

Generate a Data Table.

**Body**
```json
{
  "sourceIds": ["src_xyz"],
  "language": "en",
  "instructions": null
}
```

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/generate/mind-map`

Generate a Mind Map.

**Body**
```json
{
  "sourceIds": ["src_xyz"]
}
```

---

#### `POST /api/v1/notebooks/:notebookId/artifacts/:artifactId/revise-slide`

Revise a specific slide in a Slide Deck artifact.

**Body**
```json
{
  "slideIndex": 2,
  "prompt": "Make this slide more concise"
}
```

---

### Chat

Base path: `/api/v1/notebooks/:notebookId/chat`

---

#### `POST /api/v1/notebooks/:notebookId/chat/ask`

Ask a question in the context of a notebook.

**Body**
```json
{
  "question": "What are the main themes in this notebook?",
  "sourceIds": ["src_xyz"],
  "conversationId": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | `string` | ✅ | The question to ask |
| `sourceIds` | `string[]` | ❌ | Limit context to specific sources |
| `conversationId` | `string \| null` | ❌ | Continue an existing conversation |

**Response `200`**
```json
{
  "statusCode": 200,
  "data": {
    "answer": "The main themes are ...",
    "conversationId": "conv_abc",
    "turnNumber": 1,
    "isFollowUp": false,
    "references": [
      {
        "sourceId": "src_xyz",
        "citationNumber": 1,
        "citedText": "Relevant excerpt...",
        "startChar": 120,
        "endChar": 240,
        "chunkId": "chunk_01"
      }
    ],
    "rawResponse": "..."
  }
}
```

---

#### `GET /api/v1/notebooks/:notebookId/chat/conversation`

Get the conversation ID for the notebook's most recent conversation.

**Response `200`**
```json
{
  "statusCode": 200,
  "data": { "conversationId": "conv_abc" }
}
```

---

#### `GET /api/v1/notebooks/:notebookId/chat/history`

Get conversation history from NotebookLM.

**Query parameters**

| Param | Type | Description |
|-------|------|-------------|
| `conversationId` | `string` | Specific conversation to fetch |
| `limit` | `number` | Maximum number of turns to return |

**Response `200`**
```json
{
  "statusCode": 200,
  "data": [
    { "query": "What is X?", "answer": "X is ...", "turnNumber": 1 }
  ]
}
```

---

#### `GET /api/v1/notebooks/:notebookId/chat/cache/:conversationId`

Get locally cached conversation turns (in-memory, not persisted).

---

#### `DELETE /api/v1/notebooks/:notebookId/chat/cache`

Clear all locally cached conversations.

#### `DELETE /api/v1/notebooks/:notebookId/chat/cache/:conversationId`

Clear the cache for a specific conversation ID.

---

#### `POST /api/v1/notebooks/:notebookId/chat/configure`

Configure the chat settings for a notebook.

**Body**
```json
{
  "goal": 1,
  "responseLength": 1,
  "customPrompt": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `goal` | `number` | `1`=Default, `2`=Custom, `3`=Learning guide |
| `responseLength` | `number` | `1`=Default, `4`=Longer, `5`=Shorter |
| `customPrompt` | `string \| null` | Required when `goal` is `2` (Custom) |

---

#### `POST /api/v1/notebooks/:notebookId/chat/mode`

Set the chat mode for a notebook.

**Body**
```json
{
  "mode": "default"
}
```

`mode` values: `"default"`, `"learning_guide"`, `"concise"`, `"detailed"`

---

## Architecture

The project follows a **layered clean architecture** to maintain separation of concerns and testability.

```
HTTP Request
     │
     ▼
┌─────────────────────────────────┐
│     Presentation Layer          │  Express controllers, routes, middlewares
│  (src/presentation/)            │  Thin handlers — validate → delegate → respond
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│     Application Layer           │  Use-cases orchestrating domain operations
│  (src/application/use-cases/)   │  Framework-agnostic, reusable
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│     Domain Layer                │  Pure TypeScript models and types
│  (src/domain/models/)           │  No external dependencies
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│     Infrastructure Layer        │  NotebookLM RPC client, auth, config
│  (src/infrastructure/)          │  All I/O and third-party integrations
└─────────────────────────────────┘
```

### RPC Protocol

NotebookLM exposes internal Google `batchexecute` RPC endpoints. Each call:

1. **Encodes** params as a triple-nested JSON array (`f.req=...` form body) — `rpc/encoder.ts`
2. **Sends** a POST to `https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute`
3. **Decodes** the anti-XSSI-prefixed chunked response — `rpc/decoder.ts`
4. **Extracts** the result from `wrb.fr` entries or raises on `er` entries

Auth tokens (CSRF `SNlM0e` and session `FdrFJe`) are fetched from the NotebookLM homepage HTML on every new session and refreshed automatically on auth errors.

---

## Project Structure

```
notebooklm-ts-api/
├── .github/
│   └── workflows/
│       └── ci.yml                  # GitHub Actions CI pipeline
├── docs/                           # Extended documentation
├── locales/
│   └── en.json                     # i18n messages
├── src/
│   ├── application/
│   │   ├── ports/                  # Interface contracts
│   │   ├── use-cases/              # Orchestration logic
│   │   │   ├── notebooks.use-case.ts
│   │   │   ├── sources.use-case.ts
│   │   │   ├── artifacts.use-case.ts
│   │   │   └── chat.use-case.ts
│   │   └── validation/             # Input validation helpers
│   ├── common/                     # Shared utilities
│   ├── domain/
│   │   └── models/
│   │       └── notebooklm.types.ts # Domain interfaces and type maps
│   ├── i18n/
│   │   └── index.ts                # Lightweight i18n singleton
│   ├── infrastructure/
│   │   ├── config/
│   │   │   └── env.ts              # Typed env config singleton
│   │   ├── framework/
│   │   │   ├── app.ts              # Express app factory
│   │   │   └── server.ts           # Server entry point
│   │   └── third-party/
│   │       └── notebooklm/
│   │           ├── rpc/
│   │           │   ├── types.ts    # RPC method IDs, enums, constants
│   │           │   ├── encoder.ts  # f.req body encoder
│   │           │   ├── decoder.ts  # Chunked response decoder
│   │           │   └── errors.ts   # Typed RPC error classes
│   │           ├── auth.ts         # Cookie extraction and token refresh
│   │           ├── core.ts         # HTTP client core with retry/refresh
│   │           ├── client.ts       # NotebookLMClient facade
│   │           └── apis/           # Individual API service modules
│   ├── main/
│   │   ├── factories/
│   │   │   └── notebooklm.factory.ts
│   │   └── middlewares/
│   └── presentation/
│       ├── controllers/            # HTTP request handlers
│       ├── middlewares/
│       │   ├── notebooklm-auth.middleware.ts
│       │   └── error.middleware.ts
│       ├── responses/
│       │   └── http.response.ts    # Consistent envelope helpers
│       └── routes/                 # Express routers
├── tests/
│   ├── unit/
│   │   ├── auth.spec.ts
│   │   ├── i18n.spec.ts
│   │   ├── error.middleware.spec.ts
│   │   └── rpc/
│   │       ├── encoder.spec.ts
│   │       └── decoder.spec.ts
│   └── integration/
├── .env.example
├── .eslintrc.json
├── .prettierrc.json
├── Dockerfile
├── docker-compose.yml
├── jest.config.ts
├── package.json
├── tsconfig.json
└── tsconfig.test.json
```

---

## Running with Docker

Each environment runs behind an **Nginx reverse proxy** that terminates TLS and publishes ports **80** and **443** to the host. Port 80 issues a permanent redirect to HTTPS. The Node container itself is never exposed directly.

Three pieces work together to make the custom HTTPS hostname reachable from a browser:

1. **`/etc/hosts`** — maps each hostname to `127.0.0.1` so your OS resolves it locally
2. **`nginx/certs/`** — locally-trusted TLS certificates generated by `mkcert`
3. **`ports: ["80:80", "443:443"]`** on the Nginx container — forwards host traffic into the proxy, which routes it to the Node container over the internal Docker network

| Environment | Compose file | Network | URL |
|---|---|---|---|
| Development | `docker-compose.yml` | `notebooklm-dev-net` | `https://notebooklm.api.dev/api/v1` |
| Production | `docker-compose.prod.yml` | `notebooklm-prod-net` | `https://notebooklm.api.prod/api/v1` |

The DNS alias is registered on the **Nginx proxy container**, not the Node container. The proxy resolves `notebooklm-api-dev:3000` (or `notebooklm-api-prod:3000`) internally and forwards all traffic over HTTPS on port 443.

### Prerequisites — TLS certificates

Certificates are generated with [mkcert](https://github.com/FiloSottile/mkcert), which creates a locally-trusted CA and issues certificates for both hostnames. Run the provided script once — it installs `mkcert` if missing, installs the CA into your system and Chrome/Chromium trust stores, and generates the cert:

```bash
bash scripts/generate-certs.sh
```

The script outputs two files into `nginx/certs/` (which is `.gitignore`d — never commit private keys):

```
nginx/certs/notebooklm.api.dev+1.pem
nginx/certs/notebooklm.api.dev+1-key.pem
```

Both hostnames share a single SAN certificate, so the same files are used by both Nginx configs.

#### Firefox

Firefox maintains its own certificate store and requires a one-time manual import:

1. Open **Settings → Privacy & Security → View Certificates → Authorities**
2. Click **Import** and select `$(mkcert -CAROOT)/rootCA.pem`
3. Check **Trust this CA to identify websites** and confirm

### Prerequisites — `/etc/hosts`

Both hostnames must resolve to `127.0.0.1` on the host. Add them once:

```bash
echo "127.0.0.1   notebooklm.api.dev"  | sudo tee -a /etc/hosts
echo "127.0.0.1   notebooklm.api.prod" | sudo tee -a /etc/hosts
```

Verify:

```bash
grep "notebooklm" /etc/hosts
# 127.0.0.1   notebooklm.api.dev
# 127.0.0.1   notebooklm.api.prod
```

### Development (hot-reload)

```bash
docker compose up
```

The Node container mounts `src/`, `locales/`, and `tsconfig.json` as read-only volumes and runs `ts-node-dev` for live reloading. The proxy starts only after the API passes its healthcheck.

Once running, open your browser or call:

```bash
curl https://notebooklm.api.dev/api/v1/health
```

### Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

The Node container is built from the `runner` Dockerfile stage (compiled JS, non-root `appuser`, no dev dependencies).

Once running:

```bash
curl https://notebooklm.api.prod/api/v1/health
```

### Connecting another container

To give an external container access to either environment, connect it to the corresponding network:

```bash
# Development
docker run --network notebooklm-dev-net my-other-image
docker network connect notebooklm-dev-net <running-container>

# Production
docker run --network notebooklm-prod-net my-other-image
docker network connect notebooklm-prod-net <running-container>
```

Containers on the internal network reach the API via the proxy alias on port 80 (plain HTTP — TLS termination happens at the proxy boundary, internal traffic is unencrypted):

```
http://notebooklm.api.dev/api/v1     # from a container on notebooklm-dev-net
http://notebooklm.api.prod/api/v1    # from a container on notebooklm-prod-net
```

### Nginx configuration

Nginx configs live in `nginx/` and are mounted read-only into each proxy container:

| File | Listens | Behaviour | Upstream |
|---|---|---|---|
| `nginx/dev.conf` | 80, 443 | 80 → 301 redirect to HTTPS; 443 terminates TLS | `notebooklm-api-dev:3000` |
| `nginx/prod.conf` | 80, 443 | 80 → 301 redirect to HTTPS; 443 terminates TLS | `notebooklm-api-prod:3000` |

TLS settings applied to both: `TLSv1.2 TLSv1.3`, `HIGH:!aNULL:!MD5` cipher suite, `ssl_session_cache shared:SSL:10m`.

### Inspecting the networks

```bash
# Development
docker network inspect notebooklm-dev-net \
  --format '{{range .Containers}}{{.Name}} → {{.IPv4Address}}{{"\n"}}{{end}}'

# Production
docker network inspect notebooklm-prod-net \
  --format '{{range .Containers}}{{.Name}} → {{.IPv4Address}}{{"\n"}}{{end}}'
```

### Multi-stage Dockerfile

1. **`deps`** — installs production dependencies only (`npm ci --omit=dev`)
2. **`builder`** — installs all dependencies and compiles TypeScript to `dist/` (used by dev Compose)
3. **`runner`** — minimal Alpine image with compiled JS and a non-root `appuser` (used by prod Compose)

---

## Development

```bash
# Start with hot-reload
npm run dev

# Type-check only (no emit)
npm run lint:ts

# Lint and auto-fix
npm run lint

# Build to dist/
npm run build
```

---

## Testing

```bash
# Run all unit tests
npm test

# Run with coverage report
npm run test:coverage

# Watch mode
npm run test:watch

# Watch unit tests only
npm run test:watchUnit
```

All tests live under `tests/` and use Jest with `ts-jest`. The test TypeScript config (`tsconfig.test.json`) relaxes `rootDir` constraints so test files can import from `src/`.

Current coverage: **132 tests** across 5 suites (RPC encoder, RPC decoder, auth helpers, i18n, error middleware).

---

## CI/CD

GitHub Actions runs on every push and pull request to `main` or `develop`:

1. Install dependencies (`npm ci`)
2. Type-check `src/` (`tsc --noEmit`)
3. Type-check `tests/` (`tsc --noEmit -p tsconfig.test.json`)
4. Run tests with coverage (`npm run test:coverage`)
5. Upload coverage report as a workflow artifact (retained for 7 days)

---

## Contributing

1. Fork the repository and create a feature branch.
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:
   - `feat:` new feature
   - `fix:` bug fix
   - `refactor:` code change that is not a feat or fix
   - `docs:` documentation only
   - `chore:` dependency or config maintenance
   - `ci:` changes to CI/CD workflows
3. Ensure `npm run lint:ts && npm test` passes before opening a PR.
4. Update `locales/en.json` when adding user-facing messages.

---

## Disclaimer

This project is **not affiliated with, endorsed by, or supported by Google**. It reverse-engineers undocumented internal RPC endpoints and may break at any time if Google changes its API. Use responsibly and in accordance with [Google's Terms of Service](https://policies.google.com/terms).