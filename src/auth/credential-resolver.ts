import { LanhuError } from "../errors/lanhu-error.js";
import { readCredential } from "./credential-store.js";

export async function resolveCredential(explicit?: string): Promise<{ cookie: string; source: string }> {
  if (explicit?.trim()) return { cookie: explicit.trim(), source: "argument" };
  const envCookie = process.env.LANHU_COOKIE?.trim();
  if (envCookie && envCookie !== "your_lanhu_cookie_here") {
    return { cookie: envCookie, source: "environment" };
  }
  const stored = await readCredential();
  if (stored) return { cookie: stored.credential.value, source: stored.credential.source };
  throw new LanhuError(
    "LANHU_AUTH_REQUIRED",
    "未找到蓝湖登录凭据。",
    "运行：lanhu auth；若浏览器 Cookie 无法读取，运行：lanhu auth import",
  );
}
