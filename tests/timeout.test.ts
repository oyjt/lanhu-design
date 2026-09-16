import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { createProgram, timeoutMs } from "../src/cli/program.js";

describe("timeout options", () => {
  it("uses seconds for every public timeout", () => {
    const command = new Command().option("--timeout <seconds>").parse(["node", "test", "--timeout", "2"]);
    expect(timeoutMs(command)).toBe(2_000);

    const program = createProgram();
    expect(program.options.find(({ long }) => long === "--timeout")?.defaultValue).toBe("30");
    expect(program.commands.find((command) => command.name() === "auth")?.options.find(({ long }) => long === "--timeout")?.defaultValue).toBe("120");
  });
});
