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
  ui/
    ModelPicker.js   组件：触发器 + 模型面板 + 档位面板 + 失败提示框
    EffortSlider.js  档位滑杆（自绘轨道 + 隐藏的原生 range input）
    anchor.js        浮层定位：以触发器为中心，再夹进视口
    Chevron.js       展开箭头
    CaptionMark.js   档位标题的矢量字（仅中文）
    caption-glyphs.js 矢量字轮廓数据
    dict.js          中英字典
    styles.js        样式表（仅 --dsw-* 主题令牌）
scripts/build.mjs    零依赖打包器：按依赖顺序拼接 src/ → client.js
client.js            **构建产物，勿手改**
test/unit/client.mjs 离线单测（自带迷你 React，无依赖）
index.js             宿主半边：只提供诊断路由 /model-picker/client-log
```

## 构建：为什么必须有这一步

**Client 模块加载器给每个包只有一个浏览器入口**（`exports["./client"]`），并以 classic script
执行，**不会在运行时解析插件的 ESM 依赖图**。所以源码拆开维护、构建时拼接成单文件。

打包器只做三件事：深度优先收集本地 `./x.js` 依赖、剥掉 `import`/`export` 语法、按依赖顺序拼接。
不做 tree-shaking，也不解析裸模块——遇到裸 import 直接报错（宿主模块必须从 factory 的
`require` 取）。

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

**所有模块共用一个函数作用域。** 拼接后的产物是 `factory(require) { ...各模块... }`，所以两个模块
声明同名顶层变量会让整包抛 `SyntaxError: Identifier 'X' has already been declared`——整包不执行，
插件**完全不注册**，界面上退回官方选择器，从外面看不出任何原因（日志里只有一条 `页面 error`）。
护栏会拦并指出两处模块与行号。历史上真出现过一次，当时排查方向一度错到"槽位注册"上。

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

### 10. 滑杆的形状用 `clip-path` 定义，不用 `border-radius`

档位滑杆的胶囊形状**不能**靠 `border-radius`：在宿主里实测过，32px 高、声明 `border-radius: 16px`
的元素画出来圆角只有 ~10px，不管写 `999px`、`calc()` 还是字面量都一样，两端看着就是圆角矩形。

所以形状交给 `clip-path: inset(0 round 15px)`：它同时裁剪元素**和子元素**，轨道、蓝色填充都由它
裁出同一个形状，填充自己不带任何圆角，因此不可能出现"两个圆弧套在一起、角落露底色"。
`border-radius` 留着只是给不支持 `clip-path` 的浏览器兜底。

配套的四个数必须自洽：

| 变量 | 值 | 作用 |
|---|---|---|
| `--dmp-rail-height` | 28px | 轨道高度，`clip-path` 的半径按它写（15px = 半高 + 1） |
| `--dmp-thumb-size` | 28px | 滑块直径 |
| `--dmp-stop-left` | 28px | 第一个档位圆心离轨道左端——**故意不等于右端** |
| `--dmp-stop-right` | 14px | 最后一个档位圆心离轨道右端 |

整套尺寸是同一比例的（面板 322×177，标题 16px，刻度 11px，提示 11px）。**改大小要成套改**：
只调高度不改半径，端点立刻从半圆退回圆角矩形。

行程是**不对称**的：最左档停在离端头 28px 处（滑块左缘留 14px），最右档贴死右端。这是产品要求，
不是 bug。点数、刻度文字、蓝色填充、原生 range 的指针行程全部由这两个 offset 推导，改一个全都跟着动。

### 11. `inject` 必须包含**被调用服务自己需要的服务**

这一条踩过，代价是插件在界面上凭空消失了好几次。

`models.directoryFor(sessionId)` 是官方服务的方法，但它跑在**我们的 fiber** 里，内部会读
`ctx['remote.session']`。Cordis 只把**声明过**的服务交给一个 fiber，所以哪怕本仓库一次都没提过
`remote.session`，它也必须出现在依赖表里：

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

推论：不能凭"这个标识符没被引用"判断依赖多余。**被调用方需要的能力，就是调用方的依赖。**


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

## 交互约定（都是踩过之后定的）

- **选模型成功 → 面板关闭。** 失败 → 面板保持打开，上方弹出提示框，可以直接再选一个。
- **拖档位成功 → 面板不关。** 档位是转盘不是提交；拖动期间滑块必须一直跟手（`onInput` 只更新本地
  `dragging`，不发给 Host），松手才 `onChange` 提交一次。提交期间**不能** disable 输入框，否则
  第一个刻度就把手势打断了。
- **档位失败 → 提示框，不出现在面板里。** 提示框默认收起，点开才显示 `code: message`。
- **切档位时模型按钮必须保持原样。** 目录对"换模型"和"换档位"报的是同一个 `selecting` 状态，
  但 `pending` 里的三元组能区分：`provider/model` 与当前选择相同 = 只换了档位。早期直接用
  `pending !== null` 判断忙碌，于是每拖一格，模型按钮就变成"切换中…"并变灰一次 —— 看起来像
  模型按钮自己在闪。现在只有 `pending` 指向**另一个模型**时才算忙碌。
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
- 有 `apply 已调用` 但槽位不显示 ⇒ 组件首帧抛错
- 一直停在 `modelDirectories 缺失` ⇒ 官方 `ui-model-selection` 没启用（不变量 1）
- 显示"正在读取模型列表"不动 ⇒ `directory` 契约不对（不变量 4）

**改完 `client.js` 要重启宿主**，只刷新页面通常还是旧代码。

## 宿主半边

`index.js` 只做一件事：注册 `/model-picker/client-log` 路由，接收浏览器上报的加载阶段并写进
宿主日志。打包版桌面应用没有 devtools，客户端注册失败和根本没加载从外面看是一样的，这个通道
用来区分它们。
