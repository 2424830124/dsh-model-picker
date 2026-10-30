# AGENTS.md

给 AI agent 和人类贡献者的仓库说明。**动手前先读这一页**，里面的坑都是踩过的。

用户视角的说明在 [README.md](README.md)。

## 这是什么

`@huai_xin/dsh-model-picker` 是 DSH（DeepSeek Harness）的一个插件：把输入框的模型选择控件
（槽位 `conversation.input.model`）换成一个可搜索、按 provider 分组的列表，并把思考档位拆成
独立控件。

**它只换 UI，不碰数据层。** 会话目录、模型目录缓存、失效刷新、选择 RPC——全部是官方
`ui-model-selection` 的实现，本插件通过 `modelDirectories` 服务读取。

## 目录与分层

```
src/
  client.js          入口：模块注册 + 插件对象 + 槽位注册
  core/
    rank.js          搜索排序：官方 rankByName 的 vendored 副本
    order.js         供应商卡片顺序：官方 orderModelProviders + 本插件的置顶规则
  ui/
    ModelPicker.js   组件：触发器 + 模型面板 + 档位面板 + 失败提示框
    EffortSlider.js  档位滑杆（自绘轨道 + 隐藏的原生 range input）+ `tierFor`
    anchor.js        浮层定位：以触发器为中心，再夹进视口
    Chevron.js       展开箭头
    CaptionMark.js   档位标题的矢量字（仅中文）
    caption-glyphs.js 矢量字轮廓数据
    dict.js          中英字典
    styles.js        样式表（仅 --dsw-* 主题令牌）
scripts/build.mjs    零依赖打包器：按依赖顺序拼接 src/ → client.js
client.js            **构建产物，勿手改**
test/unit/client.mjs 离线单测（自带迷你 React，无依赖）
docs/*.png           README 的预览截图（深色 / 浅色）
index.js             宿主半边：只提供诊断路由 /model-picker/client-log
```

`docs/` 里的图片被 README 引用，所以 `package.json` 的 `files` 必须列出 `docs/*.png`，
否则 npm 包页面上图片是坏的（README 进了包、图片没进）。加新截图时两处一起改。

## 构建：为什么必须有这一步

**Client 模块加载器给每个包只有一个浏览器入口**（`exports["./client"]`），并以 classic script
执行，**不会在运行时解析插件的 ESM 依赖图**。所以源码拆开维护、构建时拼接成单文件。

打包器只做四件事：深度优先收集本地 `./x.js` 依赖、剥掉 `import`/`export` 语法、按依赖顺序拼接、
再整体包进一个 IIFE。不做 tree-shaking，也不解析裸模块——遇到裸 import 直接报错（宿主模块必须从
factory 的 `require` 取）。

```sh
pnpm build    # 重新生成 client.js
pnpm test     # 构建 + 离线单测
```

单测会校验产物是否由当前源码构建：每个模块在产物里有 `//# module: src/...` 标记，且产物不得
旧于任何源文件。**改完 src/ 忘记构建，测试会红**——这是故意的。

护栏在**写文件之前**跑：BOM、CSS 注释嵌套/未闭合、样式表模板里的反引号、花括号配平，任何一条
不过就直接抛错退出，磁盘上的 `client.js` 保持上一版可用的内容。所以"构建失败"不会把宿主搞白屏。
（这条是踩过之后加的：早期先写后校验，一个注释里的反引号把整个 bundle 写坏了，宿主启动即报
`SyntaxError`。）

**CSS 注释里不要写反引号。** 样式表是模板字面量，注释里的反引号会提前闭合它；护栏会拦，但别浪费
一次构建。

**所有模块共用一个作用域，而这个作用域是 IIFE 的，不是页面的。** 产物形状是
`(() => { ...各模块... })()`；`factory(require)` 里只有入口对象，模块并不在 factory 内部。必须
包这一层：loader 以 **classic script** 执行产物，顶层 `const` 会落进页面的全局词法作用域，于是

- 别的插件包只要声明了同名顶层变量（`CSS`、`SLOT`、`report` 这种名字），后加载的那个整包解析
  失败；
- 宿主对同一个 entry 再执行一次（重新装配插件表、reload）会抛
  `Identifier '…' has already been declared`，注册不上去，插件就"凭空消失"。

这不是理论风险：2026-10-24 的宿主日志里 `CAPTION_VIEWBOX` 重复声明刷了 169 次，而磁盘上的产物
一直是干净的——纯粹是顶层 `const` 的锅。IIFE 加进去之后，16:22 那次重新装配走完了完整链路
（`client.js 已执行` → `factory` → `apply` → `槽位回调`），此后再没出现过。
`test/unit/client.mjs` 里有一条 `vm` 双执行断言盯着它；注意它**不能**用 `import()` 写——ESM 给
文件模块作用域、还按 URL 缓存，两个问题都会被藏起来。

包了 IIFE **不等于幂等**：重复执行现在能过解析，但 loader 仍会拒绝同一个 id 的第二次 `load()`
（原文 "duplicate factory registration … (bundle executed twice without invalidate?)"）。真出现
那句时去查宿主有没有先 invalidate，别在本仓库里找。

