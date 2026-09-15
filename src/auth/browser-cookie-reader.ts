import defaultBrowser from "default-browser";
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

type ChromiumBrowser = "chrome" | "brave" | "arc" | "chromium" | "dia";

export interface BrowserTarget {
  backend: "chrome" | "edge" | "firefox" | "safari";
  chromiumBrowser?: ChromiumBrowser;
  label: string;
}

export function mapBrowser(value: string): BrowserTarget | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("brave")) return { backend: "chrome", chromiumBrowser: "brave", label: "Brave" };
  if (normalized.includes("dia")) return { backend: "chrome", chromiumBrowser: "dia", label: "Dia" };
  if (normalized.includes("arc") || normalized.includes("thebrowser")) return { backend: "chrome", chromiumBrowser: "arc", label: "Arc" };
  if (normalized.includes("chromium")) return { backend: "chrome", chromiumBrowser: "chromium", label: "Chromium" };
  if (normalized.includes("chrome")) return { backend: "chrome", chromiumBrowser: "chrome", label: "Google Chrome" };
  if (normalized.includes("edge")) return { backend: "edge", label: "Microsoft Edge" };
  if (normalized.includes("firefox")) return { backend: "firefox", label: "Firefox" };
  if (normalized.includes("safari")) return { backend: "safari", label: "Safari" };
  return null;
}

export async function resolveBrowserTarget(browser?: string): Promise<BrowserTarget> {
  if (browser) {
    const target = mapBrowser(browser);
    if (target) return target;
    throw new LanhuError(
      "LANHU_BROWSER_UNSUPPORTED",
      `暂不支持浏览器“${browser}”。`,
      "支持：chrome、edge、brave、arc、dia、chromium、firefox、safari",
    );
  }
  try {
    const detected = await defaultBrowser();
    const target = mapBrowser(`${detected.id} ${detected.name}`);
    if (target) return target;
    throw new Error(`${detected.name} (${detected.id})`);
  } catch (error) {
    throw new LanhuError(
      "LANHU_BROWSER_UNSUPPORTED",
      `无法识别受支持的系统默认浏览器：${error instanceof Error ? error.message : String(error)}`,
      "请显式指定，例如：lanhu auth --browser chrome",
    );
  }
}

export async function readLanhuBrowserCookie(
  options: BrowserCookieReadOptions & { target?: BrowserTarget } = {},
): Promise<BrowserCookieReadResult> {
  try {
    const { getCookies, toCookieHeader } = await import("@steipete/sweet-cookie");
    const target = options.target ?? await resolveBrowserTarget(options.browser);
    const result = await getCookies({
      url: "https://lanhuapp.com/",
      browsers: [target.backend],
      profile: options.profile,
      chromiumBrowser: target.chromiumBrowser,
      mode: "first",
      timeoutMs: 15_000,
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
    return { cookie, source: target.label, profile: options.profile, warnings: result.warnings };
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
