import { rankByName } from '../core/rank.js'
import { Chevron } from './Chevron.js'
import { Refresh } from './Refresh.js'
import { createAnchoredPanel } from './anchor.js'
import { createEffortSlider, tierFor } from './EffortSlider.js'
import { CSS } from './styles.js'
import { dictionaryFor } from './dict.js'


/**
 * Where the folded provider cards are remembered.
 *
 * A client plugin's Cordis config is read-only at runtime — there is no write
 * path back into it from the browser — so the durable store available here is
 * the one the shipped client plugins use for their own UI state (sidebar width,
 * composer drafts, shortcuts): `localStorage`, keyed by name. The GUI is served
 * from the loopback origin the desktop shell always binds, so the key survives a
 * DSH restart and the next start opens with the same cards folded.
 *
 * Only the FOLDED ids are stored: a provider missing from the list is open,
 * which is also what a catalogue the user has never touched should do. That
 * makes the value self-healing when a provider disappears and comes back.
 */
const COLLAPSED_KEY = 'dsh-model-picker.collapsed-cards'

/**
 * Read the persisted fold set.
 *
 * Storage can be absent (unit tests, a locked-down browser) and it can hold junk
 * (a half-written value, an older shape). Both degrade to "everything open"
 * rather than throwing from inside render.
 *
 * @returns the provider ids that were folded last time.
 */
function readCollapsedCards() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === 'string').slice(0, 64)
      : []
  } catch {
    return []
  }
}

/**
 * Persist the fold set.
 *
 * A rejected write (quota, private mode) only costs the memory: the card still
 * folds for this session, it just comes back open on the next start.
 *
 * @param ids - the provider ids that are folded now.
 */
function writeCollapsedCards(ids) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids))
  } catch {
    // ignore: persistence is a convenience, never a precondition
  }
}


/**
 * Cards that bring their own accent colour.
 *
 * Keyed by the card key (the package prefix), so the exception is stated once and
 * any card without an entry keeps the shared blue. The colour itself lives in the
 * stylesheet under the same name — this table only says whose card is whose.
 */
const CARD_ACCENTS = {
  '@huai_xin/dsh-workbuddy': 'workbuddy'
}

/**
 * The card a provider belongs to.
 *
 * Providers registered by the SAME plugin share a package prefix in their id
 * (`@huai_xin/dsh-workbuddy/cn` vs `/intl`), and that is exactly the pair a user
 * thinks of as one thing: two deployments of one product, listed side by side.
 * Grouping by that prefix rather than by a hard-coded id means any provider
 * plugin that registers several routes gets one card, and this file never has to
 * know the plugin's name.
 *
 * An id without a slash is its own card, which is the ordinary case.
 *
 * @param providerId - the catalogue's provider id.
 * @returns the grouping key: the package prefix, or the id itself.
 */
function cardKeyOf(providerId) {
  const at = String(providerId ?? '').lastIndexOf('/')
  return at > 0 ? providerId.slice(0, at) : providerId
}

/** Longest common prefix of two strings, used to name a merged card. */
function commonPrefix(left, right) {
  const limit = Math.min(left.length, right.length)
  let at = 0
  while (at < limit && left.charAt(at) === right.charAt(at)) at += 1
  return left.slice(0, at)
}

