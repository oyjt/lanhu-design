# Lanhu 设计脚本参考

## 认证

蓝湖没有公开 API。脚本通过环境变量 `LANHU_COOKIE` 携带浏览器会话 Cookie 请求蓝湖后端。

- **获取方式**：登录 `lanhuapp.com` → F12 开发者工具 → Network → 点击任意请求 → 复制 Request Headers 中完整的 `Cookie` 值。
- **配置方式**：设置为环境变量 `LANHU_COOKIE`。
- **有效期**：Cookie 会自然过期（通常数天到数周），过期后需重新获取。
- **认证失败表现**：脚本输出包含 `认证失败` 或 `HTTP 401/403` 的错误信息。
- **敏感性**：Cookie 等同于登录凭据，不要写入技能文件或输出给用户。

## URL 规则

设计稿链接使用蓝湖项目 stage 页面：

```text
https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx
```

要求：

- `pid` 必须存在。
- `tid` 可选。
- 不要传 PRD/Axure 文档链接。包含 `docId` 的链接通常属于需求文档。
- `detailDetach` 或包含 `image_id` 的链接可用于定位单个设计图，但仍应先调用列表脚本确认。

## scripts/get_designs.mjs

用途：获取 UI 设计图列表。任何查看、分析、下载切图前都先运行它。

```bash
node scripts/get_designs.mjs "https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=xxx"
```

典型返回：

```json
{
  "status": "success",
  "project_name": "项目名称",
  "total_designs": 12,
  "designs": [
    {
      "index": 1,
      "id": "image-id",
      "name": "首页设计",
      "width": 750,
      "height": 1334,
      "url": "https://...",
      "has_comment": false,
      "update_time": "..."
    }
  ]
}
```

注意：

- 后续按 `index` 匹配时，使用返回字段 `index`，不是名称前缀。
- 名称匹配优先用完整 `name`。切图脚本支持部分匹配，但只有唯一命中时才安全。
- 当 `total_designs > 8` 时，先让用户限定范围，除非用户明确要求全部。

## scripts/download_design_images.mjs

用途：下载设计图原图到本地目录，供视觉分析。替代原 MCP 的 `lanhu_get_ai_analyze_design_result` 图片获取能力。

```bash
node scripts/download_design_images.mjs "https://lanhuapp.com/..." --designs "1,2" --output ./tmp/designs
node scripts/download_design_images.mjs "https://lanhuapp.com/..." --designs all --output ./designs
node scripts/download_design_images.mjs "https://lanhuapp.com/..." --designs "首页设计" --output ./designs
```

`--designs` 支持：

- `"all"`：全部设计图。
- `"1,2,3"`：列表中 `index` 数字，逗号分隔。
- `"首页设计"`：精确名称或唯一子串。

返回：

```json
{
  "total": 2,
  "downloaded": 2,
  "failed": 0,
  "files": [
    { "name": "首页设计", "path": "./tmp/designs/首页设计.png" }
  ],
  "failures": [],
  "output": "./tmp/designs"
}
```

下载完成后，使用 Read 工具查看图片进行视觉分析。

使用规则：

- 设计图图片只做视觉校验，不作为 CSS 数值的权威来源。
- 生成 React/Vue/Flutter/SwiftUI/Android Compose 等代码时，先读取当前项目配置和已有组件风格。

必须避免：

- 把 `rgba()` 改成 hex，或把 hex 改成 `rgba()`。
- 四舍五入尺寸、间距、透明度等数值。
- 把渐变简化成纯色。
- 删除字体 fallback。
- 用 SVG、CSS shape、emoji 或占位图替换切图。
- 在最终代码保留蓝湖远程 CDN URL。

## scripts/get_design_slices.mjs

用途：获取单个设计图的切图、图标、素材下载信息。只返回元数据和下载 URL，不直接写入用户项目。

```bash
node scripts/get_design_slices.mjs "https://lanhuapp.com/..." --design "首页设计"
node scripts/get_design_slices.mjs "https://lanhuapp.com/..." --design 1
node scripts/get_design_slices.mjs "https://lanhuapp.com/..." --design "首页" --no-metadata
```

`--design` 支持：

- 精确设计图名称。
- 列表 `index` 数字字符串，如 `"1"`。
- 唯一子串匹配。

典型返回：

```json
{
  "status": "success",
  "design_id": "image-id",
  "design_name": "首页设计",
  "version": "...",
  "canvas_size": { "width": 750, "height": 1334 },
  "total_slices": 23,
  "slices": [
    {
      "id": "layer-id",
      "name": "icon-导出",
      "type": "bitmap",
      "download_url": "https://...",
      "size": "40x40",
      "position": { "x": 12, "y": 24 },
      "parent_name": "导航栏",
      "layer_path": "首页/导航栏/icon-导出",
      "metadata": {
        "fills": [],
        "borders": [],
        "opacity": 100,
        "shadows": [],
        "border_radius": 8
      }
    }
  ]
}
```

倍率选择（在 `download_slices.mjs` 中使用）：

- Web：`1x`、`2x`、`3x`。推荐 Web 2x，通常是原始高质量图。
- iOS：`ios_1x`、`ios_2x`、`ios_3x`，文件命名通常为 `name.png`、`name@2x.png`、`name@3x.png`。
- Android：`android_mdpi`、`android_hdpi`、`android_xhdpi`、`android_xxhdpi`、`android_xxxhdpi`，分别放入 `mipmap-*` 或项目约定目录。

下载策略：

1. 先让用户确认平台和倍率，或明确采用推荐的 Web 2x。
2. 读取项目结构，优先使用项目已有资源目录。
3. 根据已有资源命名风格生成英文语义名。不能判断时用 snake_case。
4. 控制并发，下载后校验文件数量。
5. 失败项要给出名称、URL 和原因。

输出目录建议：

- React/Vue：`src/assets/images/slices/` 或 `src/assets/`
- Flutter：`assets/images/`
- iOS：`Assets.xcassets/`
- Android：`res/mipmap-*` 或 `res/drawable-*`
- 普通前端：`assets/images/` 或 `images/`

## scripts/download_slices.mjs

用途：把 `get_design_slices.mjs` 输出的 JSON 中的 `slices` 批量下载为本地文件。

示例：

```bash
node scripts/download_slices.mjs slices.json --output ./src/assets/images/slices/home --scale 2x
node scripts/download_slices.mjs slices.json --output ./Assets --scale ios-all --name-map names.json
node scripts/download_slices.mjs slices.json --output ./app/src/main/res --scale android-all
```

`names.json` 示例：

```json
{
  "icon-导出": "icon_export",
  "首页/导航栏/icon-导出": "icon_export",
  "layer-id": "icon_export"
}
```

脚本会按 `id`、`layer_path`、`name` 依次查找命名映射；没有映射时使用清理后的名称，若名称无法转为安全 ASCII，则使用 `slice_001`。

## API 端点参考

以下信息供调试和理解脚本行为使用，不需要直接调用。

| 端点 | 方法 | 用途 |
|------|------|------|
| `https://lanhuapp.com/api/project/images` | GET | 获取项目设计图列表 |
| `https://lanhuapp.com/api/project/image` | GET | 获取单个设计图详情（含 Sketch JSON URL） |
| Sketch JSON URL（从 image 接口返回） | GET | 获取设计图图层数据，解析切图元数据 |

请求头（由 `lanhu-client.mjs` 自动设置）：

- `Cookie`: `LANHU_COOKIE` 环境变量值
- `User-Agent`: Chrome 模拟
- `Referer`: `https://lanhuapp.com/web/`
- `request-from`: `web`
