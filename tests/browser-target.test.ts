import { describe, expect, it } from "vitest";
import { mapBrowser, parseLastUsedProfile } from "../src/auth/browser-cookie-reader.js";

describe("browser target mapping", () => {
  it.each([
    ["com.google.Chrome", "chrome", "chrome"],
    ["com.brave.Browser", "chrome", "brave"],
    ["company.thebrowser.Browser", "chrome", "arc"],
    ["company.thebrowser.dia", "chrome", "dia"],
    ["com.microsoft.edgemac", "edge", undefined],
    ["org.mozilla.firefox", "firefox", undefined],
    ["com.apple.Safari", "safari", undefined],
  ])("maps %s to one cookie backend", (input, backend, chromiumBrowser) => {
    expect(mapBrowser(input)).toMatchObject({
      backend,
      ...(chromiumBrowser ? { chromiumBrowser } : {}),
    });
  });

  it("rejects unknown browsers", () => {
    expect(mapBrowser("com.example.unknown")).toBeNull();
  });

  it("reads the most recently used Chromium profile", () => {
    expect(parseLastUsedProfile(JSON.stringify({ profile: { last_used: "Profile 2" } }))).toBe("Profile 2");
    expect(parseLastUsedProfile("invalid json")).toBeUndefined();
  });
});
