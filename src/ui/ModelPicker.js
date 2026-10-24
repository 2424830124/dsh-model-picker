import { rankByName } from '../core/rank.js'
import { Chevron } from './Chevron.js'
import { createAnchoredPanel } from './anchor.js'
import { createEffortSlider, tierFor } from './EffortSlider.js'
import { CSS } from './styles.js'
import { dictionaryFor } from './dict.js'


/**
 * Turn a failed `select` result into the two strings the notice shows.
 *
 * `ModelDirectory.select` resolves to `{ ok: false, error: { code, message } }`
 * on a rejected selection. The summary is the short, always-visible line; the
 * detail is what expanding the notice reveals, and it is the only place the
 * provider's raw error text appears — the panels themselves stay free of it.
 *
 * @param result - the value `select` resolved to, possibly undefined.
 * @param t - the active dictionary.
 * @returns `{ summary, detail }`.
 */
function failureOf(result, t) {
  const error = result?.error
  if (error === undefined || error === null) return { summary: t.switchFailed, detail: '' }
  const code = typeof error.code === 'string' ? error.code : ''
  const message = typeof error.message === 'string' ? error.message : String(error)
  return { summary: t.switchFailed, detail: code.length > 0 ? `${code}: ${message}` : message }
}

/**
 * The composer's model seat: a searchable, provider-grouped picker plus a
 * separate reasoning-level control.
 *
 * Every value comes from the session's directory rather than the raw catalogue:
 * `current` (the effective selection, projection or default), `routable`
 * (whether the Host would still accept it), `pending` (the selection being
 * settled), `failures` (provider groups that failed to load) and `error`.
 *
 * @param React - the React runtime.
 * @returns the slot component.
 */
