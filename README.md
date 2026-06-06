# lanhu-design

一个用于 [蓝湖](https://lanhuapp.com) UI 设计稿协作的 Agent 技能。让 AI 编码助手能够列出设计图、下载设计图进行视觉分析、提取切图/图标/素材元数据，并批量下载切图到项目中。

## 安装

```bash
npx skills add oyjt/lanhu-design
```

## 前置条件

- **Node.js >= 18**（使用原生 `fetch`）
- **`LANHU_COOKIE` 环境变量** — 蓝湖没有公开 API，脚本通过浏览器会话 Cookie 进行认证。

### 获取 Cookie

1. 打开 [lanhuapp.com](https://lanhuapp.com) 并登录。
2. 按 `F12`（macOS 为 `Cmd+Option+I`）打开开发者工具，切换到 **Network** 标签页。
3. 刷新页面，点击任意 `lanhuapp.com` 请求。
4. 在 Request Headers 中找到 `Cookie` 字段，复制完整值。
5. 将该值设置为 `LANHU_COOKIE` 环境变量。

> Cookie 通常数天到数周会过期，出现认证错误时需重新获取。

## 功能说明

| 脚本 | 用途 |
|------|------|
| `get_designs.mjs` | 列出蓝湖项目的所有设计图 |
| `download_design_images.mjs` | 下载设计图原图用于视觉分析 |
| `get_design_slices.mjs` | 获取单个设计图的切图/素材元数据 |
| `download_slices.mjs` | 根据元数据 JSON 批量下载切图 |

## 典型工作流

```
1. 设置 LANHU_COOKIE
2. 获取设计图列表     → get_designs.mjs <蓝湖链接>
3. 下载设计图原图     → download_design_images.mjs <链接> --designs 1,2 --output ./tmp
4. 获取切图元数据     → get_design_slices.mjs <链接> --design "首页设计"
5. 批量下载切图       → download_slices.mjs slices.json --output ./src/assets --scale 2x
```

## 支持的平台与倍率

| 平台 | 倍率参数 |
|------|----------|
| Web | `1x`、`2x`、`3x` |
| iOS | `ios_1x`、`ios_2x`、`ios_3x`，或 `ios-all` |
| Android | `android_mdpi` … `android_xxxhdpi`，或 `android-all` |

## 兼容性

本技能遵循 [Agent Skills](https://github.com/vercel-labs/skills) 开放标准，可在 Claude Code、Codex CLI、Gemini CLI、Cursor、GitHub Copilot 等兼容的 AI 编码助手中使用。

## 许可证

[MIT](LICENSE)
