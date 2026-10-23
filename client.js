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

//# module: src/core/catalog.js

/**
 * The Host notifications that can change the catalogue.
 *
 * `llm/adapters-updated` covers a provider adding or removing a model; the other
 * three cover the inputs a provider's availability is derived from (settings,
 * stored credentials, credential references). The shipped directory subscribes to
 * exactly these four, so a model switched off in a provider's own panel
 * disappears here on the same tick it disappears there. Listening to the first
 * one alone left this picker offering models the Host would refuse until the page
 * was reloaded.
 */
const INVALIDATION_EVENTS = Object.freeze([
  'llm/adapters-updated',
  'settings/document-updated',
  'credentials/record-updated',
  'credentials/reference-updated'
])

/**
 * One Host-generation catalogue shared by every session.
 *
 * Mirrors the shipped `ModelCatalogDirectory`: a single value, one in-flight
 * request shared by every reader, a generation counter that discards responses
 * from a superseded generation, and a `reasoning` map that remembers each
 * model's effort metadata *after* the model leaves the catalogue — so a level
 * still shows its name while its model is gone.
 *
 * @param remote - the client remote face carrying `session.modelCatalog`.
 * @returns the catalogue controller.
 */
function createCatalog(remote, onDiagnostic) {
  const store = createStore({ value: null, status: 'idle', error: null })
  const reasoning = new Map()
  // Bumped by every invalidation. A response that resolves under an older
  // generation is dropped instead of publishing a catalogue the Host has
  // already superseded.
  let generation = 0
  let inflight

  const note = (message) => {
    try { onDiagnostic?.(message) } catch { /* diagnostics never break the load */ }
  }

  const reasoningFor = (selection) => selection === null || selection === undefined
    ? undefined
    : reasoning.get(JSON.stringify([selection.provider, selection.model]))

  const load = () => {
    const state = store.getSnapshot()
    if (state.status === 'ready' && state.value !== null) return Promise.resolve(state.value)
    if (inflight !== undefined) return inflight
    const run = remote?.session?.modelCatalog
    if (typeof run !== 'function') {
      store.set({ value: state.value, status: 'error', error: 'modelCatalog is unavailable' })
      return Promise.resolve(undefined)
    }
    const at = generation
    // Keep the previous value visible while reloading: an invalidation is not an
    // error, and blanking the list would flash on every provider edit.
    store.update((draft) => { draft.status = 'loading'; draft.error = null })
    const operation = Promise.resolve(run.call(remote.session)).then((result) => {
      if (result?.ok !== true) {
        note(`modelCatalog 失败：${result?.error?.code ?? '?'} ${result?.error?.message ?? ''}`)
        if (at === generation) {
          store.set({
            value: store.getSnapshot().value,
            status: 'error',
            error: result?.error?.message ?? 'failed'
          })
        }
        return undefined
      }
      const groups = Array.isArray(result.value?.groups) ? result.value.groups : []
      note(`modelCatalog 成功：${groups.length} 组，gen ${at}/${generation}`)
      if (at === generation) {
        for (const group of groups) {
          for (const model of group.models) {
            reasoning.set(JSON.stringify([group.id, model.id]), model.reasoning)
          }
        }
        store.set({ value: result.value, status: 'ready', error: null })
      } else {
        // The result was dropped: another load superseded it. Say so, because a
        // silently discarded success is what leaves the store on `loading`.
        note(`modelCatalog 结果被丢弃（gen ${at} != ${generation}）`)
      }
      return result.value
    }).catch((error) => {
      note(`modelCatalog 抛错：${error instanceof Error ? error.message : String(error)}`)
      if (at === generation) {
        store.set({
          value: store.getSnapshot().value,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        })
      }
      return undefined
    }).finally(() => {
      if (at === generation && inflight === operation) inflight = undefined
    })
    inflight = operation
    return operation
  }
  const invalidate = (clear) => {
    generation += 1
    inflight = undefined
    store.set({
      value: clear === true ? null : store.getSnapshot().value,
      status: 'idle',
      error: null
    })
  }

  /** Re-read on the next explicit load, keeping the stale value on screen. */
  const refresh = () => {
    note(`refresh 被调用（gen ${generation} → ${generation + 1}）`)
    invalidate(false)
    load()
  }

  /** Drop everything: the value belonged to a Host generation that is gone. */
  const resetGeneration = () => { reasoning.clear(); invalidate(true); load() }

  /**
   * Subscribe the invalidation events.
   *
   * Call this from the plugin's `apply` body, not from a scope or slot callback.
   * The gateway registers a forwarded-event listener in the CALLING fiber's
   * private event domain, and only the plugin's own `apply` fiber is in the
   * domain the dispatcher publishes to — a subscription installed from a
   * `ctx.inject` callback is accepted (it returns a disposer) but never fires.
   *
   * @param target - the client remote carrying `$on`.
   * @param onEvent - optional observer called with each delivered event name.
   * @returns a disposer removing every subscription.
   */
  const attach = (target, onEvent) => {
    const offs = []
    const failed = []
    for (const event of INVALIDATION_EVENTS) {
      try {
        if (typeof target?.$on !== 'function') {
          failed.push(`${event}: 目标没有 $on`)
          continue
        }
        const off = target.$on(event, () => {
          onEvent?.(event)
          refresh()
        })
        if (typeof off === 'function') offs.push(off)
        else failed.push(`${event}: 返回的不是 disposer`)
      } catch (error) {
        failed.push(`${event}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    note(`订阅结果：成功 ${offs.length}/${INVALIDATION_EVENTS.length}${failed.length > 0 ? `；问题：${failed.join(' | ')}` : ''}`)
    return () => { for (const off of offs) off() }
  }

  /** Whether this target can carry event subscriptions at all. */
  const canAttach = (target) => typeof target?.$on === 'function'

  return { store, reasoningFor, load, refresh, resetGeneration, attach, canAttach }
}

//# module: src/core/selection.js
/**
 * Reading a model selection out of whatever shape the Host handed over.
 *
 * The projection carries the selection; older and newer Host generations have
 * spelled the fields differently (`provider` / `providerId` / `provider_id`),
 * so every known shape is accepted and an unknown one simply yields `null`
 * rather than guessing.
 *
 * @param projection - a projection frame, a selection, or nothing.
 * @returns `{ provider, model, reasoningEffort }`, or null when unreadable.
 */
function readSelection(projection) {
  const value = projection?.next ?? projection?.current ?? projection
  if (value === null || typeof value !== 'object') return null
  const provider = value.provider ?? value.providerId ?? value.provider_id
  const model = value.model ?? value.modelId ?? value.model_id
  if (typeof provider !== 'string' || typeof model !== 'string') return null
  return { provider, model, reasoningEffort: value.reasoningEffort }
}

/**
 * Whether this session may change its model at all.
 *
 * An addressed subagent session cannot: the Host rejects the RPC. The shipped
 * picker renders nothing in that case rather than offering a control whose every
 * click fails. `subagentAddress` is the same probe it uses; a client generation
 * without it counts as available, so an older build keeps showing the control
 * instead of silently losing it.
 *
 * @param sessions - the sessions service face.
 * @param sessionId - the session being rendered.
 * @returns whether the model control should be offered.
 */
function isAvailable(sessions, sessionId) {
  try {
    if (typeof sessions?.subagentAddress !== 'function') return true
    return sessions.subagentAddress(sessionId) === undefined
  } catch {
    return true
  }
}

//# module: src/core/directory.js


/**
 * One session's directory, mirroring the shipped `ModelDirectory`.
 *
 * The catalogue is Host-wide, but the *selection* is per session: which model is
 * in effect, whether that model is still routable, what is in flight, and which
 * provider groups failed to load. The shipped picker renders all four, and a
 * replacement that collapsed them into "the catalogue plus the projection" loses
 * the in-flight state (so a slow switch shows nothing) and the failure list (so a
 * broken provider group is silently missing).
 *
 * The store contract is the same one the renderer's hooks read:
 * `{ current, routable, groups, failures, status, pending, error }`.
 *
 * @param catalog - the shared catalogue controller.
 * @param projectedFace - the session's `modelSelection` projection face.
 * @param remote - the client remote face carrying `session.selectModel`.
 * @param sessionId - the owning session.
 * @returns the directory controller.
 */
function createDirectory(catalog, projectedFace, remote, sessionId) {
  const store = createStore({
    current: null,
    routable: null,
    groups: [],
    failures: [],
    status: 'idle',
    pending: null,
    error: null
  })
  // Latest selection wins: an older response must never overwrite a newer one.
  let generation = 0
  let disposed = false

  /**
   * Recompute the effective selection from the two inputs that define it.
   *
   * `intended` is the session's explicit choice, else the catalogue default —
   * exactly the shipped precedence. `routable` says whether the Host would still
   * accept it, which is what lets the trigger distinguish "this model" from "a
   * model that no longer exists".
   */
  const sync = () => {
    if (disposed) return
    const catalogState = catalog.store.getSnapshot()
    const projected = readSelection(projectedFace?.getSnapshot?.())
    const intended = projected ?? readSelection(catalogState.value?.default)
    const reasoning = catalog.reasoningFor(intended)
    const effort = intended?.reasoningEffort ?? reasoning?.defaultEffort
    const retainedEffort = effort === undefined
      ? undefined
      : reasoning?.efforts?.find((level) => level.id === effort)?.name ?? effort
    const ready = catalogState.status === 'ready' && catalogState.value !== null
    if (!ready || intended === null) {
      store.set({
        current: catalogState.value === null ? null : store.getSnapshot().current,
        ...retainedEffort === undefined ? {} : { retainedEffort },
        routable: null,
        groups: catalogState.value?.groups ?? [],
        failures: catalogState.value?.failures ?? [],
        status: catalogState.status === 'error' ? 'error' : 'loading',
        pending: store.getSnapshot().pending,
        error: catalogState.error
      })
      return
    }
    const routable = (catalogState.value.groups ?? []).some((group) =>
      group.id === intended.provider && (group.models ?? []).some((model) => model.id === intended.model))
    store.set({
      current: intended,
      ...retainedEffort === undefined ? {} : { retainedEffort },
      routable,
      groups: catalogState.value.groups,
      failures: catalogState.value.failures ?? [],
      status: store.getSnapshot().status === 'selecting' ? 'selecting' : 'ready',
      pending: store.getSnapshot().pending,
      error: null
    })
  }

  const unsubscribeCatalog = catalog.store.subscribe(() => { sync() })
  const unsubscribeProjection = projectedFace?.subscribe?.(() => { sync() })
  sync()

  /**
   * Select the complete provider/model/effort triple.
   *
   * The pending selection is published before the RPC and cleared after it, so
   * the trigger can show which row is settling. A response that arrives after a
   * newer selection (or after disposal) is dropped rather than written, which is
   * the bug a bare `busy` flag cannot avoid: two fast clicks would otherwise let
   * the first reply overwrite the second choice.
   *
   * @param selection - provider, model, and optional reasoningEffort.
   * @returns the Host result, or a synthesized failure.
   */
  const select = async (selection) => {
    // The adapter's default effort is part of the selection the shipped picker
    // submits, so a model switch also settles the level instead of leaving the
    // Host to guess on the next call.
    const nextEffort = selection.reasoningEffort ?? catalog.reasoningFor(selection)?.defaultEffort
    const next = { ...selection, ...nextEffort === undefined ? {} : { reasoningEffort: nextEffort } }
    const generationAt = ++generation
    store.update((draft) => {
      draft.status = 'selecting'
      draft.pending = next
      draft.error = null
    })
    const run = remote?.session?.selectModel
    if (typeof run !== 'function') {
      store.update((draft) => {
        draft.status = 'error'
        draft.pending = null
        draft.error = 'selectModel is unavailable'
      })
      return { ok: false, error: { code: 'unavailable', message: 'selectModel is unavailable' } }
    }
    let result
    try {
      result = await run.call(remote.session, {
        sessionId,
        provider: next.provider,
        model: next.model,
        ...next.reasoningEffort === undefined ? {} : { reasoningEffort: next.reasoningEffort }
      })
    } catch (error) {
      result = {
        ok: false,
        error: { code: 'threw', message: error instanceof Error ? error.message : String(error) }
      }
    }
    if (disposed || generationAt !== generation) {
      return result?.ok === true ? { ok: true, value: undefined } : result
    }
    if (result?.ok !== true) {
      store.update((draft) => {
        draft.status = 'error'
        draft.pending = null
        draft.error = `${result?.error?.code ?? 'error'}: ${result?.error?.message ?? 'failed'}`
      })
      return result
    }
    store.update((draft) => {
      draft.status = 'ready'
      draft.pending = null
      draft.error = null
    })
    /**
     * Do NOT re-project here.
     *
     * `sync()` recomputes `current` from the session's projected selection. The
     * Host answers `selectModel` before it publishes that projection, so calling
     * `sync()` at this point reads the OLD selection and writes it straight back
     * over the one just chosen — the picker then looks like the click did
     * nothing. The projection's own subscription calls `sync()` when the Host
     * actually publishes, which is the only moment the new value is real.
     *
     * Until that push arrives, `current` is the selection the Host just
     * acknowledged. `selected` in the answer is authoritative when present;
     * otherwise the triple we sent is what the Host accepted.
     */
    const settled = readSelection(result?.value?.selected) ?? next
    store.update((draft) => {
      draft.current = settled
      draft.routable = true
    })
    return { ok: true, value: undefined }
  }

  /** Invalidate an in-flight response from a previous Host generation. */
  const resetConnected = () => {
    if (disposed) return
    generation += 1
    store.update((draft) => {
      if (draft.status === 'selecting') draft.status = 'idle'
      draft.pending = null
      draft.error = null
    })
    sync()
  }

  /** Ensure the shared catalogue is loaded, then re-project. */
  const load = async () => {
    await catalog.load()
    sync()
    return store.getSnapshot()
  }

  /** Scope teardown: late settlements lose write access to the store. */
  const dispose = () => {
    disposed = true
    unsubscribeCatalog?.()
    unsubscribeProjection?.()
  }

  return { store, select, load, resetConnected, dispose, sync }
}

//# module: src/core/directories.js

/**
 * The `modelDirectories` service: one directory per session, shared by
 * everything that renders a model seat.
 *
 * The shipped plugin registers exactly this service, and reusing its instance is
 * what keeps a replacement picker and the `/model` popup agreeing on one
 * selection state. When it is absent (the shipped bundle disabled, an older
 * build), this plugin provides its own under the same name so the rest of the
 * code has one contract either way.
 *
 * @param catalog - the shared catalogue controller.
 * @param sessions - the sessions service face.
 * @param remote - the client remote face.
 * @returns the service object with `directoryFor`.
 */
function createDirectoryService(catalog, sessions, remote) {
  /**
   * Keyed by session id, not by binding object.
   *
   * The shipped resolver keys a WeakMap by `sessions.binding(id)` because it
   * disposes each directory with the session scope. Keying by the binding here
   * would be wrong for a different reason: a binding accessor is free to return a
   * fresh wrapper per call, and each call would then allocate a new directory —
   * every remount of the seat losing the in-flight selection and re-projecting
   * from scratch. The id is the stable identity; `directoryFor` is called per
   * render, so it must be cheap and idempotent.
   */
  const directories = new Map()

  const directoryFor = (sessionId) => {
    const key = String(sessionId)
    const existing = directories.get(key)
    if (existing !== undefined) return existing
    const binding = (() => {
      try { return sessions?.binding?.(sessionId) } catch { return undefined }
    })()
    const projectedFace = (() => {
      try { return binding?.session?.projections?.faceOf?.('modelSelection') } catch { return undefined }
    })()
    const directory = createDirectory(catalog, projectedFace, remote, sessionId)
    directories.set(key, directory)
    return directory
  }

  return { directoryFor, directories }
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
 */
const CSS = `
.dmp-root { position: relative; display: flex; align-items: center; gap: 2px; min-width: 0; }
/* One popover anchor per control: the model list and the level list open above
   their own button and never overlap each other. */
.dmp-control { position: relative; display: flex; align-items: center; min-width: 0; }
.dmp-trigger { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: min(360px, 45cqw);
  height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 13px; line-height: 20px; }
.dmp-trigger-effort { max-width: min(150px, 28cqw); padding: 0 4px 0 6px; font-size: 12px;
  color: var(--dsw-alias-label-secondary); }
.dmp-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-trigger:disabled { color: var(--dsw-alias-state-idle-primary); cursor: default; }
.dmp-trigger-icon { display: var(--dsh-composer-model-icon-display, none); flex: none; }
.dmp-trigger-text { display: var(--dsh-composer-model-text-display, block);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-chevron { flex: none; color: var(--dsw-alias-label-secondary); transition: transform .12s; }
.dmp-chevron-open { transform: rotate(180deg); }
.dmp-panel { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 40;
  width: min(420px, 84vw); max-height: 320px; display: flex; flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
  box-shadow: 0 8px 28px rgba(0,0,0,.18); overflow: hidden; }
.dmp-search { flex: none; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dmp-search input { width: 100%; box-sizing: border-box; padding: 6px 8px; font: inherit; font-size: 12.5px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2, transparent);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; outline: none; }
.dmp-search input:focus-visible { border-color: var(--dsw-alias-brand-primary); }
.dmp-list { flex: 1; overflow-y: auto; padding: 4px 0 6px; }
.dmp-group { padding: 6px 12px 2px; font-size: 11px; letter-spacing: .04em;
  color: var(--dsw-alias-label-secondary); }
.dmp-item { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
  padding: 6px 12px; border: 0; background: transparent; cursor: pointer; text-align: left;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
.dmp-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-item-current { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.dmp-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-item-note { margin-left: auto; padding-left: 8px; font-size: 11px;
  color: var(--dsw-alias-label-secondary); }
/* The level list holds short labels, so it stays narrow and tight. */
.dmp-panel-narrow { width: min(220px, 60vw); max-height: 260px; }
.dmp-note { padding: 10px 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dmp-note-error { color: var(--dsw-alias-state-error-primary); }
.dmp-retry { margin-top: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
`

//# module: src/ui/dict.js
﻿/**
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
    const { sessionId, locked, renderSlot, directory, catalog: catalogFace, available } = props

    const localeId = typeof props.localeId === 'string' ? props.localeId : 'zh-CN'
    const t = dictionaryFor(localeId)

    // One panel at a time: the model list and the effort list are separate
    // controls, and opening either closes the other.
    const [panel, setPanel] = useState(null)
    const [query, setQuery] = useState('')
    const rootRef = useRef(null)

    const state = readSnapshot(useState, useEffect, directory?.store) ?? {}
    // `catalogFace` is the catalogue controller, not a store: its snapshot source
    // is `store`. Passing the controller itself made the hook call a missing
    // `getSnapshot` on first render.
    const catalogState = readSnapshot(useState, useEffect, catalogFace?.store)
    const groups = Array.isArray(state.groups) ? state.groups : []
    const failures = Array.isArray(state.failures) ? state.failures : []
    const selection = state.current ?? null
    const pending = state.pending ?? null
    const busy = pending !== null || state.status === 'selecting'

    useEffect(() => {
      /**
       * Load the directory, not just a catalogue.
       *
       * In reuse mode `directory` is the shipped one and `catalogFace` is this
       * plugin's own catalogue — loading the latter alone left the shipped
       * directory's catalogue untouched, so its `groups` never advanced past
       * whatever it held when the seat first mounted. `directory.load()` asks the
       * object that actually feeds `state.groups`; its own `load` is idempotent
       * and internally refreshes the catalogue it reads.
       */
      if (typeof directory?.load === 'function') {
        const outcome = directory.load()
        if (outcome !== undefined && typeof outcome.then === 'function') outcome.catch(() => {})
      } else if (catalogFace !== undefined && catalogFace !== null) {
        catalogFace.load()
      }
      return undefined
    }, [directory, catalogFace])

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
      if (directory === undefined || directory === null) return
      const effort = reasoningEffort ?? model?.reasoning?.defaultEffort
      const result = await directory.select({
        provider: group.id,
        model: model.id,
        ...effort === undefined ? {} : { reasoningEffort: effort }
      })
      if (result?.ok !== true) return
      setPanel(null)
    }, [directory])

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
     * targets one model by id still works. `renderSlot` is probed rather than
     * assumed: the renderer hands an entry that binding only for children the
     * entry declared itself, and this one deliberately declares none (the shipped
     * occupant owns the declaration), so the plain name is what actually renders.
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
     * Three independent problems, reported separately.
     *
     * A catalogue failure belongs to the shared cache and affects every session;
     * a selection failure belongs to this session's directory; a provider group
     * that failed to load belongs to the catalogue's failure list and explains a
     * group that is simply absent. Collapsing them into one message meant a
     * failed switch erased the load error and vice versa.
     */
    const catalogError = typeof catalogState?.error === 'string' ? catalogState.error : ''
    const selectionError = typeof state.error === 'string' ? state.error : ''
    if (state.status === 'loading' && groups.length === 0 && catalogError.length === 0) {
      notes.push(h('div', { key: 'loading', className: 'dmp-note' }, t.loading))
    }
    if (catalogError.length > 0 || selectionError.length > 0) {
      notes.push(h('div', { key: 'error', className: 'dmp-note dmp-note-error' },
        catalogError.length > 0 ? catalogError : selectionError,
        h('div', null, h('button', {
          type: 'button', className: 'dmp-retry', onClick: () => catalogFace?.refresh()
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
 * This file is the only browser entry the Client module loader knows about for
 * this package. Everything it uses lives in sibling modules under `src/`, and
 * `scripts/build.mjs` concatenates them into the served `client.js`.
 *
 * Why the picker shadows this slot at all: `conversation.input.model` is a
 * `single` slot whose shipped occupant carries `replaceRisk: shadows-shipped-ui`.
 * Shadowing it is a visual choice, so it lives in a bundle that can be turned
 * off again without touching any provider registration.
 *
 * On the `conversation.input.model.label` child slot: the shipped picker declares
 * it and provider plugins decorate it. This picker cannot join them — a child
 * slot may be declared exactly once and the shipped occupant keeps its
 * declaration even while shadowed, so a second declaration throws at
 * registration. The renderer then hands an entry a `renderSlot` binding only for
 * children that entry declared itself, so not declaring means not rendering. The
 * decorations therefore do not appear here and each model is shown by its plain
 * name. That is an accepted consequence of shadowing this slot, not an oversight.
 */




const PLUGIN = 'dsh-model-picker'
const SLOT = 'conversation.input.model'
/** The shipped service that owns per-session model directories. */
const MODEL_DIRECTORIES = 'modelDirectories'
/**
 * BELOW the shipped occupant's `priority: 0`.
 *
 * For a `single` slot the LOWEST priority renders — the registry says so in its
 * own error text ("register at a different priority to shadow it (lowest
 * renders)"), and `entriesOfSlot` returns the first survivor of a
 * priority-sorted list. A larger number would have lost to the shipped picker
 * instead of shadowing it.
 */
const SHADOW_PRIORITY = -1

/**
 * Load-stage report.
 *
 * The packaged desktop app has no devtools, so a client half that fails to
 * register is indistinguishable from one that never loaded. Each stage is posted
 * to the Host half, which logs it next to its own `host 半边已 apply` line: the
 * pair tells the two cases apart immediately.
 *
 * @param stage - a short description of the load stage reached.
 */
const report = (stage) => {
  // The renderer console reaches the desktop app log, which is captured in every
  // diagnostics bundle. A POST to the Host half is kept as the richer channel,
  // but it cannot be the only one: it is a second thing that can fail (trust
  // fence, no route yet, offline), and a missing report then looks exactly like
  // "apply was never called".
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
 * way is only visible in the page — which the packaged desktop app gives no
 * devtools for. Both global hooks forward to the host log instead.
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
       * No fiber-level `inject`.
       *
       * A required service that is not visible from this context keeps the whole
       * entry in `loading`: Cordis never calls `apply`, and the client Loader
       * turns that into `web boot: 1 entry did not activate`, i.e. a dead
       * renderer. Waiting *inside* apply means an unmet dependency costs only the
       * registration instead of the entire boot.
       */
      apply(ctx) {
        report(`apply 已调用（slots=${ctx.get('slots') === undefined ? '尚未就绪' : '就绪'}）`)

        /**
         * The catalogue, its subscriptions, and the directory service are built
         * HERE, in `apply` itself — not inside the `ctx.inject` callback below.
         *
         * This is the one structural difference from the shipped picker that
         * matters: the shipped plugin calls `ctx.remote.$on(...)` directly in its
         * `apply` body. The gateway registers a forwarded-event listener in the
         * calling fiber's private event domain (`events.subscribe(this.ctx, …)`),
         * and a subscription made from a scope callback — even when that scope is
         * the same object — is not in the domain the dispatcher publishes to, so
         * the listener never fires. Building them here keeps the registration in
         * the plugin's own fiber, exactly like the shipped plugin.
         */
        const remote = (() => {
          try { return ctx.get('remote') } catch { return undefined }
        })()
        const catalog = createCatalog(remote, (message) => { report(message) })
        const detachCatalog = catalog.attach(remote, (event) => {
          report(`收到失效事件 ${event}`)
        })
        report(`失效订阅：${catalog.canAttach(remote) ? '已挂到 remote.$on' : 'remote 没有 $on，无法订阅'}`)
        const detachReset = typeof ctx.on === 'function'
          ? ctx.on('connection/reset', () => { catalog.resetGeneration() })
          : undefined
        const sessions = (() => {
          try { return ctx.get('sessions') } catch { return undefined }
        })()
        const shipped = (() => {
          try { return ctx.get(MODEL_DIRECTORIES) } catch { return undefined }
        })()
        const directories = shipped !== undefined && typeof shipped.directoryFor === 'function'
          ? shipped
          : createDirectoryService(catalog, sessions, remote)
        const ownsDirectories = directories !== shipped
        report(`目录来源：${ownsDirectories ? '本插件自带实现' : '复用官方 modelDirectories'}`)
        const detachDirectories = ownsDirectories && typeof ctx.provide === 'function'
          ? ctx.provide(MODEL_DIRECTORIES, directories)
          : undefined
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => {
            detachCatalog()
            detachReset?.()
            detachDirectories?.()
          }, 'dsh-model-picker: catalogue and directories')
        }

        const install = (scope) => {
          try {
            const at = scope ?? ctx
            const slots = at.slots ?? ctx.get('slots')
            if (slots === undefined) {
              report('slots 服务仍不可用，槽位未注册')
              return
            }
            const locale = ctx.get('locale')
            const localeId = typeof locale?.getLocale === 'function'
              ? String(locale.getLocale()?.locale ?? 'zh-CN')
              : 'zh-CN'
            /**
             * Neither `ctx.remote` nor `ctx.remote.session` can be read through
             * the property proxy without an `inject` entry — Cordis throws
             * `cannot get property "remote.session" without inject`, which crashed
             * this component on its first render and got the entry abdicated.
             *
             * `ctx.get(...)` returns `undefined` instead of throwing, so the
             * picker degrades to its "could not load the model list" state rather
             * than taking the whole slot down.
             */
            const remoteSession = at['remote.session'] ?? ctx.get('remote.session') ?? remote?.session

            slots.inject(SLOT, () => {
              report('槽位回调已运行，准备注册 occupant')
              /**
               * NO `children` declaration, on purpose.
               *
               * A child slot may be declared exactly once, and the shipped picker
               * already declares `conversation.input.model.label` for its own
               * occupant. Declaring it here threw during registration, which is
               * what removed the shipped occupant and left the slot empty.
               *
               * The consequence is that provider decorations mounted on the label
               * child do not render while this picker is in charge. Rendering them
               * would require owning the declaration, i.e. the shipped
               * `ui-model-selection` occupant being absent entirely.
               */
              const dispose = slots.register({
                name: SLOT,
                priority: SHADOW_PRIORITY,
                inject: (sessionId) => {
                  const sessionSessions = ctx.get('sessions')
                  /**
                   * The per-session directory is the data face of this picker.
                   *
                   * `directoryFor` is the shipped service's own entry point; when
                   * this plugin had to provide the service, the fallback has the
                   * same signature, so the component never knows the difference.
                   */
                  const directory = directories.directoryFor(sessionId)
                  // The shipped directory projects inside its constructor and on
                  // its subscriptions; it exposes no `sync`. Only this plugin's
                  // fallback has one, so probe instead of assuming — calling it
                  // unconditionally threw on the shipped service and took the
                  // whole slot registration down with it.
                  if (typeof directory?.sync === 'function') directory.sync()
                  /**
                   * The directory's own snapshot, reported once per registration.
                   *
                   * This is the line that tells the two "not refreshed" failure
                   * modes apart: if the group count here stops matching what the
                   * Host now offers, the directory is stale; if it tracks the Host
                   * while the panel still shows old rows, the panel is not
                   * rendering the update.
                   */
                  const snapshot = directory?.store?.getSnapshot?.()
                  report(`目录快照：${Array.isArray(snapshot?.groups) ? snapshot.groups.length : 0} 组 / 状态 ${snapshot?.status ?? '?'}`)
                  return {
                    sessionId,
                    localeId,
                    remote,
                    remoteSession,
                    sessions: sessionSessions,
                    catalog,
                    directory,
                    available: isAvailable(sessionSessions, sessionId)
                  }
                }
              }, ModelPicker)
              report('occupant 已注册（priority ' + SHADOW_PRIORITY + '）')
              return dispose
            })
          } catch (error) {
            report(`槽位注册抛错：${error instanceof Error ? `${error.message}` : String(error)}`)
          }
        }

        // Soft wait: `apply` has already run, so a service that never shows up
        // can no longer fail the boot. The remotes are included because the
        // picker cannot do anything without them, and waiting here keeps the
        // failure to a missing control instead of a crashed one.
        if (typeof ctx.inject === 'function') ctx.inject(['slots', 'remote', 'remote.session'], install)
        else install(ctx)
      }
    }
  }
})
