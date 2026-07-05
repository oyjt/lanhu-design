# lanhu-design

一个用于 [蓝湖](https://lanhuapp.com) UI 设计稿协作的 Agent 技能。让 AI 编码助手能够列出设计图、下载设计图进行视觉分析、提取切图/图标/素材元数据，并批量下载切图到项目中。

## 安装

```bash
npx skills add oyjt/lanhu-design/skills/lanhu-design
```

技能运行文件位于 `skills/lanhu-design/`。根目录的 `README.md`、`LICENSE`、`tests/` 只用于仓库说明和开发校验，不属于安装后的技能内容。

## 前置条件

- **Node.js >= 18**（使用原生 `fetch`）
- **`LANHU_COOKIE` 环境变量** — 蓝湖没有公开 API，脚本通过浏览器会话 Cookie 进行认证。

### 获取 Cookie

1. 打开 [lanhuapp.com](https://lanhuapp.com) 并登录。
2. 按 `F12`（macOS 为 `Cmd+Option+I`）打开开发者工具，切换到 **Network** 标签页。
3. 刷新页面，点击任意 `lanhuapp.com` 请求。
4. 在 Request Headers 中找到 `Cookie` 字段，复制完整值。
5. 将该值设置为 `LANHU_COOKIE` 环境变量（见下方说明）。

> Cookie 通常数天到数周会过期，出现认证错误时需重新获取。

### 设置环境变量

复制到 Cookie 后，根据你使用的工具选择对应的配置方式：

#### Claude Code

编辑项目根目录下的 `.claude/settings.json`（没有则新建），添加：

```json
{
  "env": {
    "LANHU_COOKIE": "你复制的Cookie值"
  }
}
```

#### Codex CLI

在终端设置好环境变量后启动 Codex，它会自动继承当前 shell 的环境变量：

```bash
export LANHU_COOKIE="你复制的Cookie值"
codex
```

如需持久化，可在 `~/.codex/config.toml` 中确保该变量被传递给子进程：

```toml
[shell_environment_policy]
inherit = "core"
includes = ["LANHU_COOKIE"]
```

#### Cursor

打开 Cursor 设置（`Cmd/Ctrl + ,`），搜索 `terminal.integrated.env`，在对应操作系统的配置中添加：

```json
{
  "terminal.integrated.env.osx": {
    "LANHU_COOKIE": "你复制的Cookie值"
  },
  "terminal.integrated.env.windows": {
    "LANHU_COOKIE": "你复制的Cookie值"
  },
  "terminal.integrated.env.linux": {
    "LANHU_COOKIE": "你复制的Cookie值"
  }
}
```

或者在项目根目录创建 `.env` 文件（如果你的项目支持 dotenv）：

```
LANHU_COOKIE=你复制的Cookie值
```

#### 终端直接设置（临时生效）

**macOS / Linux：**

```bash
export LANHU_COOKIE="你复制的Cookie值"
```

如需每次打开终端自动生效，将上面这行追加到 `~/.bashrc` 或 `~/.zshrc` 文件末尾。

**Windows CMD：**

```cmd
set LANHU_COOKIE=你复制的Cookie值
```

**Windows PowerShell：**

```powershell
$env:LANHU_COOKIE="你复制的Cookie值"
```

> **注意：** Cookie 是敏感凭据，请勿提交到 Git 仓库。本仓库默认忽略 `.env` 和 `.claude/settings.json`。

## 功能说明

以下脚本位于 `skills/lanhu-design/scripts/`：

| 脚本 | 用途 |
|------|------|
| `get_designs.mjs` | 列出蓝湖项目的所有设计图 |
| `get_design_specs.mjs` | 提取设计规格 HTML+CSS、Design Tokens，并可自动下载页面图片 |
| `download_design_images.mjs` | 下载设计图原图用于视觉分析 |
| `get_design_slices.mjs` | 获取单个设计图的切图/素材元数据 |
| `download_slices.mjs` | 根据元数据 JSON 批量下载切图 |

## 典型工作流

```
1. 设置 LANHU_COOKIE
2. 获取设计图列表     → node skills/lanhu-design/scripts/get_designs.mjs <蓝湖链接>
3. 下载设计图原图     → node skills/lanhu-design/scripts/download_design_images.mjs <链接> --designs 1,2 --output ./tmp
4. 提取设计规格       → node skills/lanhu-design/scripts/get_design_specs.mjs <链接> --design "首页设计" --output ./tmp --download-images
5. 获取切图元数据     → node skills/lanhu-design/scripts/get_design_slices.mjs <链接> --design "首页设计"
6. 批量下载切图       → node skills/lanhu-design/scripts/download_slices.mjs slices.json --output ./src/assets --scale 2x
```

## 使用示例

### 查看设计图列表

```
帮我看看这个蓝湖项目有哪些设计图：
https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx
```

AI 会调用 `get_designs.mjs` 列出项目中所有设计图的名称、尺寸和更新时间。

### 分析与还原设计稿

```
帮我分析"首页设计"这张设计图，我需要还原它的 UI
```

AI 会自动：

- 下载设计图原图并进行视觉分析
- 调用 `get_design_specs.mjs` 提取精确的 HTML+CSS 规格和 Design Tokens（颜色、字体、间距、圆角、渐变、阴影等），并把页面引用的图片下载到本地
- 检测项目框架（React/Vue/Flutter 等），生成匹配的代码，CSS 值直接复用规格、不主观改动
- 逐项核对还原结果与设计规格

> 蓝湖设计稿有两种数据来源：DDS Schema（高保真，HTML+CSS 为权威）和 Sketch/Figma 标注（降级，以原图视觉 + Design Tokens 数值为主）。`get_design_specs.mjs` 会自动选择来源并在输出中标注，AI 据此调整还原策略。

### 批量下载切图

```
帮我下载"首页设计"的所有切图
```

AI 会自动：

- 获取该设计图的全部切图/图标/素材元数据
- 检测项目类型（React/Vue/Flutter 等），选择合适的输出目录
- 确认平台和倍率（默认推荐 Web 2x）
- 生成语义化文件名并批量下载
- 汇报下载结果（成功数、失败数、输出路径）

### 指定平台和倍率下载

```
把"登录页"的切图按 iOS 三套倍率下载到 Assets.xcassets 目录
```

支持 Web（1x/2x/3x）、iOS（ios-all）、Android（android-all）等多平台倍率，自动按平台规范组织目录结构。

## 支持的平台与倍率

| 平台 | 倍率参数 |
|------|----------|
| Web | `1x`、`2x`、`3x` |
| iOS | `ios_1x`、`ios_2x`、`ios_3x`，或 `ios-all` |
| Android | `android_mdpi` … `android_xxxhdpi`，或 `android-all` |

> `download_url` 只作为默认 Web 2x 下载源。`1x`、`3x`、`ios-all`、`android-all` 需要切图 JSON 中存在对应的 `scale_urls`，否则脚本会提示缺失，不会复制同一张图片伪造成多倍率资源。

## 兼容性

本技能遵循 [Agent Skills](https://github.com/vercel-labs/skills) 开放标准，可在 Claude Code、Codex CLI、Gemini CLI、Cursor、GitHub Copilot 等兼容的 AI 编码助手中使用。

## 开发校验

```bash
node --check skills/lanhu-design/scripts/*.mjs tests/*.mjs
node tests/self_check.mjs
python3 /Users/ouyang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/lanhu-design
```

## 致谢

本项目基于 [lanhu-mcp](https://github.com/dsphper/lanhu-mcp) 开发，感谢原作者对蓝湖 API 逆向工程和 MCP 工具链的开拓性工作。

## 许可证

[MIT](LICENSE)
