import { spawn } from "node:child_process";
import { LanhuError } from "../errors/lanhu-error.js";

type CommandRunner = (command: string, args: string[], silent: boolean) => Promise<void>;

function runCommand(command: string, args: string[], silent: boolean): Promise<void> {
  const executable = process.platform === "win32" ? "cmd.exe" : command;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, commandArgs, { stdio: silent ? "ignore" : "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} 退出码：${code ?? "unknown"}`)));
  });
}

export async function installCliAndSkill(
  options: { silent?: boolean; onStatus?: (message: string) => void } = {},
  run: CommandRunner = runCommand,
) {
  const silent = options.silent ?? false;
  options.onStatus?.("正在安装或升级 lanhu-design CLI...");
  try {
    await run("npm", ["install", "-g", "lanhu-design@latest"], silent);
  } catch (error) {
    throw new LanhuError("LANHU_INTERNAL_ERROR", "lanhu-design CLI 安装失败。", "请手动运行：npm install -g lanhu-design@latest", true, { cause: error });
  }

  options.onStatus?.("正在安装 lanhu-design Agent Skill...");
  try {
    // skills 会为不支持全局安装的 PromptScript 输出兼容性提示，这里只保留向导自身的明确状态。
    await run("npx", ["-y", "skills", "add", "oyjt/lanhu-design", "-y", "-g"], true);
  } catch (error) {
    throw new LanhuError("LANHU_INTERNAL_ERROR", "lanhu-design Agent Skill 安装失败。", "请手动运行：npx skills add oyjt/lanhu-design -y -g", true, { cause: error });
  }

  return { cliInstalled: true, skillInstalled: true, skillSource: "oyjt/lanhu-design" };
}
