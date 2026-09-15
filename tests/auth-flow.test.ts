import { describe, expect, it, vi } from "vitest";
import { authenticate } from "../src/auth/auth-manager.js";
import type { BrowserTarget } from "../src/auth/browser-cookie-reader.js";
import { LanhuError } from "../src/errors/lanhu-error.js";

const target: BrowserTarget = { backend: "chrome", chromiumBrowser: "chrome", label: "Google Chrome" };
const browserCookie = { cookie: "session=valid", source: "Google Chrome", profile: "Default", warnings: [] };

function dependencies(readCookie: ReturnType<typeof vi.fn>) {
  return {
    resolveTarget: vi.fn().mockResolvedValue(target),
    readCookie,
    openBrowser: vi.fn().mockResolvedValue(undefined),
    waitForLogin: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue({ method: "cookie-format" as const }),
    write: vi.fn().mockResolvedValue(undefined),
  };
}

describe("browser authentication flow", () => {
  it("uses an existing browser login without opening a page", async () => {
    const deps = dependencies(vi.fn().mockResolvedValue(browserCookie));
    const result = await authenticate({ timeout: 120_000, open: true }, deps);
    expect(result.flow).toBe("existing-cookie");
    expect(deps.readCookie).toHaveBeenCalledTimes(1);
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });

  it("opens the browser and retries when no login exists", async () => {
    const readCookie = vi.fn()
      .mockRejectedValueOnce(new LanhuError("LANHU_AUTH_REQUIRED", "not logged in"))
      .mockResolvedValueOnce(browserCookie);
    const deps = dependencies(readCookie);
    const result = await authenticate({ timeout: 120_000, open: true }, deps);
    expect(result.flow).toBe("browser-login");
    expect(readCookie).toHaveBeenCalledTimes(2);
    expect(deps.openBrowser).toHaveBeenCalledWith("https://lanhuapp.com/");
    expect(deps.waitForLogin).toHaveBeenCalledOnce();
  });

  it("does not retry when the system blocks cookie decryption", async () => {
    const readCookie = vi.fn().mockRejectedValue(new LanhuError("LANHU_PERMISSION_DENIED", "blocked"));
    const deps = dependencies(readCookie);
    await expect(authenticate({ timeout: 120_000, open: true }, deps)).rejects.toMatchObject({ code: "LANHU_PERMISSION_DENIED" });
    expect(readCookie).toHaveBeenCalledTimes(1);
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });
});
