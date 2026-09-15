import { LanhuError } from "../errors/lanhu-error.js";

export interface CredentialVerification {
  method: "cookie-format" | "jwt-expiry";
  expiresAt?: string;
}

function findCookie(cookie: string, name: string): string | undefined {
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return undefined;
}

export async function verifyCredential(cookie: string): Promise<CredentialVerification> {
  // 无项目上下文时只做本地检查，真实服务端权限由后续业务请求确认。
  const token = findCookie(cookie, "user_token");
  if (!token) return { method: "cookie-format" };
  const payload = token.split(".")[1];
  if (!payload) return { method: "cookie-format" };
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    if (typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp)) return { method: "cookie-format" };
    const expiresAt = new Date(decoded.exp * 1000);
    if (expiresAt.getTime() <= Date.now()) {
      throw new LanhuError("LANHU_AUTH_EXPIRED", "蓝湖 Cookie 中的登录令牌已过期。", "请重新登录后运行：lanhu auth", true);
    }
    return { method: "jwt-expiry", expiresAt: expiresAt.toISOString() };
  } catch (error) {
    if (error instanceof LanhuError) throw error;
    return { method: "cookie-format" };
  }
}
