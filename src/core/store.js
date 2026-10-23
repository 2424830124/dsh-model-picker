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
export function createStore(init) {
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
export function readSnapshot(useState, useEffect, source) {
  const [value, setValue] = useState(() => source?.getSnapshot?.())
  useEffect(() => {
    if (source === undefined || source === null) return undefined
    const update = () => setValue(source.getSnapshot())
    update()
    return source.subscribe(update)
  }, [source])
  return value
}
