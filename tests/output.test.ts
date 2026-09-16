import { afterEach, describe, expect, it, vi } from "vitest";
import { importAuthenticationMessage, installAuthenticationMessage, logoutMessage } from "../src/cli/program.js";
import { Output } from "../src/cli/output.js";

afterEach(() => vi.restoreAllMocks());

describe("CLI output", () => {
  it("describes whether install reused or refreshed credentials", () => {
    expect(installAuthenticationMessage("saved-credential")).toContain("已复用现有蓝湖登录凭据");
    expect(installAuthenticationMessage("existing-cookie")).toContain("已读取并保存浏览器登录凭据");
    expect(installAuthenticationMessage("browser-login")).toContain("蓝湖登录凭据已保存");
    expect(installAuthenticationMessage()).toContain("下一步：lanhu auth");
  });

  it("prints friendly import and logout results", () => {
    expect(importAuthenticationMessage({ validation: { expiresAt: "2027-09-16T07:53:07.000Z" } })).toContain("Cookie 已导入并保存");
    expect(importAuthenticationMessage({ validation: { expiresAt: "2027-09-16T07:53:07.000Z" } })).toContain("2027-09-16T07:53:07.000Z");
    expect(logoutMessage(true)).toContain("已删除");
    expect(logoutMessage(false)).toContain("未找到");
  });

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
