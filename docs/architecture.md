# Architecture

This document describes the layered architecture of `notebooklm-ts-api`, the rationale behind each layer, and the conventions that must be followed when adding new features.

---

## Guiding Principles

- **Separation of concerns** — each layer has a single, well-defined responsibility. No layer reaches down more than one level.
- **Dependency rule** — dependencies point inward only. Infrastructure depends on Application; Application depends on Domain; Domain depends on nothing.
- **Framework-agnostic core** — use-cases and domain models contain zero Express, zero HTTP, zero RPC specifics. They can be tested without starting a server.
- **Thin controllers** — controllers validate input, call one use-case method, and call one response helper. All business logic lives in services and use-cases.
- **TypeScript strict mode** — `any` is never used. Every public boundary is explicitly typed.

---

## Layer Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     HTTP Client / curl                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │  HTTP request
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               Presentation Layer                                │
│  src/presentation/                                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Middlewares │  │  Controllers │  │        Routes         │ │
│  │              │  │  (thin)      │  │  wire controllers to  │ │
│  │ - auth       │  │              │  │  Express Router       │ │
│  │ - error      │  │ - notebooks  │  │                       │ │
│  │              │  │ - sources    │  │                       │ │
│  └──────────────┘  │ - artifacts  │  └───────────────────────┘ │
│                    │ - chat       │                             │
│                    └──────┬───────┘                             │
└───────────────────────────┼─────────────────────────────────────┘
                            │  calls use-case method
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               Application Layer                                 │
│  src/application/                                               │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Use Cases                                                │  │
│  │  NotebooksUseCase / SourcesUseCase /                      │  │
│  │  ArtifactsUseCase / ChatUseCase                           │  │
│  │                                                           │  │
│  │  Orchestrate domain objects using the client interface.   │  │
│  │  No HTTP, no RPC, no Express.                             │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────┐    │                                  │
│  │  Ports (interfaces)  │◄───┘                                  │
│  │  ResponseModel       │                                       │
│  └──────────────────────┘                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │  reads/writes domain models
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               Domain Layer                                      │
│  src/domain/                                                    │
│                                                                 │
│  Pure TypeScript interfaces and type maps.                      │
│  No classes, no side effects, no I/O.                           │
│                                                                 │
│  Notebook / Source / Artifact / AskResult / ChatReference / ... │
└───────────────────────────┬─────────────────────────────────────┘
                            │  types flow up; implementations flow down
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               Infrastructure Layer                              │
│  src/infrastructure/                                            │
│                                                                 │
│  ┌────────────────────────────┐  ┌───────────────────────────┐  │
│  │  third-party/notebooklm/   │  │  config/env.ts            │  │
│  │                            │  │                           │  │
│  │  rpc/                      │  │  Typed env config         │  │
│  │  ├─ types.ts   (enums)     │  │  singleton resolved at    │  │
│  │  ├─ encoder.ts             │  │  startup.                 │  │
│  │  ├─ decoder.ts             │  └───────────────────────────┘  │
│  │  └─ errors.ts              │                                  │
│  │                            │  ┌───────────────────────────┐  │
│  │  auth.ts                   │  │  framework/               │  │
│  │  core.ts  (ClientCore)     │  │  ├─ app.ts  (Express)     │  │
│  │  client.ts (facade)        │  │  └─ server.ts (entry)     │  │
│  │  apis/    (one per domain) │  └───────────────────────────┘  │
│  └────────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities

### Presentation (`src/presentation/`)

| Module | Responsibility |
|---|---|
| `routes/` | Define URL paths; wire HTTP verbs to controller functions via `express.Router` |
| `controllers/` | Parse `req.params`, `req.query`, `req.body`; call exactly one use-case method; call one response helper |
| `middlewares/notebooklm-auth.middleware.ts` | Decode `x-notebooklm-auth` header → `AuthTokens`; attach to `req.notebookLMAuth` |
| `middlewares/error.middleware.ts` | Catch all unhandled errors; map domain / RPC errors to structured HTTP responses |
| `responses/http.response.ts` | Provide `sendSuccess`, `sendCreated`, `sendNoContent` helpers that enforce the response envelope shape |

**Invariants:**
- Controllers never import from `rpc/` or call `fetch` directly.
- Controllers never contain `if/else` branching on business logic — that belongs in the use-case or service.
- Each controller function is `async` and wraps its body in `try/catch`, forwarding errors to `next(err)`.

---

### Application (`src/application/`)

| Module | Responsibility |
|---|---|
| `use-cases/` | Orchestrate one logical operation using the `NotebookLMClient` interface |
| `ports/` | TypeScript interfaces that decouple the application layer from concrete infrastructure implementations |
| `validation/` | Pure input validation helpers (no HTTP concerns) |

