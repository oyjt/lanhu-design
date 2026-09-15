import { createInterface } from "node:readline/promises";
import { cookieFingerprint, normalizeCookie } from "./cookie.js";
import { deleteCredential, readCredential, writeCredential } from "./credential-store.js";
import { openDefaultBrowser } from "./default-browser.js";
import { readLanhuBrowserCookie, resolveBrowserTarget } from "./browser-cookie-reader.js";
import { verifyCredential } from "./credential-verifier.js";
import { LanhuError } from "../errors/lanhu-error.js";

async function waitForLogin(timeout: number, browser: string): Promise<void> {
  if (!process.stdin.isTTY) return;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    await readline.question(
      `已在 ${browser} 中打开蓝湖。完成登录后回到这里按 Enter，随后可能出现一次钥匙串授权提示：`,
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

export async function authenticate(options: {
  browser?: string;
  profile?: string;
  timeout: number;
  open: boolean;
}) {
  const target = await resolveBrowserTarget(options.browser);
  if (options.open) await openDefaultBrowser("https://lanhuapp.com/");
  if (options.open) await waitForLogin(options.timeout, target.label);
  const result = await readLanhuBrowserCookie({ ...options, target });
  const cookie = normalizeCookie(result.cookie);
  await verifyCredential(cookie);
  await writeCredential(cookie, result.source, result.profile);
  return { authenticated: true, source: result.source, profile: result.profile, fingerprint: cookieFingerprint(cookie), warnings: result.warnings };
}

export async function importCredential(cookieInput: string) {
  const cookie = normalizeCookie(cookieInput);
  await verifyCredential(cookie);
  await writeCredential(cookie, "manual-import");
  return { authenticated: true, source: "manual-import", fingerprint: cookieFingerprint(cookie) };
}

export async function authStatus(verifyRemote = false) {
  const env = process.env.LANHU_COOKIE?.trim();
  if (env && env !== "your_lanhu_cookie_here") {
    if (verifyRemote) await verifyCredential(env);
    return { authenticated: true, remoteValidated: verifyRemote, source: "environment", fingerprint: cookieFingerprint(env) };
  }
  const stored = await readCredential();
  if (!stored) return { authenticated: false, source: null };
  if (verifyRemote) await verifyCredential(stored.credential.value);
  return {
    authenticated: true,
    remoteValidated: verifyRemote,
    source: stored.credential.source,
    profile: stored.credential.profile,
    createdAt: stored.credential.createdAt,
    validatedAt: stored.credential.validatedAt,
    fingerprint: cookieFingerprint(stored.credential.value),
  };
}

export async function logout() {
  return { removed: await deleteCredential() };
}
