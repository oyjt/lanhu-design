# 设计还原实现规则

本文档补充 `lanhu-design-tools.md` 中的基础规则，提供设计稿还原为前端/移动端代码时的详细指引。

## CSS 值保真规则

HTML+CSS 是 **`source="dds"` 时**设计规格的权威来源。必须直接复制/复用精确的 CSS 属性值，不得修改、简化或"优化"。`source="sketch"` 降级时，生成的 HTML 仅是元素清单，布局以原图为主、精确数值以 `design_tokens` / `sketch_annotations` 为准（见下方「数据来源优先级」）。

### 禁止的操作

| 操作 | 错误示例 | 正确做法 |
|------|---------|---------|
| 色值格式转换 | `rgba(255,115,10,1)` → `#FF730A` | 保留原始 `rgba(255,115,10,1)` |
| 数值四舍五入 | `0.30000001192092896` → `0.3` | 保留原始浮点数 |
| 渐变简化 | `linear-gradient(...)` → 纯色 | 保留完整渐变定义 |
| 字体顺序调整 | 删除或重排 `font-family` fallback | 保留完整字体列表和顺序 |
| 间距取整 | `padding: 13.5px` → `padding: 14px` | 保留原始数值 |
| 图片替换 | 用 SVG、CSS shape、emoji 替换切图 | 使用已下载的本地切图文件 |
| 省略元素 | 跳过"不重要"的视觉元素 | 还原所有可见元素 |
| 保留远程 URL | 代码中引用蓝湖 CDN 链接 | 所有资源下载到本地引用 |

### 数据来源优先级（按 `source` 分级）

还原前先判断 `get_design_specs.mjs` 返回的 `source` 字段，两种来源权威性不同。

**`source="dds"`（高保真）：**

1. **HTML+CSS（`html` 字段）**：颜色、尺寸、间距、字体、圆角、渐变、定位、布局结构的权威来源。
2. **Design Tokens（`design_tokens`）**：补充 HTML 缺失的渐变、阴影、边框、非均匀圆角、透明度。
3. **设计图原图**：核对布局是否错位、元素是否齐全，不覆盖 HTML 数值。

**`source="sketch"`（降级）：**

1. **设计图原图**：布局结构、层级、视觉效果的主力参考。生成的 HTML 是扁平绝对定位清单，不能当布局权威。
2. **`design_tokens` / `sketch_annotations`**：颜色、字号、间距、圆角、阴影等精确数值的权威来源。
3. **`html` 字段**：仅作元素清单和绝对定位参考。

### Design Tokens 交叉引用规则

Design Tokens 从原始 Sketch 数据提取。

- `source="dds"` 时：仅作 HTML+CSS 的**补充参考**，不能覆盖 HTML 的值。仅当 HTML 中某属性**明确缺失**（而非写法不同）时才用 Token 补充。同一属性值不同时以 HTML 为准。
- `source="sketch"` 时：Design Tokens / `sketch_annotations` 是精确数值的**权威来源**，HTML 不参与数值仲裁。
- 两种来源都重点关注：复合渐变（多色阶）、边框样式、圆角、透明度、阴影。

## 框架检测与代码生成

实现 UI 时，先检测项目类型再生成对应框架的代码。

### 检测步骤

1. 读取项目配置文件（`package.json`、`tsconfig.json`、`pubspec.yaml`、`build.gradle`、`Podfile` 等）判断框架和样式方案。
2. 根据检测结果生成匹配的代码：

| 框架 | 生成产物 |
|------|---------|
| React / Next.js | JSX 组件 + CSS Modules / styled-components / Tailwind |
| Vue / Nuxt | 单文件组件（`.vue`）+ `<style scoped>` |
| Angular | `component.ts` + `component.html` + `component.css` |
| Svelte | `Component.svelte` + `<style>` |
| Flutter | `StatelessWidget`，使用 `EdgeInsets`、`BoxDecoration` 等 |
| SwiftUI | `View` struct + `ViewModifier` |
| Android Compose | `@Composable` 函数 + `Modifier` |
| 纯 HTML | 单个自包含 `.html` 文件 + 内联 `<style>` |

3. 遵循项目已有约定（文件命名、目录结构、样式方案）。未检测到框架时默认生成纯 HTML。

### CSS 属性到各平台映射

