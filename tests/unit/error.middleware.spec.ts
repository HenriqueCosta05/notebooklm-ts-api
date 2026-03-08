import type { Request, Response, NextFunction } from "express";
import { errorMiddleware } from "../../src/presentation/middlewares/error.middleware";
import {
  RPCError,
  AuthError,
  NetworkError,
  RPCTimeoutError,
  RateLimitError,
  ServerError,
  ClientError,
  SourceNotFoundError,
  SourceProcessingError,
  SourceTimeoutError,
  ArtifactNotFoundError,
  ArtifactNotReadyError,
  ChatError,
  ValidationError,
} from "../../src/infrastructure/third-party/notebooklm/rpc/errors";
import { DefaultApplicationError } from "../../src/main/factories/error/error-factory";
import { initI18n } from "../../src/i18n";
import { SourceStatus } from "../../src/infrastructure/third-party/notebooklm/rpc/types";

beforeAll(() => {
  initI18n("en");
});

const makeMockResponse = (): {
  res: Response;
  statusCode: number;
  body: unknown;
} => {
  const result = { statusCode: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      result.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      result.body = payload;
      return res;
    },
  } as unknown as Response;
  return { res, ...result, get statusCode() { return result.statusCode; }, get body() { return result.body; } };
};

const makeMocks = (): {
  req: Request;
  res: Response;
  next: NextFunction;
  statusCode: () => number;
  body: () => unknown;
} => {
  const req = {} as Request;
  const next: NextFunction = jest.fn();
  const statusCode = { value: 0 };
  const body = { value: undefined as unknown };

  const res = {
    status(code: number) {
      statusCode.value = code;
      return res;
    },
    json(payload: unknown) {
      body.value = payload;
      return res;
    },
  } as unknown as Response;

  return {
    req,
    res,
    next,
    statusCode: () => statusCode.value,
    body: () => body.value,
  };
};

