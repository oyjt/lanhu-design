#!/usr/bin/env node
/**
 * design-converter.mjs — 纯转换模块：蓝湖 DDS Schema / Sketch JSON → HTML+CSS。
 * 无 HTTP 依赖，无副作用。对应 lanhu-mcp lanhu_mcp_server.py L157–L1731。
 */

// ── 常量 ─────────────────────────────────────────────────────────────────────

const UNITLESS_PROPERTIES = new Set([
  "zIndex","fontWeight","opacity","flex","flexGrow","flexShrink","order",
]);

const COMMON_CSS_FOR_DESIGN = `
body * {
  box-sizing: border-box;
  flex-shrink: 0;
}
body {
  font-family: PingFangSC-Regular, Roboto, Helvetica Neue, Helvetica, Tahoma,
    Arial, PingFang SC-Light, Microsoft YaHei;
}
input {
  background-color: transparent;
  border: 0;
}
button {
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  outline: none;
  background-color: transparent;
}
button:active {
  opacity: 0.6;
}
.flex-col { display: flex; flex-direction: column; }
.flex-row { display: flex; flex-direction: row; }
.justify-start { display: flex; justify-content: flex-start; }
.justify-center { display: flex; justify-content: center; }
.justify-end { display: flex; justify-content: flex-end; }
.justify-evenly { display: flex; justify-content: space-evenly; }
.justify-around { display: flex; justify-content: space-around; }
.justify-between { display: flex; justify-content: space-between; }
.align-start { display: flex; align-items: flex-start; }
.align-center { display: flex; align-items: center; }
.align-end { display: flex; align-items: flex-end; }
`;

// ── Figma / Sketch 双格式归一化访问器 ─────────────────────────────────────────
// 蓝湖新版导出 Figma 格式（artboard.origin="figma"），字段结构与旧 Sketch 不同。
// 这些访问器优先读 Figma 字段，回退旧 Sketch 字段，使下游转换逻辑格式无关。

function getFrame(layer) {
  const f = layer.frame || layer.realFrame || {};
  return {
    left: layer.left ?? f.left ?? 0,
    top: layer.top ?? f.top ?? 0,
    width: layer.width ?? f.width ?? 0,
    height: layer.height ?? f.height ?? 0,
  };
}

// 归一化为 0-1。Figma opacity 本就是 0-1；旧 Sketch 是 0-100。
function getOpacity(layer) {
  const styleOp = layer.style?.opacity;
  const raw = layer.opacity ?? styleOp;
  if (raw === undefined || raw === null) return 1;
  return raw > 1 ? raw / 100 : raw;
}

function getFills(layer) {
  return layer.style?.fills ?? layer.fills ?? [];
}

function getBorders(layer) {
  return layer.style?.borders ?? layer.borders ?? [];
}

function getShadows(layer) {
  return layer.style?.shadows ?? layer.shadows ?? [];
}

// 颜色 → CSS。优先用 Figma 现成的 color.value（保真 rgba 字符串，符合不转换色值原则）。
function colorToCss(color, alphaOverride) {
  if (!color) return "transparent";
  if (typeof color === "string") return color;
  if (color.value && alphaOverride === undefined) return color.value;
  // r/g/b 可能是 0-1（Figma/新 Sketch）或 0-255（旧）。>1 视为 0-255。
  const norm = (v) => (v > 1 ? Math.round(v) : Math.round(v * 255));
  const r = norm(color.r ?? color.red ?? 0);
  const g = norm(color.g ?? color.green ?? 0);
  const b = norm(color.b ?? color.blue ?? 0);
  const a = alphaOverride ?? color.a ?? color.alpha ?? 1;
  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
}

// Figma 的真实圆角常在 layer.paths[].radius，顶层 layer.radius 多为 0。
// 取顶层 radius，若为空/全 0 则回退到第一个 path 的 radius。
function getRadius(layer) {
  const isNonZero = (r) => {
    if (typeof r === "number") return r > 0;
    if (Array.isArray(r)) return r.some((x) => x > 0);
    if (r && typeof r === "object") return [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft].some((x) => x > 0);
    return false;
  };
  if (isNonZero(layer.radius)) return layer.radius;
  for (const p of layer.paths || []) {
    if (isNonZero(p.radius)) return p.radius;
  }
  return layer.radius;
}

