export type JobErrorCode =
  | "invalid_source"
  | "blocked_address"
  | "unreachable"
  | "timeout"
  | "upstream_status"
  | "too_large"
  | "unsupported_media"
  | "too_long"
  | "conversion_failed"
  | "cancelled"
  | "internal";

export class JobError extends Error {
  readonly code: JobErrorCode;
  readonly retryable: boolean;

  constructor(code: JobErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "JobError";
    this.code = code;
    this.retryable = retryable;
  }
}
