# lanhu-design

用于读取和导出 [蓝湖](https://lanhuapp.com) 设计稿的命令行工具，同时提供可安装的 Agent Skill。

通过 `lanhu` 命令可以完成浏览器授权、设计图查询、预览图下载、设计规格提取、切图下载和设计上下文导出。

## 功能

- 使用系统默认浏览器完成蓝湖登录
- 列出项目中的设计图
- 下载设计预览图
- 导出 HTML、CSS 和 Design Tokens 等设计规格
- 获取并批量下载 Web、iOS、Android 切图
- 一次性导出 AI 编码所需的设计上下文
- 使用 `--json` 输出适合脚本和 Agent 处理的结构化结果

## 环境要求

- Node.js 22.12 或更高版本
- macOS、Windows 或 Linux
- 能够访问 `lanhuapp.com` 的网络环境
- 已加入对应蓝湖项目的账号

## 快速开始

### 1. 安装 CLI（推荐）

```bash
npm install -g lanhu-design
lanhu --version
```

### 2. 登录蓝湖

```bash
lanhu auth
```

CLI 会优先复用已有凭据。没有可用凭据时，将读取默认浏览器登录状态；如果浏览器尚未登录，CLI 会先显示 3 秒倒计时，再打开蓝湖登录页并等待你完成登录。

macOS 从 Chrome、Edge 等 Chromium 浏览器读取登录状态时，系统可能显示钥匙串授权窗口。CLI 会在弹窗出现前说明用途，请根据需要选择“允许”或“始终允许”。

### 3. 使用蓝湖项目链接

将设计项目链接保存为变量，后续命令可直接复用：

```bash
export LANHU_URL='https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx'
lanhu designs "$LANHU_URL"
```

Windows PowerShell：

```powershell
$env:LANHU_URL='https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx'
lanhu designs $env:LANHU_URL
```

## 登录管理

| 命令 | 用途 |
| --- | --- |
| `lanhu auth` | 登录或复用已有登录凭据 |
| `lanhu auth status` | 查看当前凭据状态 |
| `lanhu auth refresh` | 重新打开浏览器并刷新 Cookie |
| `lanhu auth import` | 手动导入 Cookie |
| `lanhu auth logout` | 删除 CLI 保存的凭据 |

登录凭据与 CLI 配置统一保存在用户主目录：

- macOS / Linux：`~/.config/lanhu-design/credentials.json`
- Windows：`%USERPROFILE%\.config\lanhu-design\credentials.json`

正常情况下只需要执行一次 `lanhu auth`。如果业务命令提示登录过期，请运行：

```bash
lanhu auth refresh
```

### 手动导入 Cookie

当系统安全机制禁止读取或解密浏览器 Cookie 时，可以使用内置的手动导入方式：

```bash
lanhu auth import
```

命令会通过隐藏输入读取 Cookie，避免将敏感信息直接写入命令行历史。

获取 Cookie 的步骤：

1. 在浏览器打开并登录 `https://lanhuapp.com`。
2. 打开开发者工具，进入 **Network** 面板。
3. 刷新页面并选择任意 `lanhuapp.com` 请求。
4. 在 Request Headers 中复制完整的 `Cookie` 值。
5. 回到终端执行 `lanhu auth import` 并粘贴。

> Cookie 是敏感凭据。不要将它提交到 Git、粘贴到 Issue、写入公开日志或发送给他人。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `lanhu designs "$LANHU_URL"` | 列出项目设计图 |
| `lanhu image "$LANHU_URL" --design 首页 --output .lanhu/images` | 下载指定设计图的预览图 |
| `lanhu specs "$LANHU_URL" --design 首页 --output .lanhu/specs --download-images` | 导出设计规格及引用图片 |
| `lanhu slices "$LANHU_URL" --design 首页 --output .lanhu/slices.json` | 获取切图元数据 |
| `lanhu download .lanhu/slices.json --output src/assets --scale 2x` | 批量下载切图 |
| `lanhu export "$LANHU_URL" --design 首页 --output .lanhu` | 导出完整设计上下文 |
| `lanhu doctor` | 检查运行环境和凭据配置 |

运行 `lanhu <command> --help` 可以查看命令的完整参数，例如：

```bash
lanhu specs --help
lanhu download --help
```

## 使用场景

### 查看项目设计图

```bash
lanhu designs "$LANHU_URL"
```

设计图后续可以通过序号、精确名称或 ID 选择。

### 下载设计预览图

```bash
lanhu image "$LANHU_URL" \
  --design "首页" \
  --output .lanhu/images
```

预览图适合用于视觉分析和设计还原前的布局确认。

### 导出设计规格

```bash
lanhu specs "$LANHU_URL" \
  --design "首页" \
  --output .lanhu/specs \
  --download-images
```

输出包含可用的 HTML、CSS、Design Tokens 和设计图片。数据源可能是高保真的 DDS Schema，也可能是 Sketch/Figma 标注降级结果，命令输出会标明实际来源。

### 获取并下载切图

先保存切图元数据：

```bash
lanhu slices "$LANHU_URL" \
  --design "首页" \
  --output .lanhu/slices.json
```

再按目标平台下载：

```bash
# Web 2x
lanhu download .lanhu/slices.json --output src/assets --scale 2x

# iOS 全倍率
lanhu download .lanhu/slices.json --output ios-assets --scale ios-all

# Android 全密度
lanhu download .lanhu/slices.json --output android-assets --scale android-all
```

支持的常用倍率：

| 平台 | `--scale` |
| --- | --- |
| Web | `1x`、`2x`、`3x` |
| iOS | `ios-all` |
| Android | `android-all` |

多倍率下载只使用蓝湖提供的真实资源地址；缺少对应倍率时会报告错误，不会复制同一图片伪造多倍率文件。

### 导出完整设计上下文

```bash
lanhu export "$LANHU_URL" \
  --design "首页" \
  --output .lanhu \
  --scale 2x
```

`export` 适合交给 AI 编码助手使用，会集中导出设计图、规格和切图信息。

## 结构化输出

在任意命令中添加 `--json`，可以获得稳定的 JSON envelope：

```bash
lanhu designs "$LANHU_URL" --json
lanhu doctor --json
```

普通终端模式优先显示便于阅读的操作结果；`--json` 适合脚本、CI 和 Agent 调用。需要减少非必要输出时可使用 `--quiet`。

## Agent Skill

如果希望 Claude Code、Codex CLI、Cursor 等 AI 编码助手自动调用蓝湖工具，可以安装仓库内的 Agent Skill：

```bash
npx skills add oyjt/lanhu-design
```

推荐同时安装 CLI，并先由用户完成登录：

```bash
npm install -g lanhu-design
lanhu auth
```

安装后可以直接向 AI 描述任务，例如：

```text
帮我列出这个蓝湖项目中的设计图：<蓝湖项目链接>
```

```text
根据蓝湖项目中的“首页”设计稿还原当前页面，并下载需要的切图。
```

```text
把“登录页”的切图按 iOS 全倍率下载到项目资源目录。
```

Skill 会优先使用已安装的 `lanhu` CLI；未安装 CLI 时，仍可通过仓库内兼容脚本和 `LANHU_COOKIE` 环境变量运行。

## 使用环境变量

CLI 推荐使用 `lanhu auth` 管理凭据。自动化环境或旧脚本也可以临时设置 `LANHU_COOKIE`：

macOS / Linux：

```bash
export LANHU_COOKIE='完整 Cookie'
```

Windows PowerShell：

```powershell
$env:LANHU_COOKIE='完整 Cookie'
```

凭据使用顺序为：显式 `--cookie`（仅用于调试）、`LANHU_COOKIE`、CLI 保存的凭据。

> 不建议把 Cookie 写入项目 `.env`、仓库配置或 shell 历史。业务命令不会自动扫描浏览器，只有 `auth`、`auth refresh` 和明确启用浏览器检查的诊断命令会读取浏览器登录状态。

## 故障排查

### macOS 弹出钥匙串授权窗口

这是 Chromium 解密 Cookie 时的系统安全确认。CLI 会在可能弹窗前显示说明。首次授权后是否再次询问由 macOS 钥匙串权限设置决定。

如果不希望 CLI 访问 Keychain，可以取消授权并使用：

```bash
lanhu auth import
```

### 找不到浏览器登录状态

请确认蓝湖已在系统默认浏览器中登录，然后重新执行 `lanhu auth`。如果登录位于其他 Profile，可以显式指定：

```bash
lanhu auth --browser chrome --profile "Profile 1"
```

支持的浏览器包括 Chrome、Edge、Brave、Arc、Dia、Chromium、Firefox 和 Safari。

### Windows 无法读取 Chrome 或 Edge Cookie

如果浏览器已经登录但 CLI 仍然无法读取，请先确认登录所在的 Profile，必要时显式指定：

```powershell
lanhu auth --browser edge --profile "Profile 1"
```

新版 Chromium 可能使用 App-Bound Encryption，普通进程无法解密。此时可以改用 Firefox 登录，或执行 `lanhu auth import`。认证失败时，CLI 也会直接给出这两种兜底方式。

### 登录状态失效

```bash
lanhu auth refresh
```

如果仍然失败，先在浏览器退出并重新登录蓝湖，再运行刷新命令。

### 环境诊断

```bash
lanhu doctor
```

提交 Issue 时可以附上 `lanhu doctor --json` 的脱敏结果，但不要附带 Cookie。

## 兼容脚本

原有脚本继续保留在 `skills/lanhu-design/scripts/`，供 Skill 独立运行和旧调用方式使用：

| 脚本 | 用途 |
| --- | --- |
| `get_designs.mjs` | 列出设计图 |
| `download_design_images.mjs` | 下载设计预览图 |
| `get_design_specs.mjs` | 提取设计规格 |
| `get_design_slices.mjs` | 获取切图元数据 |
| `download_slices.mjs` | 批量下载切图 |

兼容脚本要求 Node.js 18 或更高版本，并通过 `LANHU_COOKIE` 完成认证。新用户建议优先使用 CLI。

## 开发与发布

```bash
corepack pnpm install
corepack pnpm check
```

项目使用语义化版本和 `v*` Git 标签发布 npm 包，更新记录见 [CHANGELOG.md](CHANGELOG.md)。仓库维护约定见 [AGENTS.md](AGENTS.md)。

## 致谢

本项目基于 [lanhu-mcp](https://github.com/dsphper/lanhu-mcp) 开发，感谢原作者对蓝湖 API 和工具链的探索。

## 许可证

[MIT](LICENSE)
