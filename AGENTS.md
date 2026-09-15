# Repository instructions

本文件面向维护 `lanhu-design` 仓库的 AI 编码助手。面向最终用户的操作说明写入 `README.md`；安装后指导 AI 使用蓝湖能力的运行规则写入 `skills/lanhu-design/SKILL.md`。

## 项目目标

- 提供 npm 包 `lanhu-design` 和可执行命令 `lanhu`。
- 提供兼容 Agent Skills 标准的 `skills/lanhu-design/`。
- CLI 与 Skill 共享现有蓝湖脚本能力，不破坏旧脚本入口。

## 目录职责

- `src/`：TypeScript CLI、认证、配置、命令适配和错误处理。
- `skills/lanhu-design/`：可独立安装的 Agent Skill、兼容脚本和设计还原规则。
- `tests/`：Vitest 单元测试及 Skill 自检。
- `.github/workflows/`：CI 与 npm 发布流程。
- `README.md`：面向使用者的安装和操作手册，不记录内部排障过程。
- `CHANGELOG.md`：版本变化、兼容性调整和重要实现行为变更。

## 修改约束

- 保持 ESM，并在 TypeScript 相对导入中使用 `.js` 后缀。
- CLI 支持 Node.js 22.12 及以上；Skill 兼容脚本支持 Node.js 18 及以上。
- 不删除或重命名 `skills/lanhu-design/scripts/` 下的兼容入口，除非明确安排破坏性版本升级。
- 业务命令不得静默读取浏览器 Cookie。只有显式认证命令和明确启用的浏览器诊断可以访问浏览器登录状态。
- 普通终端输出应面向用户可读；`--json` 必须保持稳定、纯净、可供程序解析，不混入交互状态文本。
- 项目主要面向中国用户，用户文档、终端提示和关键业务注释优先使用简洁中文。
- 使用 `LanhuError` 和已有稳定错误码表达可预期失败，不直接泄露底层堆栈。
- 不输出、记录、提交或上传 Cookie、请求认证头和其他敏感凭据。
- 配置根目录固定为用户主目录下的 `.config/lanhu-design`，不要恢复平台相关路径或增加自定义目录入口。
- 不使用未经确认的蓝湖接口作为登录成功判定。无项目上下文时只做本地凭据检查，服务端权限由真实业务请求确认。
- macOS 读取 Chromium Cookie 前必须提示可能出现 Keychain 授权窗口；避免轮询、多浏览器或多 Profile 重复读取。
- Windows Chromium 解密受限时保留 `lanhu auth import` 和 Firefox 兜底。
- 修改 CLI 行为时同步更新 README、CHANGELOG 和相关测试；修改 Skill 行为时同步更新 Skill 文档、引用文件和自检。

## 验证要求

提交前至少运行：

```bash
corepack pnpm install
corepack pnpm check
```

`pnpm check` 必须完成 TypeScript 类型检查、Vitest、Skill 自检和 CLI 构建。涉及 npm 包内容时额外运行：

```bash
pnpm pack --dry-run
```

新增或修改认证流程时，应覆盖以下分支：

- 已保存凭据，无浏览器和 Keychain 访问。
- 浏览器已有登录态。
- 浏览器未登录，打开登录页后重试。
- Cookie 过期。
- 系统禁止 Cookie 解密。
- 人类可读输出、`--json` 和 `--quiet` 输出。

## 发布约定

- 使用语义化版本。
- npm 包名为 `lanhu-design`，二进制命令为 `lanhu`。
- `v*` 标签必须与 `package.json` 版本一致，标签推送后由 `.github/workflows/publish.yml` 发布。
- 不手动绕过 CI 或在验证失败时发布。
