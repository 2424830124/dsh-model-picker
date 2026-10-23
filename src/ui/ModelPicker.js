import { readSnapshot } from '../core/store.js'
import { Chevron } from './Chevron.js'
import { CSS } from './styles.js'
import { dictionaryFor } from './dict.js'

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
export function createModelPicker(React) {
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
