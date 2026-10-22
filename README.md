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

## 四个"很难查"的坑（都踩过）

1. **`exports` 必须包含 `"./package.json": "./package.json"`。**
   客户端模块扫描器是用 `createRequire(...).resolve('<包名>/package.json')` 定位包的，
   解析失败就**直接跳过这个 entry**——没有报错、没有日志，插件只是永远不出现在浏览器里。
   （`test/unit/client.mjs` 里钉住了这一条；skill 自带的模板恰好缺它。）
2. **不要在插件对象上声明 fiber 级 `inject`；把等待放进 `apply`。**
   这一条是踩了很久才查清的。Cordis 里 fiber 级 `inject` 是一条**必须被满足的依赖边**：
   服务不可见，`apply` 就永远不被调用，entry 停在 `loading`，然后整个渲染进程启动失败：

   ```
   Error: web boot: 1 entry did not activate
   @huai_xin/dsh-model-picker: loading
   RendererStartupFailure: Renderer boot failed for 1 plugin(s)
   ```

   本插件改成 `apply` 内部 `ctx.inject([...], install)` 软等待：依赖没到只损失这次注册，
   不会拖垮整个 boot。**注意这跟 `dsh.client.inject`（清单里那条）是两回事**——后者只影响
   激活顺序，早先把它清空并没有解决问题，日志里一直是"`factory` 已运行、`apply` 未调用"。
3. **`ctx.remote` / `ctx.remote.session` 必须经 `inject`（或 `ctx.get`）读取。**
   属性代理对未声明的服务直接抛 `cannot get property "remote.session" without inject`，
   而这条异常发生在**组件首次渲染时**，表现为整个槽位消失：entry 被 `abdicate`
   （`listSubTree` 里 `active: false`），官方 occupant 又已被压住，于是两边都不渲染。
4. **客户端半边要等宿主重启后才会被收录**：改完 `client.js` 只刷新页面，常常还是旧的。

排查用：宿主日志里的 `[model-picker] host 半边已 apply`（宿主侧）与
`[model-picker] 客户端自检：…`（浏览器侧各阶段上报，见 `index.js` 的路由）。
宿主那行有、客户端一行都没有 ⇒ 模块没被下发；只有 `factory 已运行` 而没有 `apply 已调用`
⇒ entry 卡在依赖上（就是第 2 条）。启动失败时 `%APPDATA%/DSH Desktop/diagnostics/*.zip`
里的 `dsh-*.error.log` 会指名是哪个 entry。

## 它如何与"装饰类"插件共存（目前会丢装饰）

官方 picker 自己**声明**了子槽位 `conversation.input.model.label`，provider 插件往那里挂装饰
（可用性、促销、繁忙度…）。替换者想保住这些装饰，就得自己声明并渲染这个子槽位——**但这在
当前 slots 架构下做不到**，原因是两条硬规则：

1. **子槽位只能被声明一次**（`slot "..." is already declared`）。官方 occupant 还在槽位里
   （只是被 priority 压住不渲染），它的声明仍然有效，我们再声明一次就抛错。
2. **`renderSlot` 只能渲染自己声明的子槽位**，否则抛 `SlotOwnershipError`。不声明就无权渲染。

第一版曾按"重新声明"实现，结果注册直接抛错，反而把官方 occupant 挤掉了——那次的表现是
**整个选择器消失**。所以现在**不声明 `children`**：picker 正常渲染，但 provider 挂在
`conversation.input.model.label` 上的装饰在这个槽位里不显示。

真要同时满足两者，只有让官方 `ui-model-selection` 的 occupant 完全缺席（停用那个 bundle），
代价是它的 `/model` 命令贡献一起消失。这是架构限制，不是本插件的实现缺陷。

## 已知范围（第一版）

- 有：搜索、按 provider 分组、当前项高亮、Esc / 点击外部关闭、加载与错误态、中英双语
- 有：模型与思考档位（reasoning effort）**两个独立控件**，各自一个浮层
- 暂无：键盘上下选择、分组折叠

## 开发

```sh
node test/unit/client.mjs      # 离线单测（无依赖，自带迷你 React）
```
