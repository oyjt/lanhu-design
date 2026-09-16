import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "commander";
import { authenticate, authStatus, importCredential, logout } from "../auth/auth-manager.js";
import { readSecret } from "../auth/read-secret.js";
import { resolveCredential } from "../auth/credential-resolver.js";
import { runLegacy, type LegacyScript } from "../core/legacy-runner.js";
import { exportDesign } from "../commands/export.js";
import { LanhuError } from "../errors/lanhu-error.js";
import { globalOptions } from "./context.js";
import { Output } from "./output.js";

export const VERSION = "1.4.0";

function authenticationMessage(result: { flow?: string; source?: string | null; profile?: string }): string {
  const sourceLabels: Record<string, string> = { environment: "环境变量", "manual-import": "手动导入" };
  const source = result.source ? (sourceLabels[result.source] ?? result.source) : undefined;
  const location = [source, result.profile].filter(Boolean).join(" / ");
  if (result.flow === "saved-credential") {
    return `已登录${location ? `（${location}）` : ""}，正在使用已保存的蓝湖凭据。\n如需刷新 Cookie，请运行：lanhu auth refresh`;
  }
  if (result.flow === "existing-cookie") {
    return `已登录${location ? `（${location}）` : ""}，浏览器 Cookie 已保存。\n如需重新读取 Cookie，请运行：lanhu auth refresh`;
  }
  return `蓝湖登录成功${location ? `（${location}）` : ""}，Cookie 已保存。\n如需重新读取 Cookie，请运行：lanhu auth refresh`;
}

function timeout(command: Command): number {
  const raw = globalOptions(command).timeout || "30000";
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new LanhuError("LANHU_INVALID_ARGUMENT", "--timeout 必须是正整数毫秒值。");
  return value;
}

function browserOpenDelay(command: Command): number {
  const options = globalOptions(command);
  return process.stdin.isTTY && process.stderr.isTTY && !options.json && !options.quiet ? 3 : 0;
}

async function withOutput(command: Command, name: string, action: (output: Output) => Promise<void>): Promise<void> {
  const output = new Output(name, VERSION, globalOptions(command));
  try { await action(output); }
  catch (error) {
    if (error instanceof LanhuError && process.exitCode === error.exitCode) throw error;
    output.failure(error);
  }
}

async function invokeLegacy(command: Command, name: string, script: LegacyScript, args: string[]): Promise<void> {
  await withOutput(command, name, async (output) => {
    const cookie = await resolveCredential(globalOptions(command).cookie);
    const result = await runLegacy(script, args, { cookie, timeoutMs: timeout(command) });
    output.success(result.data);
  });
}

