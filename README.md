# dsh-model-picker

DSH（DeepSeek Harness）的一个插件：**替换输入框里的模型选择器**，做成可搜索、按 provider 分组的列表。

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

## 数据层（与官方 `ui-model-selection` 同一套契约）

数据不是自己拼的，走的是和官方相同的三层结构，`test/unit/client.mjs` 逐条钉住：

**1. 全局目录（`ModelCatalogDirectory` 的等价物）**
- 一份、按 Host generation 作用域，所有会话共用；in-flight 请求去重。
- 每次失效递增 generation，旧请求的迟到响应**直接丢弃**，不会覆盖新值。
- `reasoning` 记住每个模型的档位元数据，**模型离开目录后仍能显示档位名字**。

**2. 会话级目录（`ModelDirectory` 的等价物）**
- store 形状与官方一致：`{ current, routable, groups, failures, status, pending, error }`。
- `current` = 会话显式选择 ?? 目录 `default`（官方同样的优先级）。加载中显示"加载中"，
  而不是模型名，也不是"没有可用模型"。
- `pending` 在 RPC 前后发布，触发器能显示正在结算的选择。
- `select()` 带 generation 竞态保护：**后发起的胜出**，旧回复即便晚到也不写入。
  （单测用突变验证过：去掉这个守卫，断言立刻失败。）
- 切模型时带上适配器的默认档位，与官方提交的三元组一致。
- `failures` 渲染为提示行，某个 provider 组加载失败不再静默消失。

**3. `modelDirectories` 服务**
- **优先复用官方已注册的服务**——这正是让输入框和 `/model` 弹窗共享同一份选择状态（含在途
  状态）的关键。官方服务存在时不重复注册（重复 `ctx.provide` 会抛错）。
- 官方服务缺席时（bundle 被停用、旧版本），本插件以同名提供一份**同契约**的实现，组件无感知。
- 按 sessionId 键控目录，不按 binding 对象：binding 访问器可能每次返回新包装，按它做键会导致
  每次重挂载都新建目录、丢掉在途状态。

**四个失效事件 + `connection/reset`**：与官方监听集合完全一致；只听 `llm/adapters-updated`
的旧版会在改设置/凭据后继续提供宿主已拒绝的模型。

**子会话**：addressed subagent 会话里 Host 会拒绝 `selectModel`，官方 picker 在那种会话里
什么都不渲染，本插件同样返回 `null`。

**仍与官方不同**（有意保留的范围差异）：没有 `/model` 命令贡献，也不做 analytics 埋点——
这两项属于官方 bundle，不在"替换输入框选择器"的职责内。

## 工程结构

源码在 `src/` 下按职责拆分，`client.js` 是**构建产物**（勿手改）：

```
src/
  client.js          入口：模块注册 + 插件对象 + 装配（含服务复用与槽位注册）
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
client.js            构建产物，由 scripts/build.mjs 生成
```

**为什么需要构建**：Client 模块加载器给每个包只有一个浏览器入口
（`exports["./client"]`），并以 classic script 执行，不会在运行时解析插件的 ESM 依赖图。
所以源码拆开维护、构建时拼接成单文件，是既能保持可维护性、又不要求宿主提供它没有的能力的做法。

打包器只做三件事：深度优先收集本地 `./x.js` 依赖、剥掉 `import`/`export` 语法、按依赖顺序
拼接。它不做 tree-shaking，也不解析裸模块——遇到裸 import 会直接报错（宿主模块应从 factory
的 `require` 取）。

```sh
node scripts/build.mjs    # 或 pnpm build：重新生成 client.js
node test/unit/client.mjs # 或 pnpm test：构建 + 离线单测
```

单测会校验 `client.js` 是否由当前源码构建（每个模块有 `//# module:` 标记，且产物不得旧于
任何源文件），避免改完源码忘记重新构建、让测试跑在过期产物上。

## 开发

```sh
pnpm build                     # 重新生成 client.js
pnpm test                      # 构建 + 离线单测（无依赖，自带迷你 React）
```