护栏仍会拦"两个模块声明同名顶层变量"并指出模块与行号——那是**构建坏了**，和上面这条运行时重复
执行长得像、成因相反。

写文件走临时文件 + `rename`（同一卷上原子替换）：宿主每次加载页面都直接读磁盘上的 `client.js`，
非原子写会让某个窗口读到半截文件。

## 不能违反的不变量

### 1. 不要复制官方 bundle，要复用它的服务

这是本仓库最重要的一条，**踩过两次**。

官方的 `ui-model-selection` 里有 `ctx.plugin(ModelDirectoryResolver)`，会注册
`modelDirectories` 服务。如果把整个 bundle 复制一份：

- 两个 `ModelDirectoryResolver` 抢同一个服务名
- 官方插件卡在 `loading`，报 `web boot: 1 entry did not activate`
- **整个渲染进程启动失败**，诊断包里 `pluginIds` 指向 `@deepseek-ai/dsh-client-ui-model-selection`

正确做法是只注册槽位、复用官方已注册的服务：

```js
ctx.inject(['slots', MODEL_DIRECTORIES], (scope) => {
  const models = scope.get(MODEL_DIRECTORIES)   // 官方那份
  scope.slots.register({ ... }, MyComponent)
})
```

**绝不** `ctx.provide('modelDirectories', ...)`——单测里有一条断言专门盯着这个。

### 2. 槽位注册**不要**声明 `conversation.input.model.label` 子槽位

这一条和直觉相反，**踩过**，别改回去。

官方占用者已经声明了 `conversation.input.model.label`（provider 插件把徽标挂在那里）。而**子槽位
声明是按 key 独占的**：`slots.register` 在 `options.children` 里看到同一个子槽位时，会直接抛
`slot "…label" is already declared (by …)`。

所以问题不在"谁来声明"，而在**根本轮不到第二个声明**：

1. 我们的入场比官方晚，子槽位已经有声明；
2. 带 `children` 注册时 `register` 立刻抛错；
3. 异常从槽位回调里逃出去，整个 picker 停摆——列表只画出分组标题，一行模型都没有。

先 dispose 再注册也没用：那条声明属于官方条目，而官方从不 dispose。

**不声明才是稳定的。** 代价是 provider 徽标在这里不显示，模型名回落成纯文本——这是有意的取舍：
能用的选择器，好过带徽标但不渲染的选择器。

> 单测里有一条断言盯着 `options.children === undefined`，别删。

### 3. priority 必须低于官方占用者的 0

`single` 槽位里**最低 priority 渲染**。官方占用者是 `0`，所以要 shadow 必须用负数（本插件
用 `-1`）。用正数会输给官方，插件看起来"没生效"。

### 4. 组件 props 契约来自官方注册的 `inject`

官方的槽位注册交给组件的东西是：

```js
{
  available,                 // 这个会话能不能换模型
  directory,                 // 会话目录的 STORE（不是 controller）
  load: () => {},            // 请求目录加载
  select: (selection) => {}  // 提交选择，返回 { ok, value } / { ok, error }
}
```

`directory` 是 store 本身，有 `getSnapshot` / `subscribe`，**不是**带 `.store` 的对象。
早期版本按 `.store` 读，拿到 `undefined`，组件永远显示"正在读取模型列表"。

`select` 的返回值也**必须原样透传**：官方 `ModelDirectory.select` resolve 出
`{ ok: true, value }` 或 `{ ok: false, error }`，组件靠 `result.ok` 决定关不关面板、报不报错。
早期把它 map 成 boolean，结果是模型切了、面板还开着，档位成功后乐观值也被当成失败清掉。
单测里有一条断言盯着这个。

### 5. locale 快照的字段是 `active`，不是 `locale`

`LocaleRuntime.getLocale()` 返回 `{ active, locales, revision }`。早期读 `snapshot.locale`，
永远是 `undefined`，于是不管宿主切成什么语言，界面都是中文。

注册时把 locale 服务本身（`getSnapshot` / `subscribe`）交给组件，而不是解析成一个字符串：
`inject` 的结果按 session binding 缓存，字符串会一直冻在注册那一刻，切语言不会生效。

### 6. `exports` 必须包含 `"./package.json": "./package.json"`

客户端模块扫描器用 `createRequire(...).resolve('<包名>/package.json')` 定位包，解析失败就
**直接跳过这个 entry**——没有报错、没有日志，插件永远不出现在浏览器里。

### 7. profile 里的本地链接必须是绝对路径

`dsh plugin add <本地目录>` 在 Windows 上会生成**相对路径**的符号链接：

```
node_modules\@huai_xin\dsh-model-picker -> ..\..\..\..\..\..\Projects\dsh-model-picker
```

从 `node_modules\@huai_xin` 往上解析得到 `C:\Users\Projects\dsh-model-picker`——**不存在**。
加载器读不到文件，报：

```
loaded without registering "@huai_xin/dsh-model-picker" via __ModuleLoader__.load
```

这看起来像 bundle 语法错误，实际是路径问题。自查与修复：

