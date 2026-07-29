# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)；版本以 git tag（`v*`）形式发布，安装/更新时可指定 tag 锁定版本。

## 未发布

- 支持提取 Photoshop 稿切图：设计 JSON 根节点 `type=ps` 时，自动从 `assets[]` 按图层 id 提取 `png_xxxhd`/`svg` 地址（兼容老数据 `isSlice` 和新数据 `isAsset` 标记），并按 PS 稿 @2x 基准推导 Web/iOS/Android 多倍率 `scale_urls`。
- 新增「临时文件清理规则」：设计还原交付后，设计图原图、规格 HTML、切图 JSON、命名映射等中间产物应删除（删除前需确认代码无引用），仅保留被代码引用的切图文件。

## 1.0.0 - 2026-07-29

- 新增 `get_design_specs.mjs`：基于 DDS Schema 提取设计规格 HTML+CSS 与 Design Tokens，Sketch/Figma 数据作为降级路径。
- 适配蓝湖 Figma 导出格式，修复降级路径还原度。
- 将可安装技能移动到 `skills/lanhu-design/`，在支持子目录安装时避免把仓库说明、测试等文件装进技能目录。
- 将自检脚本移动到 `tests/self_check.mjs`，并更新本地校验命令。
- 修复遍历蓝湖嵌套图层数据时重复提取切图的问题。
- 在 DDS 和 Sketch/Figma 转换输出中转义生成的 HTML 文本和属性。
- `get_design_slices.mjs` 现在会根据切图逻辑尺寸生成 Web/iOS/Android 多倍率 `scale_urls`。
- `get_design_specs.mjs` 的图片本地化现在同时覆盖 `<img src>` 和 CSS `url(...)` 背景资源。
- Sketch/Figma 降级规格会输出 `data-css`、`layer_css_annotations` 和按类型分组的标注摘要。
- Sketch/Figma 降级倍率优先读取 `device`、`sliceScale`、`exportScale` 和 `meta.sliceScale`，再回退画布尺寸判断。
- 非 2x 与多密度切图下载必须使用真实的 `scale_urls`，不再把同一个 `download_url` 复制成多倍率文件。
- 忽略 `.env` 和 `.claude/settings.json` 等本地敏感配置文件。

## 0.1.0 - 2026-06-06

- 首个公开版本：列出设计图、下载设计图原图、获取切图元数据、批量下载切图（Web/iOS/Android 多倍率）。
- 提供设计还原实现规则（CSS 值保真、DOM 结构映射、切图命名策略、目录选择、倍率指引）。
