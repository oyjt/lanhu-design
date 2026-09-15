import { describe, expect, it } from "vitest";
import { parseCredential } from "../src/auth/credential-store.js";

describe("credential store", () => {
  it("accepts stored credentials and rejects invalid files", () => {
    const raw = JSON.stringify({ version: 1, credential: { type: "cookie", value: "a=1", source: "test", createdAt: "2026-01-01" } });
    expect(parseCredential(raw).credential.value).toBe("a=1");
    expect(() => parseCredential("{}")).toThrow("凭据文件格式无效");
  });
});