```powershell
$link = "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\@huai_xin\dsh-model-picker"
(Get-Item -LiteralPath $link -Force).Target        # 应当是绝对路径
cmd /c "rmdir `"$link`""
cmd /c "mklink /D `"$link`" `"E:\Projects\dsh-model-picker`""
```

> 排查时先排除这一条：`node --check client.js` 通过、且把产物当 classic script 用 `vm` 跑
> 一遍能正常注册，就说明代码没问题，问题在路径。

### 8. 不要往发布的文件里写 BOM

安装器用 `JSON.parse` 校验 `package.json`，开头的 U+FEFF 会让它抛错，安装被回滚：

```
Cannot validate installed package @huai_xin/dsh-model-picker:
SyntaxError: Unexpected token '\uFEFF'
```

Windows 上最常见的成因是用 PowerShell 的 `Set-Content -Encoding UTF8` 改文件（默认写 BOM）。
改文件请用 .NET 的无 BOM 写入：

```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
```

`scripts/build.mjs` 和单测各有一道检查盯着这个。

### 9. 样式只用 `--dsw-*` 主题令牌

不用字面色值（图标除外）。令牌改名最多让外观退化，不会让渲染崩掉。尺寸对齐官方菜单：
面板 `max-content` 宽（不是固定值）、条目 `min-height: 34px`、内边距 `5px 7px`。

**悬浮/按下用半透明 interactive 令牌，不要用 `bg-layer-*`。** 这一条踩过：
`.dmp-trigger-effort:hover` 原来用 `--dsw-alias-bg-layer-2`，而它在两套主题里都等于输入框
自己的底色（浅色是 `#fff` 叠在 `#fff` 上，深色是 `#2c2c2e` 叠在 `#2c2c2e` 上），结果悬停
时**什么都没变** —— 整行控件里只有档位按钮没有反馈。`bg-layer-*` 描述的是"表面层级"，
不是交互态。用 `--dsw-alias-interactive-bg-hover`（半透明，叠在任意背景上都可见）。

**已知的例外只有三组，都是"刻意的字面色值"**，别把它们"修"回令牌：

1. 纯白与纯黑（描边、滑块圆环、粒子）。它们要在深浅两套主题下读起来一致，令牌反而更不可控。
2. 两个档位强调色 `#ba82ff` / `#f7c473`，见不变量 13。
3. WorkBuddy 卡片自己的强调色 `#12bfa0`（`.dmp-card[data-accent="workbuddy"]`）：那是那个插件的
   身份色，宿主没有对应的令牌。它只在 `CARD_ACCENTS` 列出的卡片上生效，别的卡片仍是共享蓝。

`test/unit/client.mjs` 扫样式表里的字面色值，白名单就是上面这几项；加新的字面色值要同时改测试，
否则测试会红——这是有意的。

### 10. 滑杆的形状用 `clip-path` + SVG 描边，不用 `border-radius`

档位滑杆的胶囊形状**不能**靠 `border-radius`：在宿主里实测过，32px 高、声明 `border-radius: 16px`
的元素画出来圆角只有 ~10px，不管写 `999px`、`calc()` 还是字面量都一样，两端看着就是圆角矩形。

所以形状交给 `clip-path: inset(0 round 15px)`：它同时裁剪元素**和子元素**，轨道、蓝色填充都由它
裁出同一个形状，填充自己不带任何圆角，因此不可能出现"两个圆弧套在一起、角落露底色"。
`border-radius` 留着只是给不支持 `clip-path` 的浏览器兜底。

**描边也必须用 SVG，不能用 `box-shadow`。** `box-shadow` 是栅格边缘：1px 平但发灰，1.5px 落在
像素中间被抗锯齿摊成约 2px 的雾带，看着"脏"。轨道描边是 `<rect>` + `vector-effect:
non-scaling-stroke`，和滑块圆环同一种绘制方式，横向拉伸也不会被压扁。描边宽度 2px、`x/y` 内缩 1px
（SVG 描边骑在路径上，不内缩会被 `clip-path` 裁掉一半）。

配套的数必须自洽：

| 变量 | 值 | 作用 |
|---|---|---|
| `--dmp-rail-height` | 28px | 轨道高度，`clip-path` 的半径按它写（15px = 半高 + 1） |
| `--dmp-thumb-size` | 28px | 滑块直径 |
| `--dmp-stop-left` | 28px | 第一个档位圆心离轨道左端——**故意不等于右端** |
| `--dmp-stop-right` | 16px | 最后一个档位圆心离轨道右端，比半径多半步，留一道细缝 |

整套尺寸是同一比例的（面板 322×177，标题 16px，刻度 11px，提示 11px）。**改大小要成套改**：
只调高度不改半径，端点立刻从半圆退回圆角矩形。

行程是**不对称**的：最左档停在离端头 28px 处（滑块左缘留 14px），最右档留 2px 细缝。这是产品要求，
不是 bug。点数、刻度文字、蓝色填充、原生 range 的指针行程全部由这两个 offset 推导，改一个全都跟着动。

**刻度文字的锚点必须统一为居中。** 早期两端标签用 `transform: none` / `translateX(-100%)` 防止溢出，
结果文字整体偏到档位点左侧，看起来就是"对不齐"。

