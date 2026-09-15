import { describe, expect, it } from "vitest";
import { cookieFingerprint, normalizeCookie, redactSecrets } from "../src/auth/cookie.js";
import { LanhuError } from "../src/errors/lanhu-error.js";

describe("cookie utilities", () => {
  it("normalizes a copied Cookie header", () => {
    expect(normalizeCookie("Cookie: a=1; b=2")).toBe("a=1; b=2");
  });

  it("rejects invalid input without echoing it", () => {
    expect(() => normalizeCookie("not-a-cookie")).toThrow(LanhuError);
  });

  it("redacts secrets and returns a stable short fingerprint", () => {
    expect(redactSecrets("LANHU_COOKIE=secret-value")).toBe("LANHU_COOKIE=<redacted>");
    expect(cookieFingerprint("a=1")).toMatch(/^[a-f0-9]{6}$/);
    expect(cookieFingerprint("a=1")).toBe(cookieFingerprint("a=1"));
  });
});
