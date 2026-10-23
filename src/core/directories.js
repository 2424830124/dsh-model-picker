import { createDirectory } from './directory.js'

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
 * @param resolveRemote - returns the client remote face. A thunk for the same
 *   reason the catalogue takes one: the service is often not visible yet when
 *   this object is built, and capturing it froze `undefined`.
 * @returns the service object with `directoryFor`.
 */
export function createDirectoryService(catalog, sessions, resolveRemote) {
  /** The remote face as it is right now, or undefined while the service is absent. */
  const currentRemote = () => {
    try { return typeof resolveRemote === 'function' ? resolveRemote() : resolveRemote } catch { return undefined }
  }

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
    const directory = createDirectory(catalog, projectedFace, currentRemote(), sessionId)
    directories.set(key, directory)
    return directory
  }

  return { directoryFor, directories }
}
