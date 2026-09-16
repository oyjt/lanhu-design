import { describe, expect, it, vi } from "vitest";
import { installCliAndSkill } from "../src/commands/install.js";

describe("install wizard", () => {
  it("installs the global CLI before the Agent Skill", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const result = await installCliAndSkill({ silent: false }, run);
    expect(run.mock.calls).toEqual([
      ["npm", ["install", "-g", "lanhu-design@latest"], false],
      ["npx", ["-y", "skills", "add", "oyjt/lanhu-design", "-y", "-g"], true],
    ]);
    expect(result).toEqual({ cliInstalled: true, skillInstalled: true, skillSource: "oyjt/lanhu-design" });
  });
});
