import {
  stripAntiXssi,
  parseChunkedResponse,
  collectRpcIds,
  extractRpcResult,
  decodeResponse,
} from "../../../src/infrastructure/third-party/notebooklm/rpc/decoder";
import { RPCMethod } from "../../../src/infrastructure/third-party/notebooklm/rpc/types";
import {
  RPCError,
  RateLimitError,
} from "../../../src/infrastructure/third-party/notebooklm/rpc/errors";

describe("stripAntiXssi", () => {
  it("strips the )]}' prefix and newline", () => {
    const raw = ")]}'\n[1,2,3]";
    const result = stripAntiXssi(raw);
    expect(result).toBe("[1,2,3]");
  });

  it("strips the )]}' prefix followed by CRLF", () => {
    const raw = ")]}'\r\n[1,2,3]";
    const result = stripAntiXssi(raw);
    expect(result).toBe("[1,2,3]");
  });

  it("returns the string unchanged when no prefix is present", () => {
    const raw = "[1,2,3]";
    expect(stripAntiXssi(raw)).toBe("[1,2,3]");
  });

  it("returns empty string unchanged", () => {
    expect(stripAntiXssi("")).toBe("");
  });
});

describe("parseChunkedResponse", () => {
  it("returns an empty array for an empty string", () => {
    expect(parseChunkedResponse("")).toEqual([]);
  });

  it("returns an empty array for a whitespace-only string", () => {
    expect(parseChunkedResponse("   ")).toEqual([]);
  });

  it("parses a bare JSON array line", () => {
    const raw = '["wrb.fr","methodId","data",null,null,null,"1"]';
    const result = parseChunkedResponse(raw);
    expect(result).toHaveLength(1);
    expect(Array.isArray(result[0])).toBe(true);
  });

  it("parses chunked format with byte-count lines", () => {
    const jsonLine = '["wrb.fr","methodId","resultData",null,null,null,"1"]';
    const raw = `${jsonLine.length}\n${jsonLine}\n`;
    const result = parseChunkedResponse(raw);
    expect(result).toHaveLength(1);
  });

  it("handles multiple chunks separated by byte-count lines", () => {
    const chunk1 = '["wrb.fr","rpc1","result1",null,null,null,"1"]';
    const chunk2 = '["wrb.fr","rpc2","result2",null,null,null,"1"]';
    const raw = `${chunk1.length}\n${chunk1}\n${chunk2.length}\n${chunk2}\n`;
    const result = parseChunkedResponse(raw);
    expect(result).toHaveLength(2);
  });

  it("skips a malformed JSON line without throwing when error rate is below 10%", () => {
    const goodLines = Array.from(
      { length: 20 },
      (_, i) => `["wrb.fr","method${i}","data",null,null,null,"1"]`,
    ).join("\n");
    const raw = `${goodLines}\nnot-valid-json`;
    expect(() => parseChunkedResponse(raw)).not.toThrow();
  });

  it("throws RPCError when more than 10% of lines are malformed", () => {
    const badLines = Array.from({ length: 20 }, (_, i) => `{bad json ${i}}`).join("\n");
    expect(() => parseChunkedResponse(badLines)).toThrow(RPCError);
  });
});

describe("collectRpcIds", () => {
  it("returns an empty array when chunks have no RPC IDs", () => {
    expect(collectRpcIds([])).toEqual([]);
    expect(collectRpcIds([[1, 2, 3]])).toEqual([]);
  });

  it("collects IDs from wrb.fr entries", () => {
    const chunks = [[["wrb.fr", "myMethodId", "data"]]];
    const ids = collectRpcIds(chunks);
    expect(ids).toContain("myMethodId");
  });

  it("collects IDs from er entries", () => {
    const chunks = [[["er", "errorMethodId", 404]]];
    const ids = collectRpcIds(chunks);
    expect(ids).toContain("errorMethodId");
  });

  it("collects IDs from both wrb.fr and er entries in the same response", () => {
    const chunks = [
      [
        ["wrb.fr", "method1", "data"],
        ["er", "method2", 500],
      ],
    ];
    const ids = collectRpcIds(chunks);
    expect(ids).toContain("method1");
    expect(ids).toContain("method2");
  });

  it("handles nested chunk arrays", () => {
    const chunks = [[["wrb.fr", "nestedId", "data"]]];
    const ids = collectRpcIds(chunks);
    expect(ids).toContain("nestedId");
  });
});

