import { afterEach, describe, expect, it, vi } from "vitest";
import { Output } from "../src/cli/output.js";

afterEach(() => vi.restoreAllMocks());

describe("CLI output", () => {
  it("prints a friendly message instead of an object in human mode", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    new Output("auth", "1.4.1", {}).success({ authenticated: true }, [], "已登录。\n如需刷新 Cookie，请运行：lanhu auth refresh");
    expect(log).toHaveBeenCalledWith("已登录。\n如需刷新 Cookie，请运行：lanhu auth refresh");
  });

  it("keeps structured data in JSON mode and suppresses status text", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const output = new Output("auth", "1.4.1", { json: true });
    output.status("Keychain notice");
    output.success({ authenticated: true }, [], "已登录");
    expect(error).not.toHaveBeenCalled();
    const outputText = log.mock.calls[0]?.[0];
    expect(outputText).toBeDefined();
    expect(JSON.parse(String(outputText)).data).toEqual({ authenticated: true });
  });
});