// radius 可能是数字、数组、或 Figma 对象 {topLeft,topRight,bottomRight,bottomLeft}。
function radiusToCss(radius) {
  if (radius === undefined || radius === null) return "";
  if (typeof radius === "number") return radius ? `border-radius: ${radius}px;` : "";
  if (Array.isArray(radius)) {
    if (new Set(radius).size === 1) return radius[0] ? `border-radius: ${radius[0]}px;` : "";
    return `border-radius: ${radius.map((r) => `${r}px`).join(" ")};`;
  }
  if (typeof radius === "object") {
    const tl = radius.topLeft ?? 0, tr = radius.topRight ?? 0;
    const br = radius.bottomRight ?? 0, bl = radius.bottomLeft ?? 0;
    if (tl === 0 && tr === 0 && br === 0 && bl === 0) return "";
    return (tl === tr && tr === br && br === bl)
      ? `border-radius: ${tl}px;`
      : `border-radius: ${tl}px ${tr}px ${br}px ${bl}px;`;
  }
  return "";
}

// 类型归一：Figma 的 shapeLayer/textLayer/groupLayer/imageLayer → shape/text/group/image。
function normType(layer) {
  const t = String(layer.type || layer.ddsType || "").toLowerCase();
  return t.replace(/layer$/, "");
}

function isLayerVisible(layer) {
  return layer.visible !== false && layer.isVisible !== false;
}

// camelToKebab 在下方定义，这里仅声明顺序无关的纯函数。

// ── CSS 辅助 ─────────────────────────────────────────────────────────────────

function camelToKebab(s) {
  return s.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

function unescapeHtml(value) {
  return String(value ?? "").replace(/&(amp|lt|gt|quot|#39);/g, (match, entity) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return "\"";
    if (entity === "#39") return "'";
    return match;
  });
}

function escapeCssUrl(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/[\n\r\f]/g, " ");
}