describe("errorMiddleware", () => {
  describe("ValidationError", () => {
    it("returns 400 with ValidationError name", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new ValidationError("field is required"), req, res, next);
      expect(statusCode()).toBe(400);
      expect((body() as Record<string, unknown>)["error"]).toBe("ValidationError");
    });

    it("includes the validation message in the response", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new ValidationError("title must not be empty"), req, res, next);
      const payload = body() as Record<string, unknown>;
      expect(String(payload["message"])).toContain("title must not be empty");
    });
  });

  describe("AuthError", () => {
    it("returns 401 for AuthError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new AuthError("session expired"), req, res, next);
      expect(statusCode()).toBe(401);
      expect((body() as Record<string, unknown>)["error"]).toBe("AuthError");
    });
  });

  describe("RateLimitError", () => {
    it("returns 429 for RateLimitError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new RateLimitError("too many requests"), req, res, next);
      expect(statusCode()).toBe(429);
      expect((body() as Record<string, unknown>)["error"]).toBe("RateLimitError");
    });
  });

  describe("RPCTimeoutError", () => {
    it("returns 504 for RPCTimeoutError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(
        new RPCTimeoutError("timed out", { timeoutSeconds: 30 }),
        req,
        res,
        next,
      );
      expect(statusCode()).toBe(504);
      expect((body() as Record<string, unknown>)["error"]).toBe("RPCTimeoutError");
    });

    it("includes the timeout duration in the response message", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(
        new RPCTimeoutError("timed out", { timeoutSeconds: 60 }),
        req,
        res,
        next,
      );
      const message = String((body() as Record<string, unknown>)["message"]);
      expect(message).toContain("60");
    });
  });

  describe("NetworkError", () => {
    it("returns 502 for NetworkError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new NetworkError("connection refused"), req, res, next);
      expect(statusCode()).toBe(502);
      expect((body() as Record<string, unknown>)["error"]).toBe("NetworkError");
    });
  });

  describe("ServerError", () => {
    it("returns 502 for ServerError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new ServerError("upstream error", { statusCode: 503 }), req, res, next);
      expect(statusCode()).toBe(502);
      expect((body() as Record<string, unknown>)["error"]).toBe("ServerError");
    });
  });

  describe("ClientError", () => {
    it("returns 400 for ClientError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new ClientError("bad request", { statusCode: 400 }), req, res, next);
      expect(statusCode()).toBe(400);
      expect((body() as Record<string, unknown>)["error"]).toBe("ClientError");
    });
  });

  describe("RPCError (generic)", () => {
    it("returns 500 for a plain RPCError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new RPCError("rpc failed"), req, res, next);
      expect(statusCode()).toBe(500);
      expect((body() as Record<string, unknown>)["error"]).toBe("RPCError");
    });

    it("uses the error message in the response", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new RPCError("custom rpc message"), req, res, next);
      expect((body() as Record<string, unknown>)["message"]).toBe("custom rpc message");
    });
  });

  describe("SourceNotFoundError", () => {
    it("returns 404 with SourceNotFoundError name", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new SourceNotFoundError("src-abc"), req, res, next);
      expect(statusCode()).toBe(404);
      expect((body() as Record<string, unknown>)["error"]).toBe("SourceNotFoundError");
    });

    it("includes the source ID in the message", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new SourceNotFoundError("src-xyz"), req, res, next);
      expect(String((body() as Record<string, unknown>)["message"])).toContain("src-xyz");
    });
  });

  describe("SourceProcessingError", () => {
    it("returns 422 for SourceProcessingError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(
        new SourceProcessingError("src-123", SourceStatus.ERROR),
        req,
        res,
        next,
      );
      expect(statusCode()).toBe(422);
      expect((body() as Record<string, unknown>)["error"]).toBe("SourceProcessingError");
    });

    it("includes the source ID in the message", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(
        new SourceProcessingError("src-456", SourceStatus.ERROR),
        req,
        res,
        next,
      );
      expect(String((body() as Record<string, unknown>)["message"])).toContain("src-456");
    });
  });

  describe("SourceTimeoutError", () => {
    it("returns 504 for SourceTimeoutError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new SourceTimeoutError("src-789", 120), req, res, next);
      expect(statusCode()).toBe(504);
      expect((body() as Record<string, unknown>)["error"]).toBe("SourceTimeoutError");
    });

    it("includes source ID and timeout seconds in the message", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new SourceTimeoutError("src-999", 90), req, res, next);
      const message = String((body() as Record<string, unknown>)["message"]);
      expect(message).toContain("src-999");
      expect(message).toContain("90");
    });
  });

  describe("ArtifactNotFoundError", () => {
    it("returns 404 for ArtifactNotFoundError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new ArtifactNotFoundError("art-abc"), req, res, next);
      expect(statusCode()).toBe(404);
      expect((body() as Record<string, unknown>)["error"]).toBe("ArtifactNotFoundError");
    });

    it("includes the artifact ID in the message", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new ArtifactNotFoundError("art-xyz"), req, res, next);
      expect(String((body() as Record<string, unknown>)["message"])).toContain("art-xyz");
    });
  });

  describe("ArtifactNotReadyError", () => {
    it("returns 409 for ArtifactNotReadyError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new ArtifactNotReadyError("audio"), req, res, next);
      expect(statusCode()).toBe(409);
      expect((body() as Record<string, unknown>)["error"]).toBe("ArtifactNotReadyError");
    });

    it("includes the artifact type in the message", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new ArtifactNotReadyError("quiz"), req, res, next);
      expect(String((body() as Record<string, unknown>)["message"])).toContain("quiz");
    });
  });

  describe("ChatError", () => {
    it("returns 422 for ChatError", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new ChatError("rate limited"), req, res, next);
      expect(statusCode()).toBe(422);
      expect((body() as Record<string, unknown>)["error"]).toBe("ChatError");
    });

    it("includes the chat error message", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new ChatError("quota exceeded"), req, res, next);
      expect((body() as Record<string, unknown>)["message"]).toBe("quota exceeded");
    });
  });

  describe("DefaultApplicationError", () => {
    it("returns the statusCode set on the error", () => {
      const { req, res, next, statusCode } = makeMocks();
      const err = new DefaultApplicationError("something went wrong");
      err.statusCode = 503;
      errorMiddleware(err, req, res, next);
      expect(statusCode()).toBe(503);
    });

    it("uses the first message from the messages array", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new DefaultApplicationError("custom app error"), req, res, next);
      expect((body() as Record<string, unknown>)["message"]).toBe("custom app error");
    });

    it("defaults statusCode to 500", () => {
      const { req, res, next, statusCode } = makeMocks();
      errorMiddleware(new DefaultApplicationError(), req, res, next);
      expect(statusCode()).toBe(500);
    });
  });

  describe("generic Error", () => {
    it("returns 500 for an unrecognised Error subclass", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new Error("something broke"), req, res, next);
      expect(statusCode()).toBe(500);
      expect((body() as Record<string, unknown>)["error"]).toBe("InternalError");
    });

    it("exposes the original error message as details", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new Error("original details"), req, res, next);
      expect((body() as Record<string, unknown>)["details"]).toBe("original details");
    });
  });

  describe("non-Error values", () => {
    it("returns 500 for a thrown string", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware("something went wrong", req, res, next);
      expect(statusCode()).toBe(500);
      expect((body() as Record<string, unknown>)["error"]).toBe("UnknownError");
    });

    it("returns 500 for a thrown null", () => {
      const { req, res, next, statusCode } = makeMocks();
      errorMiddleware(null, req, res, next);
      expect(statusCode()).toBe(500);
    });

    it("returns 500 for a thrown plain object", () => {
      const { req, res, next, statusCode } = makeMocks();
      errorMiddleware({ code: "UNKNOWN" }, req, res, next);
      expect(statusCode()).toBe(500);
    });
  });

  describe("response shape", () => {
    it("always includes statusCode, error and message fields", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new ValidationError("test"), req, res, next);
      const payload = body() as Record<string, unknown>;
      expect(payload).toHaveProperty("statusCode");
      expect(payload).toHaveProperty("error");
      expect(payload).toHaveProperty("message");
    });

    it("does not include details when the error has no extra information", () => {
      const { req, res, next, body } = makeMocks();
      errorMiddleware(new ValidationError("test"), req, res, next);
      expect((body() as Record<string, unknown>)["details"]).toBeUndefined();
    });

    it("statusCode field in the body matches the HTTP status code", () => {
      const { req, res, next, statusCode, body } = makeMocks();
      errorMiddleware(new AuthError("expired"), req, res, next);
      expect((body() as Record<string, unknown>)["statusCode"]).toBe(statusCode());
    });
  });
});