### 11. 粒子与拖尾

粒子用 `#fff`，**不跟主题令牌**。`--dsw-alias-label-primary` 在浅色主题下是近黑色，会在淡蓝填充
上画出黑点。

- 数量：只渲染 `EMIT` 表的前 N 条，`share` 用二次曲线（低档更稀、高档更密）
- 距离：`--dmp-emit-reach` 直接乘进 `@keyframes` 的位移，最高档到 1.0（约 150px，越过轨道中点）
- 速度 / 频率：`animation-duration` 和 `animation-delay` 同时缩短，两者共同决定"喷得多快多密"

`EMIT` 表是**手写**的，不是生成的：它的 `dy0` 上下交替、`dx` 无规律，是为了让"取前 N 条"也铺满整个
截面，同时避免规律感。改这个表要重新检查低档位是否仍覆盖上下边缘。

**拖尾只在最高档显示，但节点常驻 DOM**，用 `data-trail` + `opacity` 过渡淡入淡出。条件挂载会让它在
滑块跨过最后一个档位时突然出现/消失。


### 12. `inject` 必须包含**被调用服务自己需要的服务**

这一条踩过，代价是插件在界面上凭空消失了好几次。

`models.directoryFor(sessionId)` 是官方服务的方法，但它跑在**调用方的上下文**里，内部会读
`ctx['remote.session']`。**属性访问**（`ctx.remote`、`ctx['remote.session']`）按 fiber 的 inject
表放行；`ctx.get(name)` 才是那个例外——它明写着 "without the inject requirement"，不受限制。
所以哪怕本仓库一次都没提过 `remote.session`，它也必须出现在依赖表里：

```js
inject: ['locale', 'sessions', 'slots', 'remote', 'remote.session']
ctx.inject(['slots', MODEL_DIRECTORIES, 'remote', 'remote.session'], (scope) => { ... })
```

漏掉的后果不是报错，而是：

```
Error: cannot get property "remote.session" without inject
```

从 `inject` 里抛出 → 渲染层错误边界捕获 → **条目被退役** → 自动改用官方条目。外面只看到"插件
没了"，日志里一条都没有（直到把 `console.error` 转发进宿主日志才现形）。

**这条没法靠单测证伪**：本仓库的单测用的是扁平的假 context，所有服务共用一个隔离域，属性访问
沿父链就能走到，删掉声明照样绿。真实宿主里 composer 是隔离作用域，父链上的 isolate 键对不上就
直接抛。2026-10-24 00:27 的宿主日志里留着一份实证（当时嵌套的 `ctx.inject` 只写了
`['slots', MODEL_DIRECTORIES]`，插件就是这样没的）。别用"单测过了"反推依赖多余。

推论：不能凭"这个标识符没被引用"判断依赖多余。**被调用方需要的能力，就是调用方的依赖。**


### 13. 只有最高两档有专属色，而且颜色是"跟着档位换"的

配色抄自 Codex 的 TUI（它的档位色见 `codex-rs/tui/src/bottom_pane/effort_ignition.rs` 的
`hues()`）：Codex **只给最高的两档上色**，而不是给每一档排一条彩虹。本插件照这个思路：

| 档位 | 颜色 | 来源 |
|---|---|---|
| 最高档 | `#ba82ff` 紫 | Codex Ultra 深色主色 `(186,130,255)` |
| 第二高档 | `#f7c473` 浅琥珀 | Codex Max 深色主色 `(255,178,66)`，按用户要求调淡 |
| 其余档位 | 原来的品牌蓝 `--dsw-static-deepseek-450` | —— |

Codex 每档给三个色相供渐变动画用，这里只用第一个。**别自己排成连续渐变**：正是因为下面几档保持
蓝色，"最高两档不一样"才有信息量。

实现是**一个变量 + 一个属性**：`tierFor(index, count)` 返回 `'top'` / `'high'` / `undefined`，挂到
`data-tier` 上，样式表用属性选择器改写 `--dmp-accent`。滑杆填充、右上角胶囊、刻度高亮、档位按钮
文字全都读这一个变量，所以改一处颜色会自动一致。**粒子不在其中**：它固定白色（见不变量 11），
不跟档位变色。

**`tierFor` 必须导出、并且在两处各算一次。** 档位按钮在输入框那一行，**不在滑杆的 DOM 子树里**，
CSS 选择器够不着；所以 `ModelPicker` 自己算一遍挂到按钮上。它定义在模块作用域而不是组件内部，
就是为了这个。

**颜色的过渡必须写在基础规则上，不能写在 `[data-tier=…]` 那条规则里。** 过渡只有在"结束状态"那条
规则带 `transition` 时才会播放；写在 tier 规则里，进档有渐变、**退档（Max 拖回 High）会硬跳回白**。

**拖拽时不能连颜色一起取消。** 有一条 `.dmp-slider-dragging … { transition: none }` 用来让滑块跟手，
但用户恰恰是在拖动时跨越档位边界——那里必须保留 `background-color .34s`，只让几何属性（`width` /
`left`）归零。这条是踩过的：整组 `transition: none` 会让颜色最该平滑的时刻硬跳。