| CSS 属性 | Android | iOS / SwiftUI | Flutter |
|----------|---------|--------------|---------|
| `width` / `height` (px) | dp | pt | logical pixels |
| `font-size` (px) | sp | pt | `fontSize` |
| `margin` / `padding` | dp（保持比例） | pt（保持比例） | `EdgeInsets`（保持比例） |
| `border-radius` | dp | `cornerRadius` | `BorderRadius` |
| `color: rgba(r,g,b,a)` | `Color.argb(a,r,g,b)` | `UIColor` / `Color(red:green:blue:opacity:)` | `Color.fromRGBO(r,g,b,a)` |
| `linear-gradient` | `GradientDrawable` | `CAGradientLayer` / `LinearGradient` | `LinearGradient` |
| `flex-row` / `flex-col` | — | `HStack` / `VStack` | `Row()` / `Column()` |
| `position: absolute` + `left` / `top` | — | `ZStack` + `.offset()` / `.position()` | `Stack` + `Positioned(left:,top:)` |

数值转换时保持精度，仅做单位换算（px → dp/pt），不要四舍五入或"优化"。

### 各框架资源引用方式

生成代码时，图片资源必须使用本地路径，按目标框架约定引用：

| 框架 | 引用方式 |
|------|---------|
| React / Vue | `import coverImg from '@/assets/slices/cover.png'` 或相对路径 |
| Angular | `src="assets/slices/cover.png"` |
| Svelte | `import` 或 `src` 相对路径 |
| Flutter | `AssetImage('assets/images/cover.png')` |
| SwiftUI | `Image("cover")` (Assets.xcassets) |
| Android Compose | `painterResource(R.mipmap.cover)` |
| 纯 HTML | `<img src="./assets/slices/cover.png">` |

## DOM 结构到框架组件映射

蓝湖设计稿的 HTML DOM 结构和 class 名称表达了布局意图，需要根据目标框架转译为对应的组件模型，同时保持所有 CSS 值不变。

### 常见 class 映射

| HTML class | 布局意图 | React/Vue | Flutter | SwiftUI |
|-----------|---------|-----------|---------|---------|
| `flex-row` | 水平排列 | `<div style={{display:'flex'}}>` | `Row()` | `HStack` |
| `flex-col` | 垂直排列 | `<div style={{display:'flex',flexDirection:'column'}}>` | `Column()` | `VStack` |
| `justify-between` | 两端对齐 | `justifyContent:'space-between'` | `MainAxisAlignment.spaceBetween` | `.frame(maxWidth:.infinity)` 配合 `Spacer()` |
| `justify-center` | 居中对齐 | `justifyContent:'center'` | `MainAxisAlignment.center` | 默认行为 |
| `items-center` | 交叉轴居中 | `alignItems:'center'` | `CrossAxisAlignment.center` | `.alignment(.center)` |
| `relative` / `absolute` | 定位层叠 | `position:'relative'` / `position:'absolute'` | `Stack` + `Positioned` | `ZStack` + `.offset()` |

### 转译原则

- 保留原始 CSS 数值，只转换布局语义。
- 嵌套结构应反映设计稿的图层层级。
- 组件拆分粒度参考设计稿中的命名分组（`parent_name`、`layer_path`）。

## 生成后保真审计清单

在任意目标平台/语言生成代码后，必须逐属性对照设计规格 HTML+CSS 进行保真检查。将每个 CSS 属性映射到平台等价物并验证值是否精确保留。

### 10 项必检清单

| # | 检查项 | HTML/CSS | Flutter | SwiftUI | Compose |
|---|--------|----------|---------|---------|---------|
| ① | 尺寸约束：规格中的固定 height 不能变成弹性/自适应 | `height`（非 `min-height`） | 固定 `SizedBox`（非 `Flexible`） | `.frame(height:)` 不能省略 | `height()`（非 `wrapContentHeight`） |
| ② | 裁剪：规格中的 `overflow:hidden` 必须在所有平台裁剪内容 | `overflow:hidden` | `ClipRect` / `ClipRRect` | `.clipped()` | `clip()` / `clipToBounds` |
| ③ | 色值：`rgba(r,g,b,a)` 必须精确转换为平台格式 | 保留 `rgba()` | `Color.fromRGBO()` | `Color(red:green:blue:opacity:)` | `Color(r,g,b,a)` |
| ④ | 渐变：`linear-gradient` 必须映射为平台渐变，不能变纯色 | 保留完整 | `LinearGradient` | `LinearGradient` | `Brush.linearGradient` |
| ⑤ | 绝对定位：`left` / `top` 值必须映射为精确偏移 | `position:absolute` + `left`/`top` | `Positioned(left:,top:)` | `.offset()` 或 `.position()` | `Box` + `Modifier.offset()` |
| ⑥ | 字体：`font-family`、`font-weight`、`font-size` 必须全部保留；HTML 保留 fallback 列表 | 完整保留 | 对应属性 | 对应属性 | 对应属性 |
| ⑦ | 间距：每个方向的 margin/padding 值不能变 | `margin` / `padding` | `EdgeInsets` | `.padding()` | `Modifier.padding()` |
| ⑧ | 图片资源：不能用 SVG / CSS shape / emoji / 占位图替换 | 本地切图 | 本地切图 | 本地切图 | 本地切图 |
| ⑨ | 元素完整性：规格中每个可见元素都必须出现在代码中 | 逐一核对 | 逐一核对 | 逐一核对 | 逐一核对 |
| ⑩ | 无远程 URL：生成的资源路径中不能包含蓝湖 CDN URL | 检查所有 `src` / `url()` | 检查所有 `AssetImage` | 检查所有 `Image()` | 检查所有 `painterResource` |

