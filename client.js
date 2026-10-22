/**
 * Client half: a replacement for the composer's model picker.
 *
 * Why it is a separate bundle from the provider plugins: the slot it occupies is
 * `conversation.input.model`, a `single` slot whose shipped occupant carries
 * `replaceRisk: shadows-shipped-ui`. Shadowing it is a visual choice, so it lives
 * where it can be turned off again without touching any provider registration.
 *
 * The compatibility rule that makes this a drop-in: the shipped picker *declares*
 * the `conversation.input.model.label` child slot that provider plugins decorate
 * (availability, promotions, load, ...). A replacement that forgot to re-declare
 * and render that child would silently delete every one of those decorations, so
 * this plugin declares it with the same `kind`/`scope`/`inline` and renders it
 * with the same props the shipped picker passes.
 *
 * Data comes from the existing Client remotes — `session.modelCatalog()` for the
 * catalogue and `session.selectModel()` for the choice — so this plugin needs no
 * Host routes and stays unaware of which providers exist. It re-reads the
 * catalogue when the Host announces `llm/adapters-updated`, which is the same
 * notification that keeps the shipped directory fresh.
 */

/**
 * Load-stage report.
 *
 * The packaged desktop app has no devtools, so a client half that fails to
 * register is indistinguishable from one that never loaded. Each stage is posted
 * to the Host half, which logs it next to its own `host 半边已 apply` line: the
 * pair tells the two cases apart immediately.
 */