function addBusinessCommands(program: Command): void {
  program.command("designs <url>")
    .description("列出蓝湖项目设计图")
    .option("--page <number>", "页码", "1")
    .option("--limit <number>", "每页数量", "500")
    .action(async (url, _options, command) => invokeLegacy(command, "designs", "get_designs", [url]));

  program.command("image <url>")
    .description("下载设计预览图")
    .requiredOption("-d, --design <selector>", "设计序号、精确名称或 ID")
    .requiredOption("-o, --output <directory>", "输出目录")
    .action(async (url, options, command) => invokeLegacy(command, "image", "download_design_images", [url, "--designs", options.design, "--output", options.output]));

  program.command("specs <url>")
    .description("导出 DDS 或降级设计规格")
    .requiredOption("-d, --design <selector>", "设计序号、精确名称或 ID")
    .option("-o, --output <directory>", "输出目录")
    .option("--download-images", "下载规格引用图片")
    .option("--no-minify", "保留格式化 HTML")
    .action(async (url, options, command) => {
      const args = [url, "--design", options.design];
      if (options.output) args.push("--output", options.output);
      if (options.downloadImages) args.push("--download-images");
      if (options.minify === false) args.push("--no-minify");
      await invokeLegacy(command, "specs", "get_design_specs", args);
    });

  program.command("slices <url>")
    .description("获取设计切图元数据")
    .requiredOption("-d, --design <selector>", "设计序号、精确名称或 ID")
    .option("-o, --output <file>", "写入 JSON 文件")
    .option("--no-metadata", "省略扩展元数据")
    .action(async (url, options, command) => withOutput(command, "slices", async (output) => {
      const cookie = await resolveCredential(globalOptions(command).cookie);
      const args = [url, "--design", options.design];
      if (options.metadata === false) args.push("--no-metadata");
      const result = await runLegacy("get_design_slices", args, { cookie, timeoutMs: timeout(command) });
      if (options.output) {
        await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
        await writeFile(options.output, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
      }
      output.success(options.output ? { result: result.data, output: path.resolve(options.output) } : result.data);
    }));

  program.command("download <json-file>")
    .description("从切图 JSON 下载正式资源")
    .requiredOption("-o, --output <directory>", "输出目录")
    .option("--scale <scale>", "1x/2x/3x/ios-all/android-all", "2x")
    .option("--name-map <file>", "语义化命名映射 JSON")
    .option("--retries <number>", "重试次数", "2")
    .action(async (jsonFile, options, command) => {
      const args = [jsonFile, "--output", options.output, "--scale", options.scale, "--retries", options.retries];
      if (options.nameMap) args.push("--name-map", options.nameMap);
      await invokeLegacy(command, "download", "download_slices", args);
    });

  program.command("export <url>")
    .description("一次导出 Agent 所需设计上下文")
    .requiredOption("-d, --design <selector>", "设计序号、精确名称或 ID")
    .requiredOption("-o, --output <directory>", "导出根目录")
    .option("--scale <scale>", "切图倍率", "2x")
    .action(async (url, options, command) => withOutput(command, "export", async (output) => {
      const cookie = await resolveCredential(globalOptions(command).cookie);
      const result = await exportDesign({ url, design: options.design, output: options.output, scale: options.scale, cookie, timeoutMs: timeout(command), version: VERSION });
      output.success(result, result.warnings);
      if (result.status === "partial") process.exitCode = 8;
    }));
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name("lanhu")
    .description("蓝湖 Design-to-Code CLI")
    .version(VERSION)
    .option("--json", "输出稳定 JSON envelope")
    .option("--quiet", "只输出结果或错误")
    .option("--verbose", "输出脱敏诊断信息")
    .option("--timeout <milliseconds>", "请求或认证超时", "30000")
    .addOption(new Option("--cookie <cookie>", "显式 Cookie（有 shell history 泄露风险）").hideHelp())
    .showHelpAfterError();

  const auth = program.command("auth").description("从系统默认浏览器授权蓝湖登录");
  auth
    .option("--browser <browser>", "chrome/edge/brave/arc/dia/chromium/firefox/safari")
    .option("--profile <profile>", "浏览器 Profile")
    .option("--timeout <seconds>", "等待登录秒数", "120")
    .option("--no-open", "不打开浏览器")
    .action(async (options, command) => withOutput(command, "auth", async (output) => {
      const seconds = Number(options.timeout);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new LanhuError("LANHU_INVALID_ARGUMENT", "auth --timeout 必须是正数秒值。");
      const result = await authenticate({ browser: options.browser, profile: options.profile, timeout: seconds * 1000, open: options.open, openDelaySeconds: browserOpenDelay(command), onStatus: (message) => output.status(message) });
      output.success(result, result.warnings, authenticationMessage(result));
    }));
  auth.command("status").description("检查本地凭据状态").action(async (_options, command) => withOutput(command, "auth status", async (output) => output.success(await authStatus())));
  auth.command("import").description("通过隐藏输入手动导入 Cookie").action(async (_options, command) => withOutput(command, "auth import", async (output) => output.success(await importCredential(await readSecret("粘贴 Cookie（输入不会显示）：")))));
  auth.command("refresh").description("重新打开浏览器并读取会话").option("--browser <browser>").option("--profile <profile>").action(async (options, command) => withOutput(command, "auth refresh", async (output) => {
    const result = await authenticate({ browser: options.browser, profile: options.profile, timeout: 120_000, open: true, forceLogin: true, openDelaySeconds: browserOpenDelay(command), onStatus: (message) => output.status(message) });
    output.success(result, result.warnings, "蓝湖 Cookie 已刷新并保存。");
  }));
  auth.command("logout").description("删除 CLI 本地凭据").action(async (_options, command) => withOutput(command, "auth logout", async (output) => output.success(await logout())));

  program.command("doctor").description("运行脱敏环境诊断").option("--auth-browser", "明确尝试读取浏览器会话").action(async (options, command) => withOutput(command, "doctor", async (output) => {
    const credential = await authStatus();
    const checks: Array<{ name: string; ok: boolean; value: unknown }> = [
      { name: "node", ok: Number(process.versions.node.split(".")[0]) >= 20, value: process.version },
      { name: "platform", ok: true, value: `${process.platform}-${process.arch}` },
      { name: "credential", ok: credential.authenticated, value: credential },
    ];
    if (options.authBrowser) {
      try { checks.push({ name: "browser-cookie", ok: true, value: await authenticate({ timeout: 1500, open: false }) }); }
      catch (error) { checks.push({ name: "browser-cookie", ok: false, value: error instanceof Error ? error.message : String(error) }); }
    }
    output.success({ healthy: checks.every((check) => check.ok || check.name === "credential"), checks });
  }));

  addBusinessCommands(program);
  return program;
}
