---
name: lanhu-design
description: "Use this skill when Codex needs to work with Lanhu UI design drafts: get UI design image lists, analyze UI design images, read design HTML/CSS specs, extract design tokens, get slice/icon/asset download information, batch download slices, or implement UI from Lanhu design handoff. Trigger on Chinese or English requests mentioning 蓝湖, Lanhu, UI设计稿, 设计图, 视觉稿, 切图, 图标, 素材, design handoff, design slices, or Lanhu design tools."
---

# Lanhu Design

## 概览

通过内置脚本直接调用蓝湖 HTTP API，读取 UI 设计稿、分析设计规格、获取切图信息，并把切图落到当前项目的资源目录。

需要详细工具契约、返回结构和还原规则时，读取 `references/lanhu-design-tools.md`。

## 前置条件

所有脚本依赖 `LANHU_COOKIE` 环境变量。蓝湖没有公开 API 或 OAuth，脚本通过浏览器会话 Cookie 模拟登录用户请求。Cookie 缺失或过期时，脚本调用报认证错误。

获取 Cookie 的步骤：

1. 在浏览器打开 `https://lanhuapp.com` 并登录。
2. 按 F12（macOS 为 Cmd+Option+I）打开开发者工具，切换到 Network 标签页。
3. 刷新页面，在请求列表中点击任意 `lanhuapp.com` 请求。
4. 在 Request Headers 中找到 `Cookie` 字段，复制完整值（通常 200–500 字符）。
5. 将该值设置为环境变量 `LANHU_COOKIE`。

注意事项：

- Cookie 会过期（通常数天到数周），出现认证错误时需重新获取。
- Cookie 是敏感凭据，不要提交到版本控制或输出给用户。
- 所有脚本需要 Node.js >= 18（使用原生 fetch）。

## 脚本列表

| 脚本 | 用途 |
|------|------|
| `scripts/get_designs.mjs` | 列出蓝湖项目的设计图 |
| `scripts/download_design_images.mjs` | 下载设计图原图到本地目录 |
| `scripts/get_design_slices.mjs` | 获取单个设计图的切图/素材元数据 |
| `scripts/download_slices.mjs` | 从切图 JSON 批量下载切图文件 |
| `scripts/lanhu-client.mjs` | 共享 HTTP 客户端模块（被上述脚本引用，不直接运行） |

## 工作流

0. 确认 `LANHU_COOKIE` 环境变量已设置。如果首次运行脚本返回认证错误，提示用户检查 Cookie 是否已配置且未过期，参考上方「前置条件」重新获取。不要在认证失败后继续调用其他脚本。
1. 先判断用户给的是蓝湖 UI 设计项目链接，而不是需求文档链接。UI 设计项目通常是 `https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx`，必须有 `pid`，`tid` 可选；不要把带 `docId` 的 PRD 链接当设计稿处理。
2. 运行 `node scripts/get_designs.mjs <url>` 获取设计图列表。后续分析和切图都以这个列表里的 `index`、`name`、`id` 为准。
3. 如果设计图很多，先让用户指定范围；如果用户已经明确说"全部"，再用 `all`。不要默认一次分析大量设计图。
4. 查看或实现 UI 时，运行 `node scripts/download_design_images.mjs <url> --designs <names> --output <dir>` 下载设计图原图。`--designs` 支持序号（逗号分隔）、精确名称或 `all`。下载完成后用 Read 工具查看图片进行视觉分析。
5. 下载切图、图标、图片素材时，运行 `node scripts/get_design_slices.mjs <url> --design <name>` 获取切图 JSON。单次只传一个设计图名称或序号。
6. 下载前确认平台和倍率偏好。用户不指定时推荐 Web 2x，但仍要明确说明选择；常用键包括 `1x`、`2x`、`3x`、`ios_1x`、`ios_2x`、`ios_3x`、`android_mdpi`、`android_hdpi`、`android_xhdpi`、`android_xxhdpi`、`android_xxxhdpi`。
7. 将步骤 5 的切图 JSON 输出保存为文件，然后运行 `node scripts/download_slices.mjs <json_file> --output <dir> --scale <scale>` 批量下载。识别当前项目资源目录和命名风格，执行后核对文件数量和失败列表。

## 设计还原规则

分析工具返回的 HTML+CSS 是设计规格的主要依据。实现 UI 时按以下优先级取值：

1. HTML+CSS：颜色、尺寸、间距、字体、圆角、渐变、定位等参数的权威来源。
2. Design Tokens：只补充 HTML+CSS 缺失或无法完整表达的渐变、阴影、边框、透明度等信息。
3. 设计图图片：只用于视觉核对，不覆盖 HTML+CSS 中的精确数值。

保留 CSS 数值，不要擅自改色值格式、四舍五入、简化渐变、替换字体 fallback、把图片资源改成 SVG/CSS 形状/emoji，也不要省略可见元素。最终代码中不要保留蓝湖远程 CDN URL，所有图片都下载到本地并按项目约定引用。

## 切图下载

从 `get_design_slices.mjs` 保存返回结果为 JSON 后，可运行：

```bash
node scripts/download_slices.mjs slices.json --output ./src/assets/images/slices/home --scale 2x
```

常用参数：

- `--scale 2x`：下载 Web 2x，文件名后缀默认 `@2x`。
- `--scale ios-all`：下载 iOS `1x/@2x/@3x`。
- `--scale android-all`：下载 Android 全套并放入 `mipmap-*` 子目录。
- `--name-map names.json`：提供 `{slice_id_or_name_or_layer_path: "semantic_name"}`，覆盖自动文件名。
- `--referer https://lanhuapp.com/`：需要带 Referer 时使用。

脚本只负责稳定下载和基础去重。语义化命名应优先结合当前项目已有命名规范处理。

## 完成检查

交付前确认：

- 已先运行 `get_designs.mjs` 并基于列表匹配目标设计图。
- UI 实现已逐项核对 HTML+CSS 规格，没有用设计截图主观改值。
- 所有远程图片/切图已下载为本地资源，代码中没有蓝湖 CDN URL。
- 切图下载数量、失败数量、输出目录已向用户说明。
- 工作流中未出现认证错误。如果出现过，已引导用户刷新 Cookie 并重试。
