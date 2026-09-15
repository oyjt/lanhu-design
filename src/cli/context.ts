import type { Command } from "commander";

export interface GlobalOptions {
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
  verbose?: boolean;
  timeout?: string;
  cookie?: string;
}

export function globalOptions(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>();
}
