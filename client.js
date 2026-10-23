/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: the modules under src/. Rebuild with `node scripts/build.mjs`.
 * This bundle is what the Client module loader serves; it is the only browser
 * entry the loader knows about for this package.
 */
//# module: src/core/store.js
/**
 * A snapshot store with the contract the slot renderer's hooks expect.
 *
 * The Client's own engine (`@deepseek-ai/dsh-client-store`) is a Harness Client
 * package, and a plain-JS plugin must not require those: they change without
 * notice and there is no type check here. This is the same four-method surface
 * the renderer needs — `getSnapshot`, `subscribe`, `set`, `update` — over a
 * state object that is replaced, never mutated.
 *
 * @param init - the initial state object.
 * @returns the store.
 */
function createStore(init) {
  let state = init
  const listeners = new Set()

  const publish = (next) => {
    state = next
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // One failing subscriber must not stop the others.
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => publish(next),
    update: (mutate) => {
      const draft = { ...state }
      mutate(draft)
      publish(draft)
    }
  }
}

/**
 * Subscribe to any `{ getSnapshot, subscribe }` source, for a component.
 *
 * @param useState - React's useState, passed in so this module needs no import.
 * @param useEffect - React's useEffect.
 * @param source - the observable source, or undefined while it is not resolved.
 * @returns the current snapshot.
 */
function readSnapshot(useState, useEffect, source) {
  const [value, setValue] = useState(() => source?.getSnapshot?.())
  useEffect(() => {
    if (source === undefined || source === null) return undefined
    const update = () => setValue(source.getSnapshot())
    update()
    return source.subscribe(update)
  }, [source])
  return value
}

//# module: src/ui/Chevron.js
/**
 * The chevron that turns when its panel is open.
 *
 * @param props - `{ h, open }`: the createElement function and the open flag.
 * @returns the svg element.
 */
