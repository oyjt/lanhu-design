import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { runLegacy } from "../core/legacy-runner.js";
import { LanhuError } from "../errors/lanhu-error.js";

interface Design { id: string | number; index: number; name: string }

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9一-鿿._-]+/g, "_").replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "") || "design";
}

function selectDesign(data: unknown, selector: string): Design {
  const designs = (data as { designs?: Design[] })?.designs;
  if (!Array.isArray(designs)) throw new LanhuError("LANHU_API_ERROR", "设计列表返回结构无效。");
  const numeric = Number(selector);
  const matches = designs.filter((design) =>
    (Number.isInteger(numeric) && (design.index === numeric || String(design.id) === selector)) || design.name === selector,
  );
  if (matches.length === 1 && matches[0]) return matches[0];
  const partial = designs.filter((design) => design.name.includes(selector));
  if (partial.length > 1) throw new LanhuError("LANHU_DESIGN_AMBIGUOUS", `“${selector}”匹配多个设计：${partial.map(({ name }) => name).join("、")}`);
  if (partial[0]) return partial[0];
  throw new LanhuError("LANHU_DESIGN_NOT_FOUND", `未找到设计“${selector}”。`);
}

async function inventory(root: string): Promise<Array<{ path: string; type: string; size: number; sha256: string }>> {
  const result: Array<{ path: string; type: string; size: number; sha256: string }> = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(absolute); continue; }
      const bytes = await readFile(absolute);
      result.push({
        path: path.relative(root, absolute).split(path.sep).join("/"),
        type: path.extname(entry.name).slice(1) || "file",
        size: (await stat(absolute)).size,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  await visit(root);
  return result;
}

export async function exportDesign(options: {
  url: string;
  design: string;
  output: string;
  scale: string;
  cookie: string;
  timeoutMs: number;
  version: string;
}) {
  const outputRoot = path.resolve(options.output);
  const list = await runLegacy("get_designs", [options.url], { cookie: options.cookie, timeoutMs: options.timeoutMs });
  const design = selectDesign(list.data, options.design);
  const name = safeName(design.name);
  const target = path.join(outputRoot, name);
  try {
    await stat(target);
    throw new LanhuError("LANHU_INVALID_ARGUMENT", `目标目录已存在：${target}`, "请选择新的 --output，或先自行备份现有目录。");
  } catch (error) {
    if (error instanceof LanhuError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await mkdir(outputRoot, { recursive: true });
  const staging = path.join(outputRoot, `.${name}.lanhu-tmp-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const warnings: string[] = [];
  try {
    const image = await runLegacy("download_design_images", [options.url, "--designs", String(design.index), "--output", staging], { cookie: options.cookie, timeoutMs: options.timeoutMs });
    await runLegacy("get_design_specs", [options.url, "--design", String(design.index), "--output", staging, "--download-images"], { cookie: options.cookie, timeoutMs: options.timeoutMs });
    const slices = await runLegacy("get_design_slices", [options.url, "--design", String(design.index)], { cookie: options.cookie, timeoutMs: options.timeoutMs });
    const slicesPath = path.join(staging, "slices.json");
    await writeFile(slicesPath, `${JSON.stringify(slices.data, null, 2)}\n`, "utf8");
    try {
      await runLegacy("download_slices", [slicesPath, "--output", path.join(staging, "assets"), "--scale", options.scale], { cookie: options.cookie, timeoutMs: options.timeoutMs });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
    const preview = (image.data as { files?: Array<{ path?: string }> })?.files?.[0]?.path;
    if (preview) await rename(preview, path.join(staging, `preview${path.extname(preview) || ".png"}`));
    const files = await inventory(staging);
    const manifest = {
      schemaVersion: 1,
      project: { url: options.url },
      design: { id: design.id, index: design.index, name: design.name },
      scale: options.scale,
      status: warnings.length ? "partial" : "success",
      files,
      warnings,
      exportedAt: new Date().toISOString(),
      cliVersion: options.version,
    };
    await writeFile(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(staging, target);
    return { status: manifest.status, output: target, design: manifest.design, files: files.length + 1, warnings };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
