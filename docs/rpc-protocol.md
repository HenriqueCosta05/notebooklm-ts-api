# RPC Protocol

This document describes the internal Google `batchexecute` RPC protocol used by NotebookLM and how this library encodes requests, sends them, and decodes responses.

> These are undocumented internal endpoints. They can change without notice.

---

## Overview

NotebookLM communicates with Google's backend using a proprietary RPC protocol built on top of HTTP POST. There is no REST or GraphQL — every operation maps to an opaque method ID sent to a single endpoint.

The protocol has three main concerns:

1. **Encoding** — serialize method ID and params into a triple-nested JSON array, URL-encode it as a form body
2. **Transport** — POST to the `batchexecute` endpoint with the right cookies, CSRF token, and query params
3. **Decoding** — strip an anti-XSSI prefix, parse a chunked response format, and extract the result from `wrb.fr` entries (or raise on `er` entries)

---

## Endpoints

| Constant | URL |
|---|---|
| `BATCHEXECUTE_URL` | `https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute` |
| `QUERY_URL` | `https://notebooklm.google.com/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed` |
| `UPLOAD_URL` | `https://notebooklm.google.com/upload/_/` |

The vast majority of operations use `BATCHEXECUTE_URL`. `QUERY_URL` is used for streamed chat responses and `UPLOAD_URL` is used for resumable binary file uploads.

---

## RPC Method IDs

Each operation has an opaque string ID. These are defined in `src/infrastructure/third-party/notebooklm/rpc/types.ts` as the `RPCMethod` enum:

```
RPCMethod.LIST_NOTEBOOKS      = "wXbhsf"
RPCMethod.CREATE_NOTEBOOK     = "CCqFvf"
RPCMethod.GET_NOTEBOOK        = "rLM1Ne"
RPCMethod.RENAME_NOTEBOOK     = "s0tc2d"
RPCMethod.DELETE_NOTEBOOK     = "WWINqb"

RPCMethod.ADD_SOURCE          = "izAoDd"
RPCMethod.ADD_SOURCE_FILE     = "o4cbdc"
RPCMethod.DELETE_SOURCE       = "tGMBJ"
RPCMethod.GET_SOURCE          = "hizoJc"
RPCMethod.REFRESH_SOURCE      = "FLmJqe"

RPCMethod.CREATE_ARTIFACT     = "R7cb6c"
RPCMethod.LIST_ARTIFACTS      = "gArtLc"
RPCMethod.DELETE_ARTIFACT     = "V5N4be"
RPCMethod.RENAME_ARTIFACT     = "rc3d8d"
RPCMethod.EXPORT_ARTIFACT     = "Krh3pd"
RPCMethod.REVISE_SLIDE        = "KmcKPe"

RPCMethod.CREATE_NOTE         = "CYK0Xb"
RPCMethod.GET_NOTES_AND_MIND_MAPS = "cFji9"
RPCMethod.UPDATE_NOTE         = "cYAfTb"
RPCMethod.DELETE_NOTE         = "AH0mwd"

RPCMethod.GET_LAST_CONVERSATION_ID = "hPTbtc"
RPCMethod.GET_CONVERSATION_TURNS   = "khqZz"

RPCMethod.SHARE_NOTEBOOK      = "QDyure"
RPCMethod.GET_SHARE_STATUS    = "JFMDGd"

RPCMethod.GET_USER_SETTINGS   = "ZwVcOc"
RPCMethod.SET_USER_SETTINGS   = "hT54vc"
```

---

## Request Encoding

### 1. Params serialization

Method parameters are passed as a flat JavaScript array. Each API module builds this array with positional arguments matching the expected server shape.

**Example — listing notebooks:**

```typescript
const params = [null, null, [1, 2]];
```

**Example — getting a notebook:**

```typescript
const params = [notebookId, null, [2], null, 0];
```

### 2. RPC envelope

The params array is JSON-serialized and wrapped in a triple-nested array structure:

