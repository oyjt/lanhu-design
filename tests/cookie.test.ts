import { describe, expect, it } from "vitest";
import { normalizeCookie, redactSecrets } from "../src/auth/cookie.js";
import { LanhuError } from "../src/errors/lanhu-error.js";

describe("cookie utilities", () => {
  it("normalizes a copied Cookie header", () => {
    expect(normalizeCookie("Cookie: a=1; b=2")).toBe("a=1; b=2");
  });

  it("rejects invalid input without echoing it", () => {
    expect(() => normalizeCookie("not-a-cookie")).toThrow(LanhuError);
  });

  it("redacts secrets", () => {
    expect(redactSecrets("LANHU_COOKIE=secret-value")).toBe("LANHU_COOKIE=<redacted>");
  });
});
