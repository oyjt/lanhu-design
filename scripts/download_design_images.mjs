#!/usr/bin/env node

import path from "node:path";
import { getDesigns, getDesignImageUrl, downloadFile } from "./lanhu-client.mjs";

function usage() {
  return (
    'usage: node scripts/download_design_images.mjs <lanhu_url> --designs <names> --output <dir>\n\n' +
    '示例:\n' +
    '  node scripts/download_design_images.mjs "https://lanhuapp.com/..." --designs "1,2,3" --output ./tmp/designs\n' +
    '  node scripts/download_design_images.mjs "https://lanhuapp.com/..." --designs all --output ./designs\n' +
    '  node scripts/download_design_images.mjs "https://lanhuapp.com/..." --designs "首页设计" --output ./designs'
  );
}

const args = process.argv.slice(2);
let url = "";
let designsArg = "";
let outputDir = "";

const positionals = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    console.log(usage());
    process.exit(0);
  } else if (arg === "--designs") {
    designsArg = args[++i] || "";
  } else if (arg === "--output") {
    outputDir = args[++i] || "";
  } else if (!arg.startsWith("--")) {
    positionals.push(arg);
  } else {
    console.error(`未知参数: ${arg}`);
    process.exit(2);
  }
}

url = positionals[0] || "";

if (!url || !designsArg || !outputDir) {
  console.error(usage());
  process.exit(2);
}

function safeName(name) {
  return name
    .replace(/[^A-Za-z0-9一-鿿._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    || "design";
}

function extensionFromUrl(imgUrl, fallback = ".png") {
  try {
    const parsed = new URL(imgUrl);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return ext;
  } catch { /* ignore */ }
  return fallback;
}

try {
  const designsResult = await getDesigns(url);
  if (designsResult.status !== "success") {
    console.error(JSON.stringify(designsResult));
    process.exit(1);
  }

  const allDesigns = designsResult.designs;
  let targets;

  if (designsArg.toLowerCase() === "all") {
    targets = allDesigns;
  } else {
    const selectors = designsArg.split(",").map((s) => s.trim()).filter(Boolean);
    targets = [];
    for (const sel of selectors) {
      const asNum = Number(sel);
      if (Number.isInteger(asNum) && asNum >= 1 && asNum <= allDesigns.length) {
        targets.push(allDesigns[asNum - 1]);
        continue;
      }
      const exact = allDesigns.find((d) => d.name === sel);
      if (exact) {
        targets.push(exact);
        continue;
      }
      const partial = allDesigns.filter((d) => d.name.includes(sel));
      if (partial.length === 1) {
        targets.push(partial[0]);
      } else if (partial.length > 1) {
        console.error(
          `"${sel}" 匹配到多个设计图：${partial.map((d) => d.name).join(", ")}`,
        );
        process.exit(1);
      } else {
        console.error(
          `未找到设计图 "${sel}"。可用：${allDesigns.map((d) => `${d.index}. ${d.name}`).join(", ")}`,
        );
        process.exit(1);
      }
    }
  }

  if (targets.length === 0) {
    console.error("没有匹配到任何设计图。");
    process.exit(1);
  }

  const downloaded = [];
  const failed = [];

  for (const design of targets) {
    const imageUrl = getDesignImageUrl(design);
    if (!imageUrl) {
      failed.push({ name: design.name, reason: "无图片 URL" });
      continue;
    }
    const ext = extensionFromUrl(imageUrl);
    const filename = `${safeName(design.name)}${ext}`;
    const outputPath = path.join(outputDir, filename);
    try {
      await downloadFile(imageUrl, outputPath);
      downloaded.push({ name: design.name, path: outputPath });
      console.log(`OK ${outputPath}`);
    } catch (error) {
      failed.push({ name: design.name, reason: error.message });
      console.error(`FAIL ${design.name}: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        total: targets.length,
        downloaded: downloaded.length,
        failed: failed.length,
        files: downloaded,
        failures: failed,
        output: outputDir,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) process.exit(1);
} catch (error) {
  console.error(JSON.stringify({ status: "error", message: error.message }));
  process.exit(1);
}
