#!/usr/bin/env node

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://lanhuapp.com";
const DDS_BASE_URL = "https://dds.lanhuapp.com";
const HTTP_TIMEOUT = Number(process.env.HTTP_TIMEOUT) || 30_000;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Referer: "https://lanhuapp.com/web/",
  Accept: "application/json, text/plain, */*",
  "sec-ch-ua":
    '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "request-from": "web",
  "real-path": "/item/project/product",
};

function getCookie() {
  const cookie = process.env.LANHU_COOKIE;
  if (!cookie || cookie === "your_lanhu_cookie_here") {
    throw new Error(
      "LANHU_COOKIE 环境变量未设置。请登录 lanhuapp.com，打开 DevTools > Network，复制任意请求的 Cookie 头，设置为 LANHU_COOKIE 环境变量。",
    );
  }
  return cookie;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { ...HEADERS, Cookie: getCookie(), ...options.headers },
      redirect: "follow",
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `认证失败 (HTTP ${response.status})。LANHU_COOKIE 可能已过期，请重新获取。`,
      );
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(url, options) {
  const response = await request(url, options);
  return response.json();
}

async function requestDdsJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": HEADERS["User-Agent"],
        "Authorization": "Basic dW5kZWZpbmVkOg==",
        "Referer": `${DDS_BASE_URL}/`,
        "Accept": "application/json, text/plain, */*",
        "Cookie": getCookie(),
      },
      redirect: "follow",
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`DDS 认证失败 (HTTP ${response.status})。LANHU_COOKIE 可能已过期。`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getVersionId(url, designId) {
  const params = parseUrl(url);
  const qs = new URLSearchParams({
    project_id: params.project_id,
    img_limit: "500",
    detach: "1",
  });
  if (params.team_id) qs.set("team_id", params.team_id);
  const data = await requestJson(`${BASE_URL}/api/project/multi_info?${qs}`);
  if (data.code !== "00000") throw new Error(`multi_info 失败: ${data.msg}`);
  const images = (data.data || {}).images || [];
  const img = images.find(i => String(i.id) === String(designId));
  if (!img) throw new Error(`multi_info 中未找到 design id=${designId}`);
  const versionId = img.latest_version || img.version_id;
  if (!versionId) throw new Error(`design id=${designId} 没有 latest_version 字段`);
  return String(versionId);
}