function formatCssValue(key, value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (value === 0) return "0";
    return UNITLESS_PROPERTIES.has(key) ? String(value) : `${value}px`;
  }
  if (typeof value === "string") {
    if (value.includes("rgba(")) {
      return value.replace(
        /rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g,
        (_, r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a.includes(".") ? parseFloat(a) : parseInt(a, 10)})`
      );
    }
    if (/^\d+$/.test(value) && !UNITLESS_PROPERTIES.has(key)) {
      return value === "0" ? "0" : `${value}px`;
    }
  }
  return String(value);
}

function mergeSides(styles, t, r, b, l, shorthand) {
  if (!(t in styles && r in styles && b in styles && l in styles)) return;
  const [tv, rv, bv, lv] = [styles[t]||0, styles[r]||0, styles[b]||0, styles[l]||0];
  styles[shorthand] = (tv===bv && lv===rv)
    ? (tv===lv ? `${tv}px` : `${tv}px ${rv}px`)
    : `${tv}px ${rv}px ${bv}px ${lv}px`;
  for (const k of [t, r, b, l]) delete styles[k];
}

function mergePadding(s) {
  mergeSides(s, "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "padding");
}
function mergeMargin(s) {
  mergeSides(s, "marginTop", "marginRight", "marginBottom", "marginLeft", "margin");
}

// ── Flex 分析 ─────────────────────────────────────────────────────────────────

function shouldUseFlex(node) {
  if (!node) return false;
  const style = { ...(node.style||{}), ...((node.props||{}).style||{}) };
  return style.display === "flex" || style.flexDirection !== undefined;
}

function getFlexClasses(node) {
  const classes = [];
  if (!shouldUseFlex(node)) return classes;
  const style = { ...(node.style||{}), ...((node.props||{}).style||{}) };
  const className = (node.props||{}).className || "";
  const aj = node.alignJustify || {};
  const dir = style.flexDirection;
  if (dir === "column" || className.includes("flex-col")) classes.push("flex-col");
  else if (dir === "row" || className.includes("flex-row")) classes.push("flex-row");
  const jmap = { "space-between":"justify-between","center":"justify-center","flex-end":"justify-end","flex-start":"justify-start","space-around":"justify-around","space-evenly":"justify-evenly" };
  const justify = aj.justifyContent || style.justifyContent;
  if (jmap[justify]) classes.push(jmap[justify]);
  const amap = { "flex-start":"align-start","center":"align-center","flex-end":"align-end" };
  const align = aj.alignItems || style.alignItems;
  if (amap[align]) classes.push(amap[align]);
  return classes;
}

function cleanStyles(node, flexClasses) {
  const propsStyle = (node.props||{}).style || {};
  const result = {};
  const stdJ = new Set(["flex-start","center","flex-end","space-between","space-around","space-evenly"]);
  const stdA = new Set(["flex-start","center","flex-end"]);
  for (const [key, value] of Object.entries(propsStyle)) {
    if ((key==="display"||key==="flexDirection") && flexClasses.length) continue;
    if (key==="justifyContent" && flexClasses.length && stdJ.has(value)) continue;
    if (key==="alignItems" && flexClasses.length && stdA.has(value)) continue;
    if (key==="position" && value==="static") continue;
    if (key==="overflow" && value==="visible") continue;
    result[key] = value;
  }
  if (["paddingTop","paddingRight","paddingBottom","paddingLeft"].some(k=>k in result)) mergePadding(result);
  if (["marginTop","marginRight","marginBottom","marginLeft"].some(k=>k in result)) mergeMargin(result);
  return result;
}

// ── 循环 & 递归生成器 ─────────────────────────────────────────────────────────

function getLoopArr(node) {
  const arr = node.loop || node.loopData;
  return Array.isArray(arr) ? arr : [];
}

function resolveLoopPlaceholder(value, loopItem) {
  if (!value || typeof loopItem !== "object") return value || "";
  const m = String(value).trim().match(/^this\.item\.(\w+)$/);
  return m ? (loopItem[m[1]] ?? "") : value;
}

function generateCss(node, cssRules, loopSuffixes = null) {
  if (!node) return;
  let suffixes = loopSuffixes;
  const loopArr = node.loopType ? getLoopArr(node) : [];
  if (loopArr.length && !suffixes) suffixes = loopArr.map((_,i) => String(i));
  const nodeProps = node.props || {};
  const className = nodeProps.className;
  if (className) {
    const flexCls = getFlexClasses(node);
    const styles = cleanStyles(node, flexCls);
    const entries = Object.entries(styles);
    let content = "";
    if (entries.length || node.type === "lanhutext") {
      content = entries
        .map(([k,v]) => { const val = formatCssValue(k,v); return val ? `  ${camelToKebab(k)}: ${val};` : null; })
        .filter(Boolean).join("\n");
    }
    if (suffixes) for (const suf of suffixes) cssRules[`${className}-${suf}`] = content;
    else cssRules[className] = content;
  }
  for (const child of node.children||[]) generateCss(child, cssRules, suffixes);
}

function generateHtml(node, indent = 2, loopContext = null) {
  if (!node) return "";
  const [loopArr, loopIndex] = loopContext || [null, null];
  const loopItem = loopArr && loopIndex !== null ? loopArr[loopIndex] : null;
  const sp = " ".repeat(indent);
  const flexCls = getFlexClasses(node);
  const nodeProps = node.props || {};
  let cls = nodeProps.className || "";
  if (loopIndex !== null && cls) cls = `${cls}-${loopIndex}`;
  const allCls = escapeHtml([cls, ...flexCls].filter(Boolean).join(" "));
  const type = node.type;
  const LRE = /^this\.item\.\w+$/;

  if (type === "lanhutext") {
    let text = node.data?.value || nodeProps.text || "";
    if (loopItem && text && LRE.test(String(text).trim())) text = resolveLoopPlaceholder(text, loopItem);
    else if (text && LRE.test(String(text).trim())) text = "";
    return `${sp}<span class="${allCls}">${escapeHtml(text)}</span>`;
  }
  if (type === "lanhuimage") {
    let src = node.data?.value || nodeProps.src || "";
    if (loopItem && src && LRE.test(String(src).trim())) src = resolveLoopPlaceholder(src, loopItem);
    else if (src && LRE.test(String(src).trim())) src = "";
    return `${sp}<img\n${sp}  class="${allCls}"\n${sp}  referrerpolicy="no-referrer"\n${sp}  src="${escapeHtml(src)}"\n${sp}/>`;
  }
  if (type === "lanhubutton") {
    const ch = (node.children||[]).map(c=>generateHtml(c,indent+2,loopContext)).join("\n");
    return `${sp}<button class="${allCls}">\n${ch}\n${sp}</button>`;
  }
  const children = node.children || [];
  const nla = node.loopType ? getLoopArr(node) : [];
  if (nla.length && !loopContext) {
    const parts = [];
    for (let i=0; i<nla.length; i++) for (const c of children) parts.push(generateHtml(c,indent+2,[nla,i]));
    return `${sp}<div class="${allCls}">\n${parts.join("\n")}\n${sp}</div>`;
  }
  if (children.length) {
    const ch = children.map(c=>generateHtml(c,indent+2,loopContext)).join("\n");
    return `${sp}<div class="${allCls}">\n${ch}\n${sp}</div>`;
  }
  return `${sp}<div class="${allCls}"></div>`;
}

// ── DDS Schema → HTML+CSS（主路径） ───────────────────────────────────────────

export function convertLanhuToHtml(jsonData) {
  const cssRules = {};
  generateCss(jsonData, cssRules);
  const css = Object.entries(cssRules)
    .map(([cls,props]) => props ? `.${cls} {\n${props}\n}` : `.${cls} {\n}`)
    .join("\n\n") + COMMON_CSS_FOR_DESIGN;
  const body = generateHtml(jsonData, 4);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <style>
${css}
    </style>
  </head>
  <body>
${body}
  </body>
</html>`;
}

// ── Design Tokens 提取（共用，交叉验证高风险元素） ─────────────────────────────

const SKETCH_NOISE_TYPES = new Set(["artboard","page","symbolMaster","slice","MSImmutableHotspotLayer","hotspot"]);

export function extractDesignTokens(sketchData) {
  function getDims(obj) {
    const { left, top, width, height } = getFrame(obj);
    return [left, top, width, height];
  }
  function simplifyFill(f) {
    if (!f || f.isEnabled === false) return null;
    if (f.fillType === 1 || f.type === "gradient") {
      const grad = f.gradient || {};
      const stops = (grad.stops||[]).map(s => `${colorToCss(s.color)} ${Math.round((s.position??0)*100)}%`).join(", ");
      return `linear-gradient(${gradientAngle(grad)}, ${stops})`;
    }
    if (f.type === "image" || f.fillType === 2) return null;
    if (!f.color) return null;
    return colorToCss(f.color);
  }
  function simplifyBorder(b) {
    if (!b||b.isEnabled===false) return null;
    return `${b.thickness??b.width??1}px solid ${colorToCss(b.color)}`;
  }
  function simplifyShadow(s) {
    if (!s||s.isEnabled===false) return null;
    return `${colorToCss(s.color)} ${s.offsetX??s.x??0}px ${s.offsetY??s.y??0}px ${s.blurRadius??s.blur??0}px`;
  }
  function hasOnlyTransparentSolid(fills) {
    if (!fills||!fills.length) return true;
    return fills.every(f => f.isEnabled===false
      || ((f.fillType===0||f.type==="color") && ((f.color?.alpha??f.color?.a??1)===0)));
  }
  function radiusIsNonUniform(radius) {
    if (Array.isArray(radius)) return new Set(radius).size>1;
    if (radius && typeof radius==="object") {
      const v=[radius.topLeft??0,radius.topRight??0,radius.bottomRight??0,radius.bottomLeft??0];
      return new Set(v).size>1 && v.some(x=>x>0);
    }
    return false;
  }
  function isHighRisk(obj) {
    const t = normType(obj);
    if (SKETCH_NOISE_TYPES.has(t)) return false;
    const [,,w,h] = getDims(obj);
    if (w<2&&h<2) return false;
    const fills = getFills(obj);
    if (fills.some(f=>f.isEnabled!==false&&(f.fillType===1||f.type==="gradient"))) return true;
    if (getBorders(obj).some(b=>b.isEnabled!==false)) return true;
    if (radiusIsNonUniform(getRadius(obj))) return true;
    const op = getOpacity(obj);
    if (op<1) {
      if (hasOnlyTransparentSolid(fills)&&!getBorders(obj).length&&!getShadows(obj).length) return false;
      return true;
    }
    if (getShadows(obj).some(s=>s.isEnabled!==false)) return true;
    return false;
  }
  function radiusToken(radius) {
    if (Array.isArray(radius)) return new Set(radius).size===1?radius[0]:JSON.stringify(radius);
    if (radius && typeof radius==="object") {
      const v=[radius.topLeft??0,radius.topRight??0,radius.bottomRight??0,radius.bottomLeft??0];
      return new Set(v).size===1?v[0]:`${v[0]} ${v[1]} ${v[2]} ${v[3]}`;
    }
    return radius;
  }
  const tokens = [];
  function walk(obj, parentPath = "") {
    if (!obj||typeof obj!=="object"||!isLayerVisible(obj)) return;
    const name = obj.name||"";
    const path = parentPath ? `${parentPath}/${name}` : name;
    if (isHighRisk(obj)) {
      const t = obj.type||obj.ddsType||"unknown";
      const [x,y,w,h] = getDims(obj);
      const lines = [`[${t}] "${name}" @(${Math.round(x)},${Math.round(y)}) ${Math.round(w)}x${Math.round(h)}${parentPath?`  path: ${path}`:""}`];
      const rad = getRadius(obj);
      if (rad!==undefined) { const rt=radiusToken(rad); if(rt) lines.push(`  radius: ${rt}`); }
      for (const f of getFills(obj)) { const s=simplifyFill(f); if(s) lines.push(`  fill: ${s}`); }
      for (const b of getBorders(obj)) { const s=simplifyBorder(b); if(s) lines.push(`  border: ${s}`); }
      const op = getOpacity(obj);
      if (op<1) lines.push(`  opacity: ${op}`);
      for (const sh of getShadows(obj)) { const s=simplifyShadow(sh); if(s) lines.push(`  shadow: ${s}`); }
      tokens.push(lines.join("\n"));
    }
    for (const child of obj.layers||[]) walk(child, path);
  }
  const root = sketchData.artboard || (sketchData.info && sketchData.info[0]);
  if (root?.layers) { for (const l of root.layers) walk(l); }
  else if (sketchData.info) {
    for (const item of sketchData.info) {
      walk(item);
      for (const v of Object.values(item)) {
        if (typeof v==="object"&&v!==null) {
          if (Array.isArray(v)) v.forEach(i => typeof i==="object"&&i&&walk(i));
          else walk(v);
        }
      }
    }
  }
  return tokens.length ? tokens.join("\n\n") : "";
}

// ── Sketch JSON → 绝对定位 HTML（降级路径） ──────────────────────────────────

const SKETCH_SKIP_TYPES = new Set(["artboard","page","symbolMaster","slice","MSImmutableHotspotLayer","hotspot","group"]);

function sketchColor(c, alpha) {
  // 兼容旧调用签名：旧 Sketch 的 r/g/b 是 0-1，需 *255；新格式走 colorToCss 的 value/归一逻辑。
  return colorToCss(c, alpha);
}

// 从 Figma 渐变的 from/to 归一化坐标点计算 CSS 角度。
function gradientAngle(grad) {
  if (grad.from && grad.to) {
    const dx = grad.to.x - grad.from.x;
    const dy = grad.to.y - grad.from.y;
    // CSS 角度：0deg 朝上，顺时针。atan2 的 0 朝右、逆时针，故换算 90 - 角度。
    const deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90);
    return `${((deg % 360) + 360) % 360}deg`;
  }
  if (grad.gradientType === 0 && grad.rotation !== undefined) return `${Math.round(grad.rotation)}deg`;
  return "to right";
}

