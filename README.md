# dsh-model-picker

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的输入框换一个**模型选择器**：可搜索、按 provider 分组，模型和思考档位分成两个独立控件。

DSH 自带的模型选择器是按两级菜单设计的。模型一多，找一个模型要翻两层；思考档位藏在二级菜单里，改一次要点三次。这个插件把它换成一次点开的列表：直接搜、直接选。

## 它做了什么

**可搜索的模型列表** — 点开即输入，按名字或 id 过滤，按 provider 分组显示。

**模型与思考档位分开** — 两个按钮、两个浮层，互不干扰。换模型不会顺手改掉档位，改档位也不会换模型。

**和官方选择器共用一份状态** — 不是另起炉灶。它复用 DSH 自己的 `modelDirectories` 服务，所以你在输入框里选的模型，和 `/model` 命令弹窗里看到的，永远是同一个。切换过程中（Host 还没确认时）两个入口都会显示"正在切换"。

**跟着模型列表实时变** — 别的插件改了可用模型（开关模型、导入账号、探测到模型不可用……），这个列表会立刻跟着变，不用刷新页面。

**新会话显示默认模型** — 而不是空着或显示"没有可用模型"。

**子会话里自动隐藏** — 在被指派的 subagent 会话里，Host 不允许换模型，控件直接不渲染，而不是给你一个点了必失败的按钮。

## 安装

```sh
dsh plugin --profile <你的 profile> add @huai_xin/dsh-model-picker
```

装完**重启宿主**，再刷新页面。客户端代码是在页面启动时加载的，只刷新页面通常还是旧的。

也可以从本地目录装：

```sh
dsh plugin --profile <你的 profile> add /path/to/dsh-model-picker
```

不想要了就直接停用或移除这个 bundle，不会影响模型本身是否可用。

## 已知限制

**会丢掉 provider 插件挂在模型名上的装饰。** DSH 官方选择器声明了一个子槽位 `conversation.input.model.label`，provider 插件往那里挂徽标、可用性提示、促销标记之类的东西。替换者没法继承这个声明——子槽位只能声明一次，官方占用者即使被压住不渲染，它的声明依然有效。所以在这个选择器里，模型名后面不会有那些装饰。

想同时要装饰和这套交互，只能停用官方的 `ui-model-selection` bundle，代价是它的 `/model` 命令一起消失。这是 DSH 槽位架构的限制，不是本插件能绕过的。

## 兼容性

需要 DSH `0.2.1-rc` 及以上。模型数据全部走 DSH 自己的 client remote（`session.modelCatalog` / `session.selectModel`），插件本身不认识任何具体 provider——任何 provider 插件注册的模型都会出现在列表里。

## 开发

见 [AGENTS.md](AGENTS.md)。

## License

MIT
