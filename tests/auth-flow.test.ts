import { describe, expect, it, vi, type Mock } from "vitest";
import { authenticate, keychainReadNotice } from "../src/auth/auth-manager.js";
import { readLanhuBrowserCookie, type BrowserTarget } from "../src/auth/browser-cookie-reader.js";
import { LanhuError } from "../src/errors/lanhu-error.js";

const target: BrowserTarget = { backend: "chrome", chromiumBrowser: "chrome", label: "Google Chrome" };
const browserCookie = { cookie: "session=valid", source: "Google Chrome", profile: "Default", warnings: [] };
type AuthenticationOverrides = NonNullable<Parameters<typeof authenticate>[1]>;
type CookieReader = NonNullable<AuthenticationOverrides["readCookie"]>;

function cookieReader(): Mock<CookieReader> {
  return vi.fn<typeof readLanhuBrowserCookie>();
}

function dependencies(readCookie: Mock<CookieReader>) {
  return {
    readLocal: vi.fn().mockResolvedValue({ authenticated: false, source: null }),
    resolveTarget: vi.fn().mockResolvedValue(target),
    readCookie,
    openBrowser: vi.fn().mockResolvedValue(undefined),
    waitForLogin: vi.fn().mockResolvedValue(undefined),
    delay: vi.fn().mockResolvedValue(undefined),
    platform: "linux" as NodeJS.Platform,
    verify: vi.fn().mockResolvedValue({ method: "cookie-format" as const }),
    write: vi.fn().mockResolvedValue(undefined),
  } satisfies AuthenticationOverrides;
}

describe("browser authentication flow", () => {
  it("warns before a macOS Chromium Keychain read", () => {
    expect(keychainReadNotice(target, "darwin")).toContain("macOS 可能弹出钥匙串授权窗口");
    expect(keychainReadNotice({ backend: "safari", label: "Safari" }, "darwin")).toBeUndefined();
    expect(keychainReadNotice(target, "win32")).toBeUndefined();
  });

  it("uses a saved CLI credential without touching the browser or Keychain", async () => {
    const deps = dependencies(cookieReader().mockResolvedValue(browserCookie));
    deps.readLocal.mockResolvedValue({
      authenticated: true,
      source: "Google Chrome",
      profile: "Default",
      validation: { method: "cookie-format" },
    });
    const result = await authenticate({ timeout: 120_000, open: true }, deps);
    expect(result.flow).toBe("saved-credential");
    expect(deps.resolveTarget).not.toHaveBeenCalled();
    expect(deps.readCookie).not.toHaveBeenCalled();
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });

  it("bypasses a saved credential when refresh forces browser login", async () => {
    const deps = dependencies(cookieReader().mockResolvedValue(browserCookie));
    deps.readLocal.mockResolvedValue({ authenticated: true, source: "Google Chrome" });
    const result = await authenticate({ timeout: 120_000, open: true, forceLogin: true }, deps);
    expect(result.flow).toBe("browser-login");
    expect(deps.readLocal).not.toHaveBeenCalled();
    expect(deps.openBrowser).toHaveBeenCalledOnce();
    expect(deps.readCookie).toHaveBeenCalledOnce();
  });

  it("uses an existing browser login without opening a page", async () => {
    const deps = dependencies(cookieReader().mockResolvedValue(browserCookie));
    const result = await authenticate({ timeout: 120_000, open: true }, deps);
    expect(result.flow).toBe("existing-cookie");
    expect(deps.readCookie).toHaveBeenCalledTimes(1);
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });

  it("opens the browser and retries when no login exists", async () => {
    const readCookie = cookieReader()
      .mockRejectedValueOnce(new LanhuError("LANHU_AUTH_REQUIRED", "not logged in"))
      .mockResolvedValueOnce(browserCookie);
    const deps = dependencies(readCookie);
    const statuses: string[] = [];
    const result = await authenticate({ timeout: 120_000, open: true, openDelaySeconds: 3, onStatus: (message) => statuses.push(message) }, deps);
    expect(result.flow).toBe("browser-login");
    expect(readCookie).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual([
      "3 秒后将打开 Google Chrome，请完成蓝湖登录后返回终端。",
      "2 秒后将打开 Google Chrome，请完成蓝湖登录后返回终端。",
      "1 秒后将打开 Google Chrome，请完成蓝湖登录后返回终端。",
    ]);
    expect(deps.delay).toHaveBeenCalledTimes(3);
    expect(deps.openBrowser).toHaveBeenCalledWith("https://lanhuapp.com/");
    expect(deps.waitForLogin).toHaveBeenCalledOnce();
  });

  it("explains Windows Chromium limitations after the login retry fails", async () => {
    const readCookie = cookieReader().mockRejectedValue(new LanhuError("LANHU_AUTH_REQUIRED", "not logged in"));
    const deps = dependencies(readCookie);
    deps.platform = "win32";
    const error = await authenticate({ timeout: 120_000, open: true }, deps).catch((caught) => caught);
    expect(error).toMatchObject({
      code: "LANHU_AUTH_REQUIRED",
      message: "已打开 Google Chrome，但仍未读取到 lanhuapp.com 登录状态。",
      hint: expect.stringContaining("Windows 版 Chromium 浏览器可能限制 Cookie 解密"),
    });
    expect(error.hint).toContain("lanhu auth import");
  });

  it("does not retry when the system blocks cookie decryption", async () => {
    const readCookie = cookieReader().mockRejectedValue(new LanhuError("LANHU_PERMISSION_DENIED", "blocked"));
    const deps = dependencies(readCookie);
    await expect(authenticate({ timeout: 120_000, open: true }, deps)).rejects.toMatchObject({ code: "LANHU_PERMISSION_DENIED" });
    expect(readCookie).toHaveBeenCalledTimes(1);
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });
});