function sketchFillCss(fills) {
  if (!fills || !fills.length) return "";
  const enabled = fills.filter(f => f.isEnabled !== false);
  if (!enabled.length) return "";
  const f = enabled[enabled.length - 1];
  if (f.fillType === 1 || f.type === "gradient") {
    const grad = f.gradient || {};
    const stops = (grad.stops || []).map(s => {
      const pct = Math.round((s.position || 0) * 100);
      return `${colorToCss(s.color)} ${pct}%`;
    }).join(", ");
    return `background: linear-gradient(${gradientAngle(grad)}, ${stops});`;
  }
  if (f.type === "image" || f.fillType === 2) return ""; // 图片填充由切图/原图处理
  return `background-color: ${colorToCss(f.color)};`;
}

function sketchBorderCss(borders) {
  if (!borders || !borders.length) return "";
  const b = borders.find(b => b.isEnabled !== false);
  if (!b) return "";
  const w = b.thickness ?? b.width ?? 1;
  return `border: ${w}px solid ${colorToCss(b.color)};`;
}

function sketchRadiusCss(radius) {
  return radiusToCss(radius);
}

function sketchShadowCss(shadows) {
  if (!shadows || !shadows.length) return "";
  const enabled = shadows.filter(s => s.isEnabled !== false);
  if (!enabled.length) return "";
  const parts = enabled.map(s => {
    const x=s.offsetX??s.x??0, y=s.offsetY??s.y??0, blur=s.blurRadius??s.blur??0, spread=s.spread??0;
    return `${x}px ${y}px ${blur}px ${spread}px ${colorToCss(s.color)}`;
  });
  return `box-shadow: ${parts.join(", ")};`;
}

