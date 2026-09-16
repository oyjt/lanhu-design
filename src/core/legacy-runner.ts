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

export async function runLegacy(
  script: LegacyScript,
  args: string[],
  options: { cookie?: string; timeoutMs?: number } = {},
): Promise<unknown> {
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
      if (code === 0) {
        try { resolve(JSON.parse(stdout.trim())); }
        catch (error) { reject(new LanhuError("LANHU_INTERNAL_ERROR", "Skill runtime 未返回有效 JSON。", undefined, false, { cause: error })); }
        return;
      }
      const message = redactSecrets(stderr.trim() || stdout.trim() || `旧脚本退出码：${code}`);
      const errorCode = code === 2 ? "LANHU_INVALID_ARGUMENT" : /认证|cookie/i.test(message) ? "LANHU_AUTH_EXPIRED" : "LANHU_API_ERROR";
      reject(new LanhuError(errorCode, message, errorCode.startsWith("LANHU_AUTH") ? "运行：lanhu auth refresh 或 lanhu auth import" : undefined));
    });
  });
}
