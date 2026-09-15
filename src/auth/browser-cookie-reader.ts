import defaultBrowser from "default-browser";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
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

const MACOS_CHROMIUM_ROOTS: Record<string, string[]> = {
  chrome: ["Google", "Chrome"],
  brave: ["BraveSoftware", "Brave-Browser"],
  arc: ["Arc", "User Data"],
  chromium: ["Chromium"],
  dia: ["Dia", "User Data"],
  edge: ["Microsoft Edge"],
};

export function parseLastUsedProfile(raw: string): string | undefined {
  try {
    const value = JSON.parse(raw) as { profile?: { last_used?: unknown } };
    const profile = value.profile?.last_used;
    return typeof profile === "string" && profile.trim() ? profile.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function isCookieDecryptionBlocked(warnings: string[]): boolean {
  return warnings.some((warning) => /keychain|safe storage|keyring|app-bound encryption|could not be decrypted|decrypt failed|permission denied|access denied|interaction.*not allowed/i.test(warning));
}

async function resolveChromiumProfile(target: BrowserTarget, explicitProfile?: string): Promise<string | undefined> {
  if (explicitProfile) return explicitProfile;
  if (process.platform !== "darwin") return undefined;
  const browser = target.backend === "edge" ? "edge" : target.chromiumBrowser;
  if (!browser) return undefined;
  const root = MACOS_CHROMIUM_ROOTS[browser];
  if (!root) return undefined;
  try {
    const state = await readFile(path.join(homedir(), "Library", "Application Support", ...root, "Local State"), "utf8");
    return parseLastUsedProfile(state) ?? "Default";
  } catch {
    // Limit the read to one database even when Local State is temporarily unavailable.
    return "Default";
  }
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
    const profile = await resolveChromiumProfile(target, options.profile);
    const result = await getCookies({
      url: "https://lanhuapp.com/",
      browsers: [target.backend],
      profile,
      chromiumBrowser: target.chromiumBrowser,
      mode: "first",
      timeoutMs: 15_000,
    });
    const cookie = toCookieHeader(result.cookies, { dedupeByName: true });
    if (!cookie) {
      if (isCookieDecryptionBlocked(result.warnings)) {
        throw new LanhuError(
          "LANHU_PERMISSION_DENIED",
          `系统不允许 CLI 解密 ${target.label} Cookie。`,
          "请使用浏览器 Extension 导出 lanhuapp.com Cookie 后运行：lanhu auth import",
          false,
        );
      }
      throw new LanhuError(
        "LANHU_AUTH_REQUIRED",
        `${target.label} 中尚未找到 lanhuapp.com 登录态。`,
        "请在打开的蓝湖页面完成登录后重试。",
        true,
      );
    }
    return { cookie, source: target.label, profile, warnings: result.warnings };
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
