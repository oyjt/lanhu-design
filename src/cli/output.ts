import { redactSecrets } from "../auth/cookie.js";
import { toLanhuError } from "../errors/lanhu-error.js";

export interface OutputOptions { json?: boolean; quiet?: boolean; verbose?: boolean }

export class Output {
  private readonly startedAt = Date.now();
  constructor(private readonly command: string, private readonly version: string, private readonly options: OutputOptions) {}

  status(message: string): void {
    if (!this.options.json && !this.options.quiet) process.stderr.write(`${redactSecrets(message)}\n`);
  }

  success(data: unknown, warnings: string[] = [], humanMessage?: string): void {
    if (this.options.json) {
      console.log(JSON.stringify({
        ok: true,
        data,
        meta: { command: this.command, version: this.version, durationMs: Date.now() - this.startedAt, warnings },
        error: null,
      }, null, 2));
      return;
    }
    if (humanMessage !== undefined) {
      if (!this.options.quiet) console.log(redactSecrets(humanMessage));
      for (const warning of warnings) console.error(`警告：${redactSecrets(warning)}`);
      return;
    }
    if (this.options.quiet && (data === undefined || data === null)) return;
    if (typeof data === "string") console.log(redactSecrets(data));
    else console.log(JSON.stringify(data, null, 2));
    for (const warning of warnings) console.error(`警告：${redactSecrets(warning)}`);
  }

  failure(error: unknown): never {
    const normalized = toLanhuError(error);
    if (this.options.json) {
      console.error(JSON.stringify({
        ok: false,
        data: null,
        meta: { command: this.command, version: this.version, durationMs: Date.now() - this.startedAt },
        error: { code: normalized.code, message: redactSecrets(normalized.message), hint: normalized.hint, retryable: normalized.retryable },
      }, null, 2));
    } else {
      console.error(`错误 [${normalized.code}]：${redactSecrets(normalized.message)}`);
      if (normalized.hint) console.error(`提示：${normalized.hint}`);
      if (this.options.verbose && normalized.cause instanceof Error) console.error(redactSecrets(normalized.cause.stack || normalized.cause.message));
    }
    process.exitCode = normalized.exitCode;
    throw normalized;
  }
}
