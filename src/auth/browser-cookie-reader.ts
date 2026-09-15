import { LanhuError } from "../errors/lanhu-error.js";

export interface BrowserCookieReadOptions {
  browser?: string;
  profile?: string;
}

export interface BrowserCookieReadResult {
  cookie: string;
  source: string;
  profile?: string;
  warnings: string[];
}

export async function readLanhuBrowserCookie(
  options: BrowserCookieReadOptions = {},
): Promise<BrowserCookieReadResult> {
  try {
    const { getCookies, toCookieHeader } = await import("@steipete/sweet-cookie");
    const browsers = options.browser ? [options.browser] : ["chrome", "edge", "firefox", "safari"];
    const result = await getCookies({
      url: "https://lanhuapp.com/",
      browsers,
      profile: options.profile,
    });
    const cookie = toCookieHeader(result.cookies, { dedupeByName: true });
    if (!cookie) {
      throw new LanhuError(
        "LANHU_AUTH_UNREADABLE",
        "浏览器中尚未读取到 lanhuapp.com 登录 Cookie。",
        process.platform === "win32"
          ? "Windows Chrome/Edge 可能受 App-Bound Encryption 限制；可改用 Firefox，或运行：lanhu auth import"
          : "请确认已在打开的默认浏览器中登录，或运行：lanhu auth import",
        true,
      );
    }
    return { cookie, source: options.browser || "browser", profile: options.profile, warnings: result.warnings };
  } catch (error) {
    if (error instanceof LanhuError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new LanhuError(
      "LANHU_AUTH_UNREADABLE",
      `无法读取浏览器 Cookie：${message}`,
      "运行：lanhu auth import",
      true,
      { cause: error },
    );
  }
}
