#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCALE_GROUPS = {
  "ios-all": [
    ["ios_1x", ""],
    ["ios_2x", "@2x"],
    ["ios_3x", "@3x"],
  ],
  "android-all": [
    ["android_mdpi", "mipmap-mdpi"],
    ["android_hdpi", "mipmap-hdpi"],
    ["android_xhdpi", "mipmap-xhdpi"],
    ["android_xxhdpi", "mipmap-xxhdpi"],
    ["android_xxxhdpi", "mipmap-xxxhdpi"],
  ],
};

const SINGLE_SCALE_SUFFIX = {
  "1x": "",
  "2x": "@2x",
  "3x": "@3x",
  ios_1x: "",
  ios_2x: "@2x",
  ios_3x: "@3x",
  android_mdpi: "",
  android_hdpi: "",
  android_xhdpi: "",
  android_xxhdpi: "",
  android_xxxhdpi: "",
};

function usage() {
  return `usage: node scripts/download_slices.mjs <json_file> --output <dir> [--scale 2x] [--name-map names.json] [--referer https://lanhuapp.com/] [--retries 2]

Download Lanhu design slices from lanhu_get_design_slices JSON output.`;
}

function parseArgs(argv) {
  const args = {
    jsonFile: "",
    output: "",
    scale: "2x",
    nameMap: "",
    referer: "",
    retries: 2,
  };

  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--output") {
      args.output = argv[++index] || "";
    } else if (arg === "--scale") {
      args.scale = argv[++index] || "2x";
    } else if (arg === "--name-map") {
      args.nameMap = argv[++index] || "";
    } else if (arg === "--referer") {
      args.referer = argv[++index] || "";
    } else if (arg === "--retries") {
      args.retries = Number.parseInt(argv[++index] || "2", 10);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  args.jsonFile = positionals[0] || "";
  if (!Number.isInteger(args.retries) || args.retries < 0) {
    throw new Error("--retries must be a non-negative integer.");
  }
  return args;
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function findSlices(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findSlices(item);
      if (found.length > 0) return found;
    }
    return [];
  }

  if (data && typeof data === "object") {
    if (Array.isArray(data.slices)) return data.slices;
    for (const value of Object.values(data)) {
      const found = findSlices(value);
      if (found.length > 0) return found;
    }
  }

  return [];
}

function safeStem(value, fallback) {
  const leaf = String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .at(-1);
  const cleaned = leaf
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned || fallback;
}

function extensionFromUrl(url, fallback = ".png") {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) {
      return ext;
    }
  } catch {
    const clean = String(url).split(/[?#]/, 1)[0];
    const ext = path.extname(clean).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) {
      return ext;
    }
  }
  return fallback;
}

function nameForSlice(item, index, nameMap) {
  const keys = [
    String(item.id || ""),
    String(item.layer_path || ""),
    String(item.name || ""),
  ];
  for (const key of keys) {
    if (key && Object.hasOwn(nameMap, key)) {
      return safeStem(nameMap[key], `slice_${String(index).padStart(3, "0")}`);
    }
  }
  return safeStem(
    item.name || item.layer_path || "",
    `slice_${String(index).padStart(3, "0")}`,
  );
}

function urlForScale(item, scale) {
  const scaleUrls = item.scale_urls && typeof item.scale_urls === "object"
    ? item.scale_urls
    : {};
  if (scaleUrls[scale]) return String(scaleUrls[scale]);
  if (scale === "2x" && item.download_url) return String(item.download_url);
  if (Object.keys(scaleUrls).length === 0 && item.download_url) {
    return String(item.download_url);
  }
  return "";
}

function buildTargets(item, index, scale, outputDir, nameMap) {
  const stem = nameForSlice(item, index, nameMap);
  const targets = [];

  if (Object.hasOwn(SCALE_GROUPS, scale)) {
    for (const [scaleKey, suffixOrDir] of SCALE_GROUPS[scale]) {
      const url = urlForScale(item, scaleKey);
      if (!url) continue;
      const ext = extensionFromUrl(url);
      const outputPath = scale === "android-all"
        ? path.join(outputDir, suffixOrDir, `${stem}${ext}`)
        : path.join(outputDir, `${stem}${suffixOrDir}${ext}`);
      targets.push({ url, outputPath });
    }
    return targets;
  }

  const url = urlForScale(item, scale);
  if (!url) return targets;
  const ext = extensionFromUrl(url);
  const suffix = SINGLE_SCALE_SUFFIX[scale] || "";
  targets.push({ url, outputPath: path.join(outputDir, `${stem}${suffix}${ext}`) });
  return targets;
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBuffer(url, referer) {
  if (url.startsWith("file://")) {
    return readFile(fileURLToPath(url));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const headers = { "User-Agent": "Mozilla/5.0" };
    if (referer) headers.Referer = referer;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function download(url, outputPath, referer, retries) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await writeFile(outputPath, await fetchBuffer(url, referer));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.jsonFile || !args.output) {
    console.error(usage());
    return 2;
  }

  const data = await loadJson(args.jsonFile);
  const slices = findSlices(data);
  if (slices.length === 0) {
    console.error("No slices found in JSON.");
    return 2;
  }

  const nameMap = args.nameMap ? await loadJson(args.nameMap) : {};
  if (!nameMap || typeof nameMap !== "object" || Array.isArray(nameMap)) {
    console.error("--name-map must be a JSON object.");
    return 2;
  }

  const planned = [];
  let missing = 0;
  slices.forEach((item, itemIndex) => {
    const targets = buildTargets(item, itemIndex + 1, args.scale, args.output, nameMap);
    if (targets.length === 0) {
      missing += 1;
      return;
    }
    const label = String(item.layer_path || item.name || item.id || itemIndex + 1);
    for (const target of targets) {
      planned.push({ ...target, label });
    }
  });

  const failures = [];
  for (let index = 0; index < planned.length; index += 1) {
    const item = planned[index];
    try {
      await download(item.url, item.outputPath, args.referer, args.retries);
      console.log(`[${index + 1}/${planned.length}] OK ${item.outputPath}`);
    } catch (error) {
      failures.push(`${item.label} -> ${item.outputPath}: ${error.message}`);
      console.error(`[${index + 1}/${planned.length}] FAIL ${item.outputPath}`);
    }
  }

  console.log(JSON.stringify({
    slices: slices.length,
    planned_files: planned.length,
    downloaded: planned.length - failures.length,
    missing_url: missing,
    failed: failures.length,
    output: args.output,
  }, null, 2));

  if (failures.length > 0) {
    console.error("Failures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