**Invariants:**
- Use-case classes receive a `NotebookLMClient` instance via constructor injection — no static imports of infrastructure.
- Use-cases return domain model types (`Notebook`, `Source`, `Artifact`, etc.) — never raw RPC arrays.
- Use-cases are fully testable without Express or any HTTP mocking.

---

### Domain (`src/domain/`)

| Module | Responsibility |
|---|---|
| `models/notebooklm.types.ts` | TypeScript interfaces for all domain objects; mapping helper functions (`mapSourceKind`, `mapArtifactKind`) |

**Invariants:**
- No classes; interfaces and pure functions only.
- No imports from any other `src/` layer.
- No runtime side effects.

---

### Infrastructure (`src/infrastructure/`)

#### `third-party/notebooklm/`

| File | Responsibility |
|---|---|
| `rpc/types.ts` | `RPCMethod` enum (method IDs), all other enums (`ArtifactTypeCode`, `SourceStatus`, etc.), URL constants |
| `rpc/encoder.ts` | `encodeRpcRequest`, `buildRequestBody`, `buildUrlParams` — pure serialization, no I/O |
| `rpc/decoder.ts` | `decodeResponse` — anti-XSSI stripping, chunked parse, `wrb.fr`/`er` extraction |
| `rpc/errors.ts` | Error class hierarchy: `RPCError`, `AuthError`, `RateLimitError`, `ServerError`, `ClientError`, `NetworkError`, `RPCTimeoutError` |
| `auth.ts` | Cookie extraction from Playwright storage state, CSRF/session token fetch from homepage HTML, `AuthTokens` class |
| `core.ts` | `ClientCore` — HTTP lifecycle, RPC call wrapper, auth refresh+retry, conversation turn cache |
| `client.ts` | `NotebookLMClient` — assembles `ClientCore` and all API modules into a single facade; `fromStorage()` factory |
| `apis/*.api.ts` | One module per NotebookLM domain area; each method builds RPC params and decodes the typed response |

#### `config/env.ts`

Resolves all environment variables into the typed `AppConfig` singleton at module load time. Provides `requireEnv`, `optionalEnv`, `optionalIntEnv`, `optionalBoolEnv` helpers for safe env access.

#### `framework/`

| File | Responsibility |
|---|---|
| `app.ts` | `createApp()` — registers all Express middlewares (Helmet, CORS, rate limiter), mounts routes, registers the 404 handler and error middleware |
| `server.ts` | Imports `reflect-metadata`; calls `initI18n("en")`; calls `createApp()`; binds the HTTP server; registers graceful shutdown and unhandled rejection handlers |

---

### Main (`src/main/`)

| Module | Responsibility |
|---|---|
| `factories/notebooklm.factory.ts` | `createNotebookLMClient()` — async factory that calls `NotebookLMClient.fromStorage()` and wires all use-cases; `createNotebookLMClientFromAuth()` — synchronous variant for when an `AuthTokens` instance already exists (used by controllers) |
| `middlewares/` | Re-exported or composed middleware chains for the framework layer |

---

### i18n (`src/i18n/`)

A lightweight singleton `I18n` class that:
- Loads a JSON locale file from `locales/` at construction time
- Provides `t(key, params)` for dot-path key lookup with `{{placeholder}}` interpolation
- Exposes `initI18n(locale)` (called once in `server.ts`) and `t()` (shorthand for use anywhere)

Locale files live in `locales/en.json`. Every user-facing string — including error messages, success messages, and validation errors — must be a key in the locale file.

---

## Request Lifecycle

A complete trace of an authenticated `POST /api/v1/notebooks/:notebookId/chat/ask` request:

```
1. Express receives the request.

2. Helmet sets security headers.
   CORS validates the origin.
   Rate limiter checks the IP bucket.
   express.json() parses the body.

3. notebookLMAuthMiddleware (applied to all /api/v1/* routes):
   a. Reads the x-notebooklm-auth header (base64 Playwright storage state).
   b. Decodes → extractCookiesFromStorage() → fetchTokens() (GET notebooklm.google.com).
   c. Attaches AuthTokens to req.notebookLMAuth.
   d. Calls next().

4. chatRouter matches POST /ask → askQuestion controller.

5. askQuestion controller:
   a. Constructs NotebookLMClient(req.notebookLMAuth!).
   b. Calls createNotebookLMClientFromAuth(client).chat to obtain a ChatUseCase.
   c. Destructures req.body → { question, sourceIds, conversationId }.
   d. Awaits chatUseCase.ask(notebookId, question, { sourceIds, conversationId }).
   e. Calls sendSuccess(res, result).

6. ChatUseCase.ask():
   a. Delegates to client.chat.ask() (ChatAPI).

7. ChatAPI.ask():
   a. Builds RPC params array.
   b. Calls core.rpcCall(RPCMethod.QUERY_URL, params, { sourcePath }).

8. ClientCore.rpcCall():
   a. Calls encodeRpcRequest() → buildRequestBody().
   b. Calls buildUrl() → buildUrlParams().
   c. Calls fetchWithTimeout() (POST with cookie header + CSRF token).
   d. On auth failure → tryRefreshAndRetry() (re-fetch CSRF, retry once).
   e. Calls decodeResponse() on the raw text.

9. decodeResponse():
   a. stripAntiXssi() → parseChunkedResponse() → extractRpcResult().
   b. Returns parsed domain data.

10. ChatAPI decodes the result into AskResult (typed domain model).

11. ChatUseCase returns AskResult to the controller.

12. sendSuccess(res, askResult) writes:
    { statusCode: 200, data: askResult }

13. On any throw → next(err) → errorMiddleware maps to structured HTTP error.
```

