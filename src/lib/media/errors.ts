import type { ApiErrorCode, SourceId } from "./types";

interface MediaErrorOptions {
  source?: SourceId;
  retryAfterSeconds?: number;
}

export class MediaError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly source?: SourceId;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    options: MediaErrorOptions = {},
  ) {
    super(message);
    this.name = "MediaError";
    this.code = code;
    this.status = status;
    this.source = options.source;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
