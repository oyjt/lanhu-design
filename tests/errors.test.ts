import { describe, expect, it } from "vitest";
import { LanhuError, toLanhuError } from "../src/errors/lanhu-error.js";

describe("error contract", () => {
  it("maps authentication failures to stable exit code 3", () => {
    const error = toLanhuError(new Error("LANHU_COOKIE 未设置"));
    expect(error.code).toBe("LANHU_AUTH_REQUIRED");
    expect(error.exitCode).toBe(3);
  });

  it("preserves typed errors", () => {
    const error = new LanhuError("LANHU_DESIGN_AMBIGUOUS", "ambiguous");
    expect(toLanhuError(error)).toBe(error);
    expect(error.exitCode).toBe(7);
  });
});
