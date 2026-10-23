# AGENTS.md

给 AI agent 和人类贡献者的仓库说明。**动手前先读这一页**，里面的坑都是踩过的。

用户视角的说明在 [README.md](README.md)。

## 这是什么

`@huai_xin/dsh-model-picker` 是 DSH（DeepSeek Harness）的一个插件：把输入框的模型选择控件
（槽位 `conversation.input.model`）换成一个可搜索、按 provider 分组的列表，并把思考档位拆成
独立控件。

它是一个**影子 UI**——该槽位的官方占用者带 `replaceRisk: shadows-shipped-ui`。所以刻意做成
独立 bundle：想用就装，不想要就停用，不影响任何 provider 的注册。

## 目录与分层

```
src/
  client.js          入口：模块注册 + 插件对象 + 装配（服务复用、槽位注册）
  core/
    store.js         snapshot store 契约（getSnapshot/subscribe/set/update）
    selection.js     readSelection（兼容各代字段拼写）、isAvailable（子会话探测）
    catalog.js       全局目录：共享缓存、generation 失效、reasoning 记忆
    directory.js     会话级目录：current/routable/pending/failures + 竞态保护
    directories.js   modelDirectories 服务的自带实现（官方缺席时使用）
  ui/
    ModelPicker.js   组件：触发器 + 模型面板 + 档位面板
    Chevron.js       展开箭头
    dict.js          中英字典
    styles.js        样式表（仅 --dsw-alias-* 主题令牌）
scripts/build.mjs    零依赖打包器：按依赖顺序拼接 src/ → client.js
client.js            **构建产物，勿手改**
test/unit/client.mjs 离线单测（自带迷你 React，无依赖）
index.js             宿主半边：只提供诊断路由 /model-picker/client-log
```

依赖方向单向：`store/selection` ← `catalog` ← `directory` ← `directories` ← `client`，
`ui/*` 只依赖 `core`。

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

> 加载器其实支持 chunk（`require.async('./client.x.js')` + `register({chunk})`），但 chunk 是
> 异步的、`factory` 是同步的，用它拆数据层会把 `apply` 变成异步装配，复杂度和风险都高于收益。

## 不能违反的不变量

### 1. 事件订阅必须在 `apply` 顶层，不能在 `ctx.inject` 回调里

这是最难查的一个，**症状是"订阅成功了但事件永远收不到"**。

`ctx.remote.$on` 的实现是 `this.events.subscribe(this.ctx, event, listener)`，它把监听器注册在
**调用方 fiber 的私有事件域**里；而派发走 `privateEvents(this.ownerCtx).parallel(...)`。
从 `ctx.inject([...], install)` 回调里订阅，`$on` 会**正常返回 disposer**（所以日志显示"成功
4/4"），但监听器落在不是派发域的域里，永远不会触发。

必须像官方插件那样，在 `apply` 函数体里直接订阅：

```js
apply(ctx) {
  const remote = ctx.get('remote')
  const catalog = createCatalog(remote)
  const detach = catalog.attach(remote)      // ← 在这里，不是 install 里
  ctx.effect(() => detach, '...')
  ctx.inject([...], install)                 // ← 槽位注册可以在这里
}
```

排查这一条时，用「官方选择器会不会刷新」做对照最快：官方能刷新、本插件不能，就说明事件到了
浏览器、问题在本插件的订阅位置。

### 2. `exports` 必须包含 `"./package.json": "./package.json"`

客户端模块扫描器用 `createRequire(...).resolve('<包名>/package.json')` 定位包，解析失败就
**直接跳过这个 entry**——没有报错、没有日志，插件永远不出现在浏览器里。
`test/unit/client.mjs` 钉住了这条。

### 3. 不要在插件对象上声明 fiber 级 `inject`

Cordis 里 fiber 级 `inject` 是**必须被满足的依赖边**：服务不可见时 `apply` 永远不被调用，
entry 停在 `loading`，整个渲染进程启动失败：

```
Error: web boot: 1 entry did not activate
@huai_xin/dsh-model-picker: loading
RendererStartupFailure: Renderer boot failed for 1 plugin(s)
```

所以改成 `apply` 内部 `ctx.inject([...], install)` 软等待：依赖没到只损失这次注册。
**这跟 `dsh.client.inject`（清单里那条）是两回事**——后者只影响激活顺序。

### 4. `ctx.remote` / `ctx.remote.session` 必须经 `ctx.get` 读取

属性代理对未声明的服务直接抛 `cannot get property "remote.session" without inject`，而这条
异常发生在**组件首次渲染时**，表现为整个槽位消失（entry 被 `abdicate`，`listSubTree` 里
`active: false`），官方占用者又已被压住，于是两边都不渲染。

### 5. 选择成功后不要调 `sync()`

`sync()` 会从会话投影重新计算 `current`。Host 返回 `selectModel` 成功**早于**它发布新投影，
此刻 `sync()` 读到的是旧值，会把刚选中的模型写回去——**表现是"点了没反应"，但实际已经选上了**。

成功路径要用 Host 确认的返回值直接写入 `current`，等投影自己推送时再由订阅触发 `sync()`。

### 6. 目录按 sessionId 键控，不要按 binding 对象

