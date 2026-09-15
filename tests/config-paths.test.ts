import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConfigDirectory } from "../src/config/paths.js";

describe("config paths", () => {
  it("uses the same .config directory below the user home on every platform", () => {
    expect(resolveConfigDirectory("/Users/example")).toBe(path.join("/Users/example", ".config", "lanhu-design"));
  });
});