function sketchTextCss(obj) {
  const parts = [];
  // Figma：text.style.font + text.style.color；旧 Sketch：textStyle/style.textStyle。
  const figmaText = obj.text?.style;
  const font = figmaText?.font;
  if (font) {
    const alignMap = { left:"left", right:"right", center:"center", justify:"justify" };
    if (alignMap[font.align]) parts.push(`text-align: ${alignMap[font.align]};`);
    if (font.size) parts.push(`font-size: ${font.size}px;`);
    if (font.fontWeight) parts.push(`font-weight: ${font.fontWeight};`);
    if (font.name) parts.push(`font-family: ${font.name};`);
    if (font.lineHeight?.value) parts.push(`line-height: ${font.lineHeight.value}px;`);
    if (font.letterSpacing?.value) parts.push(`letter-spacing: ${font.letterSpacing.value}px;`);
    if (figmaText.color) parts.push(`color: ${colorToCss(figmaText.color)};`);
    return parts.join(" ");
  }
  const ta = obj.textAlignment ?? obj.style?.textAlignment;
  const map = {0:"left",1:"right",2:"center",3:"justify"};
  if (map[ta]) parts.push(`text-align: ${map[ta]};`);
  const ts = obj.textStyle || obj.style?.textStyle || {};
  if (ts.fontSize) parts.push(`font-size: ${ts.fontSize}px;`);
  if (ts.fontWeight) parts.push(`font-weight: ${ts.fontWeight};`);
  if (ts.color) parts.push(`color: ${colorToCss(ts.color)};`);
  if (ts.lineHeight) parts.push(`line-height: ${ts.lineHeight}px;`);
  if (ts.letterSpacing) parts.push(`letter-spacing: ${ts.letterSpacing}px;`);
  return parts.join(" ");
}

