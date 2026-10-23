import { createStore } from './store.js'

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
export const INVALIDATION_EVENTS = Object.freeze([
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
export function createCatalog(remote, onDiagnostic) {
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
