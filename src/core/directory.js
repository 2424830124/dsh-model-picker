import { createStore } from './store.js'
import { readSelection } from './selection.js'

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
export function createDirectory(catalog, projectedFace, remote, sessionId) {
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
