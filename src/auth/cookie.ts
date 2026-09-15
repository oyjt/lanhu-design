import { LanhuError } from "../errors/lanhu-error.js";

export function normalizeCookie(input: string): string {
  const value = input.trim().replace(/^cookie:\s*/i, "").replace(/^['\"]|['\"]$/g, "");
  if (!value || !value.includes("=")) {
    throw new LanhuError("LANHU_INVALID_ARGUMENT", "Cookie 格式无效，应为 name=value; name2=value2。");
  }
  if (/\r|\n/.test(value)) {
    throw new LanhuError("LANHU_INVALID_ARGUMENT", "Cookie 不得包含换行符。");
  }
  return value;
}

export function cookieFingerprint(cookie: string): string {
  let hash = 2166136261;
  for (const char of cookie) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0").slice(-6);
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(cookie\s*[:=]\s*)[^\r\n]+/gi, "$1<redacted>")
    .replace(/(LANHU_COOKIE\s*[:=]\s*)[^\s]+/gi, "$1<redacted>");
}
