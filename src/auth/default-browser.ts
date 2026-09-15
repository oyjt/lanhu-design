import { spawn } from "node:child_process";
import { LanhuError } from "../errors/lanhu-error.js";

export async function openDefaultBrowser(url: string): Promise<void> {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", (error) => reject(new LanhuError(
      "LANHU_BROWSER_UNSUPPORTED",
      `无法打开系统默认浏览器：${error.message}`,
      "请手动打开 https://lanhuapp.com/ 后运行：lanhu auth import",
    )));
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
