import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { paths } from "../config/paths.js";

const credentialSchema = z.object({
  version: z.literal(1),
  credential: z.object({
    type: z.literal("cookie"),
    value: z.string().min(1),
    source: z.string(),
    profile: z.string().optional(),
    createdAt: z.string(),
    validatedAt: z.string().optional(),
  }),
});

export type StoredCredential = z.infer<typeof credentialSchema>;
export const credentialPath = path.join(paths.config, "credentials.json");

export async function readCredential(): Promise<StoredCredential | null> {
  try {
    return credentialSchema.parse(JSON.parse(await readFile(credentialPath, "utf8")));
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
    credential: { type: "cookie", value: cookie, source, profile, createdAt: now, validatedAt: now },
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