export function createModelPicker(React) {
  const h = React.createElement
  const EffortSlider = createEffortSlider(React)
  const { useCallback, useEffect, useMemo, useRef, useState } = React

  /**
   * Subscribe to any `{ getSnapshot, subscribe }` source.
   *
   * Both sources this component reads — the session directory and the locale
   * service — expose exactly that pair, so one hook covers them. It lives here
   * rather than in a shared module because it needs the component's own hooks,
   * which are bound to this factory's React instance.
   *
   * @param source - the observable source, or undefined while it is not resolved.
   * @returns the current snapshot.
   */
  const useSnapshot = (source) => {
    const [value, setValue] = useState(() => source?.getSnapshot?.())
    useEffect(() => {
      if (source === undefined || source === null) return undefined
      const update = () => setValue(source.getSnapshot())
      update()
      return source.subscribe(update)
    }, [source])
    return value
  }

  return function ModelPicker(props) {
    /**
     * The props bundle the shipped registration hands its own component.
     *
     * `directory` is the session directory's STORE (already subscribed-ready),
     * `load` asks it to refresh, `select` submits a triple, and `available` says
     * whether this session may change models at all. Nothing here reaches behind
     * that bundle: the data layer is the shipped one, this file is the view.
     */
    const { locked, directory, available, load, select: submit } = props

    /**
     * The active language, followed live.
     *
     * `localeSource` is the locale service itself (`getSnapshot` / `subscribe`),
     * so a language switch made while the composer is on screen re-renders with
     * the new dictionary. `localeId` is the value resolved when the seat was
     * registered, used only until the first snapshot arrives.
     */
    const localeState = useSnapshot(props.localeSource)
    const localeId = typeof localeState?.active === 'string' && localeState.active.length > 0
      ? localeState.active
      : typeof props.localeId === 'string' ? props.localeId : 'zh-CN'
    const t = dictionaryFor(localeId)
    // The panel heading is vector art drawn from CJK outlines, so it only reads
    // as words in Chinese; every other language prints the plain string.
    const glyphCaption = String(localeId).toLowerCase().startsWith('zh')

    // One panel at a time: the model list and the effort list are separate
    // controls, and opening either closes the other.
    const [panel, setPanel] = useState(null)
    const [query, setQuery] = useState('')
    // The level the thumb should sit on right now, before the Host confirms.
    // Null means "follow the directory".
    const [draftEffort, setDraftEffort] = useState(null)
    // A rejected selection. Kept out of the panels on purpose: the notice above
    // them is collapsed until the user asks for the raw error.
    const [failure, setFailure] = useState(null)
    const [noticeOpen, setNoticeOpen] = useState(false)
    const [noticeLift, setNoticeLift] = useState(0)
    const rootRef = useRef(null)
    const noticeRef = useRef(null)
    // Whether the most recent action was a load or a selection. `state.error`
    // carries both, and only a LOAD failure belongs inside the model panel.
    const lastActionRef = useRef('load')

    const state = useSnapshot(directory) ?? {}
    const groups = Array.isArray(state.groups) ? state.groups : []
    const failures = Array.isArray(state.failures) ? state.failures : []
    const selection = state.current ?? null
    const pending = state.pending ?? null
    /**
     * Distinguish a MODEL change from a LEVEL change.
     *
     * The directory reports one `selecting` status for both, and `pending` holds
     * whichever triple is in flight. They are not the same event to the user: a
     * level change is a dial, dragged back and forth, and each stop submits. So a
     * pending selection is treated as a model change ONLY when it names a
     * different model than the one in effect — otherwise every slider stop made
     * the model trigger print "Switching…" and go dim, which read as the model
     * button flickering on its own.
     */
    const modelKeyOf = (value) => value === null ? null : `${value.provider ?? ''}:${value.model ?? ''}`
    const swappingModel = pending !== null && modelKeyOf(pending) !== modelKeyOf(selection)
    const busy = swappingModel

    const doLoad = useCallback(() => {
      lastActionRef.current = 'load'
      // Ask the directory to load. It is idempotent: the shipped controller
      // shares one in-flight request and re-projects when it settles.
      if (typeof load === 'function') load()
    }, [load])

    useEffect(() => {
      doLoad()
      return undefined
    }, [doLoad])

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

    // Closing a panel also clears the transient state it carried: the search
    // text (so reopening shows the full list) and the failure notice.
    useEffect(() => {
      if (panel !== null) return
      setQuery('')
      setFailure(null)
      setNoticeOpen(false)
    }, [panel])

    /**
     * Push a failure into the notice and collapse it again.
     *
     * @param result - the failed `select` result.
     */
    const showFailure = useCallback((result) => {
      setFailure(failureOf(result, t))
      setNoticeOpen(false)
    }, [t])

    /**
     * Choose a model, carrying the adapter's default effort when the caller did
     * not name one — the shipped picker sends the same triple.
     *
     * Returns the directory's own result unchanged: `{ ok: true }` or
     * `{ ok: false, error }`. Anything else would make a successful pick look
     * like a failure and leave the panel open.
     */
    const select = useCallback(async (group, model, reasoningEffort) => {
      if (typeof submit !== 'function') return undefined
      lastActionRef.current = 'select'
      const effort = reasoningEffort ?? model?.reasoning?.defaultEffort
      return submit({
        provider: group.id,
        model: model.id,
        ...effort === undefined ? {} : { reasoningEffort: effort }
      })
    }, [submit])

    /**
     * Choosing a MODEL closes the panel on success.
     *
     * A rejected selection keeps it open and raises the notice instead, so the
     * user can pick another model without reopening the list.
     */
    const chooseModel = useCallback(async (group, model, reasoningEffort) => {
      const result = await select(group, model, reasoningEffort)
      if (result?.ok === true) {
        setFailure(null)
        setPanel(null)
        return
      }
      showFailure(result)
    }, [select, showFailure])

    const queryText = query.trim()
    /**
     * The model list, ranked exactly like the shipped menus.
     *
     * `rankByName` is the host's own fuzzy matcher: an ordered subsequence of
     * the name (or of the model id, supplied as the second search key), prefix
     * hits first. A plain substring test could not find `gpt61` in
     * `GPT-6.1-Sol`, which is most of the point of having a search box.
     */
    const filtered = useMemo(() => groups
      .map((group) => ({
        group,
        models: rankByName(
          (group.models ?? []).map((model) => ({
            ...model,
            label: typeof model.label === 'string' ? model.label : model.id
          })),
          queryText
        )
      }))
      .filter((entry) => entry.models.length > 0), [groups, queryText])

    const current = selection === null ? null : groups
      .find((group) => group.id === selection.provider)?.models
      ?.find((model) => model.id === selection.model)
    const currentGroup = selection === null ? null : groups.find((group) => group.id === selection.provider) ?? null

    /**
     * A level change keeps the panel open, and moves the thumb IMMEDIATELY.
     *
     * Two things were wrong before:
     *
     *  - Closing the panel on success made it vanish mid-drag, so the animation
     *    never played — a level is a dial, not a commitment.
     *  - The thumb was positioned from the directory's `current`, which only
     *    updates after the Host answers. During a drag that means the thumb is
     *    dragged back to the old stop on every render — it looks stuck to the
     *    start and refuses to follow the pointer.
     *
     * `draftEffort` is the optimistic stop: set it on every move so the thumb
     * tracks the pointer, and clear it once the Host confirms so the directory
     * becomes the source of truth again. If the RPC fails the draft is dropped,
     * the thumb springs back to the real value, and the notice says why.
     */
    const chooseEffort = useCallback(async (effortId) => {
      if (currentGroup === null || current === null) return
      setDraftEffort(effortId)
      const result = await select(currentGroup, current, effortId)
      if (result?.ok === true) {
        setFailure(null)
        return
      }
      setDraftEffort(null)
      showFailure(result)
    }, [select, currentGroup, current, showFailure])

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
    /**
     * The level to show, and why it is NOT simply `selection.reasoningEffort`.
     *
     * `selection.reasoningEffort` belongs to the SESSION, not to the model. When
     * the user switches to a model they have never used, that field still carries
     * the previous model's level — `xhigh` while the new model only declares
     * `low/high`, or `high` for both, where inheriting it silently starts the new
     * model at a level the user never chose for it.
     *
     * The rule is therefore: a level is only "current" for a model that has
     * already been used in this session. On a model switch the adapter's declared
     * default takes over, which is what the Host would use anyway. `modelKey`
     * tracks which model the level belongs to, so a switch is detectable.
     */
    const declares = (id) => id !== undefined && id !== null && efforts.some((effort) => effort.id === id)
    const modelKey = current === null ? null : `${selection?.provider ?? ''}:${selection?.model ?? ''}`
    const seenModelRef = useRef(null)
    const switchedModel = seenModelRef.current !== null && seenModelRef.current !== modelKey
    const inheritedEffortId = switchedModel ? undefined : selection?.reasoningEffort
    /**
     * The level in effect, resolved through three fallbacks.
     *
     * A provider may declare `reasoningEfforts` without a default — the
     * `openai-responses` models in this profile do exactly that (five levels, no
     * default). Taking `defaultEffort` verbatim then left `activeEffortId`
     * undefined, so the tag rendered with an empty label even though the slider
     * had five stops. The first declared level is the right fallback: it is what
     * an unspecified request uses.
     */
    const confirmedEffortId = declares(inheritedEffortId)
      ? inheritedEffortId
      : declares(current?.reasoning?.defaultEffort)
        ? current.reasoning.defaultEffort
        : efforts[0]?.id
    useEffect(() => { seenModelRef.current = modelKey }, [modelKey])
    const activeEffortId = draftEffort !== null && declares(draftEffort)
      ? draftEffort
      : confirmedEffortId
    const activeEffort = efforts.find((effort) => effort.id === activeEffortId) ?? null

    /**
     * What the trigger prints for the current level.
     *
     * The trigger is only rendered when the model declares levels, so a resolved
     * name always exists by then; the id is a fallback for a level whose entry has
     * no display name, and an empty string is the last resort.
     */
    const effortLabel = activeEffort?.name ?? activeEffort?.id ?? String(activeEffortId ?? '')

    /**
     * Drop the draft once the Host agrees with it.
     *
     * Until the directory catches up the draft IS the truth, so it must not be
     * cleared earlier or the thumb would jump back for one frame. When the
     * confirmed value finally matches, the draft has done its job.
     */
    useEffect(() => {
      if (draftEffort !== null && confirmedEffortId === draftEffort) setDraftEffort(null)
    }, [draftEffort, confirmedEffortId])

    /**
     * The label, in the shipped picker's addressable wrapper.
     *
     * The `data-provider-id` / `data-model-id` span is kept because host CSS that
     * targets one model by id still works. It is deliberately plain text: this entry
     * does not declare the `conversation.input.model.label` child, so the renderer
     * hands it no `renderSlot` and provider badges cannot mount here (see AGENTS.md,
     * invariant 2 — declaring that child breaks the whole registration).
     */
    const renderLabel = (group, model) => h('span', {
      'data-provider-id': group?.id,
      'data-model-id': model?.id
    }, model?.name)

    const renderItem = (group, model) => {
      const isCurrent = selection !== null &&
        selection.provider === group.id && selection.model === model.id
      return h('button', {
        key: `${group.id}:${model.id}`,
        type: 'button',
        role: 'option',
        'aria-selected': isCurrent,
        className: `dmp-item${isCurrent ? ' dmp-item-current' : ''}`,
        onClick: () => void chooseModel(group, model)
      },
        h('span', { className: 'dmp-item-name' }, renderLabel(group, model)))
    }

    const renderGroup = ({ group, models }) => h('div', { key: group.id },
      h('div', { className: 'dmp-group' }, group.name ?? group.id),
      models.map((model) => renderItem(group, model)))

    const notes = []
    /**
     * Catalogue problems only.
     *
     * A selection failure is reported by the notice above the panels instead: it
     * belongs to this session, and the raw `code: message` text is not worth
     * pushing into the list. `lastActionRef` keeps a selection error from
     * appearing here as if it were a load failure.
     */
    const loadError = state.status === 'error' && lastActionRef.current === 'load' &&
      typeof state.error === 'string' && state.error.length > 0 ? state.error : ''
    if (state.status === 'loading' && groups.length === 0) {
      notes.push(h('div', { key: 'loading', className: 'dmp-note' }, t.loading))
    }
    if (loadError.length > 0) {
      notes.push(h('div', { key: 'error', className: 'dmp-note dmp-note-error' },
        loadError,
        h('div', null, h('button', {
          type: 'button', className: 'dmp-retry', onClick: doLoad
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

    const hasEfforts = efforts.length > 0

    /**
     * Where each popover sits.
     *
     * Both panels are wider than their trigger and open above it, so a fixed side
     * anchor drifts away from the button and runs off the window near an edge.
     * The shared hook centres each panel on its trigger and clamps the result to
     * the viewport; `deps` re-measures when the content width changes (a five-level
     * slider is wider than a three-level one, and a longer model list is wider than
     * a short one).
     */
    const effortAnchor = createAnchoredPanel(React, {
      open: panel === 'effort',
      fallbackWidth: 280,
      deps: [efforts.length]
    })
    const modelAnchor = createAnchoredPanel(React, {
      open: panel === 'model',
      fallbackWidth: 320,
      deps: [filtered.length, groups.length]
    })

    /**
     * Measure the notice so the open panel can sit above it instead of under it.
     *
     * The panel's `bottom` adds `--dmp-notice-lift`, so this only has to report
     * the notice's rendered height.
     */
    useEffect(() => {
      const node = noticeRef.current
      if (failure === null || node === null || typeof node.getBoundingClientRect !== 'function') {
        setNoticeLift(0)
        return
      }
      const height = node.getBoundingClientRect().height
      setNoticeLift(Number.isFinite(height) && height > 0 ? height + 6 : 0)
    }, [failure, noticeOpen])

    const notice = failure === null
      ? null
      : h('div', { className: 'dmp-notice', ref: noticeRef, role: 'status' },
        h('button', {
          type: 'button',
          className: 'dmp-notice-toggle',
          'aria-expanded': noticeOpen,
          title: failure.detail,
          onClick: () => setNoticeOpen((value) => !value)
        },
          h('span', { className: 'dmp-notice-text' }, failure.summary),
          h(Chevron, { h, open: noticeOpen })),
        noticeOpen && failure.detail.length > 0
          ? h('div', { className: 'dmp-notice-detail' }, failure.detail)
          : null)

    const effortButton = current === null || currentGroup === null || !hasEfforts
      ? null
      : h('button', {
        type: 'button',
        ref: effortAnchor.ref,
        className: 'dmp-trigger dmp-trigger-effort',
        // The two highest levels name themselves in their accent colour here, so the
        // tag in the composer row carries the same colour as the bar in the panel it
        // opens. The slider computes the value for its own subtree; this component has
        // to compute it again because the tag is NOT a descendant of the slider.
        'data-tier': tierFor(efforts.findIndex((effort) => effort.id === activeEffortId), efforts.length),
        // Only a locked composer disables the level tag. Its own commits flip the
        // directory to `selecting`, and disabling here killed the drag after the
        // first stop — the same reason the slider's range input stays enabled.
        disabled: locked === true,
        title: t.effortTitle(effortLabel),
        'aria-haspopup': 'dialog',
        'aria-expanded': panel === 'effort',
        onClick: () => setPanel((value) => (value === 'effort' ? null : 'effort'))
      },
        h('span', { className: 'dmp-trigger-text dmp-trigger-effort-text' }, effortLabel),
        h(Chevron, { h, open: panel === 'effort' }))

    const effortPanel = panel === 'effort' && effortButton !== null
      ? h('div', {
        className: 'dmp-panel dmp-panel-slider',
        role: 'dialog',
        'aria-label': t.effortHeading,
        // The host lifts the composer's stacking context when one of its own menus
        // is open: `.composerSeat:has([data-trigger-menu]) { z-index: 9 }`. Without
        // it the seat stays at z-index 7, and the chat's "jump to latest" button
        // (z-index 8, a sibling of the seat) paints over this panel no matter what
        // z-index the panel itself asks for — a child cannot escape its parent's
        // stacking context. Marking the panel is the supported way to ask for the
        // same lift.
        'data-trigger-menu': '',
        ref: effortAnchor.panelRef,
        style: effortAnchor.style
      },
        h(EffortSlider, {
          efforts,
          activeId: activeEffortId,
          /**
           * Deliberately NOT disabled while a change is settling.
           *
           * `busy` tracks the directory's `status === 'selecting'`, and every stop
           * the slider passes submits a selection — so the first stop flipped
           * `busy`, disabled the input mid-gesture, and the drag died. The user
           * then had to press again for each further stop. A level is a dial: it
           * stays live, and the draft value keeps the thumb honest while the Host
           * catches up.
           */
          disabled: locked === true,
          caption: glyphCaption ? undefined : t.effortHeading,
          t,
          onChange: (effortId) => { void chooseEffort(effortId) }
        }))
      : null

    const modelPanel = panel === 'model'
      ? h('div', {
        className: 'dmp-panel',
        role: 'listbox',
        // Same stacking lift as the effort panel: see the comment there.
        'data-trigger-menu': '',
        ref: modelAnchor.panelRef,
        style: modelAnchor.style
      },
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

    return h('div', {
      className: 'dmp-root',
      ref: rootRef,
      style: noticeLift > 0 ? { '--dmp-notice-lift': `${noticeLift}px` } : undefined
    },
      h('style', null, CSS),
      // The model control and the reasoning-level control are deliberately two
      // buttons: they are two independent choices, and a model change must not
      // silently drag the level along with it.
      h('div', { className: 'dmp-control' },
        h('button', {
          type: 'button',
          ref: modelAnchor.ref,
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
                : renderLabel(currentGroup, current))),
          h(Chevron, { h, open: panel === 'model' })),
        modelPanel),
      effortButton === null ? null : h('div', { className: 'dmp-control' }, effortButton, effortPanel),
      notice)
  }
}
