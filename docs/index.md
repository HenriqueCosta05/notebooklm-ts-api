# Documentation Index

Welcome to the `notebooklm-ts-api` documentation. Use the links below to navigate to the topic you need.

---

## Guides

| Document | Description |
|---|---|
| [Authentication](./authentication.md) | How to capture a Playwright session, supply credentials, and understand the automatic token-refresh mechanism |
| [Client Library Usage](./client-usage.md) | How to use the TypeScript client programmatically — all APIs with code examples |
| [RPC Protocol](./rpc-protocol.md) | Deep-dive into the internal Google batchexecute protocol: encoding, decoding, error handling, and how to add new methods |
| [Architecture](./architecture.md) | Layered architecture overview, layer responsibilities, request lifecycle trace, and step-by-step guide for adding new features |

---

## Quick Links

- **Running the server** → [README — Quick Start](../README.md#quick-start)
- **Environment variables** → [README — Environment Variables](../README.md#environment-variables)
- **REST API reference** → [README — REST API Reference](../README.md#rest-api-reference)
- **Docker** → [README — Running with Docker](../README.md#running-with-docker)
- **Testing** → [README — Testing](../README.md#testing)
- **CI/CD** → [README — CI/CD](../README.md#cicd)

---

## Source Layout

```
src/
├── application/use-cases/       Use-case layer (NotebooksUseCase, SourcesUseCase, …)
├── domain/models/               Pure TypeScript interfaces and type maps
├── i18n/                        Lightweight i18n singleton
├── infrastructure/
│   ├── config/env.ts            Typed env config singleton
│   ├── framework/               Express app factory + server entry point
│   └── third-party/notebooklm/  RPC layer, auth, client, per-domain API modules
├── main/factories/              Client + use-case wiring factories
└── presentation/
    ├── controllers/             Thin HTTP request handlers
    ├── middlewares/             Auth + error middlewares
    ├── responses/               Consistent HTTP envelope helpers
    └── routes/                  Express routers
```

---

## Key Concepts

### Cookie-based authentication

NotebookLM has no public API. Access relies on a Playwright-captured `storage_state.json` containing live Google session cookies. See [Authentication](./authentication.md) for full details.

### Batchexecute RPC

All operations use Google's internal `batchexecute` protocol — opaque method IDs, triple-nested JSON request bodies, and chunked anti-XSSI responses. See [RPC Protocol](./rpc-protocol.md).

### Async artifact generation

Artifact generation (audio, video, quiz, etc.) is asynchronous. Generate endpoints return a `taskId`. Use `pollStatus` or `waitForCompletion` to track progress. See [Client Library Usage — Artifacts](./client-usage.md#artifacts).

### Automatic token refresh

On auth failures (HTTP 401/403 or `AuthError` in the RPC response), the client automatically re-fetches CSRF and session tokens from the NotebookLM homepage and retries the request once. See [Authentication — Automatic Token Refresh](./authentication.md#automatic-token-refresh).

---

## Disclaimer

This project is **not affiliated with, endorsed by, or supported by Google**. It reverse-engineers undocumented internal RPC endpoints and may break at any time. Use responsibly and in accordance with [Google's Terms of Service](https://policies.google.com/terms).