#!/usr/bin/env node

import { getDesigns } from "./lanhu-client.mjs";

const url = process.argv[2];
if (!url) {
  console.error(
    "usage: node scripts/get_designs.mjs <lanhu_url>\n\n" +
      '示例: node scripts/get_designs.mjs "https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx"',
  );
  process.exit(2);
}

try {
  const result = await getDesigns(url);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "success") process.exit(1);
} catch (error) {
  console.error(JSON.stringify({ status: "error", message: error.message }));
  process.exit(1);
}
