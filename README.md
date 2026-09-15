# lanhu-design

一个用于 [蓝湖](https://lanhuapp.com) UI 设计稿协作的 CLI 与 Agent Skill。让开发者和 AI 编码助手通过统一的 `lanhu` 命令完成登录、设计图读取、规格提取、切图下载和设计上下文导出。

## 推荐安装：CLI

```bash
npm install -g lanhu-design
lanhu --version
lanhu auth
```

`lanhu auth` 会先检查现有 `LANHU_COOKIE` 和 CLI Credential Store；凭据仍有效时直接成功，不读取浏览器，因此不会触发 Keychain。仅当本地没有可用凭据时，才读取默认浏览器最近使用的 Profile；浏览器也未登录时，再打开 `https://lanhuapp.com`，等待用户登录后重新读取。如自动识别的 Profile 不正确，可显式执行 `lanhu auth --browser chrome --profile "Profile 1"`。

首次使用且 CLI 尚未保存凭据时，Chromium Cookie 解密仍可能触发一次系统授权，这是读取浏览器登录态所必需的。后续执行普通 `lanhu auth` 会复用已保存凭据；需要强制重新读取浏览器时使用 `lanhu auth refresh`。

普通终端模式会输出“已登录”或“登录成功”等可读提示，并在已有凭据时给出 `lanhu auth refresh` 引导；只有显式添加 `--json` 才输出结构化 JSON。macOS 每次可能访问 Chromium Keychain 前，CLI 都会先说明弹窗用途，避免系统授权窗口突然出现。

认证命令仅在本地检查 Cookie 格式和可识别令牌的过期时间，不调用未经保证的“用户信息”探测接口；服务器端权限和有效性会在首次带有真实蓝湖项目地址的业务命令中确认。

如果 macOS Keychain、Windows App-Bound Encryption 等系统机制禁止 Cookie 解密，CLI 会停止重试并提示兜底方案：使用浏览器 Extension 导出 `lanhuapp.com` Cookie，再运行 `lanhu auth import` 隐藏输入。Extension 负责导出，CLI 不要求 Extension 将凭据写入环境变量。

Windows 新版 Chrome/Edge 可能因系统安全机制无法读取登录会话，此时也可改用 Firefox。

常用命令：

```bash
lanhu auth status
lanhu designs "$LANHU_URL" --json
lanhu image "$LANHU_URL" --design 首页 --output .lanhu/images
lanhu specs "$LANHU_URL" --design 首页 --output .lanhu/specs --download-images
lanhu slices "$LANHU_URL" --design 首页 --output .lanhu/slices.json
lanhu download .lanhu/slices.json --output src/assets --scale 2x
lanhu export "$LANHU_URL" --design 首页 --output .lanhu --json
lanhu doctor --json
```

凭据解析顺序为：显式 `--cookie`（仅调试）→ `LANHU_COOKIE` → CLI Credential Store。业务命令不会静默读取浏览器；只有显式的 `auth` 和 `auth refresh` 会读取浏览器会话。

## Agent Skill 独立安装（兼容入口）

```bash
npx skills add oyjt/lanhu-design
```

技能运行文件仍位于 `skills/lanhu-design/`，可以不安装 CLI 独立运行。原脚本路径与 `LANHU_COOKIE` 行为保持兼容。
技能目录自身包含 `LICENSE.txt`、Codex/ChatGPT 展示元数据和 `evals/evals.json`，可随安装包独立分发和评测。

## 版本

本项目使用 git tag（`v*`）做版本管理，遵循[语义化版本](https://semver.org/lang/zh-CN/)。每个版本的更新内容见 [CHANGELOG.md](CHANGELOG.md)。

- 安装最新版：`npx skills add oyjt/lanhu-design`
- 安装指定版本：`npx skills add oyjt/lanhu-design#v1.0.0`
- 查看所有版本：`git ls-remote --tags https://github.com/oyjt/lanhu-design`

## Skill 独立运行的前置条件

- **Node.js >= 18**（CLI 要求 Node.js >= 20）
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

编辑用户级配置 `~/.claude/settings.json`（跨项目生效，且不进入项目仓库，推荐），添加：

```json
{
  "env": {
    "LANHU_COOKIE": "你复制的Cookie值"
  }
}
```

也可以放在项目根目录的 `.claude/settings.json` 中，但务必确认该文件已被你项目的 `.gitignore` 忽略（本技能仓库已默认忽略，你的项目不一定）。

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

Cursor 的 AI Agent 执行命令时不使用内置终端，因此 `terminal.integrated.env.*` 配置对它**无效**。请使用系统级环境变量：

**Windows：**「系统属性 → 环境变量」中添加用户变量 `LANHU_COOKIE`，值为你的 Cookie，然后**完全退出并重启 Cursor**。

**macOS / Linux：** 在 `~/.zshrc` 或 `~/.bashrc` 中添加 `export LANHU_COOKIE="你复制的Cookie值"`，然后从该终端启动 Cursor（GUI 启动的 Cursor 不读 shell rc 文件，macOS 上可用 `launchctl setenv LANHU_COOKIE "值"` 后重启 Cursor）。

> 注意：在项目根目录创建 `.env` 文件对本技能**无效**——脚本只读进程环境变量，不加载 dotenv。

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

> 注意：`set` 命令的值**不要加引号**，`set LANHU_COOKIE="xxx"` 会把引号一起存入变量，导致 Cookie 头非法、认证失败。

**Windows PowerShell：**

```powershell
$env:LANHU_COOKIE="你复制的Cookie值"
```

> **注意：** Cookie 是敏感凭据，请勿提交到 Git 仓库。存放 Cookie 的配置文件（如 `.claude/settings.json`、`.env`、shell rc 文件）应确认已被你项目的 `.gitignore` 忽略，或改用用户级配置（如 `~/.claude/settings.json`）避免进入项目仓库。

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

> `get_design_slices.mjs` 会尽量根据切图逻辑尺寸生成 `scale_urls`。`download_url` 只作为默认 Web 2x 下载源；若某些旧稿缺少尺寸导致无法生成 `scale_urls`，`1x`、`3x`、`ios-all`、`android-all` 会提示缺失，不会复制同一张图片伪造成多倍率资源。

> `get_design_specs.mjs --download-images` 会把 HTML 中的 `<img src>` 和 CSS `url(...)` 背景资源一并下载到本地映射目录，最终实现时不要保留蓝湖 CDN 地址。

## 兼容性

本技能遵循 [Agent Skills](https://agentskills.io/) 开放标准，可在 Claude Code、Codex CLI、Gemini CLI、Cursor、GitHub Copilot 等兼容的 AI 编码助手中使用。

## 开发校验

```bash
corepack pnpm install
corepack pnpm check
node tests/self_check.mjs
npx skills-ref validate skills/lanhu-design
```

`tests/self_check.mjs` 覆盖核心转换/下载逻辑和技能包结构；`skills/lanhu-design/evals/evals.json` 保存正向、边界与负向 Agent 评测用例。

## 致谢

本项目基于 [lanhu-mcp](https://github.com/dsphper/lanhu-mcp) 开发，感谢原作者对蓝湖 API 逆向工程和 MCP 工具链的开拓性工作。

## 许可证

[MIT](LICENSE)