function Chevron({ h, open }) {
  return h('svg', {
    className: `dmp-chevron${open ? ' dmp-chevron-open' : ''}`,
    viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true
  }, h('path', {
    d: 'M4 6.5L8 10.5L12 6.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }))
}

//# module: src/ui/styles.js
/**
 * The picker's stylesheet.
 *
 * Host theme tokens only, plus the two composer variables the row sets when its
 * controls no longer fit on one line. Every class is prefixed `dmp-` so a copied
 * host pattern can never collide with the host's own rules.
 *
 * Sizing follows the shipped menu rather than inventing its own scale: the panel
 * is `max-content` wide (so a short list stays narrow instead of stretching to a
 * fixed width), rows are 34px tall with 5px/7px padding, and the panel pads 4px.
 * Those numbers are what makes the replacement feel like part of the composer
 * instead of a dialog dropped on top of it.
 */
const CSS = `
.dmp-root { position: relative; display: flex; align-items: center; gap: 2px; min-width: 0; }
/* One popover anchor per control: the model list and the level list open above
   their own button and never overlap each other. */
.dmp-control { position: relative; display: flex; align-items: center; min-width: 0; }
.dmp-trigger { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: min(360px, 45cqw);
  height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: var(--dsw-radius-sm, 6px); cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 13px; line-height: 20px; }
.dmp-trigger-effort { max-width: min(150px, 28cqw); padding: 0 4px 0 6px; font-size: 12px;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary)); }
.dmp-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-trigger:disabled { color: var(--dsw-alias-label-dimmed, var(--dsw-alias-state-idle-primary)); cursor: default; }
.dmp-trigger-icon { display: var(--dsh-composer-model-icon-display, none); flex: none; }
.dmp-trigger-text { display: var(--dsh-composer-model-text-display, block);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-chevron { flex: none; color: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary));
  transition: transform .12s; }
.dmp-chevron-open { transform: rotate(180deg); }
/* Content-sized, like the shipped menu: a two-model list must not be as wide as a
   twenty-model one. The caps only exist so a long model name cannot run off the
   viewport. */
.dmp-panel { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 40;
  width: max-content; min-width: min(240px, 100vw - 32px); max-width: min(360px, 92vw);
  max-height: min(320px, 60vh); display: flex; flex-direction: column; padding: 4px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
  box-shadow: var(--dsw-elevation-prominent, 0 8px 28px rgba(0,0,0,.18));
  color: var(--dsw-alias-label-primary); overflow: hidden; }
.dmp-search { flex: none; padding: 0 0 4px; }
.dmp-search input { width: 100%; box-sizing: border-box; padding: 5px 7px; font: inherit; font-size: 12.5px;
  color: var(--dsw-alias-label-primary); background: transparent;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md, 8px); outline: none; }
.dmp-search input:focus-visible { border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.dmp-list { flex: 1; overflow-y: auto; }
.dmp-group { padding: 6px 7px 2px; font-size: 11px; letter-spacing: .04em;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-item { display: flex; align-items: center; gap: 6px; width: auto; min-width: 100%; box-sizing: border-box;
  min-height: 34px; padding: 5px 7px; border: 0; border-radius: var(--dsw-radius-md, 8px);
  background: transparent; cursor: pointer; text-align: left;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
.dmp-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-item-current { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.dmp-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-item-note { margin-left: auto; padding-left: 8px; font-size: 11px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
/* The level list holds short labels, so it stays narrower than the model list.
   It also anchors to its own right edge: the control sits near the right side of
   the composer row, so a left-anchored panel would run off the viewport. */
.dmp-panel-narrow { left: auto; right: 0; min-width: min(160px, 60vw); max-width: min(220px, 80vw);
  max-height: min(260px, 50vh); }
.dmp-note { padding: 8px 7px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-note-error { color: var(--dsw-alias-state-error-primary); }
.dmp-retry { margin-top: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm, 6px); background: transparent; color: inherit;
  font: inherit; font-size: 12px; cursor: pointer; }
`

//# module: src/ui/dict.js
/**
 * The picker's two dictionaries.
 *
 * Kept as a plain object rather than the Client locale service because the
 * strings are this component's own copy, not a namespace other plugins
 * translate. Adding a language is one more entry here.
 */
const DICT = {
  'zh-CN': {
    placeholder: '搜索模型',
    empty: '没有匹配的模型',
    loading: '正在读取模型列表…',
    failed: '读取模型列表失败',
    retry: '重试',
    noCatalog: '当前没有可用模型',
    trigger: (name) => `${name}（点此切换模型）`,
    effortTitle: (name) => `思考档位：${name}（点此调整）`,
    switching: '切换中…',
    switchFailed: '切换失败',
    providerDefault: '默认',
    groupFailed: (name) => `${name} 加载失败`
  },
  en: {
    placeholder: 'Search models',
    empty: 'No matching model',
    loading: 'Loading models…',
    failed: 'Could not load the model list',
    retry: 'Retry',
    noCatalog: 'No model is currently available',
    trigger: (name) => `${name} (click to switch model)`,
    effortTitle: (name) => `Reasoning level: ${name} (click to change)`,
    switching: 'Switching…',
    switchFailed: 'Switch failed',
    providerDefault: 'Default',
    groupFailed: (name) => `${name} failed to load`
  }
}

/**
 * Resolve a dictionary from a locale id.
 *
 * @param localeId - the active locale, e.g. `zh-CN` or `en-US`.
 * @returns the matching dictionary, English when the language is unknown.
 */
function dictionaryFor(localeId) {
  return DICT[String(localeId ?? '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en']
}

//# module: src/ui/ModelPicker.js




const LABEL_SLOT = 'conversation.input.model.label'

/**
 * The composer's model seat: a searchable, provider-grouped picker plus a
 * separate reasoning-level control.
 *
 * Every value comes from the session's directory rather than the raw catalogue:
 * `current` (the effective selection, projection or default), `routable`
 * (whether the Host would still accept it), `pending` (the selection being
 * settled), `failures` (provider groups that failed to load) and `error`.
 * Deriving those in the component is what made an in-flight switch invisible and
 * a broken provider group silently absent.
 *
 * @param props - slot props: `locked`, the session id, `renderSlot` (when the
 *   entry declared children), plus what `inject` supplied.
 * @returns the rendered control, or null when the session cannot change models.
 */
function createModelPicker(React) {
  const h = React.createElement
  const { useCallback, useEffect, useMemo, useRef, useState } = React

  return function ModelPicker(props) {
    /**
     * The props bundle the shipped registration hands its own component.
     *
     * `directory` is the session directory's STORE (already subscribed-ready),
     * `load` asks it to refresh, `select` submits a triple, and `available` says
     * whether this session may change models at all. Nothing here reaches behind
     * that bundle: the data layer is the shipped one, this file is the view.
     */
    const { sessionId, locked, renderSlot, directory, available, load, select: submit } = props

    const localeId = typeof props.localeId === 'string' ? props.localeId : 'zh-CN'
    const t = dictionaryFor(localeId)

    // One panel at a time: the model list and the effort list are separate
    // controls, and opening either closes the other.
    const [panel, setPanel] = useState(null)
    const [query, setQuery] = useState('')
    const rootRef = useRef(null)

    const state = readSnapshot(useState, useEffect, directory) ?? {}
    const groups = Array.isArray(state.groups) ? state.groups : []
    const failures = Array.isArray(state.failures) ? state.failures : []
    const selection = state.current ?? null
    const pending = state.pending ?? null
    const busy = pending !== null || state.status === 'selecting'

    useEffect(() => {
      // Ask the directory to load. It is idempotent: the shipped controller
      // shares one in-flight request and re-projects when it settles.
      if (typeof load === 'function') load()
      return undefined
    }, [load])

    useEffect(() => {
      if (panel === null) return undefined
      const onKey = (event) => { if (event.key === 'Escape') setPanel(null) }
      const onClick = (event) => {
        if (rootRef.current !== null && !rootRef.current.contains(event.target)) setPanel(null)
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('mousedown', onClick)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('mousedown', onClick)
      }
    }, [panel])

    /**
     * Choose a model, carrying the adapter's default effort when the caller did
     * not name one — the shipped picker sends the same triple, so a model whose
     * adapter defaults to a level records that level rather than an unset field.
     */
    const select = useCallback(async (group, model, reasoningEffort) => {
      if (typeof submit !== 'function') return
      const effort = reasoningEffort ?? model?.reasoning?.defaultEffort
      const result = await submit({
        provider: group.id,
        model: model.id,
        ...effort === undefined ? {} : { reasoningEffort: effort }
      })
      if (result?.ok !== true) return
      setPanel(null)
    }, [submit])

    const needle = query.trim().toLowerCase()
    const filtered = useMemo(() => {
      const match = (model) => needle.length === 0 ||
        String(model.name ?? model.id).toLowerCase().includes(needle) ||
        String(model.id).toLowerCase().includes(needle)
      return groups
        .map((group) => ({ group, models: (group.models ?? []).filter(match) }))
        .filter((entry) => entry.models.length > 0)
    }, [groups, needle])

    const current = selection === null ? null : groups
      .find((group) => group.id === selection.provider)?.models
      ?.find((model) => model.id === selection.model)
    const currentGroup = selection === null ? null : groups.find((group) => group.id === selection.provider) ?? null

    /**
     * What the trigger says, in the shipped picker's precedence.
     *
     * While the directory is still loading and nothing is known yet, it says
     * "loading" rather than naming a model it has not read or claiming there is
     * none. A selection whose model left the catalogue still names the model,
     * because the selection is what the Host will use until it is changed.
     */
    const waiting = selection === null && state.status === 'loading'
    const currentLabel = waiting
      ? t.loading
      : current?.name ?? selection?.model ?? t.noCatalog

    /**
     * Reasoning levels of the selected model.
     *
     * The catalogue entry carries `reasoning: { efforts, defaultEffort }`. An
     * explicit choice wins; otherwise the adapter's default is what the next call
     * will use, so that is what the control shows rather than a blank.
     */
    const efforts = Array.isArray(current?.reasoning?.efforts) ? current.reasoning.efforts : []
    const activeEffortId = selection?.reasoningEffort ?? current?.reasoning?.defaultEffort
    const activeEffort = efforts.find((effort) => effort.id === activeEffortId) ?? null
    const effortName = (effort) => effort?.name ?? effort?.id ?? String(activeEffortId ?? '')

    /**
     * The label, in the shipped picker's addressable wrapper.
     *
     * The `data-provider-id` / `data-model-id` span is kept because CSS that
     * targets one model by id still works. `renderSlot` renders the
     * `conversation.input.model.label` child this entry declares, which is where
     * provider plugins mount their badges; the fallback keeps the plain name
     * visible when nothing is mounted there.
     */
    const renderLabel = (group, model, placement, selected) => h('span', {
      'data-provider-id': group?.id,
      'data-model-id': model?.id
    }, renderSlot === undefined
      ? model?.name
      : renderSlot(LABEL_SLOT, { provider: group, model, placement, selected }, { fallback: model?.name }))

    const renderItem = (group, model) => {
      const isCurrent = selection !== null &&
        selection.provider === group.id && selection.model === model.id
      return h('button', {
        key: `${group.id}:${model.id}`,
        type: 'button',
        role: 'option',
        'aria-selected': isCurrent,
        className: `dmp-item${isCurrent ? ' dmp-item-current' : ''}`,
        onClick: () => void select(group, model)
      },
        h('span', { className: 'dmp-item-name' }, renderLabel(group, model, 'option', isCurrent)))
    }

    const renderGroup = ({ group, models }) => h('div', { key: group.id },
      h('div', { className: 'dmp-group' }, group.name ?? group.id),
      models.map((model) => renderItem(group, model)))

    const notes = []
    /**
     * Two independent problems, reported separately.
     *
     * A load failure belongs to the shared directory (every session sees it); a
     * selection failure belongs to this session. Merging them meant a failed
     * switch erased the load error and vice versa.
     */
    const selectionError = typeof state.error === 'string' ? state.error : ''
    if (state.status === 'loading' && groups.length === 0) {
      notes.push(h('div', { key: 'loading', className: 'dmp-note' }, t.loading))
    }
    if (selectionError.length > 0) {
      notes.push(h('div', { key: 'error', className: 'dmp-note dmp-note-error' },
        selectionError,
        h('div', null, h('button', {
          type: 'button', className: 'dmp-retry', onClick: () => { if (typeof load === 'function') load() }
        }, t.retry))))
    }
    // A provider group whose catalogue failed: say so, instead of leaving a
    // provider the user knows about silently missing from the list.
    if (failures.length > 0) {
      notes.push(h('div', { key: 'failures', className: 'dmp-note dmp-note-error' },
        failures.map((failure) => h('div', { key: String(failure?.provider ?? failure?.id ?? failure) },
          String(failure?.message ?? failure?.provider ?? failure)))))
    }
    if (state.status === 'ready' && filtered.length === 0) {
      notes.push(h('div', { key: 'empty', className: 'dmp-note' }, t.empty))
    }

    const effortButton = current === null || currentGroup === null || efforts.length === 0
      ? null
      : h('button', {
        type: 'button',
        className: 'dmp-trigger dmp-trigger-effort',
        disabled: locked === true || busy,
        title: t.effortTitle(effortName(activeEffort)),
        'aria-haspopup': 'listbox',
        'aria-expanded': panel === 'effort',
        onClick: () => setPanel((value) => (value === 'effort' ? null : 'effort'))
      },
        h('span', { className: 'dmp-trigger-text' }, effortName(activeEffort)),
        h(Chevron, { h, open: panel === 'effort' }))

    const effortPanel = panel === 'effort' && effortButton !== null
      ? h('div', { className: 'dmp-panel dmp-panel-narrow', role: 'listbox' },
        h('div', { className: 'dmp-list' }, efforts.map((effort) => {
          const isCurrent = effort.id === activeEffortId
          return h('button', {
            key: effort.id,
            type: 'button',
            role: 'option',
            'aria-selected': isCurrent,
            className: `dmp-item${isCurrent ? ' dmp-item-current' : ''}`,
            onClick: () => void select(currentGroup, current, effort.id)
          }, h('span', { className: 'dmp-item-name' }, effortName(effort)),
          effort.description === undefined
            ? null
            : h('span', { className: 'dmp-item-note' }, String(effort.description)))
        })))
      : null

    const modelPanel = panel === 'model'
      ? h('div', { className: 'dmp-panel', role: 'listbox' },
        h('div', { className: 'dmp-search' },
          h('input', {
            type: 'search',
            value: query,
            placeholder: t.placeholder,
            'aria-label': t.placeholder,
            autoFocus: true,
            onChange: (event) => setQuery(event.target.value)
          })),
        notes,
        h('div', { className: 'dmp-list' }, filtered.map(renderGroup)))
      : null

    /**
     * An addressed subagent session cannot change its model — the Host rejects
     * the RPC. The shipped picker renders nothing in that case rather than
     * offering a control whose every click fails, so this one does the same.
     * `available` is computed once per session, in `inject`.
     */
    if (available === false) return null

    return h('div', { className: 'dmp-root', ref: rootRef },
      h('style', null, CSS),
      // The model control and the reasoning-level control are deliberately two
      // buttons: they are two independent choices, and a model change must not
      // silently drag the level along with it.
      h('div', { className: 'dmp-control' },
        h('button', {
          type: 'button',
          className: 'dmp-trigger',
          disabled: locked === true || busy,
          title: t.trigger(currentLabel),
          'aria-haspopup': 'listbox',
          'aria-expanded': panel === 'model',
          onClick: () => setPanel((value) => (value === 'model' ? null : 'model'))
        },
          h('span', { className: 'dmp-trigger-text' },
            busy
              ? t.switching
              : (current === null || currentGroup === null
                ? currentLabel
                : renderLabel(currentGroup, current, 'trigger', true))),
          h(Chevron, { h, open: panel === 'model' })),
        modelPanel),
      effortButton === null ? null : h('div', { className: 'dmp-control' }, effortButton, effortPanel))
  }
}

//# module: src/client.js
/**
 * Client entry: the module-loader registration and the plugin object.
 *
 * This plugin replaces ONLY the composer's model-selection UI. Everything behind
 * it — the per-session directory, the catalogue cache, the invalidation events,
 * the selection RPC — is the shipped `ui-model-selection` implementation, reached
 * through its `modelDirectories` service.
 *
 * That split works because the shipped plugin keeps its slot registration and its
 * component apart: the registration's `inject` hands the component a plain props
 * bundle (`available`, a `directory` store, `load`, `select`), and the component
 * may render however it likes. This entry registers the same slot with the same
 * `inject` contract and substitutes its own component.
 *
 * Why not copy the shipped bundle instead: a copy registers a second
 * `ModelDirectoryResolver` under the same service name, the two fight over it,
 * and the shipped plugin parks in `loading` — which fails the whole renderer
 * boot. Reusing the service avoids that, and keeps tracking upstream fixes.
 */

const PLUGIN = 'dsh-model-picker'
const SLOT = 'conversation.input.model'
const LABEL_CHILD_SLOT = 'conversation.input.model.label'
/** The service the shipped picker exposes for per-session model directories. */
const MODEL_DIRECTORIES = 'modelDirectories'
/**
 * BELOW the shipped occupant's `priority: 0`.
 *
 * For a `single` slot the LOWEST priority renders — the registry says so in its
 * own error text ("register at a different priority to shadow it (lowest
 * renders)"). A larger number would lose to the shipped picker instead of
 * shadowing it.
 */
const SHADOW_PRIORITY = -1

/**
 * Load-stage report.
 *
 * The packaged desktop app has no devtools, so a client half that fails to
 * register is indistinguishable from one that never loaded. Each stage is posted
 * to the Host half, which logs it beside its own line: the pair tells the two
 * cases apart immediately.
 *
 * @param stage - a short description of the load stage reached.
 */
const report = (stage) => {
  try {
    console.error(`[model-picker] ${stage}`)
  } catch {
    // no console in some hosts
  }
  try {
    void fetch('/model-picker/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
      keepalive: true
    }).catch(() => {})
  } catch {
    // diagnostics must never break the picker
  }
}

/**
 * The failure worth capturing happens *outside* apply: the client composition
 * builds this plugin object, then never applies it, and whatever it threw on the
 * way is only visible in the page.
 *
 * @param value - the thrown value, in any shape.
 * @returns a short description safe to log.
 */
const describe = (value) => {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

report('client.js 已执行，开始注册 factory')

try {
  window.addEventListener('error', (event) => {
    report(`页面 error：${describe(event?.error ?? event?.message)}`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    report(`页面 unhandledrejection：${describe(event?.reason)}`)
  })
} catch {
  // a missing window hook must never stop the plugin from registering
}

window.__ModuleLoader__.load({
  id: '@huai_xin/dsh-model-picker',
  factory(require) {
    report('factory 已运行，正在装配插件对象')
    const React = require('react')
    const ModelPicker = createModelPicker(React)

    return {
      name: PLUGIN,
      /**
       * Wait for the services the seat needs.
       *
       * The same set the shipped registration waits for, minus `commandUi` (this
       * plugin contributes no `/model` command). Declaring them as fiber
       * dependencies is safe: every one is registered by the time the composer
       * renders, and a missing one is a composition error worth failing loudly
       * rather than half-working.
       */
      inject: ['locale', 'sessions', 'slots', 'remote', 'remote.session'],
      apply(ctx) {
        report(`apply 已调用（slots=${ctx.get('slots') === undefined ? '尚未就绪' : '就绪'}）`)

        /**
         * Register the seat through the shipped directory service.
         *
         * `ctx.inject` runs this callback once the named services are visible, so
         * the registration lands at the same point the shipped one would. It is
         * also re-run if a service goes away and returns, which is what keeps the
         * seat from binding to `undefined` across a reconnect.
         */
        ctx.inject(['slots', MODEL_DIRECTORIES], (scope) => {
          const slots = scope.get('slots')
          const models = scope.get(MODEL_DIRECTORIES)
          const sessions = scope.get('sessions')
          const locale = scope.get('locale')
          const localeId = typeof locale?.getLocale === 'function'
            ? String(locale.getLocale()?.locale ?? 'zh-CN')
            : 'zh-CN'

          if (slots === undefined || models === undefined) {
            report(`槽位未注册：slots=${slots === undefined ? '缺失' : '就绪'} modelDirectories=${models === undefined ? '缺失' : '就绪'}`)
            return
          }

          slots.inject(SLOT, () => {
            report('槽位回调已运行，准备注册 occupant')
            /**
             * The same registration shape the shipped picker uses, including the
             * `conversation.input.model.label` child declaration.
             *
             * That declaration is what keeps provider decorations working:
             * `renderSlot` is only authorised for a child the entry declared
             * itself, so a replacement that skipped it would silently delete
             * every badge and availability hint mounted there.
             */
            const dispose = slots.register({
              name: SLOT,
              priority: SHADOW_PRIORITY,
              children: {
                [LABEL_CHILD_SLOT]: { kind: 'single', scope: 'session', inline: true }
              },
              inject: (sessionId) => {
                const directory = models.directoryFor(sessionId)
                const available = typeof sessions?.subagentAddress === 'function'
                  ? sessions.subagentAddress(sessionId) === undefined
                  : true
                return {
                  sessionId,
                  localeId,
                  available,
                  // The shipped registration hands over the STORE, not the
                  // controller; the component subscribes to it directly.
                  directory: directory.store,
                  load: () => {
                    if (available) directory.load().catch(() => {})
                  },
                  select: (selection) => available
                    ? directory.select(selection)
                    : Promise.resolve(undefined)
                }
              }
            }, ModelPicker)
            report(`occupant 已注册（priority ${SHADOW_PRIORITY}）`)
            return dispose
          })
        })
      }
    }
  }
})