describe("extractRpcResult", () => {
  it("returns the parsed JSON result for a matching wrb.fr entry", () => {
    const resultJson = JSON.stringify([{ key: "value" }]);
    const chunks = [[["wrb.fr", "testMethod", resultJson, null, null, null, "1"]]];
    const result = extractRpcResult(chunks, "testMethod");
    expect(result).toEqual([{ key: "value" }]);
  });

  it("returns null when the result data field is null", () => {
    const chunks = [[["wrb.fr", "testMethod", null, null, null, null, "1"]]];
    const result = extractRpcResult(chunks, "testMethod");
    expect(result).toBeNull();
  });

  it("returns undefined when no matching RPC ID is found", () => {
    const chunks = [[["wrb.fr", "otherMethod", "data"]]];
    const result = extractRpcResult(chunks, "nonExistentMethod");
    expect(result).toBeUndefined();
  });

  it("throws RPCError when an er entry is found for the method", () => {
    const chunks = [[["er", "testMethod", 404]]];
    expect(() => extractRpcResult(chunks, "testMethod")).toThrow(RPCError);
  });

  it("throws RateLimitError when result is null and item[5] contains UserDisplayableError", () => {
    const errorObj = { type: "UserDisplayableError", message: "quota exceeded" };
    const chunks = [[["wrb.fr", "testMethod", null, null, null, errorObj, "1"]]];
    expect(() => extractRpcResult(chunks, "testMethod")).toThrow(RateLimitError);
  });

  it("returns non-JSON string result as-is", () => {
    const chunks = [[["wrb.fr", "testMethod", "plain-string-result"]]];
    const result = extractRpcResult(chunks, "testMethod");
    expect(result).toBe("plain-string-result");
  });
});

describe("decodeResponse", () => {
  const buildResponse = (rpcId: string, resultJson: string): string => {
    const inner = JSON.stringify([["wrb.fr", rpcId, resultJson, null, null, null, "1"]]);
    return `${inner.length}\n${inner}\n`;
  };

  it("returns the decoded result for a well-formed response", () => {
    const resultData = JSON.stringify([{ id: "nb1", title: "My Notebook" }]);
    const raw = buildResponse(RPCMethod.LIST_NOTEBOOKS, resultData);
    const result = decodeResponse(raw, RPCMethod.LIST_NOTEBOOKS);
    expect(Array.isArray(result)).toBe(true);
  });

  it("strips the anti-XSSI prefix before decoding", () => {
    const resultData = JSON.stringify(["notebook"]);
    const rawWithPrefix = ")]}'\n" + buildResponse(RPCMethod.LIST_NOTEBOOKS, resultData);
    expect(() => decodeResponse(rawWithPrefix, RPCMethod.LIST_NOTEBOOKS)).not.toThrow();
  });

  it("throws RPCError when the RPC ID is not found in the response", () => {
    const resultData = JSON.stringify([]);
    const raw = buildResponse("someOtherMethod", resultData);
    expect(() => decodeResponse(raw, RPCMethod.LIST_NOTEBOOKS)).toThrow(RPCError);
  });

  it("throws RPCError when result is null and allowNull is false", () => {
    const inner = JSON.stringify([
      ["wrb.fr", RPCMethod.LIST_NOTEBOOKS, null, null, null, null, "1"],
    ]);
    const raw = `${inner.length}\n${inner}\n`;
    expect(() => decodeResponse(raw, RPCMethod.LIST_NOTEBOOKS, false)).toThrow(RPCError);
  });

  it("returns null when result is null and allowNull is true", () => {
    const inner = JSON.stringify([
      ["wrb.fr", RPCMethod.LIST_NOTEBOOKS, null, null, null, null, "1"],
    ]);
    const raw = `${inner.length}\n${inner}\n`;
    const result = decodeResponse(raw, RPCMethod.LIST_NOTEBOOKS, true);
    expect(result).toBeNull();
  });

  it("throws RPCError for er entries with a numeric error code", () => {
    const inner = JSON.stringify([["er", RPCMethod.LIST_NOTEBOOKS, 403]]);
    const raw = `${inner.length}\n${inner}\n`;
    expect(() => decodeResponse(raw, RPCMethod.LIST_NOTEBOOKS)).toThrow(RPCError);
  });

  it("includes found RPC IDs in the thrown error when the requested ID is absent", () => {
    const inner = JSON.stringify([["wrb.fr", "differentMethod", '["data"]']]);
    const raw = `${inner.length}\n${inner}\n`;
    let thrownError: RPCError | null = null;
    try {
      decodeResponse(raw, RPCMethod.LIST_NOTEBOOKS);
    } catch (err) {
      thrownError = err as RPCError;
    }
    expect(thrownError).not.toBeNull();
    expect(thrownError?.foundIds).toContain("differentMethod");
  });
});