### 审计流程

1. 生成代码后，对照设计规格 HTML+CSS 逐项执行上述 10 项检查。
2. 对每个差异明确标注：**平台适配**（如 px→dp 单位转换，可接受）还是**错误**（值被改变，必须修正）。
3. 所有错误必须在交付最终代码前修正。

## 切图智能命名策略

基于切图的 `layer_path`、`parent_name`、`size` 生成语义化英文文件名。

### 命名模式

| 类型 | 模式 | 示例 |
|------|------|------|
| 图标 | `icon_{功能描述}.png` | `icon_search.png`、`icon_notification.png` |
| 背景 | `bg_{位置或用途}.png` | `bg_header.png`、`bg_card.png` |
| 按钮 | `btn_{状态或用途}.png` | `btn_submit.png`、`btn_close.png` |
| 头像/图片 | `img_{描述}.png` | `img_avatar.png`、`img_banner.png` |
| 分隔线/装饰 | `divider_{位置}.png` 或 `deco_{描述}.png` | `divider_horizontal.png` |

### 从 layer_path 生成名称

```
layer_path: "TopStatusBar/Battery/Border"
size: "26x14"
→ 建议名称: status_bar_battery_border.png

layer_path: "Button/Background"
size: "200x50"
→ 建议名称: btn_background.png

layer_path: "NavigationBar/SearchIcon"
→ 建议名称: icon_search.png
```

### 命名规范

- 使用 `snake_case`，纯 ASCII 字符。
- 中文名称翻译为英文语义（如 `首页` → `home`，`我的` → `profile`）。
- 优先沿用当前项目已有的命名风格。无法判断时默认 `snake_case`。
- 使用 `download_slices.mjs` 的 `--name-map` 参数批量应用命名映射。

## 切图目录选择规则

按优先级选择输出目录：

1. **用户指定**：用户明确给出路径时，直接使用。
2. **项目约定**：项目已有标准资源目录时，遵循现有结构。
3. **通用默认**：无约定时使用合理的默认路径。

### 各项目类型参考目录

| 项目类型 | 判断依据 | 推荐目录 |
|---------|---------|---------|
| React / Vue / Nuxt | `package.json` 含 `react` 或 `vue` | `src/assets/images/` 或项目已有的 `assets` 目录 |
| Flutter | `pubspec.yaml` | `assets/images/` |
| iOS (Swift/ObjC) | `.xcodeproj` 或 `*.xcworkspace` | `Assets.xcassets/` |
| Android | `build.gradle` 或 `AndroidManifest.xml` | `res/mipmap-*/` 或 `res/drawable-*/` |
| 普通前端 | `index.html` 无框架 | `assets/images/` 或 `images/` |

### 目录检测流程

1. 读取项目根目录结构，查找 `package.json`、`pubspec.yaml`、`*.xcodeproj`、`build.gradle` 等标志文件。
2. 识别项目类型后，检查已有资源目录路径。
3. 如果已有资源目录包含图片文件，沿用该目录（或在其下创建子目录）。
4. 通知用户选择的目录和理由。

## 倍率与平台选择指引

### 默认推荐

- 用户不指定时推荐 **Web 2x**（通常是原始高质量图）。
- 必须明确告知用户当前选择的倍率，即使使用默认值。
- 多倍率下载必须使用切图 JSON 中的真实 `scale_urls`。缺少对应 URL 时不要用 `download_url` 复制出多份文件。

### 各平台倍率对照

| 平台 | 倍率键 | 文件命名/目录 |
|------|-------|-------------|
| Web | `1x` | `name.png` |
| Web | `2x` | `name@2x.png` |
| Web | `3x` | `name@3x.png` |
| iOS | `ios_1x` | `name.png` |
| iOS | `ios_2x` | `name@2x.png` |
| iOS | `ios_3x` | `name@3x.png` |
| iOS | `ios-all` | 同时下载 1x/2x/3x |
| Android | `android_mdpi` | `mipmap-mdpi/name.png` |
| Android | `android_hdpi` | `mipmap-hdpi/name.png` |
| Android | `android_xhdpi` | `mipmap-xhdpi/name.png` |
| Android | `android_xxhdpi` | `mipmap-xxhdpi/name.png` |
| Android | `android_xxxhdpi` | `mipmap-xxxhdpi/name.png` |
| Android | `android-all` | 同时下载全部密度 |
