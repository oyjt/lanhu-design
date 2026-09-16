import { afterEach, describe, expect, it, vi } from "vitest";
import { Output } from "../src/cli/output.js";

afterEach(() => vi.restoreAllMocks());

describe("CLI output", () => {
  it("prints a friendly message instead of an object in human mode", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    new Output("auth", "1.4.1", {}).success({ authenticated: true }, [], "已登录。\n如需刷新 Cookie，请运行：lanhu auth refresh");
    expect(log).toHaveBeenCalledWith("已登录。\n如需刷新 Cookie，请运行：lanhu auth refresh");
  });

  it("writes progress to stderr without labeling it as an error", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    new Output("image", "1.4.1", {}).status("OK image.png");
    expect(write).toHaveBeenCalledWith("OK image.png\n");
  });

  it("keeps structured data in JSON mode and suppresses status text", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const output = new Output("auth", "1.4.1", { json: true });
    output.status("Keychain notice");
    output.success({ authenticated: true }, [], "已登录");
    expect(write).not.toHaveBeenCalled();
    const outputText = log.mock.calls[0]?.[0];
    expect(outputText).toBeDefined();
    expect(JSON.parse(String(outputText)).data).toEqual({ authenticated: true });
  });
});