## 数据层契约（官方提供，本插件只消费）

组件从 `directory` store 读这些字段：

| 字段 | 含义 |
|---|---|
| `current` | 当前选择（`{ provider, model, reasoningEffort }`） |
| `routable` | Host 是否还接受这个选择 |
| `groups` | 按 provider 分组的模型列表 |
| `failures` | 加载失败的 provider 组 |
| `status` | `idle` / `loading` / `ready` / `selecting` / `error` |
| `pending` | 正在结算的选择 |
| `error` | 失败信息（加载失败和选择失败共用这个字段） |
| `retainedEffort` | 模型没有 `reasoning` 时沿用的档位名。本插件**不读**它：没有声明档位的模型直接不显示档位控件 |

触发器的文案优先级：`status === 'loading' && current === null` 时显示"正在读取模型列表"，
否则显示模型名，再否则显示"没有可用模型"。

`error` 分两种来源，用 `lastActionRef` 区分：只有**加载**失败才进模型面板里的 note；
**选择**失败走面板上方的提示框。

### 可选的 provider 状态服务

模型行的倍率 / 状态 / 负载圆点来自 provider 插件**自己发布的客户端服务**，当前只有一个：

```
@huai_xin/dsh-workbuddy/state   { getSnapshot, subscribe }
```

- 形状：`{ version, updatedAt, providers: { [providerId]: { region, provider, displayName,
  loggedIn, pending, credits, models: { [modelId]: { name, verdict, busy, rate } } } } }`；
- `verdict` 是**语言无关的英文 token**（`available` / `unusable` / `no permission` /
  `credentials rejected` / `out of credits` / `rate limited` / `unknown`），由我们翻译成中文，
  别指望对方发中文——它上一版就是发中文字符串，切语言就崩；
- `busy` 是 `idle` / `busy` / `congested` / `unknown`；`rate` 是展示串（`0.23x` / `free` / `unknown`），
  **不提供数值**，要排序得自己解析；
- 服务**是可选的**：`src/client.js` 用 `createProviderStateSource(scope, name)` 晚绑定地包一层，
  每次都重新 `scope.get`，拿不到就返回空快照——**绝不要把它写进 `inject`**。写进去而对方没装，
  Cordis 会一直等这个服务，我们的槽位就永远不注册，整个插件"消失"；
- 服务名**是写死的**（`PROVIDER_STATE = '@huai_xin/dsh-workbuddy/state'`），不是通用的"任何插件发布
  同形状服务都能接入"——README 里说"没有白名单"指的是**卡片合并和强调色表**（`cardKeyOf` 按 id 前缀、
  `CARD_ACCENTS` 查表），状态服务这一层就是点名绑定。第三家想接入时把 `PROVIDER_STATE` 换成可配置的
  服务名列表，别在文案里先把话说满；
- 读的时候整表按 `providerId` → `modelId` 两级查找，键与目录里的 `group.id` / `model.id` 完全一致，
  不需要归一化。

## 交互约定（都是踩过之后定的）

- **选模型成功 → 面板不关。** 选模型是比较过程，不是提交；选中的行就地标成当前项（`dmp-item-current`），
  面板留着方便接着比。失败 → 面板保持打开，上方弹出提示框，可以直接再选一个。
- **模型列表按 provider 分卡片**（`.dmp-card`，`role="group"`）：官方目录里同名模型会同时挂在两个
  provider 下（DeepSeek 和 DeepSeek Account 都列 V4.1-Flash），平板式列表加一行小标题时看不出边界。
  **卡片头只写 provider 名**（同时作为 `aria-label`），不印 provider id——id 是给程序看的，列表里
  没有第二个地方需要它；卡片体是模型行。
  卡片面用 `--dsw-alias-bg-layer-1`——这是**表面层级**的用法（面板里的一层），不是交互态；悬停仍走
  interactive 令牌，两者不冲突，别把卡片"改回"成 hover 令牌。
- **卡片可以带自己的强调色**（`CARD_ACCENTS` → `data-accent` → 样式表里的 `--dmp-accent` 覆盖）。
  目前只有 `@huai_xin/dsh-workbuddy`，用那个插件自己的青绿 `#12bfa0`；表里没有的卡片保持共享蓝。
  强调色同时决定选中行、标签下划线和"免费"胶囊，改一处三处一致。
- **同一个插件注册的多个 provider 合并成一张卡，卡内用标签页切换**（`cardKeyOf`）：key 是 provider
  id 去掉最后一段（`@huai_xin/dsh-workbuddy/cn` / `/intl` → `@huai_xin/dsh-workbuddy`）。没有 `/` 的
  id 自成一张卡，这是常态。合并后卡片头显示两边显示名的**公共前缀**，卡内是一条**居中的**标签栏：
  **标签名优先用发布出来的 `region` 翻译**（`cn`→大陆版、`intl`→海外版，英文界面是 Mainland /
  Overseas），只有拿不到 region 时才回落到"显示名去掉公共前缀"的碎片——provider 面板的显示名是英文
  写的，照抄会让中文面板里长出两个英文标签。标签栏是**两列等宽、整组居中**（`grid-template-columns:
  repeat(2, minmax(0, 112px))` + `justify-content: center`，列间距 10px），文字在列内居中，下划线跟着
  列宽走——两列占满整张卡时两个词会被推到两头，看着像两件事，收窄成一组才像同一组选项；112px 是装得下
  「积分 1766.68 ⟳」的最小宽度，再窄账户行就要换行。
