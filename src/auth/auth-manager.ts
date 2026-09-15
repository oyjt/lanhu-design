import { setTimeout as delay } from "node:timers/promises";
import { cookieFingerprint, normalizeCookie } from "./cookie.js";
import { deleteCredential, readCredential, writeCredential } from "./credential-store.js";
import { openDefaultBrowser } from "./default-browser.js";
import { readLanhuBrowserCookie } from "./browser-cookie-reader.js";
import { verifyCredential } from "./credential-verifier.js";

export async function authenticate(options: {
  browser?: string;
  profile?: string;
  timeout: number;
  open: boolean;
}) {
  if (options.open) await openDefaultBrowser("https://lanhuapp.com/");
  const deadline = Date.now() + options.timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await readLanhuBrowserCookie(options);
      const cookie = normalizeCookie(result.cookie);
      await verifyCredential(cookie);
      await writeCredential(cookie, result.source, result.profile);
      return { authenticated: true, source: result.source, profile: result.profile, fingerprint: cookieFingerprint(cookie), warnings: result.warnings };
    } catch (error) {
      lastError = error;
      await delay(Math.min(1500, Math.max(0, deadline - Date.now())));
    }
  }
  throw lastError;
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
