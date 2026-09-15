import { homedir } from "node:os";
import path from "node:path";

export function resolveConfigDirectory(homeDirectory = homedir()): string {
  return path.join(homeDirectory, ".config", "lanhu-design");
}

export const paths = {
  config: resolveConfigDirectory(),
};