- **每个部署标签下带一行账户状态**：已登录显示「积分 <数值> ⟳」，未登录显示「登录」按钮。数据是快照里的
  `loggedIn` / `credits`；动作调 provider 服务的 `refreshCredits(region)` / `login(region)`，参数传
  **完整 provider id**（那个服务三种写法都收，传 id 最不容易错）。刷新时图标转圈、按钮 disable；
  登录期间按钮文字变「登录中…」。**动作失败要吞掉**：那个插件在自己的面板里讲它的错误，模型列表不是
  讲登录失败的地方，抛到界面上只会把一次点击变成一条无头无尾的红字。
- **登录完成必须由 provider 发拓扑事件，选择器这边等不来。** 官方目录的 `load()` 在
  `status === 'ready'` 时直接返回缓存，客户端也没有公开的 `refresh()`——唯一能触发重读的就是宿主的
  `llm/adapters-updated` 转发事件。所以"登录后模型不出现"**不是选择器的 bug** 时，去查 provider 插件
  的登录完成路径有没有 `notifyModelTopology(ctx)`（dsh-workbuddy 0.8.0 补上了；那一版的坑是只有
  logout / 开关模型发了，login 漏了）。选择器能做的只有两件：空窗期补 `load()`（万一目录自己没
  ready），以及账户行动作成功后立刻 `refresh()` 一次状态，不等下一个轮询周期。
- **列表打开期间：立刻刷一次，然后每 2 秒一次；关闭就停**（`panel === 'model'` 时的 `setInterval`，
  清理函数里 `clearInterval`）。那个插件在**静置时每 5 分钟**才刷新一次自己的快照，2 秒的轮询只在
  **它自己的设置面板**打开时跑，而倍率和繁忙程度是实时数据——不主动要就是几分钟前的数字。同一个 tick 还负责"**已登录但目录里还没有模型**"的那段空窗：
  此时额外调一次目录的 `load()`，否则刚登录完的部署会长时间显示「暂无可用模型」。定时器要 `unref()`
  一下，否则离线单测进程会因为活着的 interval 永不退出（这是踩过的）。
- **目录里没有、插件快照里有的 provider，一律补成零模型小节**（`stateOnlySections`）：没有凭据的
  provider 不注册模型，刚登录完的那一小段时间也一样（凭据有了、模型还没注册）。只信目录会让整张卡
  在"刚登录"的窗口里**整个消失**，也会让登出的部署连标签带登录按钮一起没掉。插件自己的快照才是
  "它管着哪几个部署"的权威，所以快照里有、目录里没有的一律补小节：标签在、账户行在，正文显示
  「暂无可用模型」直到模型到达。搜索时不补（搜的是模型）。
- **卡片头右侧有一个「续期」按钮**（`dmp-card-renew`，调 provider 服务的 `renew(region?)`）：多个部署
  的卡片不传 id（续期它管的全部），单部署的卡片传自己的 id。只在该卡片至少有一个部署**已登录**时出现
  ——没登录就没有可续的东西。失败同样吞掉。**按钮不能嵌按钮**，所以卡片头拆成三件东西（从左到右）：
  折叠按钮 `dmp-card-head-toggle`（名字，`flex: 1`）→ 续期按钮 `dmp-card-renew` → 折叠箭头
  `dmp-card-chevron`（装饰性的重复入口：`aria-hidden` + `tabIndex: -1`，`aria-expanded` 只挂在前面的
  折叠按钮上）。搜索时前两者退化成 div / 隐藏，箭头仍是 span。
- **标签文字 13px**（`dmp-card-tab`），比卡片名大一号：它是这一屏真正要点的那一行，名字只是分组标题。
- **只有一个部署的卡片也要显示账户行**：没有标签栏可挂，就放在卡片头下面（`.dmp-card-account-solo`），
  否则「同一张卡换了个形态」时余额和登录会凭空消失。
- **同一张卡一次只显示一个部署的模型行**——上下堆两段等于把高度翻倍去讲一个用户
  很少在意的差别，而设置面板本身就是标签页。选中仍然提交**各自的完整 provider id**。
  标签只在会话内记住（`activeSection`，按卡片 key），不持久化：翻不翻是视角，不是偏好。
  **搜索时标签栏隐藏、两个部署的命中行一起列出**（否则藏在另一个标签里的命中项就被吞了），此时行上方
  补一条小节标题说明归属。合并是按 id 前缀算的，**没有任何 provider 白名单**，别为了某个插件写死名字。
