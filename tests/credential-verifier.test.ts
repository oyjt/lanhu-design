import { describe, expect, it } from "vitest";
import { verifyCredential } from "../src/auth/credential-verifier.js";

function jwt(exp: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp })}.signature`;
}

describe("credential verifier", () => {
  it("accepts an opaque cookie without guessing a remote endpoint", async () => {
    await expect(verifyCredential("session=opaque")).resolves.toEqual({ method: "cookie-format" });
  });

  it("checks a JWT expiry locally when user_token contains one", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await expect(verifyCredential(`user_token=${jwt(exp)}`)).resolves.toMatchObject({ method: "jwt-expiry" });
  });

  it("rejects an expired JWT without a network request", async () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    await expect(verifyCredential(`user_token=${jwt(exp)}`)).rejects.toMatchObject({ code: "LANHU_AUTH_EXPIRED" });
  });
});
