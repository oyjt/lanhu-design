import { LanhuError } from "../errors/lanhu-error.js";
import { readCredential } from "./credential-store.js";

export async function findCredential(explicit?: string): Promise<{
  value: string;
  source: string;
  profile?: string;
  createdAt?: string;
} | null> {
  if (explicit?.trim()) return { value: explicit.trim(), source: "explicit" };
  const envCookie = process.env.LANHU_COOKIE?.trim();
  if (envCookie && envCookie !== "your_lanhu_cookie_here") {
    return { value: envCookie, source: "environment" };
  }
  const stored = await readCredential();
  if (stored) return stored.credential;
  return null;
}

export async function resolveCredential(explicit?: string): Promise<string> {
  const credential = await findCredential(explicit);
  if (credential) return credential.value;
  throw new LanhuError(
    "LANHU_AUTH_REQUIRED",
    "未找到蓝湖登录凭据。",
    "运行：lanhu auth；若浏览器 Cookie 无法读取，运行：lanhu auth import",
  );
}