function getSketchLayerCss(layer, scale) {
  const sc = scale || 1;
  const { left, top, width, height } = getFrame(layer);
  const parts = [
    `position: absolute; left: ${Math.round(left / sc)}px; top: ${Math.round(top / sc)}px; width: ${Math.round(width / sc)}px; height: ${Math.round(height / sc)}px;`,
  ];
  const fillCss = sketchFillCss(getFills(layer));
  if (fillCss) parts.push(fillCss);
  const borderCss = sketchBorderCss(getBorders(layer));
  if (borderCss) parts.push(borderCss);
  const radCss = sketchRadiusCss(getRadius(layer));
  if (radCss) parts.push(radCss);
  const shadowCss = sketchShadowCss(getShadows(layer));
  if (shadowCss) parts.push(shadowCss);
  const op = getOpacity(layer);
  if (op < 1) parts.push(`opacity: ${op};`);
  const t = normType(layer);
  if (t === "text" || t === "shapepath" || t === "shape") {
    const txt = sketchTextCss(layer);
    if (txt) parts.push(txt);
  }
  return parts.join(" ");
}

// 取图片层的图片 URL。Figma：层带 image.{imageUrl,svgUrl}（hasExportImage 导出切片）。
function getImageSrc(layer) {
  const img = layer.image;
  if (img && typeof img === "object") return img.imageUrl || img.svgUrl || "";
  return layer.imageUrl || layer.svgUrl || layer.src || "";
}

