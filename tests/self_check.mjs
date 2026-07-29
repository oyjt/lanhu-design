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
  detectDesignScale,
  extractFullAnnotationsFromSketch,
  extractLayerAnnotationsFromSketch,
  localizeImageUrls,
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
  assert.match(sketchHtml, /data-css="position: absolute;/);
  assert.match(sketchHtml, /title="Title"/);
}

function checkSketchAnnotations() {
  const sketchData = {
    device: "iPhone @3x",
    artboard: {
      frame: { width: 1125, height: 2001 },
      layers: [
        {
          type: "text",
          name: "Title",
          frame: { left: 30, top: 60, width: 300, height: 60 },
          text: { value: "Hello", style: { font: { size: 48 }, color: { value: "rgba(1,2,3,1)" } } },
        },
        {
          type: "bitmap",
          name: "Hero",
          frame: { left: 0, top: 0, width: 600, height: 300 },
          image: { imageUrl: "https://cdn.test/hero.png" },
        },
        {
          type: "shape",
          name: "Card",
          frame: { left: 15, top: 150, width: 330, height: 120 },
          style: { fills: [{ type: "color", color: { value: "rgba(255,255,255,1)" } }] },
        },
      ],
    },
  };
  assert.equal(detectDesignScale(sketchData, { width: 375, height: 667 }), 3);
  const annotations = extractLayerAnnotationsFromSketch(sketchData, 3);
  assert.equal(annotations.length, 3);
  assert.equal(annotations[0].path, "Title");
  assert.equal(annotations[0].text, "Hello");
  assert.equal(annotations[1].src, "https://cdn.test/hero.png");
  const summary = extractFullAnnotationsFromSketch(sketchData, 3);
  assert.match(summary, /设计标注摘要 scale=@3x total=3/);
  assert.match(summary, /文本图层 \(1\)/);
  assert.match(summary, /图片\/切图图层 \(1\)/);
  assert.match(summary, /形状\/普通图层 \(1\)/);
}

function checkImageLocalization() {
  const { html, mapping } = localizeImageUrls(
    '<style>.hero { background-image: url("https://cdn.test/bg.png?token=1"); }</style>' +
      '<img class="icon_main" src="https://cdn.test/icon.svg?token=2" />',
    "首页",
  );
  assert.doesNotMatch(html, /https:\/\/cdn\.test/);
  assert.match(html, /url\("\.\/assets\/slices\/hero\.png"\)/);
  assert.match(html, /src="\.\/assets\/slices\/icon_main\.svg"/);
  assert.equal(mapping["./assets/slices/hero.png"], "https://cdn.test/bg.png?token=1");
  assert.equal(mapping["./assets/slices/icon_main.svg"], "https://cdn.test/icon.svg?token=2");
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
              fills: [
                {
                  type: "image",
                  image: { imageUrl: "https://cdn.test/not-a-slice.png", size: { width: 20, height: 20 } },
                },
              ],
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
    assert.equal(result.slices[0].scale_urls["2x"], "https://cdn.test/icon.png");
    assert.match(result.slices[0].scale_urls["1x"], /w_10,h_10/);
    assert.deepEqual(result.slices[0].logical_size.width, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function checkPhotoshopSlices() {
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
            { id: "d1", name: "PS Page", width: 750, height: 1334, url: "https://cdn.test/ps.png" },
          ],
        },
      });
    }
    if (href.includes("/api/project/image")) {
      return Response.json({
        code: "00000",
        result: { versions: [{ id: "v1", json_url: "https://cdn.test/ps.json" }] },
      });
    }
    if (href.includes("ps.json")) {
      return Response.json({
        type: "ps",
        board: {
          layers: [
            {
              id: "L1",
              name: "btn_bg",
              type: "layer",
              left: 10,
              top: 20,
              width: 200,
              height: 80,
              images: { png_xxxhd: "https://cdn.test/btn.png", svg: "https://cdn.test/btn.svg" },
            },
            {
              id: "L2",
              name: "not_exported",
              width: 100,
              height: 100,
              images: { png_xxxhd: "https://cdn.test/skip.png" },
            },
          ],
        },
        assets: [
          { id: "L1", name: "btn_bg", isAsset: true, scaleType: 2 },
          { id: "L2" },
          { id: "L3", isSlice: true },
        ],
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
    const slice = result.slices[0];
    assert.equal(slice.id, "L1");
    assert.equal(slice.download_url, "https://cdn.test/btn.png");
    assert.equal(slice.svg_url, "https://cdn.test/btn.svg");
    assert.equal(slice.size, "200x80");
    assert.deepEqual(slice.position, { x: 10, y: 20 });
    assert.equal(slice.metadata.source, "photoshop");
    assert.match(slice.scale_urls["2x"], /w_200,h_80/);
    assert.match(slice.scale_urls["1x"], /w_100,h_40/);
    assert.match(slice.scale_urls["3x"], /w_300,h_120/);
    assert.match(slice.scale_urls.android_hdpi, /w_150,h_60/);
    assert.equal(slice.logical_size.width, 100);
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
checkSketchAnnotations();
checkImageLocalization();
await checkSliceDeduping();
await checkPhotoshopSlices();
await checkScaleFallback();
console.log("self_check passed");