export async function getDdsSchema(versionId) {
  const qs = new URLSearchParams({ version_id: versionId });
  const data = await requestDdsJson(`${DDS_BASE_URL}/api/dds/image/store_schema_revise?${qs}`);
  if (data.code !== "00000" && data.code !== 0) {
    throw new Error(`store_schema_revise 失败 (code=${data.code}): ${data.msg || data.message || ""}`);
  }
  const resourceUrl = (data.data || {}).data_resource_url;
  if (!resourceUrl) throw new Error("store_schema_revise 未返回 data_resource_url");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const resp = await fetch(resourceUrl, { signal: controller.signal });
    if (!resp.ok) throw new Error(`Schema CDN HTTP ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDesignSchema(url, designName) {
  const designsResult = await getDesigns(url);
  if (designsResult.status !== "success") throw new Error(designsResult.message || "getDesigns 失败");
  const design = matchDesign(designsResult.designs, designName);

  const params = parseUrl(url);
  const qs = new URLSearchParams({ dds_status: "1", image_id: design.id, project_id: params.project_id });
  if (params.team_id) qs.set("team_id", params.team_id);
  const imgData = await requestJson(`${BASE_URL}/api/project/image?${qs}`);
  if (imgData.code !== "00000") throw new Error(`获取设计图详情失败: ${imgData.msg}`);
  const latestVersion = (imgData.result.versions || [])[0];
  if (!latestVersion) throw new Error("设计图没有版本信息");
  const sketchData = await requestJson(latestVersion.json_url);
  const designImageUrl = getDesignImageUrl(design);

  let schema = null, ddsError = null;
  try {
    const versionId = await getVersionId(url, design.id);
    schema = await getDdsSchema(versionId);
  } catch (err) {
    ddsError = err.message;
  }

  return {
    schema,
    sketchData,
    design,
    source: schema ? "dds" : "sketch",
    ddsError,
    designImageUrl,
    canvasSize: { width: design.width, height: design.height },
  };
}

export function parseUrl(url) {
  let paramStr = url;

  if (url.startsWith("http")) {
    const hashIdx = url.indexOf("#");
    if (hashIdx === -1) {
      throw new Error("无效的蓝湖 URL：缺少 # fragment 部分");
    }
    const fragment = url.slice(hashIdx + 1);
    const qIdx = fragment.indexOf("?");
    paramStr = qIdx !== -1 ? fragment.slice(qIdx + 1) : fragment;
  }

  if (paramStr.startsWith("?")) {
    paramStr = paramStr.slice(1);
  }

  const params = {};
  for (const part of paramStr.split("&")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx !== -1) {
      params[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
    }
  }

  const project_id = params.pid;
  const team_id = params.tid;
  const doc_id = params.docId || params.image_id;
  const version_id = params.versionId;

  if (!project_id) {
    throw new Error("URL 解析失败：缺少必需参数 pid (project_id)");
  }

  return { team_id, project_id, doc_id, version_id };
}

export async function getDesigns(url) {
  const params = parseUrl(url);
  const qs = new URLSearchParams({
    project_id: params.project_id,
    dds_status: "1",
    position: "1",
    show_cb_src: "1",
    comment: "1",
  });
  if (params.team_id) qs.set("team_id", params.team_id);

  const data = await requestJson(`${BASE_URL}/api/project/images?${qs}`);

  if (data.code !== "00000") {
    return { status: "error", message: data.msg || "Unknown error" };
  }

  const projectData = data.data || {};
  const images = projectData.images || [];

  const designs = images.map((img, idx) => ({
    index: idx + 1,
    id: img.id,
    name: img.name,
    width: img.width,
    height: img.height,
    url: img.url,
    has_comment: img.has_comment || false,
    update_time: img.update_time,
  }));

  return {
    status: "success",
    project_name: projectData.name,
    total_designs: designs.length,
    designs,
  };
}

function matchDesign(designs, nameOrIndex) {
  const trimmed = String(nameOrIndex).trim();
  const asNum = Number(trimmed);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= designs.length) {
    return designs[asNum - 1];
  }
  const exact = designs.find((d) => d.name === trimmed);
  if (exact) return exact;
  const partial = designs.filter((d) => d.name.includes(trimmed));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      `"${trimmed}" 匹配到多个设计图：${partial.map((d) => d.name).join(", ")}。请使用精确名称或索引。`,
    );
  }
  throw new Error(
    `未找到设计图 "${trimmed}"。可用设计图：${designs.map((d) => `${d.index}. ${d.name}`).join(", ")}`,
  );
}

function jsRound(value) {
  return Math.floor(Number(value) + 0.5);
}

function parseSize(size) {
  if (!size) return { width: 0, height: 0 };
  if (typeof size === "object") {
    return {
      width: Number(size.width || size.w || 0),
      height: Number(size.height || size.h || 0),
    };
  }
  const match = String(size).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  return match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : { width: 0, height: 0 };
}

function frameSize(obj) {
  const frame = obj.frame || obj.bounds || {};
  return {
    width: Number(frame.width || obj.width || 0),
    height: Number(frame.height || obj.height || 0),
  };
}

function resizeUrl(imageUrl, width, height, storedWidth, storedHeight) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w === storedWidth && h === storedHeight) return imageUrl;
  const separator = imageUrl.includes("?") ? "&" : "?";
  return `${imageUrl}${separator}x-oss-process=image/resize,w_${w},h_${h}/format,png`;
}

function buildScaleUrls(imageUrl, logicalWidth, logicalHeight, sliceScale) {
  if (!imageUrl || !logicalWidth || !logicalHeight) return {};
  const scale = Number(sliceScale) || 2;
  const lw = Math.max(1, Math.round(logicalWidth));
  const lh = Math.max(1, Math.round(logicalHeight));
  const storedWidth = lw * scale;
  const storedHeight = lh * scale;
  const makeUrl = (width, height) => resizeUrl(imageUrl, width, height, storedWidth, storedHeight);

  return {
    "1x": makeUrl(lw, lh),
    "2x": makeUrl(lw * 2, lh * 2),
    "3x": makeUrl(lw * 3, lh * 3),
    ios_1x: makeUrl(jsRound(storedWidth / 4), jsRound(storedHeight / 4)),
    ios_2x: makeUrl(jsRound(storedWidth / 2), jsRound(storedHeight / 2)),
    ios_3x: makeUrl(jsRound((storedWidth / 4) * 3), jsRound((storedHeight / 4) * 3)),
    android_mdpi: makeUrl(jsRound(storedWidth / 4), jsRound(storedHeight / 4)),
    android_hdpi: makeUrl(jsRound((storedWidth / 4) * 1.5), jsRound((storedHeight / 4) * 1.5)),
    android_xhdpi: makeUrl(jsRound(storedWidth / 2), jsRound(storedHeight / 2)),
    android_xxhdpi: makeUrl(jsRound((storedWidth / 4) * 3), jsRound((storedHeight / 4) * 3)),
    android_xxxhdpi: makeUrl(storedWidth, storedHeight),
  };
}

function addScaleUrls(sliceInfo, imageUrl, logicalSize, sliceScale) {
  const { width, height } = logicalSize;
  if (!imageUrl || !width || !height) return;
  sliceInfo.scale_urls = buildScaleUrls(imageUrl, width, height, sliceScale);
  sliceInfo.logical_size = {
    width: Math.round(width),
    height: Math.round(height),
    note: `1x logical px; stored at ${sliceScale}x = ${Math.round(width * sliceScale)}x${Math.round(height * sliceScale)}px`,
  };
}

// Photoshop：蓝湖在根节点 type=ps，导出资源登记在 assets[]（老数据标 isSlice，新数据可能只标 isAsset），
// 实际 PNG/SVG 地址在对应 id 图层的 images.png_xxxhd / images.svg。
// PS 稿 layer.width/height 是蓝湖切图面板的 @2x 像素尺寸（即 iOS @2x / Android xhdpi）。
function buildPsScaleUrls(imageUrl, baseWidth, baseHeight) {
  if (!imageUrl || !baseWidth || !baseHeight) return {};
  const bw = Math.max(1, Math.round(baseWidth));
  const bh = Math.max(1, Math.round(baseHeight));
  const makeUrl = (w, h) =>
    `${imageUrl}?x-oss-process=image/resize,w_${Math.max(1, w)},h_${Math.max(1, h)}/format,png`;
  const oneW = bw / 2;
  const oneH = bh / 2;
  return {
    "1x": makeUrl(Math.round(oneW), Math.round(oneH)),
    "2x": makeUrl(bw, bh),
    "3x": makeUrl(Math.round(oneW * 3), Math.round(oneH * 3)),
    ios_1x: makeUrl(Math.round(oneW), Math.round(oneH)),
    ios_2x: makeUrl(bw, bh),
    ios_3x: makeUrl(Math.round(oneW * 3), Math.round(oneH * 3)),
    android_mdpi: makeUrl(Math.round(oneW), Math.round(oneH)),
    android_hdpi: makeUrl(Math.round(oneW * 1.5), Math.round(oneH * 1.5)),
    android_xhdpi: makeUrl(bw, bh),
    android_xxhdpi: makeUrl(Math.round(oneW * 3), Math.round(oneH * 3)),
    android_xxxhdpi: makeUrl(Math.round(oneW * 4), Math.round(oneH * 4)),
  };
}

function extractPhotoshopSlices(sketchData, slices, seenSlices, includeMetadata) {
  if (String(sketchData.type || "").toLowerCase() !== "ps") return;
  if (!Array.isArray(sketchData.assets)) return;

  const byId = new Map();
  (function indexPs(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    if (obj.id != null) byId.set(obj.id, obj);
    for (const key of ["layers", "children"]) {
      for (const child of obj[key] || []) indexPs(child);
    }
  })(sketchData.board);
  for (const section of sketchData.info || []) indexPs(section);

  for (const asset of sketchData.assets) {
    if (!asset || typeof asset !== "object") continue;
    const lid = asset.id;
    if (lid == null || seenSlices.has(`id:${lid}`)) continue;
    const layer = byId.get(lid);
    if (!layer) continue;
    if (!(asset.isSlice || asset.isAsset || layer.isSlice || layer.isAsset)) continue;
    const imgs = layer.images || {};
    const downloadUrl = imgs.png_xxxhd || imgs.svg;
    if (!downloadUrl) continue;

    let baseW = Number(layer.width) || 0;
    let baseH = Number(layer.height) || 0;
    if (baseW <= 0 || baseH <= 0) {
      const bb = asset.bounds || {};
      baseW = Number(bb.right || 0) - Number(bb.left || 0);
      baseH = Number(bb.bottom || 0) - Number(bb.top || 0);
    }
    if (baseW <= 0 || baseH <= 0) continue;

    const displayName = asset.name || layer.name || "slice";
    const sliceInfo = {
      id: lid,
      name: displayName,
      type: layer.type || "ps-slice",
      download_url: downloadUrl,
      size: `${Math.round(baseW)}x${Math.round(baseH)}`,
      format: imgs.png_xxxhd ? "png" : "svg",
    };
    if (imgs.png_xxxhd && imgs.svg) sliceInfo.svg_url = imgs.svg;
    if ("left" in layer && "top" in layer) {
      sliceInfo.position = {
        x: Math.round(Number(layer.left) || 0),
        y: Math.round(Number(layer.top) || 0),
      };
    }
    sliceInfo.layer_path = displayName;

    if (includeMetadata) {
      const metadata = { source: "photoshop", asset_id: lid };
      if (asset.scaleType != null) metadata.scaleType = asset.scaleType;
      sliceInfo.metadata = metadata;
    }

    if (imgs.png_xxxhd) {
      sliceInfo.scale_urls = buildPsScaleUrls(downloadUrl, baseW, baseH);
      sliceInfo.logical_size = {
        width: Math.round(baseW / 2),
        height: Math.round(baseH / 2),
        note: "1x logical px; PS slice base px equals iOS @2x / Android xhdpi",
      };
    }

    seenSlices.add(`id:${lid}`);
    slices.push(sliceInfo);
  }
}

export async function getDesignSlicesInfo(
  url,
  designName,
  includeMetadata = true,
) {
  const designsResult = await getDesigns(url);
  if (designsResult.status !== "success") {
    return designsResult;
  }

  const design = matchDesign(designsResult.designs, designName);
  const params = parseUrl(url);

  const qs = new URLSearchParams({
    dds_status: "1",
    image_id: design.id,
    project_id: params.project_id,
  });
  if (params.team_id) qs.set("team_id", params.team_id);

  const data = await requestJson(`${BASE_URL}/api/project/image?${qs}`);

  if (data.code !== "00000") {
    throw new Error(`获取设计图详情失败: ${data.msg}`);
  }

  const result = data.result;
  const latestVersion = result.versions[0];
  const jsonUrl = latestVersion.json_url;

  const sketchData = await requestJson(jsonUrl);
  const meta = sketchData.meta || {};
  const sliceScale = Number.parseInt(
    sketchData.sliceScale || sketchData.exportScale || meta.sliceScale || "2",
    10,
  ) || 2;
  const hostName = (meta.host || {}).name || "";
  const isFigma =
    hostName.toLowerCase() === "figma" ||
    String(sketchData.artboard?.origin || "").toLowerCase() === "figma";

  const slices = [];
  const seenSlices = new Set();

  function findDdsImages(obj, parentName = "", layerPath = "") {
    if (!obj || typeof obj !== "object") return;

    const currentName = obj.name || "";
    const currentPath = layerPath
      ? `${layerPath}/${currentName}`
      : currentName;

    const looksLikeLayer =
      obj.hasExportImage ||
      obj.layerType ||
      obj.ddsType ||
      obj.id ||
      obj.name ||
      obj.frame ||
      obj.bounds ||
      "left" in obj ||
      "top" in obj ||
      "width" in obj ||
      "height" in obj;
    if (looksLikeLayer && obj.image && (obj.image.imageUrl || obj.image.svgUrl)) {
      if (isFigma && !obj.hasExportImage) {
        // Figma 图片填充层不是切图，继续递归子层。
      } else {
        const image = obj.image;
        const downloadUrl = image.imageUrl || image.svgUrl;
        const parsedSize = parseSize(image.size);
        const fallbackSize = frameSize(obj);
        const logicalSize = {
          width: parsedSize.width || fallbackSize.width,
          height: parsedSize.height || fallbackSize.height,
        };
        const sizeText = logicalSize.width && logicalSize.height
          ? `${Math.round(logicalSize.width)}x${Math.round(logicalSize.height)}`
          : "unknown";
        const sliceInfo = {
          id: obj.id,
          name: currentName,
          type: obj.type || obj.layerType || "bitmap",
          download_url: downloadUrl,
          size: sizeText,
          format: image.imageUrl ? "png" : "svg",
        };

        if (image.svgUrl && image.imageUrl) sliceInfo.svg_url = image.svgUrl;
        if (image.imageUrl) addScaleUrls(sliceInfo, image.imageUrl, logicalSize, sliceScale);

        const frame = obj.frame || obj.bounds || {};
        const x = frame.x ?? frame.left ?? obj.left;
        const y = frame.y ?? frame.top ?? obj.top;
        if (x !== undefined || y !== undefined) {
          sliceInfo.position = {
            x: Math.round(Number(x) || 0),
            y: Math.round(Number(y) || 0),
          };
        }

        if (parentName) sliceInfo.parent_name = parentName;
        sliceInfo.layer_path = currentPath;

        if (includeMetadata) {
          const metadata = {};
          if (obj.fills) metadata.fills = obj.fills;
          if (obj.borders || obj.strokes) metadata.borders = obj.borders || obj.strokes;
          if ("opacity" in obj) metadata.opacity = obj.opacity;
          if (obj.rotation) metadata.rotation = obj.rotation;
          if (obj.textStyle) metadata.text_style = obj.textStyle;
          if (obj.shadows) metadata.shadows = obj.shadows;
          if (obj.radius || obj.cornerRadius) metadata.border_radius = obj.radius || obj.cornerRadius;
          if (Object.keys(metadata).length > 0) sliceInfo.metadata = metadata;
        }

        const sliceKey = obj.id ? `id:${obj.id}` : `${downloadUrl}|${currentPath}`;
        if (!seenSlices.has(sliceKey)) {
          seenSlices.add(sliceKey);
          slices.push(sliceInfo);
        }
      }
    } else if (obj.ddsImage && obj.ddsImage.imageUrl && !isFigma) {
      const parsedSize = parseSize(obj.ddsImage.size);
      const fallbackSize = frameSize(obj);
      const logicalSize = {
        width: parsedSize.width || fallbackSize.width,
        height: parsedSize.height || fallbackSize.height,
      };
      const sizeText = logicalSize.width && logicalSize.height
        ? `${Math.round(logicalSize.width)}x${Math.round(logicalSize.height)}`
        : String(obj.ddsImage.size || "unknown");
      const sliceInfo = {
        id: obj.id,
        name: currentName,
        type: obj.type || obj.ddsType,
        download_url: obj.ddsImage.imageUrl,
        size: sizeText,
        format: "png",
      };
      addScaleUrls(sliceInfo, obj.ddsImage.imageUrl, logicalSize, sliceScale);

      if ("left" in obj && "top" in obj) {
        sliceInfo.position = {
          x: Math.round(Number(obj.left) || 0),
          y: Math.round(Number(obj.top) || 0),
        };
      }

      if (parentName) sliceInfo.parent_name = parentName;
      sliceInfo.layer_path = currentPath;

      if (includeMetadata) {
        const metadata = {};
        if (obj.fills) metadata.fills = obj.fills;
        if (obj.borders) metadata.borders = obj.borders;
        if ("opacity" in obj) metadata.opacity = obj.opacity;
        if (obj.rotation) metadata.rotation = obj.rotation;
        if (obj.textStyle) metadata.text_style = obj.textStyle;
        if (obj.shadows) metadata.shadows = obj.shadows;
        if (obj.radius) metadata.border_radius = obj.radius;
        if (Object.keys(metadata).length > 0) sliceInfo.metadata = metadata;
      }

      const sliceKey = obj.id
        ? `id:${obj.id}`
        : `${obj.ddsImage.imageUrl}|${currentPath}`;
      if (!seenSlices.has(sliceKey)) {
        seenSlices.add(sliceKey);
        slices.push(sliceInfo);
      }
    }

    if (Array.isArray(obj.layers)) {
      for (const layer of obj.layers) {
        findDdsImages(layer, currentName, currentPath);
      }
    }

    for (const value of Object.values(obj)) {
      if (value === obj.layers || value === obj.ddsImage || value === obj.image) continue;
      if (typeof value === "object" && value !== null && value !== obj) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === "object" && item !== null) {
              findDdsImages(item, parentName, layerPath);
            }
          }
        } else if (value !== obj.layers) {
          findDdsImages(value, parentName, layerPath);
        }
      }
    }
  }

  findDdsImages(sketchData);
  extractPhotoshopSlices(sketchData, slices, seenSlices, includeMetadata);

  return {
    status: "success",
    design_id: design.id,
    design_name: design.name,
    version: latestVersion.id || latestVersion.version,
    canvas_size: { width: design.width, height: design.height },
    total_slices: slices.length,
    slices,
  };
}

export function getDesignImageUrl(designObj) {
  if (!designObj.url) return "";
  return designObj.url.replace(/\?x-oss-process=.*$/, "");
}

export async function downloadFile(url, localPath, referer) {
  await mkdir(path.dirname(localPath), { recursive: true });
  const headers = {};
  if (referer) headers.Referer = referer;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: { ...HEADERS, Cookie: getCookie(), ...headers },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(localPath, buffer);
  } finally {
    clearTimeout(timeout);
  }
}