function isImageLayer(layer) {
  // Figma：hasExportImage=true 且带 image.imageUrl，整层已被导出为一张切片图。
  if (layer.hasExportImage && layer.image?.imageUrl) return true;
  const t = normType(layer);
  if (t === "bitmap" || t === "image") return true;
  if (layer.imageData && !layer.layers?.length) return true;
  // Figma：style.fills 含 image 类型填充
  return getFills(layer).some(f => f.type === "image" || f.fillType === 2);
}

function isTextLayer(layer) {
  return normType(layer) === "text";
}

function getTextContent(layer) {
  return layer.text?.value
    || layer.text?.style?.content
    || layer.content
    || layer.value
    || layer.attributedString?.string
    || layer.name
    || "";
}

function safeCls(name) {
  return String(name || "").replace(/[^A-Za-z0-9_-]/g, "_").replace(/^[^A-Za-z]/, "l$&");
}

// Figma 子图层 frame 是绝对画板坐标（实测：Battery@(672,35) 的子 Border 也是 @(672,35)），
// 因此扁平化渲染——所有可见叶子层作为画板直接子元素绝对定位，容器层只递归不包裹，避免双重偏移。
function sketchLayersToHtml(layers, scale, indent) {
  const sp = " ".repeat(indent);
  const parts = [];
  for (const layer of layers || []) {
    if (!isLayerVisible(layer)) continue;
    const t = normType(layer);
    const hasChildren = Array.isArray(layer.layers) && layer.layers.length > 0;
    const isContainer = hasChildren && !isImageLayer(layer) && !isTextLayer(layer);

    // 纯容器（group/artboard 等）：不渲染自身包裹，直接递归子层（坐标已是绝对值）。
    if (isContainer && SKETCH_SKIP_TYPES.has(t)) {
      const inner = sketchLayersToHtml(layer.layers, scale, indent);
      if (inner) parts.push(inner);
      continue;
    }

    const css = getSketchLayerCss(layer, scale);
    const cls = escapeHtml(safeCls(layer.name));
    const styleAttr = escapeHtml(css.replace(/"/g, "'"));
    if (isImageLayer(layer)) {
      // 图片层整体已被导出为一张切片图，用 image.imageUrl，不再递归子层。
      const src = getImageSrc(layer);
      parts.push(`${sp}<img class="${cls}" referrerpolicy="no-referrer" src="${escapeHtml(src)}" style="${styleAttr}" />`);
    } else if (isTextLayer(layer)) {
      const text = getTextContent(layer);
      parts.push(`${sp}<span class="${cls}" style="${styleAttr}">${escapeHtml(text)}</span>`);
    } else {
      // 有样式的非容器层（含带子层的非 skip 类型）：渲染自身 + 递归子层（子层同为绝对坐标，平级排列）。
      const inner = hasChildren ? sketchLayersToHtml(layer.layers, scale, indent) : "";
      parts.push(`${sp}<div class="${cls}" style="${styleAttr}"></div>`);
      if (inner) parts.push(inner);
    }
  }
  return parts.join("\n");
}

export function convertSketchToHtml(sketchData, designScale, designImgUrl) {
  const sc = designScale || 1;
  let artboardW = 375, artboardH = 667;
  let layers = [];
  const root = sketchData.artboard || (sketchData.info && sketchData.info[0]);
  if (root) {
    const fr = getFrame(root);
    artboardW = Math.round((fr.width || 375) / sc);
    artboardH = Math.round((fr.height || 667) / sc);
    layers = root.layers || [];
  }
  const body = sketchLayersToHtml(layers, sc, 4);
  const bgStyle = designImgUrl
    ? `background-image: url("${escapeCssUrl(designImgUrl)}"); background-size: cover;`
    : "background: #f0f0f0;";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Design Spec</title>
    <style>
body { margin: 0; padding: 0; }
.artboard { position: relative; width: ${artboardW}px; height: ${artboardH}px; overflow: hidden; ${bgStyle} }
    </style>
  </head>
  <body>
    <div class="artboard">
${body}
    </div>
  </body>
</html>`;
}

// ── Sketch 结构化标注（降级路径文本输出） ─────────────────────────────────────

function annotateLayer(layer, scale, depth, lines) {
  if (!layer || !isLayerVisible(layer)) return;
  const sc = scale || 1;
  const sp = "  ".repeat(depth);
  const { left, top, width, height } = getFrame(layer);
  const x = Math.round(left / sc);
  const y = Math.round(top / sc);
  const w = Math.round(width / sc);
  const h = Math.round(height / sc);
  const name = layer.name || "(unnamed)";
  const t = layer.type || layer.ddsType || "unknown";
  const cssParts = [];
  cssParts.push(`left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px`);
  const fillCss = sketchFillCss(getFills(layer));
  if (fillCss) cssParts.push(fillCss.replace(/;$/, ""));
  const borderCss = sketchBorderCss(getBorders(layer));
  if (borderCss) cssParts.push(borderCss.replace(/;$/, ""));
  const radCss = sketchRadiusCss(getRadius(layer));
  if (radCss) cssParts.push(radCss.replace(/;$/, ""));
  const shadowCss = sketchShadowCss(getShadows(layer));
  if (shadowCss) cssParts.push(shadowCss.replace(/;$/, ""));
  const op = getOpacity(layer);
  if (op < 1) cssParts.push(`opacity: ${op}`);
  if (isTextLayer(layer)) {
    const txt = sketchTextCss(layer).replace(/;/g, "").trim();
    if (txt) cssParts.push(txt);
    const content = getTextContent(layer);
    if (content) cssParts.push(`content: "${content}"`);
  }
  lines.push(`${sp}[${t}] "${name}" { ${cssParts.join("; ")} }`);
  for (const child of layer.layers || []) annotateLayer(child, scale, depth + 1, lines);
}

export function extractFullAnnotationsFromSketch(sketchData, designScale) {
  const sc = designScale || 1;
  const lines = [];
  const root = sketchData.artboard || (sketchData.info && sketchData.info[0]);
  const layers = root?.layers || [];
  for (const layer of layers) annotateLayer(layer, sc, 0, lines);
  return lines.join("\n");
}

// ── HTML 压缩 & 图片本地化 ─────────────────────────────────────────────────────

export function minifyHtml(html) {
  if (!html) return "";
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

export function localizeImageUrls(htmlCode, designName) {
  if (!htmlCode) return { html: htmlCode, mapping: {} };
  const safeDesign = String(designName || "design").replace(/[^A-Za-z0-9_-]/g, "_");
  const mapping = {};
  const counter = {};
  const result = htmlCode.replace(/src="(https?:\/\/[^"]+)"/g, (match, encodedUrl) => {
    const url = unescapeHtml(encodedUrl);
    let ext = ".png";
    try { const u = new URL(url); const e = u.pathname.split(".").pop().toLowerCase(); if (["png","jpg","jpeg","webp","gif","svg"].includes(e)) ext = `.${e}`; } catch {}
    const urlKey = url.split("?")[0].split("/").pop().replace(/[^A-Za-z0-9._-]/g, "_") || "img";
    const stem = urlKey.replace(/\.[^.]+$/, "");
    counter[stem] = (counter[stem] || 0) + 1;
    const localName = counter[stem] > 1 ? `${stem}_${counter[stem]}${ext}` : `${stem}${ext}`;
    const localPath = `./assets/slices/${localName}`;
    mapping[localPath] = url;
    return `src="${escapeHtml(localPath)}"`;
  });
  return { html: result, mapping };
}
