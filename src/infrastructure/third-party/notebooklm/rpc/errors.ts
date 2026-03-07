export class RPCError extends Error {
  public readonly methodId: string | null;
  public readonly rpcCode: string | number | null;
  public foundIds: string[];
  public rawResponse: string;

  constructor(
    message: string,
    options: {
      methodId?: string | null;
      rpcCode?: string | number | null;
      foundIds?: string[];
      rawResponse?: string;
    } = {}
  ) {
    super(message);
    this.name = "RPCError";
    this.methodId = options.methodId ?? null;
    this.rpcCode = options.rpcCode ?? null;
    this.foundIds = options.foundIds ?? [];
    this.rawResponse = options.rawResponse ?? "";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthError extends RPCError {
  constructor(message: string, options: ConstructorParameters<typeof RPCError>[1] = {}) {
    super(message, options);
    this.name = "AuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NetworkError extends RPCError {
  public readonly originalError: Error | null;

  constructor(
    message: string,
    options: ConstructorParameters<typeof RPCError>[1] & { originalError?: Error } = {}
  ) {
    super(message, options);
    this.name = "NetworkError";
    this.originalError = options.originalError ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RPCTimeoutError extends RPCError {
  public readonly timeoutSeconds: number | null;
  public readonly originalError: Error | null;

  constructor(
    message: string,
    options: ConstructorParameters<typeof RPCError>[1] & {
      timeoutSeconds?: number;
      originalError?: Error;
    } = {}
  ) {
    super(message, options);
    this.name = "RPCTimeoutError";
    this.timeoutSeconds = options.timeoutSeconds ?? null;
    this.originalError = options.originalError ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RateLimitError extends RPCError {
  public readonly retryAfter: number | null;

  constructor(
    message: string,
    options: ConstructorParameters<typeof RPCError>[1] & { retryAfter?: number } = {}
  ) {
    super(message, options);
    this.name = "RateLimitError";
    this.retryAfter = options.retryAfter ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ServerError extends RPCError {
  public readonly statusCode: number | null;

  constructor(
    message: string,
    options: ConstructorParameters<typeof RPCError>[1] & { statusCode?: number } = {}
  ) {
    super(message, options);
    this.name = "ServerError";
    this.statusCode = options.statusCode ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ClientError extends RPCError {
  public readonly statusCode: number | null;

  constructor(
    message: string,
    options: ConstructorParameters<typeof RPCError>[1] & { statusCode?: number } = {}
  ) {
    super(message, options);
    this.name = "ClientError";
    this.statusCode = options.statusCode ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SourceAddError extends SourceError {
  public readonly source: string;
  public readonly cause: Error | null;

  constructor(source: string, options: { message?: string; cause?: Error } = {}) {
    super(options.message ?? `Failed to add source: ${source}`);
    this.name = "SourceAddError";
    this.source = source;
    this.cause = options.cause ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SourceProcessingError extends SourceError {
  public readonly sourceId: string;
  public readonly status: number;

  constructor(sourceId: string, status: number) {
    super(`Source ${sourceId} processing failed with status ${status}`);
    this.name = "SourceProcessingError";
    this.sourceId = sourceId;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SourceTimeoutError extends SourceError {
  public readonly sourceId: string;
  public readonly timeoutSeconds: number;
  public readonly lastStatus: number | null;

  constructor(sourceId: string, timeoutSeconds: number, lastStatus: number | null = null) {
    super(`Source ${sourceId} timed out after ${timeoutSeconds}s`);
    this.name = "SourceTimeoutError";
    this.sourceId = sourceId;
    this.timeoutSeconds = timeoutSeconds;
    this.lastStatus = lastStatus;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SourceNotFoundError extends SourceError {
  public readonly sourceId: string;

  constructor(sourceId: string) {
    super(`Source not found: ${sourceId}`);
    this.name = "SourceNotFoundError";
    this.sourceId = sourceId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ArtifactNotFoundError extends ArtifactError {
  public readonly artifactId: string;
  public readonly artifactType: string | null;

  constructor(artifactId: string, options: { artifactType?: string } = {}) {
    super(`Artifact not found: ${artifactId}`);
    this.name = "ArtifactNotFoundError";
    this.artifactId = artifactId;
    this.artifactType = options.artifactType ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ArtifactNotReadyError extends ArtifactError {
  public readonly artifactType: string;
  public readonly artifactId: string | null;

  constructor(artifactType: string, options: { artifactId?: string } = {}) {
    super(
      options.artifactId
        ? `Artifact ${options.artifactId} (${artifactType}) is not ready`
        : `No completed ${artifactType} artifact found`
    );
    this.name = "ArtifactNotReadyError";
    this.artifactType = artifactType;
    this.artifactId = options.artifactId ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ArtifactParseError extends ArtifactError {
  public readonly artifactType: string;
  public readonly details: string;
  public readonly cause: Error | null;

  constructor(
    artifactType: string,
    options: { details?: string; cause?: Error; artifactId?: string } = {}
  ) {
    super(`Failed to parse ${artifactType}: ${options.details ?? "unknown error"}`);
    this.name = "ArtifactParseError";
    this.artifactType = artifactType;
    this.details = options.details ?? "";
    this.cause = options.cause ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ArtifactDownloadError extends ArtifactError {
  public readonly artifactType: string;
  public readonly details: string;
  public readonly artifactId: string | null;

  constructor(
    artifactType: string,
    options: { details?: string; artifactId?: string } = {}
  ) {
    super(`Failed to download ${artifactType}: ${options.details ?? "unknown error"}`);
    this.name = "ArtifactDownloadError";
    this.artifactType = artifactType;
    this.details = options.details ?? "";
    this.artifactId = options.artifactId ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
