import { LanhuError } from "../errors/lanhu-error.js";
import { readCredential } from "./credential-store.js";

export async function resolveCredential(explicit?: string): Promise<string> {
  if (explicit?.trim()) return explicit.trim();
  const envCookie = process.env.LANHU_COOKIE?.trim();
  if (envCookie && envCookie !== "your_lanhu_cookie_here") {
    return envCookie;
  }
  const stored = await readCredential();
  if (stored) return stored.credential.value;
  throw new LanhuError(
    "LANHU_AUTH_REQUIRED",
    "未找到蓝湖登录凭据。",
    "运行：lanhu auth；若浏览器 Cookie 无法读取，运行：lanhu auth import",
  );
}
