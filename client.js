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

window.__ModuleLoader__.load({
  id: '@huai_xin/dsh-model-picker',
  factory(require) {
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
        switching: 'Switching…',
        switchFailed: 'Switch failed'
      }
    }

    /* Host theme tokens only, plus the two composer variables the row sets when
       its controls no longer fit on one line. */
    const CSS = `
.dmp-root { position: relative; display: flex; align-items: center; min-width: 0; }
.dmp-trigger { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: min(360px, 45cqw);
  height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 13px; line-height: 20px; }
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

      const [open, setOpen] = useState(false)
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
        if (!open) return undefined
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        const onClick = (event) => {
          if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('mousedown', onClick)
        return () => {
          document.removeEventListener('keydown', onKey)
          document.removeEventListener('mousedown', onClick)
        }
      }, [open])

      const select = useCallback(async (group, model) => {
        const run = remote?.session?.selectModel
        if (typeof run !== 'function') return
        setBusy(true)
        setProblem('')
        try {
          const result = await run.call(remote.session, {
            sessionId,
            provider: group.id,
            model: model.id
          })
          if (result?.ok !== true) {
            setProblem(result?.error?.message ?? t.switchFailed)
            return
          }
          setOpen(false)
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

      return h('div', { className: 'dmp-root', ref: rootRef },
        h('style', null, CSS),
        h('button', {
          type: 'button',
          className: 'dmp-trigger',
          disabled: locked === true || busy,
          title: t.trigger(currentLabel),
          'aria-haspopup': 'listbox',
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value)
        },
          h('span', { className: 'dmp-trigger-text' },
            busy
              ? t.switching
              : (current === null || currentGroup === null
                ? currentLabel
                : renderLabel(currentGroup, current, 'trigger', true))),
          h(Chevron, { open })),
        open
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
          : null)
    }

    return {
      name: PLUGIN,
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale')
        const localeId = typeof locale?.getLocale === 'function'
          ? String(locale.getLocale()?.locale ?? 'zh-CN')
          : 'zh-CN'

        ctx.slots.inject(SLOT, () => ctx.slots.register({
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
        }, ModelPicker))
      }
    }
  }
})
