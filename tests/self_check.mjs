#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  convertLanhuToHtml,
  convertSketchToHtml,
} from "../skills/lanhu-design/scripts/design-converter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillScripts = path.resolve(here, "../skills/lanhu-design/scripts");

function checkHtmlEscaping() {
  const ddsHtml = convertLanhuToHtml({
    type: "lanhutext",
    props: { className: "title" },
    data: { value: "<b>A&B</b>" },
  });
  assert.match(ddsHtml, /&lt;b&gt;A&amp;B&lt;\/b&gt;/);
  assert.doesNotMatch(ddsHtml, /<b>A&B<\/b>/);

  const sketchHtml = convertSketchToHtml({
    artboard: {
      frame: { width: 100, height: 40 },
      layers: [
        {
          type: "text",
          name: "Title",
          frame: { left: 0, top: 0, width: 100, height: 20 },
          content: "<i>Hello</i>",
        },
      ],
    },
  });
  assert.match(sketchHtml, /&lt;i&gt;Hello&lt;\/i&gt;/);
  assert.doesNotMatch(sketchHtml, /<i>Hello<\/i>/);
}

async function checkSliceDeduping() {
  process.env.LANHU_COOKIE = "self-check";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("/api/project/images")) {
      return Response.json({
        code: "00000",
        data: {
          name: "Project",
          images: [
            { id: "d1", name: "Home", width: 100, height: 100, url: "https://cdn.test/home.png" },
          ],
        },
      });
    }
    if (href.includes("/api/project/image")) {
      return Response.json({
        code: "00000",
        result: { versions: [{ id: "v1", json_url: "https://cdn.test/sketch.json" }] },
      });
    }
    if (href.includes("sketch.json")) {
      return Response.json({
        artboard: {
          name: "Artboard",
          layers: [
            {
              id: "g1",
              name: "Group",
              layers: [
                {
                  id: "s1",
                  name: "Icon",
                  type: "bitmap",
                  left: 1,
                  top: 2,
                  ddsImage: { imageUrl: "https://cdn.test/icon.png", size: "10x10" },
                },
              ],
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const { getDesignSlicesInfo } = await import("../skills/lanhu-design/scripts/lanhu-client.mjs");
    const result = await getDesignSlicesInfo(
      "https://lanhuapp.com/web/#/item/project/stage?pid=p1&tid=t1",
      "1",
    );
    assert.equal(result.total_slices, 1);
    assert.equal(result.slices[0].layer_path, "Artboard/Group/Icon");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function checkScaleFallback() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "lanhu-design-check-"));
  try {
    const sourcePath = path.join(tempDir, "source.png");
    const slicesPath = path.join(tempDir, "slices.json");
    const outDir = path.join(tempDir, "out");
    await writeFile(sourcePath, "fake-image");
    await writeFile(slicesPath, JSON.stringify({
      slices: [
        { id: "s1", name: "Icon", download_url: pathToFileURL(sourcePath).href },
      ],
    }));

    const script = path.join(skillScripts, "download_slices.mjs");
    const iosAll = spawnSync(process.execPath, [
      script,
      slicesPath,
      "--output",
      outDir,
      "--scale",
      "ios-all",
    ], { encoding: "utf8" });
    assert.notEqual(iosAll.status, 0);
    assert.match(`${iosAll.stdout}\n${iosAll.stderr}`, /scale_urls/);

    const web2x = spawnSync(process.execPath, [
      script,
      slicesPath,
      "--output",
      outDir,
      "--scale",
      "2x",
    ], { encoding: "utf8" });
    assert.equal(web2x.status, 0, web2x.stderr || web2x.stdout);
    assert.equal(await readFile(path.join(outDir, "Icon@2x.png"), "utf8"), "fake-image");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

checkHtmlEscaping();
await checkSliceDeduping();
await checkScaleFallback();
console.log("self_check passed");