```typescript
type RpcInner  = [methodId: string, paramsJson: string, null, "generic"];
type RpcRequest = [[RpcInner]];

const inner: RpcInner = [method, JSON.stringify(params), null, "generic"];
const rpcRequest: RpcRequest = [[inner]];
```

**Concrete output for `LIST_NOTEBOOKS` with `params = [null, null, [1,2]]`:**

```json
[
  [
    ["wXbhsf", "[null,null,[1,2]]", null, "generic"]
  ]
]
```

### 3. Form body

The outer array is JSON-serialized again and URL-encoded into an `f.req` form field. The CSRF token is appended as `at`:

```
f.req=%5B%5B%5B%22wXbhsf%22%2C%22%5Bnull%2Cnull%2C%5B1%2C2%5D%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&at=<csrf_token>&
```

The trailing `&` is part of the expected format.

### 4. URL query params

The method ID and session information are also passed as URL query parameters:

| Param | Value |
|---|---|
| `rpcids` | The method ID (e.g. `wXbhsf`) |
| `source-path` | The notebook path (e.g. `/notebook/<id>`) or `/` for global calls |
| `hl` | Language hint — always `"en"` |
| `rt` | Response type — always `"c"` (chunked) |
| `f.sid` | Session ID (`FdrFJe`) extracted from the homepage HTML |

Full URL example:

```
https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute
  ?rpcids=wXbhsf
  &source-path=%2F
  &hl=en
  &rt=c
  &f.sid=<session_id>
```

### 5. Request headers

```
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
Cookie: SID=...; HSID=...; SSID=...; (full cookie header)
```

---

## Response Decoding

Responses are returned in a chunked streaming format with an anti-XSSI prefix.

### Step 1 — Strip the anti-XSSI prefix

Google prepends `)]}'` followed by a newline to every JSON response to prevent cross-site script inclusion attacks. The decoder strips this prefix before parsing:

```
)]}'\n
[[...actual data...]]
```

### Step 2 — Parse the chunked format

The response body uses a line-based chunked format. Each chunk is optionally preceded by a line containing only its byte count:

```
<optional byte count>\n
<json chunk>\n
<optional byte count>\n
<json chunk>\n
...
```

The decoder handles both variants — with and without byte-count lines — by checking whether a line is a pure integer. If parsing any individual chunk fails, that chunk is skipped. If the malformed chunk rate exceeds 10%, an `RPCError` is thrown.

### Step 3 — Find the result entry

Each parsed chunk is scanned for entries where the first element is one of two sentinel strings:

| Sentinel | Meaning |
|---|---|
| `"wrb.fr"` | Successful result — second element is the method ID, third is the result data |
| `"er"` | Error — second element is the method ID, third is an error code |

**Result entry shape:**

```json
["wrb.fr", "wXbhsf", "<json_encoded_result_string>", null, null, [...]]
```

**Error entry shape:**

```json
["er", "wXbhsf", 429]
```

### Step 4 — Deserialize the result

The `resultData` (third element of a `wrb.fr` entry) is usually a JSON-encoded string that must be parsed a second time:

```typescript
if (typeof resultData === "string") {
  return JSON.parse(resultData);
}
return resultData;
```

This double-encoding is a quirk of the batchexecute protocol.

### Step 5 — Null result handling

Some methods legitimately return `null` (e.g. `DELETE_NOTEBOOK`). Pass `allowNull: true` to `rpcCall` for these:

```typescript
await this.core.rpcCall(RPCMethod.DELETE_NOTEBOOK, params, { allowNull: true });
```

Without `allowNull`, a `null` result raises an `RPCError`.

---

## Error Handling

### HTTP-level errors

| Status | Error class | Notes |
|---|---|---|
| `401`, `403` | triggers auth refresh + retry | Not thrown directly — refresh callback fires first |
| `429` | `RateLimitError` | Too many requests |
| `5xx` | `ServerError` | Transient — retry after a delay |
| Other `4xx` | `ClientError` | Bad parameters or missing resource |

