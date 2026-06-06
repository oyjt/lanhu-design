#!/usr/bin/env node

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://lanhuapp.com";
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

  const slices = [];

  function findDdsImages(obj, parentName = "", layerPath = "") {
    if (!obj || typeof obj !== "object") return;

    const currentName = obj.name || "";
    const currentPath = layerPath
      ? `${layerPath}/${currentName}`
      : currentName;

    if (obj.ddsImage && obj.ddsImage.imageUrl) {
      const sliceInfo = {
        id: obj.id,
        name: currentName,
        type: obj.type || obj.ddsType,
        download_url: obj.ddsImage.imageUrl,
        size: obj.ddsImage.size,
      };

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

      slices.push(sliceInfo);
    }

    if (Array.isArray(obj.layers)) {
      for (const layer of obj.layers) {
        findDdsImages(layer, currentName, currentPath);
      }
    }

    for (const value of Object.values(obj)) {
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
