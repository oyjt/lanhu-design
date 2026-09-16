import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../config/paths.js";

export interface StoredCredential {
  version: 1;
  credential: {
    type: "cookie";
    value: string;
    source: string;
    profile?: string;
    createdAt: string;
  };
}

export function parseCredential(raw: string): StoredCredential {
  const value = JSON.parse(raw) as Partial<StoredCredential>;
  const credential = value?.credential;
  if (
    value.version !== 1 || credential?.type !== "cookie" || !credential.value
    || typeof credential.source !== "string" || typeof credential.createdAt !== "string"
    || (credential.profile !== undefined && typeof credential.profile !== "string")
  ) throw new TypeError("凭据文件格式无效。");
  return value as StoredCredential;
}
export const credentialPath = path.join(paths.config, "credentials.json");

export async function readCredential(): Promise<StoredCredential | null> {
  try {
    return parseCredential(await readFile(credentialPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeCredential(cookie: string, source: string, profile?: string): Promise<void> {
  await mkdir(paths.config, { recursive: true, mode: 0o700 });
  await chmod(paths.config, 0o700).catch(() => undefined);
  const now = new Date().toISOString();
  const value: StoredCredential = {
    version: 1,
    credential: { type: "cookie", value: cookie, source, profile, createdAt: now },
  };
  // 先写临时文件再原子替换，避免进程中断后留下半写入的凭据文件。
  const temporary = `${credentialPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(temporary, 0o600).catch(() => undefined);
  await rename(temporary, credentialPath);
}

export async function deleteCredential(): Promise<boolean> {
  try {
    await rm(credentialPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