/** Trim separators and brackets from both ends of a label fragment. */
function trimFragment(text) {
  return String(text ?? '')
    .replace(/^[\s([{（【·:：\-—]+/u, '')
    .replace(/[\s)\]}）】([{（【·:：\-—]+$/u, '')
}

/**
 * Order model rows by the name they are drawn with.
 *
 * The catalogue's order is whatever the provider registered, and two deployments
 * of one product register theirs independently: the same model sat at a different
 * height in each tab, which reads as "these are different lists" rather than as
 * one list with different availability. Sorting happens per section, so the two
 * tabs line up row for row.
 *
 * `numeric` keeps V3.9 before V3.10 instead of after it; `base` stops the order
 * from depending on capitalisation. A search result keeps its relevance order —
 * this is only for the unsearched list.
 */
function sortByModelName(models) {
  const textOf = (model) => String(model?.name ?? model?.label ?? model?.id ?? '')
  return [...models].sort((left, right) => textOf(left).localeCompare(textOf(right), undefined,
    { numeric: true, sensitivity: 'base' }))
}


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
    /**
     * Which provider cards are folded.
     *
     * Seeded from the persisted set on every mount — the value is a user
     * preference, not session state, so it must not depend on the panel having
     * been opened before.
     */
    const [collapsedCards, setCollapsedCards] = useState(readCollapsedCards)
    /**
     * The deployment tab each merged card is showing, keyed by card key.
     *
     * Session-only on purpose: it is a view state, and remembering it across
     * restarts would mean a card silently opening on the deployment the user
     * picked weeks ago rather than the first one the catalogue lists.
     */
    const [activeSection, setActiveSection] = useState({})
    /**
     * Which tab's account action is in flight (`credits:<provider>` / `login:<id>`).
     *
     * One key rather than a set: both actions belong to a deployment header, and
     * letting the user start a second one while the first is pending buys nothing.
     */
    const [busyAccount, setBusyAccount] = useState(null)
    const toggleCard = useCallback((providerId) => {
      setCollapsedCards((current) => {
        const next = current.includes(providerId)
          ? current.filter((id) => id !== providerId)
          : [...current, providerId]
        writeCollapsedCards(next)
        return next
      })
    }, [])
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

    /**
     * Keep the provider's numbers fresh while the list is open.
     *
     * At rest that plugin refreshes its own snapshot every FIVE MINUTES, and its
     * faster two-second poll only runs while its settings panel is mounted. Busy
     * levels and rates are live numbers, so a list opened for a while would show
     * stale chips; this asks again every few seconds instead, at a rate well below
     * what the provider's own panel does.
     *
     * The same tick re-asks the DIRECTORY when a deployment is signed in but has
     * no models in the catalogue yet — that gap is what makes a freshly signed-in
     * deployment look empty for a long time: credentials arrive first, the model
     * registration lands in a later catalogue fetch.
     */
    const catalogueGapRef = useRef(false)
    useEffect(() => {
      if (panel !== 'model') return undefined
      const source = props.modelStateSource
      const ask = typeof source?.refresh === 'function' ? source.refresh : null
      if (ask === null && typeof load !== 'function') return undefined
      const tick = () => {
        if (ask !== null) {
          try {
            const task = ask()
            if (task !== null && task !== undefined && typeof task.catch === 'function') task.catch(() => {})
          } catch {
            // A provider that cannot refresh simply keeps the cached values.
          }
        }
        if (catalogueGapRef.current && typeof load === 'function') {
          try {
            load()
          } catch {
            // The directory load is best-effort; the next tick tries again.
          }
        }
      }
      tick()
      const timer = setInterval(tick, 2000)
      // Node keeps a live interval alive; a browser has no such concern, and the
      // guard costs nothing there. Without it the offline test suite never exits.
      timer?.unref?.()
      return () => clearInterval(timer)
    }, [panel, props.modelStateSource, load])

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
     * Choosing a MODEL keeps the panel open.
     *
     * A pick is not a commit that dismisses the list: users compare models, and
     * the shipped picker reopens on the next click anyway. The row that was just
     * taken is marked (`.dmp-item-current`) so the panel still shows where the
     * selection went. A rejected selection raises the notice as before.
     */
    const chooseModel = useCallback(async (group, model, reasoningEffort) => {
      const result = await select(group, model, reasoningEffort)
      if (result?.ok === true) {
        setFailure(null)
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
      .map((group) => {
        const ranked = rankByName(
          (group.models ?? []).map((model) => ({
            ...model,
            label: typeof model.label === 'string' ? model.label : model.id
          })),
          queryText
        )
        // Without a query the rows are listed by NAME, not by catalogue order.
        // Two deployments of one product register their catalogues independently,
        // so the same model used to sit at a different height depending on which
        // tab was open — which reads as "these are different lists".
        return { group, models: queryText.length > 0 ? ranked : sortByModelName(ranked) }
      })
      .filter((entry) => entry.models.length > 0), [groups, queryText])

    /**
     * The cards the list draws: providers from the same plugin merged into one.
     *
     * A card is not the same thing as a provider any more. The WorkBuddy plugin
     * registers two providers for two deployments of one product, and showing
     * them as two cards means two headers carrying almost the same word, two fold
     * controls, and no way to compare their rows. Merging by the package prefix
     * of the provider id puts them under one card with a section each, while a
     * pick still carries the exact provider id it came from.
     *
     * Order follows the catalogue: a card keeps the position of its first section.
     */
    /**
     * Live provider state, when the matching provider plugin publishes it.
     *
     * Optional by design: `modelStateSource` is `undefined` when that plugin is
     * not installed, and every read below treats a missing entry as "no
     * decoration" rather than as an error. The snapshot is keyed by provider id,
     * then by model id — both match the catalogue verbatim, so no lookup table.
     */
    const stateSnapshot = useSnapshot(props.modelStateSource)
    const providerState = stateSnapshot?.providers ?? {}
    /**
     * Whether ANY provider plugin publishes state in this composition.
     *
     * The service answers `undefined` when no plugin exists at all, and an empty
     * `providers` map while a plugin is still loading. Only the second case is
     * "pending" — otherwise a plugin that registers several providers without
     * publishing state would wear "unknown" on every row forever.
     */
    const stateAvailable = stateSnapshot !== undefined && stateSnapshot !== null
    /**
     * Is a signed-in deployment still missing from the catalogue?
     *
     * Credentials arrive before model registration, so this is true for a while
     * after a sign-in — the window in which the list looks empty. The panel's
     * poller reads it to decide whether to re-ask the directory as well.
     */
    catalogueGapRef.current = stateAvailable && Object.entries(providerState).some(([id, entry]) => {
      if (entry?.loggedIn !== true) return false
      const listed = groups.find((group) => group.id === id)
      return listed === undefined || (listed.models?.length ?? 0) === 0
    })
    /**
     * Deployments the plugin publishes but the catalogue does not list.
     *
     * A provider registers no models until it has credentials, and right after a
     * sign-in there is a window where the credentials exist but the models are not
     * registered yet — the catalogue lists neither state. Trusting the catalogue
     * alone made the whole card vanish in exactly that window (and a signed-out
     * deployment lost the tab that carried its sign-in button). The plugin's own
     * snapshot is the authority on which deployments it manages, so anything it
     * publishes but the directory does not list is shown as a section with no
     * models: a tab with its account line, an empty body until models arrive.
     */
    const stateOnlySections = useMemo(() => {
      if (!stateAvailable || queryText.length > 0) return []
      const listed = new Set(groups.map((group) => group.id))
      return Object.entries(providerState)
        .filter(([id]) => listed.has(id) === false)
        .map(([id, entry]) => ({
          group: {
            id,
            name: typeof entry?.displayName === 'string' && entry.displayName.length > 0
              ? entry.displayName
              : id,
            models: []
          },
          models: []
        }))
    }, [stateAvailable, providerState, groups, queryText])

    const cards = useMemo(() => {
      const byKey = new Map()
      const order = []
      for (const entry of [...filtered, ...stateOnlySections]) {
        const key = cardKeyOf(entry.group.id)
        let card = byKey.get(key)
        if (card === undefined) {
          card = { key, sections: [] }
          byKey.set(key, card)
          order.push(card)
        }
        card.sections.push(entry)
      }
      return order
    }, [filtered, stateOnlySections])

    const busyWord = (busy) => busy === 'idle' ? t.busyIdle
      : busy === 'busy' ? t.busyBusy
        : busy === 'congested' ? t.busyCongested
          : t.rateUnknown
    /**
     * The tooltip's wording: the dot's colour already says how bad it is, so the
     * label spells it out — the degree the panel's own tooltip names, which the
     * two-character chip deliberately drops.
     */
    const busyDetail = (busy) => busy === 'idle' ? t.busyIdle
      : busy === 'busy' ? t.busyBusyDetail
        : busy === 'congested' ? t.busyCongestedDetail
          : t.rateUnknown
    const verdictWord = (verdict) => t.verdict[verdict] ?? verdict
    const rateWord = (rate) => rate === 'free'
      ? t.rateFree
      : (typeof rate === 'string' && rate.length > 0 && rate !== 'unknown' ? rate : t.rateUnknown)
    /**
     * What a row's tail says.
     *
     * A callable model shows what it costs; one that cannot be called shows why,
     * because a price on a model you cannot use is noise. `unknown` counts as
     * callable: the probe reached no conclusion, which is not the same as the
     * model being broken — the panel draws no chip for it either.
     */
    const tailOf = (info) => {
      if (info === undefined || info === null) return undefined
      const calm = info.verdict === undefined || info.verdict === 'available' || info.verdict === 'unknown'
      return calm ? rateWord(info.rate) : verdictWord(info.verdict)
    }
    /** How a verdict reads at a glance: a callable model is calm, a broken one is not. */
    const verdictTone = (verdict) => verdict === 'unusable' || verdict === 'no permission' || verdict === 'credentials rejected'
      ? 'bad'
      : verdict === 'out of credits' || verdict === 'rate limited' ? 'warn' : 'muted'

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

    /**
     * One model row: an optional load dot, the name, and a status/price tail.
     *
     * The decoration comes from a provider plugin's published state, so it only
     * exists for providers that publish one — every other provider renders the
     * plain row it always did. The dot is the LOAD level, not availability: a
     * coloured dot next to the name reads as "how busy is this thing right now",
     * while availability already decides what the tail says.
     */
    const renderItem = (group, model, pending) => {
      const isCurrent = selection !== null &&
        selection.provider === group.id && selection.model === model.id
      const info = providerState?.[group.id]?.models?.[model.id]
      const busy = info?.busy
      /**
       * The dot is the LOAD level. Once a deployment publishes state every row
       * carries one — grey when the level is unknown — so the column keeps its
       * shape instead of appearing only for the deployments that report load.
       * A provider with no state at all still renders plain rows.
       */
      const loading = info === undefined && pending === true
      const tone = info === undefined && loading === false ? undefined
        : busy === 'idle' || busy === 'busy' || busy === 'congested' ? busy
          : 'unknown'
      const tail = loading ? t.rateUnknown : tailOf(info)
      /**
       * The tail's dress follows the provider panel's vocabulary: a price is plain
       * mono text, "free" is an accent pill, and a verdict is a pill tinted by how
       * bad it is. Same information, same reading, one glance.
       */
      const calm = info !== undefined && info !== null &&
        (info.verdict === undefined || info.verdict === 'available' || info.verdict === 'unknown')
      const tailClass = tail === undefined ? undefined
        : loading ? 'dmp-item-tail dmp-item-tail-pending'
          : calm
            ? (info.rate === 'free'
              ? 'dmp-item-tail dmp-item-tail-pill dmp-item-tail-accent'
              : 'dmp-item-tail dmp-item-tail-rate')
            : `dmp-item-tail dmp-item-tail-pill dmp-item-tail-${verdictTone(info.verdict)}`
      return h('button', {
        key: `${group.id}:${model.id}`,
        type: 'button',
        role: 'option',
        'aria-selected': isCurrent,
        className: `dmp-item${isCurrent ? ' dmp-item-current' : ''}`,
        onClick: () => void chooseModel(group, model)
      },
        tone === undefined ? null : h('span', {
          key: 'dot',
          className: 'dmp-item-dot',
          'data-tone': tone,
          title: busyDetail(busy)
        }),
        h('span', { className: 'dmp-item-name' }, renderLabel(group, model)),
        tail === undefined ? null : h('span', {
          key: 'tail',
          className: tailClass
        }, tail))
    }

    /**
     * Whether a deployment is still waiting for its first snapshot.
     *
     * Only a card that is EXPECTED to have state gets placeholders: one with a
     * published entry already, or a merged card (several providers under one
     * package — the shape a provider plugin uses for several deployments). An
     * ordinary provider that never publishes state keeps its plain rows instead of
     * wearing a permanent "unknown".
     */
    const statePending = (card, group) => stateAvailable && providerState?.[group.id] === undefined &&
      (card.sections.length > 1 ||
        card.sections.some((section) => providerState?.[section.group.id] !== undefined))
    /**
     * One card, foldable from its header, holding one section per provider.
     *
     * A flat list with a thin caption per group reads as one undifferentiated
     * column as soon as two providers offer models with the same name — which is
     * exactly what the official catalogue does (a model appears under both the
     * official and the account provider). The card edge is what says "these
     * belong to DeepSeek, those to DeepSeek Account". The header doubles as the
     * fold control and keeps the provider name for a one-model group.
     *
     * Sections appear when a provider plugin registers several providers under
     * one package (see `cardKeyOf`): one card, one header, one fold, and a small
     * label per deployment inside. The label is the part of the display name the
     * shared title does not already say — "WorkBuddy (Mainland)" under a
     * "WorkBuddy" header reads "Mainland".
     *
     * A search FORCES every card open: a folded group must not swallow the very
     * rows the query matched. The saved fold is left untouched, so clearing the
     * query restores it, and the header is deliberately not a button while
     * searching — a control that looks fusable and does nothing is worse than no
     * control.
     */
    const searching = queryText.length > 0
    const cardTitle = (card) => {
      if (card.sections.length === 1) return card.sections[0].group.name ?? card.sections[0].group.id
      const shared = card.sections
        .map((section) => section.group.name ?? section.group.id)
        .reduce((left, right) => commonPrefix(left, right))
      const trimmed = trimFragment(shared)
      return trimmed.length > 0 ? trimmed : card.sections[0].group.name ?? card.key
    }
    /** The balance as the header shows it: a plain number, or a dash when unknown. */
    const creditsText = (entry) => {
      const value = entry?.credits
      if (typeof value !== 'number' || !Number.isFinite(value)) return t.creditsUnknown
      return Number.isInteger(value) ? String(value) : value.toFixed(2)
    }
    /**
     * Ask the provider to re-read itself, without waiting for the next poll.
     *
     * Used after an action that can change the snapshot (sign-in, renewal): the
     * service is cheap and shares an in-flight load, and the alternative is a tab
     * that sits on a stale state for up to one polling interval.
     */
    const nudgeState = () => {
      try {
        const task = props.modelStateSource?.refresh?.()
        if (task !== null && task !== undefined && typeof task.catch === 'function') task.catch(() => {})
      } catch {
        // The poll will pick it up.
      }
    }
    /**
     * Run a deployment's side action.
     *
     * Refresh and sign-in both live on the provider's service; the picker only
     * triggers them and shows a busy state. A failure is swallowed on purpose:
     * that plugin explains its own errors in its panel, and a model list is the
     * wrong place to narrate a login problem.
     */
    const runAccount = async (kind, providerId) => {
      const key = `${kind}:${providerId ?? 'all'}`
      if (busyAccount === key) return
      setBusyAccount(key)
      try {
        const source = props.modelStateSource
        if (kind === 'credits') {
          await source?.refreshCredits?.(providerId)
        } else if (kind === 'renew') {
          // No id renews every deployment the plugin manages, which is what the
          // card header offers; a one-deployment card names its own.
          await source?.renew?.(providerId)
          nudgeState()
        } else {
          await source?.login?.(providerId)
          // Signing in finishes on the host (the browser round-trip), so the call
          // above only starts it. Nudge both the state and the catalogue right away
          // instead of leaving the tab on "signing in" until the next poll.
          nudgeState()
          if (typeof load === 'function') {
            try {
              load()
            } catch {
              // Best effort; see above.
            }
          }
        }
      } catch {
        // See above: not this list's story.
      } finally {
        setBusyAccount(null)
      }
    }
    /**
     * The account line under a deployment tab: what it costs, or how to get in.
     *
     * A signed-out deployment gets a sign-in button because nothing else on this
     * list can tell the user why its models are missing; a signed-in one gets its
     * balance and a refresh, which is the number people actually watch.
     */
    const accountRow = (group, pending, solo) => {
      const entry = providerState?.[group.id]
      const rowClass = solo === true ? 'dmp-card-account dmp-card-account-solo' : 'dmp-card-account'
      if (entry === undefined || entry === null) {
        // Nothing published yet: say so rather than leaving a hole, which reads as
        // "this deployment has no balance" until it silently fills in.
        if (pending !== true) return null
        return h('div', { className: rowClass },
          h('span', { className: 'dmp-card-credits dmp-card-credits-pending' },
            `${t.credits} ${t.creditsLoading}`))
      }
      if (entry.loggedIn === false) {
        const signingIn = busyAccount === `login:${group.id}`
        return h('div', { className: rowClass },
          h('button', {
            type: 'button',
            className: 'dmp-card-login',
            disabled: signingIn,
            onClick: () => void runAccount('login', group.id)
          }, signingIn ? t.loginPending : t.login))
      }
      const working = busyAccount === `credits:${group.id}`
      return h('div', { className: rowClass },
        h('span', { className: 'dmp-card-credits' }, `${t.credits} ${creditsText(entry)}`),
        h('button', {
          type: 'button',
          className: 'dmp-card-refresh',
          title: t.refreshCredits,
          'aria-label': t.refreshCredits,
          disabled: working,
          onClick: () => void runAccount('credits', group.id)
        }, h(Refresh, { h, spinning: working })))
    }
    /**
     * Which deployment a provider is, read from the id when state is still in flight.
     *
     * `region` from the published snapshot is authoritative, but it arrives
     * asynchronously — the first frames of the panel would then name the tab from
     * the English display name and relabel it a moment later, which reads as a
     * language flip. The provider id carries the same token synchronously
     * (`…/cn`, `…/intl`), so the id is used as the immediate source and the
     * snapshot only has to agree with it.
     */
    const regionOf = (group) => {
      const published = providerState?.[group.id]?.region
      if (typeof published === 'string' && published.length > 0) return published
      const id = String(group.id ?? '')
      const at = id.lastIndexOf('/')
      return at > 0 ? id.slice(at + 1) : undefined
    }
    const regionLabel = (region) => region === 'cn' ? t.regionCn
      : region === 'intl' ? t.regionIntl
        : undefined
    const sectionTitle = (card, group, title) => {
      if (card.sections.length === 1) return undefined
      /**
       * A deployment is named in the picker's own language.
       *
       * The display names arrive in English ("WorkBuddy (Mainland)") because the
       * provider plugin writes them for its own panel; a Chinese picker should not
       * grow an English tab in the middle of it. The region token is stable, so it
       * is the thing translated — the derived name stays the fallback for a
       * provider that is not a deployment at all.
       */
      const translated = regionLabel(regionOf(group))
      if (translated !== undefined) return translated
      const full = group.name ?? group.id
      const rest = trimFragment(full.startsWith(title) ? full.slice(title.length) : full)
      return rest.length > 0 ? rest : group.id
    }
    const renderCard = (card) => {
      const title = cardTitle(card)
      const folded = !searching && collapsedCards.includes(card.key)
      const head = [
        h('span', { key: 'name', className: 'dmp-card-head-text' }, title)
      ]
      /**
       * Several providers under one card are TABS, not stacked sections.
       *
       * Two deployments of one product have near-identical model lists; stacked,
       * the second one reads as "more of the same list" and the card doubles in
       * height for a difference the user rarely cares about. A tab strip is what
       * the provider panel itself uses, and it keeps one deployment's rows on
       * screen at a time. The choice is per card and lives for the session only —
       * it is a view state, not a preference.
       */
      const activeGroupId = card.sections.length > 1
        ? (card.sections.some((section) => section.group.id === activeSection[card.key])
          ? activeSection[card.key]
          : card.sections[0].group.id)
        : undefined
      const tabs = card.sections.length > 1 && !searching
        ? h('div', { className: 'dmp-card-tabs' }, card.sections.map(({ group }) => {
          const active = group.id === activeGroupId
          return h('div', {
            key: group.id,
            className: `dmp-card-tabcol${active ? ' dmp-card-tabcol-active' : ''}`
          },
            h('button', {
              type: 'button',
              className: 'dmp-card-tab',
              'aria-pressed': active,
              onClick: () => setActiveSection((current) => ({ ...current, [card.key]: group.id }))
            }, sectionTitle(card, group, title)),
            accountRow(group, statePending(card, group)))
        }))
        : null
      // A search hides the tabs so a match in the OTHER deployment is not swallowed;
      // without tabs the section caption comes back to say which is which.
      const visible = tabs === null
        ? card.sections
        : card.sections.filter((section) => section.group.id === activeGroupId)
      const showSectionLabels = tabs === null && card.sections.length > 1
      const body = [
        tabs,
        // A card with a single deployment has no tab strip to hang the account
        // line on, but its balance (or a way to sign in) is just as useful.
        card.sections.length === 1
          ? accountRow(card.sections[0].group, statePending(card, card.sections[0].group), true)
          : null,
        ...visible.map(({ group, models }) => h('div', { key: group.id, className: 'dmp-card-section' },
          showSectionLabels
            ? h('div', { className: 'dmp-card-section-label' }, sectionTitle(card, group, title))
            : null,
          models.length === 0
            ? h('div', { className: 'dmp-card-empty' }, t.noModels)
            : null,
          models.map((model) => renderItem(group, model, statePending(card, group)))))
      ]
      /**
       * The header row: the fold control, plus one action of its own.
       *
       * A button cannot contain a button, so the fold area (name + chevron) is its
       * own button and the renewal sits beside it in the same row. The action is
       * offered only where there is something to renew — a deployment the plugin
       * reports as signed in — since renewing a signed-out one has nothing to work
       * with.
       */
      const renewable = card.sections.some(({ group }) => providerState?.[group.id]?.loggedIn === true)
      const renewKey = `renew:${card.sections.length === 1 ? card.sections[0].group.id : 'all'}`
      const renewing = busyAccount === renewKey
      const renewButton = renewable && !searching
        ? h('button', {
          key: 'renew',
          type: 'button',
          className: 'dmp-card-renew',
          disabled: renewing,
          title: t.renew,
          onClick: () => {
            void runAccount('renew',
              card.sections.length === 1 ? card.sections[0].group.id : undefined)
          }
        }, renewing ? t.renewing : t.renew)
        : null
      const headToggle = searching
        ? h('div', { className: 'dmp-card-head-toggle' }, head)
        : h('button', {
          type: 'button',
          className: 'dmp-card-head-toggle',
          'aria-expanded': !folded,
          title: folded ? t.expand : t.collapse,
          onClick: () => toggleCard(card.key)
        }, head)
      /**
       * The chevron closes the row, after the renewal: it is the fold affordance,
       * so it lives at the end where the eye expects it. It repeats the toggle's
       * action, which is why it is hidden from assistive tech and skipped by tab —
       * the titled toggle above already carries `aria-expanded`.
       */
      const chevron = searching
        ? h('span', { className: 'dmp-card-chevron' }, h(Chevron, { h, open: !folded }))
        : h('button', {
          type: 'button',
          className: 'dmp-card-chevron',
          'aria-hidden': 'true',
          tabIndex: -1,
          onClick: () => toggleCard(card.key)
        }, h(Chevron, { h, open: !folded }))
      return h('div', {
        key: card.key,
        // A provider plugin may bring its own accent; the attribute carries the
        // name, the stylesheet owns the colour (see CARD_ACCENTS).
        'data-accent': CARD_ACCENTS[card.key],
        className: `dmp-card${folded ? ' dmp-card-folded' : ''}`,
        role: 'group',
        'aria-label': title
      },
        h('div', { className: 'dmp-card-head' }, headToggle, renewButton, chevron),
        folded
          ? null
          : h('div', { className: 'dmp-card-body' }, body))
    }

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
        h('div', { className: 'dmp-list' }, cards.map(renderCard)))
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
          // Only the read-only session disables this button. A switch in flight
          // used to disable it and swap the label for "switching…"; with the panel
          // staying open after a pick, that meant the button shrank, dimmed and
          // grew again on EVERY selection — a visible flash right where the user
          // is still reading. `aria-busy` says the same thing without moving a
          // pixel, and the host already dedupes a repeated triple.
          disabled: locked === true,
          'aria-busy': busy || undefined,
          title: t.trigger(currentLabel),
          'aria-haspopup': 'listbox',
          'aria-expanded': panel === 'model',
          onClick: () => setPanel((value) => (value === 'model' ? null : 'model'))
        },
          h('span', { className: 'dmp-trigger-text' },
            current === null || currentGroup === null
              ? currentLabel
              : renderLabel(currentGroup, current)),
          h(Chevron, { h, open: panel === 'model' })),
        modelPanel),
      effortButton === null ? null : h('div', { className: 'dmp-control' }, effortButton, effortPanel),
      notice)
  }
}