const report = (stage) => {
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

report('client.js 已执行，开始注册 factory')

/**
 * The failure worth capturing happens *outside* apply: the client composition
 * builds this plugin object, then never applies it, and whatever it threw on the
 * way is only visible in the page — which the packaged desktop app gives no
 * devtools for. Both global hooks forward to the host log instead.
 */
const describe = (value) => {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}
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
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PLUGIN = 'dsh-model-picker'
    const SLOT = 'conversation.input.model'
    const LABEL_SLOT = 'conversation.input.model.label'
    /**
     * Above the shipped occupant's `priority: 0`: for a `single` slot the highest
     * priority wins, which is how a plugin shadows shipped UI on purpose.
     */
    const SHADOW_PRIORITY = 100

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
        switchFailed: '切换失败'
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
        switchFailed: 'Switch failed'
      }
    }

    /* Host theme tokens only, plus the two composer variables the row sets when
       its controls no longer fit on one line. */
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

    /** Subscribe to any `{ getSnapshot, subscribe }` source without extra imports. */
    function useSnapshot(source) {
      const [value, setValue] = useState(() => source?.getSnapshot?.())
      useEffect(() => {
        if (source === undefined || source === null) return undefined
        const update = () => setValue(source.getSnapshot())
        update()
        return source.subscribe(update)
      }, [source])
      return value
    }

    /**
     * The session's current selection, normalised.
     *
     * The projection carries it; older and newer Host generations have spelled it
     * differently, so every known shape is accepted and an unknown one simply
     * leaves the trigger showing the placeholder rather than guessing.
     */
    function readSelection(projection) {
      const value = projection?.next ?? projection?.current ?? projection
      if (value === null || typeof value !== 'object') return null
      const provider = value.provider ?? value.providerId ?? value.provider_id
      const model = value.model ?? value.modelId ?? value.model_id
      if (typeof provider !== 'string' || typeof model !== 'string') return null
      return { provider, model, reasoningEffort: value.reasoningEffort }
    }

    function Chevron({ open }) {
      return h('svg', {
        className: `dmp-chevron${open ? ' dmp-chevron-open' : ''}`,
        viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true
      }, h('path', {
        d: 'M4 6.5L8 10.5L12 6.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }))
    }

    /**
     * @param props - slot props: the owner's `locked`, the session id, the slot
     *   renderer needed for the inline label child, plus what `inject` supplied.
     */
    function ModelPicker(props) {
      const { sessionId, locked, renderSlot, remote, sessions, useSession } = props

      const localeId = typeof props.localeId === 'string' ? props.localeId : 'zh-CN'
      const t = DICT[String(localeId).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en']

      // One panel at a time: the model list and the effort list are separate
      // controls, and opening either closes the other.
      const [panel, setPanel] = useState(null)
      const [query, setQuery] = useState('')
      const [catalog, setCatalog] = useState(null)
      const [problem, setProblem] = useState('')
      const [busy, setBusy] = useState(false)
      const rootRef = useRef(null)

      const selectionSource = useMemo(() => {
        try {
          return sessions?.binding?.(sessionId)?.session?.projections?.faceOf?.('modelSelection') ?? undefined
        } catch {
          return undefined
        }
      }, [sessions, sessionId])
      const selection = readSelection(useSnapshot(selectionSource))

      const reload = useCallback(() => {
        let alive = true
        setProblem('')
        const run = remote?.session?.modelCatalog
        if (typeof run !== 'function') {
          setProblem(t.failed)
          return () => { alive = false }
        }
        run.call(remote.session).then((result) => {
          if (!alive) return
          if (result?.ok !== true) {
            setProblem(result?.error?.message ?? t.failed)
            return
          }
          setCatalog(result.value)
        }).catch((error) => {
          if (alive) setProblem(error instanceof Error ? error.message : String(error))
        })
        return () => { alive = false }
      }, [remote, t])

      // Load once, then re-read whenever the Host says the model set changed: that
      // notification is what keeps a model switched off in a provider's panel from
      // lingering here.
      useEffect(() => reload(), [reload])
      useEffect(() => {
        const off = remote?.$on?.('llm/adapters-updated', () => { reload() })
        return typeof off === 'function' ? off : undefined
      }, [remote, reload])

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

      const select = useCallback(async (group, model, reasoningEffort) => {
        const run = remote?.session?.selectModel
        if (typeof run !== 'function') return
        setBusy(true)
        setProblem('')
        try {
          const result = await run.call(remote.session, {
            sessionId,
            provider: group.id,
            model: model.id,
            ...reasoningEffort === undefined ? {} : { reasoningEffort }
          })
          if (result?.ok !== true) {
            setProblem(result?.error?.message ?? t.switchFailed)
            return
          }
          setPanel(null)
        } catch (error) {
          setProblem(error instanceof Error ? error.message : String(error))
        } finally {
          setBusy(false)
        }
      }, [remote, sessionId, t])

      const groups = Array.isArray(catalog?.groups) ? catalog.groups : []
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
      const currentLabel = current?.name ?? selection?.model ?? t.noCatalog

      /**
       * Reasoning levels of the selected model.
       *
       * The catalogue entry carries `reasoning: { efforts, defaultEffort }`. An
       * explicit choice wins; otherwise the adapter's default is what the next
       * call will use, so that is what the control shows rather than a blank.
       */
      const efforts = Array.isArray(current?.reasoning?.efforts) ? current.reasoning.efforts : []
      const activeEffortId = selection?.reasoningEffort ?? current?.reasoning?.defaultEffort
      const activeEffort = efforts.find((effort) => effort.id === activeEffortId) ?? null
      const effortName = (effort) => effort?.name ?? effort?.id ?? String(activeEffortId ?? '')

      /**
       * The inline decoration point.
       *
       * Wrapped in the same `data-provider-id` / `data-model-id` span the shipped
       * picker uses, and called with the same `placement` values (`trigger`,
       * `option`), so a provider plugin's decoration renders identically here and
       * can still be targeted per model from CSS.
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
      if (catalog === null && problem.length === 0) {
        notes.push(h('div', { key: 'loading', className: 'dmp-note' }, t.loading))
      }
      if (problem.length > 0) {
        notes.push(h('div', { key: 'error', className: 'dmp-note dmp-note-error' },
          problem,
          h('div', null, h('button', {
            type: 'button', className: 'dmp-retry', onClick: () => reload()
          }, t.retry))))
      }
      if (catalog !== null && filtered.length === 0) {
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
          h(Chevron, { open: panel === 'effort' }))

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
            h(Chevron, { open: panel === 'model' })),
          modelPanel),
        effortButton === null ? null : h('div', { className: 'dmp-control' }, effortButton, effortPanel))
    }

    return {
      name: PLUGIN,
      inject: ['slots'],
      apply(ctx) {
        report(`apply 已调用（slots=${ctx.slots === undefined ? '缺失' : '就绪'}，remote=${ctx.remote === undefined ? '缺失' : '就绪'}）`)
        try {
          const locale = ctx.get('locale')
          const localeId = typeof locale?.getLocale === 'function'
            ? String(locale.getLocale()?.locale ?? 'zh-CN')
            : 'zh-CN'

          ctx.slots.inject(SLOT, () => {
            report('槽位回调已运行，准备注册 occupant')
            const dispose = ctx.slots.register({
              name: SLOT,
              priority: SHADOW_PRIORITY,
              // The child declaration is the compatibility contract: without it every
              // provider plugin's inline decoration loses its slot and disappears.
              children: {
                [LABEL_SLOT]: { kind: 'single', scope: 'session', inline: true }
              },
              inject: (sessionId) => ({
                sessionId,
                localeId,
                remote: ctx.remote,
                sessions: ctx.get('sessions')
              })
            }, ModelPicker)
            report('occupant 已注册（priority ' + SHADOW_PRIORITY + '）')
            return dispose
          })
        } catch (error) {
          report(`apply 抛错：${error instanceof Error ? `${error.message}` : String(error)}`)
          throw error
        }
      }
    }
  }
})
