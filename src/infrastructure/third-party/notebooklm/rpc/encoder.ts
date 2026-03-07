import { RPCMethod } from "./types";

type RpcInner = [string, string, null, "generic"];
type RpcRequest = [[RpcInner]];

export const encodeRpcRequest = (method: RPCMethod, params: unknown[]): RpcRequest => {
  const paramsJson = JSON.stringify(params);
  const inner: RpcInner = [method, paramsJson, null, "generic"];
  return [[inner]];
};

export const buildRequestBody = (rpcRequest: RpcRequest, csrfToken?: string): string => {
  const fReq = JSON.stringify(rpcRequest);
  const encodedFReq = encodeURIComponent(fReq);
  const parts: string[] = [`f.req=${encodedFReq}`];

  if (csrfToken) {
    parts.push(`at=${encodeURIComponent(csrfToken)}`);
  }

  return parts.join("&") + "&";
};

export const buildUrlParams = (
  method: RPCMethod,
  sourcePath: string = "/",
  sessionId?: string
): Record<string, string> => {
  const params: Record<string, string> = {
    rpcids: method,
    "source-path": sourcePath,
    hl: "en",
    rt: "c",
  };

  if (sessionId) {
    params["f.sid"] = sessionId;
  }

  return params;
};
