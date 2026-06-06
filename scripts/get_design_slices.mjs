#!/usr/bin/env node

import { getDesignSlicesInfo } from "./lanhu-client.mjs";

function usage() {
  return (
    'usage: node scripts/get_design_slices.mjs <lanhu_url> --design <name_or_index> [--no-metadata]\n\n' +
    '示例:\n' +
    '  node scripts/get_design_slices.mjs "https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx" --design "首页设计"\n' +
    '  node scripts/get_design_slices.mjs "https://lanhuapp.com/..." --design 1\n' +
    '  node scripts/get_design_slices.mjs "https://lanhuapp.com/..." --design "首页" --no-metadata'
  );
}

const args = process.argv.slice(2);
let url = "";
let designName = "";
let includeMetadata = true;

const positionals = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    console.log(usage());
    process.exit(0);
  } else if (arg === "--design") {
    designName = args[++i] || "";
  } else if (arg === "--no-metadata") {
    includeMetadata = false;
  } else if (!arg.startsWith("--")) {
    positionals.push(arg);
  } else {
    console.error(`未知参数: ${arg}`);
    process.exit(2);
  }
}

url = positionals[0] || "";

if (!url || !designName) {
  console.error(usage());
  process.exit(2);
}

try {
  const result = await getDesignSlicesInfo(url, designName, includeMetadata);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "success") process.exit(1);
} catch (error) {
  console.error(JSON.stringify({ status: "error", message: error.message }));
  process.exit(1);
}
