import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "./paths.js";

const configPath = path.join(paths.config, "config.json");
export type Config = Record<string, string | number | boolean>;

export async function readConfig(): Promise<Config> {
  try { return JSON.parse(await readFile(configPath, "utf8")) as Config; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeConfig(config: Config): Promise<void> {
  await mkdir(paths.config, { recursive: true, mode: 0o700 });
  const temporary = `${configPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temporary, configPath);
}
