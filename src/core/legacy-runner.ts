import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactSecrets } from "../auth/cookie.js";
import { LanhuError } from "../errors/lanhu-error.js";

export type LegacyScript = "get_designs" | "download_design_images" | "get_design_specs" | "get_design_slices" | "download_slices";

async function repositoryRoot(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../.."), path.resolve(here, "..")];
  for (const candidate of candidates) {
    try { await access(path.join(candidate, "skills/lanhu-design/scripts/lanhu-client.mjs")); return candidate; }
    catch { /* 当前路径不可用时继续尝试下一个候选路径。 */ }
  }
  throw new LanhuError("LANHU_INTERNAL_ERROR", "npm 包中缺少 Skill runtime。请重新安装 lanhu-design。");
}

function parseLastJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  try { return JSON.parse(trimmed); } catch { /* 输出可能同时包含进度文本和 JSON。 */ }
  for (let index = trimmed.lastIndexOf("\n{"); index >= 0; index = trimmed.lastIndexOf("\n{", index - 1)) {
    try { return JSON.parse(trimmed.slice(index + 1)); } catch { /* 当前片段无效时继续向前查找。 */ }
  }
  return trimmed;
}

export async function runLegacy(
  script: LegacyScript,
  args: string[],
  options: { cookie?: string; timeoutMs?: number } = {},
): Promise<{ data: unknown }> {
  const root = await repositoryRoot();
  const file = path.join(root, "skills/lanhu-design/scripts", `${script}.mjs`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(options.cookie ? { LANHU_COOKIE: options.cookie } : {}),
        ...(options.timeoutMs ? { HTTP_TIMEOUT: String(options.timeoutMs) } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) { resolve({ data: parseLastJson(stdout) }); return; }
      const message = redactSecrets(stderr.trim() || stdout.trim() || `旧脚本退出码：${code}`);
      const errorCode = code === 2 ? "LANHU_INVALID_ARGUMENT" : /认证|cookie/i.test(message) ? "LANHU_AUTH_EXPIRED" : "LANHU_API_ERROR";
      reject(new LanhuError(errorCode, message, errorCode.startsWith("LANHU_AUTH") ? "运行：lanhu auth refresh 或 lanhu auth import" : undefined));
    });
  });
}
