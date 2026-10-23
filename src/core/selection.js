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
export function readSelection(projection) {
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
export function isAvailable(sessions, sessionId) {
  try {
    if (typeof sessions?.subagentAddress !== 'function') return true
    return sessions.subagentAddress(sessionId) === undefined
  } catch {
    return true
  }
}