- **模型行可以带"状态尾"和负载圆点**，数据来自 provider 插件自己发布的客户端服务
  （`@huai_xin/dsh-workbuddy/state`，见下节）。尾部：可用（`available` / `unknown`，后者表示探测
  没有结论、不是坏了）显示倍率，`free` → 免费、`unknown` → 未知、其余原样（`0.23x`）；不可用
  （限流 / 积分不足 / 凭据失效 / 无权限 / 下架）显示**状态文字代替倍率**——不可用的模型不该报价。
  圆点是**负载（busy）**：空闲绿、**busy 黄（tooltip 写「轻微拥堵」）**、**congested 红（tooltip 写
  「极度拥堵」）**；面板上有状态数据的部署每行都有圆点——**探不出负载时画灰点**（tooltip「未知」），
  只有整个组合里没有发布状态的插件时才完全不画（那是"没有这个数据列"，不是缺值）。
- **没有搜索词时，模型行按名字排序**（`sortByModelName`）：`localeCompare` + `numeric: true`（V3.9
  在 V3.10 前）+ `sensitivity: 'base'`（大小写不影响顺序），**按 section 各排一次**，两个部署的标签
  逐行对齐。有搜索词时保留 `rankByName` 的相关性顺序，不重排。（目录顺序是 provider 注册的顺序，
  两个部署各自注册，同一模型在两个标签里高度不同——那才是问题。）
- **卡片的顺序不是目录顺序，是官方选择器的顺序**（`orderByProvider`，`src/core/order.js`）：
  `deepseek-account` → `deepseek-official` → 其余保持注册顺序，和官方
  `ui-model-selection` 的 `orderModelProviders` 一致（那份源码在
  `@deepseek-ai/dsh-client-ui-model-selection/lib/client.js`，注意它用的是 `toSorted`）。
  **在此之上再钉一条本仓库自己的规则：`@huai_xin/dsh-workbuddy` 的卡片固定置顶，排在官方两者之前**
  ——那张卡是本插件唯一带实时余额、负载和登录入口的卡，用户来这个列表首先看它。pinned 判定走
  **id 前缀**（`id === PINNED_PROVIDER || id.startsWith(PINNED_PROVIDER + '/')`），所以 `/cn`、`/intl`
  和将来第三个部署都自动归入同一张置顶卡，不需要改规则。
  排序作用在**卡片层**（`cards` 的 key，即 `cardKeyOf` 的结果），所以合并卡只占一个位置；平局用
  数组下标显式打破，**不依赖引擎的排序稳定性**——"其余保持原序"是复刻契约的一部分。
  `stateOnlySections` 补出来的零模型卡走同一条规则（它就是一张卡，没有理由在排序里例外）。
  **搜索时也按这个顺序**，不要改成"命中的排前面"：卡片在查询变化时跳位置比顺序不完美更糟。
- **状态没到之前先占位，别留空。** 快照是异步的，首帧若什么都不画，行会在半秒后"长"出圆点和倍率。
  所以部署还在加载时：行尾显示**未知**（弱化色）、行首画**灰点**（tooltip 也是"未知"）、账户行显示
  **积分 加载中…**。判断"在加载"用的是 `stateAvailable`（服务返回了对象、只是 `providers` 为空）——
  如果整个组合里根本没有发布状态的插件，服务返回 `undefined`，此时**不要**占位，否则一个多 provider
  但没状态的插件会永远顶着"未知"。
- **卡片头就是折叠开关，折叠状态跨会话记忆。** 卡片头在无搜索时渲染成 `button.dmp-card-head`
  （`aria-expanded`），点击切换；折叠的卡片不渲染卡片体。
  状态存在 localStorage 的 `dsh-model-picker.collapsed-cards`，**只存折叠的卡片 key**（合并卡存包前缀，
  单 provider 存 provider id；不在表里 = 展开），provider 消失再回来时自然自洽。选这个通道是因为
  客户端的 Cordis 配置运行期只读、没有写回路径——官方客户端插件（侧栏宽度、会话草稿、快捷键）也都
  是存 localStorage。GUI 一直从 `127.0.0.1:43120` 提供，origin 稳定，所以重启不丢。
- **搜索时所有卡片强制展开。** 折叠的卡片不能把命中项藏起来；此时卡片头渲染成 `div`（不是 button），
  避免出现"看起来能点、点了没反应"的控件。保存的折叠状态不动，清空搜索就恢复。
- **选中行用 `--dmp-accent`（`--dsw-static-deepseek-450`），深浅主题同一个蓝。** 原来用
  `--dsw-alias-brand-primary`，而它在深色主题下解析成 neutral-bluish-1000（近白）、浅色下近黑——
  选中态看起来"只是加粗"，没有颜色。选中行和滑杆的填充、档位标签共用这个变量，别换回别名。
  注意这个变量的**默认值**是品牌蓝，只有滑杆和档位按钮各自的子树里会被 `data-tier` 改写成
  紫 / 琥珀（不变量 13），所以模型列表的选中行永远是蓝的。
- **拖档位成功 → 面板不关。** 档位是转盘不是提交；拖动期间滑块必须一直跟手（`onInput` 只更新本地
  `dragging`，不发给 Host），松手才 `onChange` 提交一次。提交期间**不能** disable 输入框，否则
  第一个刻度就把手势打断了。