### RPC-level errors

| Condition | Error class |
|---|---|
| `er` entry in response | `RPCError` with `rpcCode` |
| `UserDisplayableError` in response payload | `RateLimitError` |
| No result found for the expected method ID | `RPCError` |
| Null result when `allowNull` is false | `RPCError` |
| Chunked parse failure rate > 10% | `RPCError` |

### Network errors

| Condition | Error class |
|---|---|
| Request timeout (`AbortController`) | `RPCTimeoutError` |
| `TypeError` during `fetch` (DNS, connection refused) | `NetworkError` |

### Error class hierarchy

```
Error
└── RPCError
    ├── AuthError
    ├── RateLimitError
    ├── ServerError
    ├── ClientError
    ├── NetworkError
    └── RPCTimeoutError
```

All error classes carry a structured `context` object:

```typescript
interface RPCErrorContext {
  methodId?: string;
  rpcCode?: string | number | null;
  statusCode?: number;
  foundIds?: string[];
  rawResponse?: string;
  timeoutSeconds?: number;
  originalError?: Error;
}
```

This context is useful for structured logging:

```typescript
catch (err) {
  if (err instanceof RPCError) {
    logger.error({
      method: err.context.methodId,
      code: err.context.rpcCode,
      status: err.context.statusCode,
    }, err.message);
  }
}
```

---

## Retry and Refresh Logic

`ClientCore.rpcCall` implements a single-retry strategy on auth failures:

```
rpcCall(method, params)
  │
  ├─ fetchWithTimeout()   ── fail (AuthError / 401 / 403)
  │                              │
  │                              └─ tryRefreshAndRetry()
  │                                    ├─ refreshCallback()   (fetch homepage → new CSRF + session ID)
  │                                    └─ rpcCall(..., { isRetry: true })
  │
  └─ decodeResponse()     ── fail (AuthError)
         │
         └─ tryRefreshAndRetry()  (same as above)
```

Only one refresh is in-flight at a time. Multiple concurrent calls that all fail on auth share a single `refreshPromise`. After refresh resolves, each caller retries independently with the updated auth state.

The `isRetry: true` flag prevents recursive refresh loops — a second auth failure on the retry call is thrown directly.

---

## Rate Request Counter

`ClientCore` maintains a monotonically increasing `reqIdCounter` (starting at `100000`, incrementing by `100000`) exposed via `incrementReqId()`. Some RPC methods include this counter in their params array to help the server deduplicate or sequence requests.

---

## Conversation Cache

`ClientCore` also maintains an in-memory LRU conversation turn cache (`Map<conversationId, ConversationTurnCache[]>`). The cache is capped at 100 conversations (oldest entry evicted when the cap is reached). It is used by `ChatAPI` to avoid redundant `GET_CONVERSATION_TURNS` calls when the same conversation ID is accessed repeatedly.

| Method | Description |
|---|---|
| `cacheConversationTurn(id, query, answer, turnNumber)` | Append a new turn |
| `getCachedConversation(id)` | Retrieve all turns for a conversation |
| `clearConversationCache(id?)` | Clear one or all conversations |

---

## Adding a New RPC Method

1. Add the method ID to the `RPCMethod` enum in `rpc/types.ts`:

```typescript
export enum RPCMethod {
  // ...existing entries
  MY_NEW_METHOD = "aBcDeF",
}
```

2. Build the params array in the relevant API module (study the Python reference to identify the correct positional arguments):

```typescript
async myNewMethod(notebookId: string): Promise<MyResult> {
  const params = [notebookId, null, 1];
  const raw = await this.core.rpcCall(RPCMethod.MY_NEW_METHOD, params, {
    sourcePath: `/notebook/${notebookId}`,
  });
  return decodeMyResult(raw);
}
```

3. Add a decoder function that maps the raw deeply-nested array to a typed domain object.

4. Add unit tests in `tests/unit/rpc/` for the decoder function, covering success, null, and error cases.