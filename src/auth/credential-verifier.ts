import { LanhuError } from "../errors/lanhu-error.js";

const VERIFY_ENDPOINTS = ["/api/user/info", "/api/project/all", "/api/project/list"];

export async function verifyCredential(cookie: string, timeoutMs = 15_000): Promise<{ endpoint: string }> {
  let authFailure = false;
  let lastFailure = "";
  for (const endpoint of VERIFY_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`https://lanhuapp.com${endpoint}`, {
        signal: controller.signal,
        headers: {
          Cookie: cookie,
          Referer: "https://lanhuapp.com/web/",
          Accept: "application/json, text/plain, */*",
          "User-Agent": "lanhu-design-cli",
        },
      });
      if ([401, 403, 418].includes(response.status)) { authFailure = true; continue; }
      if (!response.ok) { lastFailure = `${endpoint}: HTTP ${response.status}`; continue; }
      const data = await response.json() as { code?: string | number };
      if (data.code === undefined || data.code === 0 || data.code === "0" || data.code === "00000") return { endpoint };
      lastFailure = `${endpoint}: code=${String(data.code)}`;
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new LanhuError("LANHU_NETWORK_ERROR", "验证蓝湖登录状态超时。", undefined, true);
      lastFailure = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }
  }
  if (authFailure) throw new LanhuError("LANHU_AUTH_EXPIRED", "蓝湖 Cookie 已失效或没有访问权限。", "请重新登录后运行：lanhu auth", true);
  throw new LanhuError("LANHU_API_ERROR", `无法通过蓝湖只读接口验证 Cookie：${lastFailure}`, "可稍后重试；不要把 Cookie 提交到 Issue。", true);
}