- **档位失败 → 提示框，不出现在面板里。** 提示框默认收起，点开才显示 `code: message`。
- **切档位时模型按钮必须保持原样。** 目录对"换模型"和"换档位"报的是同一个 `selecting` 状态，
  但 `pending` 里的三元组能区分：`provider/model` 与当前选择相同 = 只换了档位。早期直接用
  `pending !== null` 判断忙碌，于是每拖一格，模型按钮就变成"切换中…"并变灰一次 —— 看起来像
  模型按钮自己在闪。现在只有 `pending` 指向**另一个模型**时才算忙碌。
- **忙碌不改变外观，只挂 `aria-busy`。** 真换模型时也**不再**把按钮文字换成"切换中…"、也不再
  disable：文字一换，按钮宽度就变，而面板的包含块就是这一行——面板会跟着横移，用户看到的是"每选
  一次闪一下"。
- **模型按钮里的文字靠右**（`.dmp-trigger` 的 `justify-content: flex-end` + `.dmp-trigger-text` 的
  `text-align: right`）。按钮是定宽的，名字短的时候左侧自然留白，名字和箭头因此贴在一起、贴近右边缘；
  别把整组控件推到行尾去——那会让模型按钮跑到别处，和输入框里其他控件脱节。
- **两个触发按钮都是定宽**（模型 `min(160px, 34cqw)`、档位 `80px`，都 `flex: none`），名字长了
  就截断。它们以前是内容宽度，模型名一变长/变短，整行的宽度和位置就变；面板锚在这一行里，于是
  跟着漂。定宽之后行宽恒定，面板才可能真正定住。
- **面板定位用像素**（`offsetParent` 的 `getBoundingClientRect().left`），不是 `left: 50%`：
  百分比跟着按钮宽度走，模型名一变就漂。宿主对重复的三元组本来就会去重，不需要靠 disable 挡双击。
- **面板在测量完成前停在屏幕外左侧（`left: -9999px`），并且用 `useLayoutEffect` 测量。**
  这一条是"打开档位面板时整个聊天区弹一下"的根因修复：面板挂在会话的纵向滚动容器里，用
  `useEffect` 时它会先以初始位置画一帧——那一帧一旦伸出容器的右边缘，浏览器就补一条**横向滚动条**，
  容器可用高度随之减少，底部粘着的输入框和聊天区被顶上去；下一帧挪回正确位置，滚动条消失，于是
  "弹出来又马上消失"。负数溢出会被裁掉、不会产生滚动条，所以停在左侧既能量到宽度又不会撑出滚动条；
  `useLayoutEffect` 保证这一停不会真的画出来。**别把初始位置改回 0**，也别换成 `useEffect`。
- **关闭任何面板 → 清空搜索词和提示框。** 否则下次打开还带着上次的过滤条件，看着像"模型变少了"。
- **搜索用 `rankByName`**（`src/core/rank.js`），和官方 `/` 菜单同一套算法：有序子序列匹配，
  前缀优先。模型 id 作为第二个搜索键。
- **档位标题**：中文用矢量字（CJK 轮廓），其他语言直接印 `t.effortHeading` 文本。
- **无键盘导航**：模型列表没做 ↑/↓，是有意的取舍，不是遗漏。
- **面板只做水平 clamp**，固定向上开。垂直翻转不做。


## 排查

宿主日志（`%APPDATA%/DSH Desktop/logs/host/dsh-*.log`）：

| 日志 | 含义 |
|---|---|
| `host 半边已 apply` | 宿主侧加载了 |
| `client.js 已执行，开始注册 factory` | 模块被下发了 |
| `factory 已运行，正在装配插件对象` | `require('react')` 拿到了 |
| `apply 已调用（slots=就绪）` | apply 跑了，槽位服务可见 |
| `modelDirectories 缺失，暂不注册` | 官方服务还没注册，等它出现 |
| `槽位未注册：slots 缺失` | 槽位注册表没拿到 |
| `槽位回调已运行，准备注册 occupant` | 槽位回调触发，正在注册 |

判断顺序：

- 宿主那行有、客户端一行都没有 ⇒ 模块没被下发（查 `exports` 自引用、查链接）
- `页面 error：SyntaxError: Identifier '…' has already been declared` ⇒ 同一个 entry 在页面里
  被执行了第二遍（见"构建"一节）。先确认磁盘上的产物带不带 IIFE 外壳（`node --check` 之后看第
  一行是不是 `(() => {`）；带外壳还报，说明页面跑的是没有外壳的旧产物
- 有 `apply 已调用` 但槽位不显示 ⇒ 组件首帧抛错
- 一直停在 `modelDirectories 缺失` ⇒ 官方 `ui-model-selection` 没启用（不变量 1）
- 显示"正在读取模型列表"不动 ⇒ `directory` 契约不对（不变量 4）

**改完 `client.js` 要重启宿主**，只刷新页面通常还是旧代码。

## 宿主半边

`index.js` 只做一件事：注册 `/model-picker/client-log` 路由，接收浏览器上报的加载阶段并写进
宿主日志。打包版桌面应用没有 devtools，客户端注册失败和根本没加载从外面看是一样的，这个通道
用来区分它们。
