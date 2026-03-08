import { encodeRpcRequest, buildRequestBody, buildUrlParams } from "../../../src/infrastructure/third-party/notebooklm/rpc/encoder";
import { RPCMethod } from "../../../src/infrastructure/third-party/notebooklm/rpc/types";

describe("encodeRpcRequest", () => {
  it("wraps method and params in triple-nested array structure", () => {
    const result = encodeRpcRequest(RPCMethod.LIST_NOTEBOOKS, [null, 1, null, [2]]);
    expect(Array.isArray(result)).toBe(true);
    expect(Array.isArray(result[0])).toBe(true);
    expect(Array.isArray(result[0][0])).toBe(true);
  });

  it("places the method ID as the first element of the inner array", () => {
    const result = encodeRpcRequest(RPCMethod.LIST_NOTEBOOKS, []);
    expect(result[0][0][0]).toBe(RPCMethod.LIST_NOTEBOOKS);
  });

  it("serialises params to JSON and stores them as the second element", () => {
    const params = [null, 1, null, [2]];
    const result = encodeRpcRequest(RPCMethod.LIST_NOTEBOOKS, params);
    expect(result[0][0][1]).toBe(JSON.stringify(params));
  });

  it("sets the third element to null and the fourth to 'generic'", () => {
    const result = encodeRpcRequest(RPCMethod.CREATE_NOTEBOOK, ["title"]);
    expect(result[0][0][2]).toBeNull();
    expect(result[0][0][3]).toBe("generic");
  });

  it("handles empty params array", () => {
    const result = encodeRpcRequest(RPCMethod.GET_USER_SETTINGS, []);
    expect(result[0][0][1]).toBe("[]");
  });

  it("handles nested params correctly", () => {
    const params = [[["sourceId"]], "notebookId", null];
    const result = encodeRpcRequest(RPCMethod.ADD_SOURCE, params);
    expect(result[0][0][1]).toBe(JSON.stringify(params));
  });
});

describe("buildRequestBody", () => {
  it("includes f.req as a URL-encoded JSON string", () => {
    const rpcRequest = encodeRpcRequest(RPCMethod.LIST_NOTEBOOKS, []);
    const body = buildRequestBody(rpcRequest);
    expect(body).toContain("f.req=");
    const encoded = body.split("f.req=")[1].split("&")[0];
    const decoded = decodeURIComponent(encoded);
    expect(() => JSON.parse(decoded)).not.toThrow();
  });

  it("appends the CSRF token as 'at' when provided", () => {
    const rpcRequest = encodeRpcRequest(RPCMethod.LIST_NOTEBOOKS, []);
    const body = buildRequestBody(rpcRequest, "my-csrf-token");
    expect(body).toContain("at=");
    expect(body).toContain(encodeURIComponent("my-csrf-token"));
  });

  it("does not include 'at' when CSRF token is omitted", () => {
    const rpcRequest = encodeRpcRequest(RPCMethod.LIST_NOTEBOOKS, []);
    const body = buildRequestBody(rpcRequest);
    expect(body).not.toContain("at=");
  });

  it("always ends with a trailing ampersand", () => {
    const rpcRequest = encodeRpcRequest(RPCMethod.LIST_NOTEBOOKS, []);
    const body = buildRequestBody(rpcRequest, "token");
    expect(body.endsWith("&")).toBe(true);
  });

  it("f.req decodes back to the original RPC request structure", () => {
    const params = [null, 1, null, [2]];
    const rpcRequest = encodeRpcRequest(RPCMethod.LIST_NOTEBOOKS, params);
    const body = buildRequestBody(rpcRequest);
    const encoded = body.split("f.req=")[1].split("&")[0];
    const decoded = JSON.parse(decodeURIComponent(encoded)) as unknown;
    expect(decoded).toEqual(rpcRequest);
  });
});

describe("buildUrlParams", () => {
  it("always includes rpcids, source-path, hl and rt", () => {
    const params = buildUrlParams(RPCMethod.LIST_NOTEBOOKS, "/");
    expect(params["rpcids"]).toBe(RPCMethod.LIST_NOTEBOOKS);
    expect(params["source-path"]).toBe("/");
    expect(params["hl"]).toBe("en");
    expect(params["rt"]).toBe("c");
  });

  it("defaults source-path to '/' when not supplied", () => {
    const params = buildUrlParams(RPCMethod.LIST_NOTEBOOKS);
    expect(params["source-path"]).toBe("/");
  });

  it("includes f.sid when sessionId is provided", () => {
    const params = buildUrlParams(RPCMethod.LIST_NOTEBOOKS, "/", "session-123");
    expect(params["f.sid"]).toBe("session-123");
  });

  it("omits f.sid when sessionId is not provided", () => {
    const params = buildUrlParams(RPCMethod.LIST_NOTEBOOKS, "/");
    expect(params["f.sid"]).toBeUndefined();
  });

  it("reflects the given source path", () => {
    const params = buildUrlParams(RPCMethod.GET_NOTEBOOK, "/notebook/abc123");
    expect(params["source-path"]).toBe("/notebook/abc123");
  });

  it("uses the correct RPC method for different methods", () => {
    const params = buildUrlParams(RPCMethod.CREATE_NOTEBOOK, "/");
    expect(params["rpcids"]).toBe(RPCMethod.CREATE_NOTEBOOK);
  });
});