---

## File Naming Conventions

| Layer | Pattern | Example |
|---|---|---|
| Controllers | `<domain>.controller.ts` | `notebooks.controller.ts` |
| Routes | `<domain>.routes.ts` | `notebooks.routes.ts` |
| Use-cases | `<domain>.use-case.ts` | `notebooks.use-case.ts` |
| API modules | `<domain>.api.ts` | `notebooks.api.ts` |
| Middlewares | `<name>.middleware.ts` | `notebooklm-auth.middleware.ts` |
| Tests (unit) | `<subject>.spec.ts` | `encoder.spec.ts` |
| Tests (integration) | `<subject>.test.ts` | `notebooks.test.ts` |

---

## Adding a New Domain Feature

Follow these steps in order. Each step has a clear, narrow scope.

### 1. Domain model

Add or extend interfaces in `src/domain/models/notebooklm.types.ts`:

```typescript
export interface MyNewThing {
  id: string;
  title: string;
  createdAt: Date | null;
}
```

### 2. RPC method ID

Add the method ID to `RPCMethod` in `src/infrastructure/third-party/notebooklm/rpc/types.ts`:

```typescript
export enum RPCMethod {
  // ...
  MY_NEW_METHOD = "xYzAbC",
}
```

### 3. API module

Add a method to the relevant `apis/*.api.ts` file (or create a new one):

```typescript
async myNewThing(notebookId: string): Promise<MyNewThing> {
  const params = [notebookId, null, 1];
  const raw = await this.core.rpcCall(RPCMethod.MY_NEW_METHOD, params, {
    sourcePath: `/notebook/${notebookId}`,
  });
  return decodeMyNewThing(raw);
}
```

### 4. Client facade

Expose the new method (or new API class) on `NotebookLMClient` in `client.ts` if it is a new service.

### 5. Use-case

Add a method to the relevant use-case class in `src/application/use-cases/`:

```typescript
async getMyNewThing(notebookId: string): Promise<MyNewThing> {
  return this.client.myApi.myNewThing(notebookId);
}
```

### 6. Controller

Add a controller function in `src/presentation/controllers/`:

```typescript
export const getMyNewThing = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { notebookId } = req.params as { notebookId: string };
    const result = await resolveUseCase(req).getMyNewThing(notebookId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};
```

### 7. Route

Register the route in the relevant `src/presentation/routes/*.routes.ts`:

```typescript
router.get("/:notebookId/my-new-thing", getMyNewThing);
```

### 8. i18n

Add any user-facing strings to `locales/en.json`:

```json
{
  "myNewThing": {
    "not_found": "My new thing not found: {{id}}",
    "created": "My new thing created successfully."
  }
}
```

### 9. Tests

Add a unit test in `tests/unit/` covering the decoder function and at least the happy path.

---

## Error Handling Convention

All controllers follow the same pattern:

```typescript
export const myHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // ...
  } catch (err) {
    next(err); // always forward to errorMiddleware
  }
};
```

`errorMiddleware` in `src/presentation/middlewares/error.middleware.ts` maps known error types to HTTP status codes:

| Error class | HTTP status |
|---|---|
| `AuthError` | 401 |
| `RateLimitError` | 429 |
| `ServerError` | 502 |
| `NetworkError` | 503 |
| `RPCTimeoutError` | 504 |
| `ClientError` | 400 |
| `RPCError` (generic) | 500 |
| Unknown | 500 |

---

## Environment Configuration

All configuration is resolved once at startup in `src/infrastructure/config/env.ts`. The exported `config` singleton is the single source of truth for every runtime setting. No module should call `process.env` directly — import from `config` instead:

```typescript
import { config } from "../config/env";

app.listen(config.port, config.host);
```

---

## Testing Strategy

| Test type | Location | Scope |
|---|---|---|
| Unit | `tests/unit/**/*.spec.ts` | Single module, all dependencies mocked |
| Integration | `tests/integration/**/*.test.ts` | Multiple layers wired together; external HTTP mocked |

Run tests:

```bash
npm test                  # all tests, bail on first failure
npm run test:coverage     # with coverage report
npm run test:watchUnit    # watch mode, unit tests only
```

Type-check both source and test TypeScript configs before pushing:

```bash
npm run lint:ts
```
