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
    store.js         readSnapshot：订阅任意 { getSnapshot, subscribe } 源
  ui/
    ModelPicker.js   组件：触发器 + 模型面板 + 档位面板
    Chevron.js       展开箭头
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

### 2. 槽位注册要声明 `conversation.input.model.label` 子槽位

provider 插件把徽标、可用性提示挂在这个子槽位上。`renderSlot` 只对**自己声明的**子槽位可用
（否则抛 `SlotOwnershipError`），所以不声明就等于删掉所有装饰。

本插件和官方占用者都声明它——这没问题，因为官方占用者被 priority 压住不渲染时，**它的声明
不会被撤销**，两个声明是分开的条目。

> 早期版本不声明 children（担心 `slot "..." is already declared`），结果是模型名后面什么
> 装饰都没有。现在的做法是照官方那样声明，装饰正常显示。

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
  select: (selection) => {}  // 提交选择
}
```

`directory` 是 store 本身，有 `getSnapshot` / `subscribe`，**不是**带 `.store` 的对象。
早期版本按 `.store` 读，拿到 `undefined`，组件永远显示"正在读取模型列表"。

### 5. `exports` 必须包含 `"./package.json": "./package.json"`

客户端模块扫描器用 `createRequire(...).resolve('<包名>/package.json')` 定位包，解析失败就
**直接跳过这个 entry**——没有报错、没有日志，插件永远不出现在浏览器里。

### 6. profile 里的本地链接必须是绝对路径

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

### 7. 不要往发布的文件里写 BOM

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

### 8. 样式只用 `--dsw-*` 主题令牌

不用字面色值（图标除外）。令牌改名最多让外观退化，不会让渲染崩掉。尺寸对齐官方菜单：
面板 `max-content` 宽（不是固定值）、条目 `min-height: 34px`、内边距 `5px 7px`。

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
| `error` | 失败信息 |

触发器的文案优先级：`status === 'loading' && current === null` 时显示"正在读取模型列表"，
否则显示模型名，再否则显示"没有可用模型"。

## 排查

宿主日志（`%APPDATA%/DSH Desktop/logs/host/dsh-*.log`）：

| 日志 | 含义 |
|---|---|
| `host 半边已 apply` | 宿主侧加载了 |
| `客户端自检：client.js 已执行` | 模块被下发了 |
| `客户端自检：apply 已调用` | apply 跑了 |
| `槽位未注册：slots=缺失 / modelDirectories=缺失` | 官方服务没拿到 |
| `occupant 已注册（priority -1）` | 槽位注册成功 |

判断顺序：

- 宿主那行有、客户端一行都没有 ⇒ 模块没被下发（查 `exports` 自引用、查链接）
- 有 `apply 已调用` 但槽位不显示 ⇒ 组件首帧抛错
- 显示"正在读取模型列表"不动 ⇒ `directory` 契约不对（不变量 4）

**改完 `client.js` 要重启宿主**，只刷新页面通常还是旧代码。

## 宿主半边

`index.js` 只做一件事：注册 `/model-picker/client-log` 路由，接收浏览器上报的加载阶段并写进
宿主日志。打包版桌面应用没有 devtools，客户端注册失败和根本没加载从外面看是一样的，这个通道
用来区分它们。