binding 访问器可能每次返回新包装，按它做键会导致每次重挂载都新建目录、丢掉在途状态。

### 7. 子槽位 `conversation.input.model.label` 不能重新声明

官方占用者即使被压住，它的声明依然有效，再声明一次就抛 `slot "..." is already declared`，
反而把官方占用者挤掉、**整个选择器消失**。所以本插件不声明 `children`，代价是 provider 挂在
该子槽位上的装饰不显示（见 README 的已知限制）。

顺带：`renderSlot` 只对**自己声明的**子槽位可用（否则抛 `SlotOwnershipError`），所以组件里的
`renderSlot` 是探测式的——生产环境拿不到这个 binding。

### 8. profile 里的本地链接必须是绝对路径

报错长这样：

```
Error: client-modules: could not load "@huai_xin/dsh-model-picker":
plugins/??@huai_xin/dsh-model-picker/client.js&rev=...:
loaded without registering "@huai_xin/dsh-model-picker" via __ModuleLoader__.load
```

**这不一定是代码问题。** 本地目录安装会在
`%USERPROFILE%\.dsh\profiles\<profile>\node_modules\@huai_xin\dsh-model-picker` 建一个符号链接。
如果链接目标写成了相对路径（`..\..\..\..\..\..\Projects\dsh-model-picker`），它会从
`node_modules\@huai_xin` 往上解析，得到 `C:\Users\Projects\dsh-model-picker`——**一个不存在的
路径**。加载器读不到文件，于是报 "loaded without registering"，看起来像是 bundle 里的语法错误。

自查：

```powershell
$link = "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\@huai_xin\dsh-model-picker"
(Get-Item -LiteralPath $link -Force).Target      # 应当是一个绝对路径
Test-Path -LiteralPath (Join-Path $link 'client.js')
```

修复（用绝对路径重建）：

```powershell
cmd /c "rmdir `"$link`""
cmd /c "mklink /D `"$link`" `"E:\Projects\dsh-model-picker`""
```

> 排查时先排除这一条：`node --check client.js` 通过、且把产物当 classic script 用 `vm`
> 跑一遍能正常注册，就说明代码没问题，问题在路径。

## 数据层契约（与官方 `ui-model-selection` 对齐）

1. **全局目录**：一份、按 Host generation 作用域，所有会话共用；in-flight 去重；每次失效递增
   generation，旧响应直接丢弃；`reasoning` 记住档位元数据，模型离开目录后仍能显示档位名字。
2. **会话级目录**：store 形状与官方一致 `{ current, routable, groups, failures, status, pending,
   error }`；`current` = 显式选择 ?? 目录 `default`；`pending` 在 RPC 前后发布；`select()` 带
   generation 竞态保护（后发起的胜出）；`failures` 渲染为提示行。
3. **`modelDirectories` 服务**：优先复用官方已注册的实例（这是让输入框和 `/model` 弹窗共享
   同一份状态的关键），缺席时才以同名提供同契约实现。
4. **失效事件**：四个（`llm/adapters-updated`、`settings/document-updated`、
   `credentials/record-updated`、`credentials/reference-updated`）加 `connection/reset`，与官方
   监听集合完全一致。

单测对这些逐条钉住，其中竞态和"事件真的触发重读"两条用**突变验证**过：去掉守卫/去掉
`refresh()`，断言会立刻失败。

## 排查

宿主日志里看这几行（`%APPDATA%/DSH Desktop/logs/host/dsh-*.log`）：

| 日志 | 含义 |
|---|---|
| `host 半边已 apply` | 宿主侧加载了 |
| `客户端自检：client.js 已执行` | 模块被下发了 |
| `客户端自检：factory 已运行` | factory 跑了 |
| `客户端自检：apply 已调用` | apply 跑了 |
| `订阅结果：成功 4/4` | 事件订阅挂上了（注意：**这不等于能收到事件**，见不变量 1） |
| `目录来源：复用官方 modelDirectories` | 拿到了官方服务 |
| `目录来源：本插件自带实现` | 没拿到，走自带实现 |
| `收到失效事件 …` | 事件真的到了 |
| `modelCatalog 成功：N 组，gen a/b` | 重读成功；`a != b` 说明结果被丢弃 |

判断顺序：

- 宿主那行有、客户端一行都没有 ⇒ 模块没被下发（查 `exports` 自引用）
- 有 `factory 已运行` 但没有 `apply 已调用` ⇒ entry 卡在依赖上（不变量 3）
- 有 `apply 已调用` 但槽位不显示 ⇒ 组件首帧抛错（不变量 4、7）
- 有订阅但没有 `收到失效事件` ⇒ 订阅位置错了（不变量 1）

启动失败时 `%APPDATA%/DSH Desktop/diagnostics/*.zip` 里的 `dsh-*.error.log` 会指名是哪个 entry。

**改完 `client.js` 要重启宿主**，只刷新页面通常还是旧代码。

## 宿主半边

`index.js` 只做一件事：注册 `/model-picker/client-log` 路由，接收浏览器上报的加载阶段并写进
宿主日志。打包版桌面应用没有 devtools，客户端注册失败和根本没加载从外面看是一样的，这个通道
用来区分它们。
