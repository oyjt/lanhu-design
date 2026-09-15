import { EXIT_CODE_BY_ERROR, type LanhuErrorCode } from "./codes.js";

export class LanhuError extends Error {
  readonly exitCode: number;

  constructor(
    readonly code: LanhuErrorCode,
    message: string,
    readonly hint?: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LanhuError";
    this.exitCode = EXIT_CODE_BY_ERROR[code];
  }
}

export function toLanhuError(error: unknown): LanhuError {
  if (error instanceof LanhuError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/LANHU_COOKIE|认证|cookie/i.test(message)) {
    return new LanhuError("LANHU_AUTH_REQUIRED", message, "运行：lanhu auth 或 lanhu auth import");
  }
  if (/fetch|network|timeout|aborted|ENOTFOUND|ECONN/i.test(message)) {
    return new LanhuError("LANHU_NETWORK_ERROR", message, undefined, true, { cause: error });
  }
  return new LanhuError("LANHU_INTERNAL_ERROR", message, undefined, false, { cause: error });
}
