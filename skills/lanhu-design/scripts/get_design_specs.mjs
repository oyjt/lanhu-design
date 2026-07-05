#!/usr/bin/env node

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDesignSchema, downloadFile } from "./lanhu-client.mjs";
import {
  convertLanhuToHtml,
  convertSketchToHtml,
  extractDesignTokens,
  extractFullAnnotationsFromSketch,
  minifyHtml,
  localizeImageUrls,
} from "./design-converter.mjs";

function usage() {
  return `usage: node scripts/get_design_specs.mjs <lanhu_url> --design <name_or_index> [--output <dir>] [--no-minify] [--download-images] [--referer <url>]

输出包含精确 HTML+CSS 规格的 JSON，可直接用于设计还原。
指定 --output 且加 --download-images 时，自动把 HTML 引用的图片下载到 <dir>/assets/slices/，使 HTML 可直接渲染。

示例:
  node scripts/get_design_specs.mjs "https://lanhuapp.com/..." --design "首页设计"
  node scripts/get_design_specs.mjs "https://lanhuapp.com/..." --design 1 --output ./tmp/specs --download-images`;
}

const argv = process.argv.slice(2);
let url = "";
let designArg = "";
let outputDir = "";
let doMinify = true;
let downloadImages = false;
let referer = "";

const positionals = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "-h" || arg === "--help") { console.log(usage()); process.exit(0); }
  else if (arg === "--design") { designArg = argv[++i] || ""; }
  else if (arg === "--output") { outputDir = argv[++i] || ""; }
  else if (arg === "--no-minify") { doMinify = false; }
  else if (arg === "--download-images") { downloadImages = true; }
  else if (arg === "--referer") { referer = argv[++i] || ""; }
  else if (arg.startsWith("--")) { console.error(`未知参数: ${arg}`); process.exit(2); }
  else positionals.push(arg);
}

url = positionals[0] || "";

if (!url || !designArg) {
  console.error(usage());
  process.exit(2);
}

try {
  const { schema, sketchData, design, source, ddsError, designImageUrl, canvasSize } =
    await getDesignSchema(url, designArg);

  let html, imageUrlMapping;

  if (source === "dds" && schema) {
    const rawHtml = convertLanhuToHtml(schema);
    const minified = doMinify ? minifyHtml(rawHtml) : rawHtml;
    const localized = localizeImageUrls(minified, design.name);
    html = localized.html;
    imageUrlMapping = localized.mapping;
  } else {
    const scale = canvasSize.width > 750 ? 2 : 1;
    const rawHtml = convertSketchToHtml(sketchData, scale, designImageUrl);
    const minified = doMinify ? minifyHtml(rawHtml) : rawHtml;
    const localized = localizeImageUrls(minified, design.name);
    html = localized.html;
    imageUrlMapping = localized.mapping;
  }

  const designTokens = extractDesignTokens(sketchData);
  const sketchAnnotations = source === "sketch"
    ? extractFullAnnotationsFromSketch(sketchData, canvasSize.width > 750 ? 2 : 1)
    : "";

  // P2：把数据权威性指引直接写给 AI，避免它误把降级 HTML 当权威。
  const sourceGuidance = source === "dds"
    ? "source=dds（高保真）：html 字段是布局结构和所有 CSS 数值的权威来源，直接复用、不得主观修改；design_tokens 补充渐变/阴影/非均匀圆角等；原图仅用于核对布局是否错位。"
    : "source=sketch（降级，DDS Schema 不可用）：html 仅为绝对定位的元素清单，不能当作布局权威。请以设计图原图为布局结构的主力参考，以 design_tokens / sketch_annotations 的原始数值为精确数值来源。强烈建议先下载并 Read 原图再还原。";

  const result = {
    status: "success",
    source,
    source_guidance: sourceGuidance,
    design_name: design.name,
    canvas_size: canvasSize,
    html,
    design_tokens: designTokens || null,
    sketch_annotations: sketchAnnotations || null,
    image_url_mapping: imageUrlMapping,
    total_images: Object.keys(imageUrlMapping).length,
    dds_error: ddsError || null,
  };

  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const safeName = design.name.replace(/[^A-Za-z0-9一-鿿._-]+/g, "_").replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "") || "design";
    const jsonPath = path.join(outputDir, `${safeName}_specs.json`);
    const htmlPath = path.join(outputDir, `${safeName}.html`);
    await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf8");
    await writeFile(htmlPath, doMinify ? minifyHtml(html) : html, "utf8");
    console.error(`已保存规格 JSON: ${jsonPath}`);
    console.error(`已保存 HTML: ${htmlPath}`);

    // P3：把 HTML 引用的远程图片下载到本地，使保存的 HTML 可直接渲染。
    if (downloadImages) {
      const entries = Object.entries(imageUrlMapping);
      const ref = referer || "https://lanhuapp.com/";
      let ok = 0;
      const failed = [];
      for (const [localPath, remoteUrl] of entries) {
        // localPath 形如 "./assets/slices/x.png"，相对 HTML 所在目录解析。
        const dest = path.resolve(outputDir, localPath);
        try {
          await downloadFile(remoteUrl, dest, ref);
          ok += 1;
        } catch (err) {
          failed.push(`${localPath}: ${err.message}`);
        }
      }
      result.images_downloaded = ok;
      result.images_failed = failed;
      console.error(`已下载图片: ${ok}/${entries.length}` + (failed.length ? `，失败 ${failed.length}` : ""));
      for (const f of failed) console.error(`  下载失败 ${f}`);
      // 回写带下载结果的 JSON。
      await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf8");
    }
  } else if (downloadImages) {
    console.error("提示：--download-images 需要配合 --output 使用，已忽略。");
  }

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "error", message: error.message }));
  process.exit(1);
}
