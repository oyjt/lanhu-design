import { createInterface } from "node:readline/promises";
import { normalizeCookie } from "./cookie.js";
import { deleteCredential, readCredential, writeCredential } from "./credential-store.js";
import { openDefaultBrowser } from "./default-browser.js";
import { readLanhuBrowserCookie, resolveBrowserTarget } from "./browser-cookie-reader.js";
import { verifyCredential } from "./credential-verifier.js";
import { LanhuError } from "../errors/lanhu-error.js";

interface AuthenticationDependencies {
  readLocal: typeof authStatus;
  resolveTarget: typeof resolveBrowserTarget;
  readCookie: typeof readLanhuBrowserCookie;
  openBrowser: typeof openDefaultBrowser;
  waitForLogin: typeof waitForLogin;
  delay: (milliseconds: number) => Promise<void>;
  platform: NodeJS.Platform;
  verify: typeof verifyCredential;
  write: typeof writeCredential;
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function waitForLogin(timeout: number, browser: string): Promise<void> {
  if (!process.stdin.isTTY) return;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    await readline.question(
      `已在 ${browser} 中打开蓝湖。完成登录后回到这里按 Enter，CLI 将再次读取登录态：`,
      { signal: controller.signal },
    );
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new LanhuError("LANHU_AUTH_UNREADABLE", "等待蓝湖登录确认超时。", "重新运行 lanhu auth，或使用 lanhu auth import。", true);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    readline.close();
  }
}

export function keychainReadNotice(target: { backend: string; label: string }, platform = process.platform): string | undefined {
  if (platform !== "darwin" || !["chrome", "edge"].includes(target.backend)) return undefined;
  return `即将读取 ${target.label} 登录态，macOS 可能弹出钥匙串授权窗口。这是解密浏览器 Cookie 所需的系统授权，请选择“允许”或“始终允许”。`;
}

function browserLoginFailure(target: { backend: string; label: string }, platform: NodeJS.Platform, cause: LanhuError): LanhuError {
  const profileHint = `请确认蓝湖登录在当前 ${target.label} Profile；如果使用其他 Profile，请通过 --profile 指定。`;
  const windowsHint = platform === "win32" && ["chrome", "edge"].includes(target.backend)
    ? "Windows 版 Chromium 浏览器可能限制 Cookie 解密，可改用 Firefox，或运行：lanhu auth import"
    : "也可以运行：lanhu auth import";
  return new LanhuError(
    "LANHU_AUTH_REQUIRED",
    `已打开 ${target.label}，但仍未读取到 lanhuapp.com 登录状态。`,
    `${profileHint}${windowsHint}`,
    true,
    { cause },
  );
}

export async function authenticate(options: {
  browser?: string;
  profile?: string;
  timeout: number;
  open: boolean;
  forceLogin?: boolean;
  openDelaySeconds?: number;
  onStatus?: (message: string) => void;
}, overrides: Partial<AuthenticationDependencies> = {}) {
  const dependencies: AuthenticationDependencies = {
    readLocal: authStatus,
    resolveTarget: resolveBrowserTarget,
    readCookie: readLanhuBrowserCookie,
    openBrowser: openDefaultBrowser,
    waitForLogin,
    delay,
    platform: process.platform,
    verify: verifyCredential,
    write: writeCredential,
    ...overrides,
  };

  if (!options.forceLogin) {
    // 优先复用 CLI 已有凭据，避免不必要地访问浏览器 Cookie 和 macOS Keychain。
    try {
      const local = await dependencies.readLocal();
      if (local.authenticated) return { ...local, flow: "saved-credential" as const, warnings: [] };
    } catch (error) {
      if (!(error instanceof LanhuError) || error.code !== "LANHU_AUTH_EXPIRED") throw error;
    }
  }

  const target = await dependencies.resolveTarget(options.browser);

  const attempt = async (flow: "existing-cookie" | "browser-login") => {
    // 每次可能访问 Keychain 前先告知用户，避免系统授权窗口突然出现。
    const notice = keychainReadNotice(target, dependencies.platform);
    if (notice) options.onStatus?.(notice);
    const result = await dependencies.readCookie({ ...options, target });
    const cookie = normalizeCookie(result.cookie);
    const verification = await dependencies.verify(cookie);
    await dependencies.write(cookie, result.source, result.profile);
    return {
      authenticated: true,
      flow,
      source: result.source,
      profile: result.profile,
      validation: verification,
      warnings: result.warnings,
    };
  };

  if (!options.forceLogin) {
    try {
      return await attempt("existing-cookie");
    } catch (error) {
      const canLogin = error instanceof LanhuError && ["LANHU_AUTH_REQUIRED", "LANHU_AUTH_EXPIRED"].includes(error.code);
      if (!canLogin || !options.open) throw error;
    }
  }

  if (!options.open) {
    throw new LanhuError("LANHU_AUTH_REQUIRED", "当前没有可用的蓝湖浏览器登录态。", "移除 --no-open 后重试，或运行：lanhu auth import");
  }
  // 仅在本地凭据和现有浏览器登录态都不可用时，才打开登录页面。
  const delaySeconds = Math.max(0, Math.floor(options.openDelaySeconds ?? 0));
  for (let remaining = delaySeconds; remaining > 0; remaining -= 1) {
    options.onStatus?.(`${remaining} 秒后将打开 ${target.label}，请完成蓝湖登录后返回终端。`);
    await dependencies.delay(1_000);
  }
  await dependencies.openBrowser("https://lanhuapp.com/");
  await dependencies.waitForLogin(options.timeout, target.label);
  try {
    return await attempt("browser-login");
  } catch (error) {
    if (error instanceof LanhuError && error.code === "LANHU_AUTH_REQUIRED") {
      throw browserLoginFailure(target, dependencies.platform, error);
    }
    throw error;
  }
}

export async function importCredential(cookieInput: string) {
  const cookie = normalizeCookie(cookieInput);
  const verification = await verifyCredential(cookie);
  await writeCredential(cookie, "manual-import");
  return { authenticated: true, source: "manual-import", validation: verification };
}

export async function authStatus() {
  const env = process.env.LANHU_COOKIE?.trim();
  if (env && env !== "your_lanhu_cookie_here") {
    const verification = await verifyCredential(env);
    return { authenticated: true, validation: verification, source: "environment" };
  }
  const stored = await readCredential();
  if (!stored) return { authenticated: false, source: null };
  const verification = await verifyCredential(stored.credential.value);
  return {
    authenticated: true,
    validation: verification,
    source: stored.credential.source,
    profile: stored.credential.profile,
    createdAt: stored.credential.createdAt,
    validatedAt: stored.credential.validatedAt,
  };
}

export async function logout() {
  return { removed: await deleteCredential() };
}
