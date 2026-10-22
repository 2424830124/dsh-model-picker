# dsh-model-picker

DSH（DeepSeek Harness）的一个插件：**替换输入框里的模型选择器**，做成可搜索、按 provider 分组的列表。

- 只依赖 harness 自己的客户端 remote（`session.modelCatalog` / `session.selectModel`），所以**不认识任何具体 provider** ✓
- 独立于任何 provider 插件：想用就装，不想要就停用，不影响模型是否可用 ✓
- 是"影子 UI"（`conversation.input.model` 槽位带 `replaceRisk: shadows-shipped-ui` ✓），所以刻意做成单独一个 bundle

## 安装

```sh
dsh plugin --profile <profile> add /path/to/dsh-model-picker     # 本地目录
dsh plugin --profile <profile> add <包名>                        # 发布后
```

装完**刷新页面**（客户端模块在页面启动时加载）。

## 两个"静默失效"的坑（都踩过）

1. **`exports` 必须包含 `"./package.json": "./package.json"`。**
   客户端模块扫描器是用 `createRequire(...).resolve('<包名>/package.json')` 定位包的，
   解析失败就**直接跳过这个 entry**——没有报错、没有日志，插件只是永远不出现在浏览器里。
   （`test/unit/client.mjs` 里钉住了这一条；skill 自带的模板恰好缺它。）
2. **`dsh.client.inject` 里的依赖必须真实存在**，而且客户端半边要等宿主重启后才会被收录：
   改完 `client.js` 只刷新页面，常常还是旧的。

排查用：宿主日志里的 `[model-picker] host 半边已 apply`（宿主侧）与
`[model-picker] 客户端自检：…`（浏览器侧各阶段上报，见 `index.js` 的路由）。
宿主那行有、客户端一行都没有 ⇒ 模块没被下发；两行都有 ⇒ 再看是不是样式问题。

## 它如何与"装饰类"插件共存

官方 picker 自己**声明**了子槽位 `conversation.input.model.label`，provider 插件往那里挂装饰（可用性、促销、繁忙度…）。
替换者如果不重新声明并渲染这个子槽位，**所有这些装饰都会消失** ✗。

本插件显式声明并渲染它，并且：

- 用与官方一致的 `kind` / `scope` / `inline`：`{ kind: 'single', scope: 'session', inline: true }`
- 用与官方一致的 `placement` 取值：`trigger` / `option`
- 外面包一层同样的 `data-provider-id` / `data-model-id` span，装饰仍可按模型用 CSS 定位

`test/unit/client.mjs` 用迷你 React 真的跑一遍组件，把这条契约钉住（少声明或少渲染都会红）。

## 已知范围（第一版）

- 有：搜索、按 provider 分组、当前项高亮、Esc / 点击外部关闭、加载与错误态、中英双语
- 暂无：键盘上下选择、思考档位（reasoning effort）子菜单、分组折叠

## 开发

```sh
node test/unit/client.mjs      # 离线单测（无依赖，自带迷你 React）
```
