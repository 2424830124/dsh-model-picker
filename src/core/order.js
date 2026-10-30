/**
 * Provider order for the model list.
 *
 * The shipped picker does not list providers in catalogue order: it puts two of
 * them first and leaves everything else alone. That rule lives in
 * `orderModelProviders` (`@deepseek-ai/dsh-client-ui-model-selection`):
 *
 *   deepseek-account → 0, deepseek-official → 1, every other provider → 2
 *
 * and it is a STABLE sort, so the remaining providers keep the order they were
 * registered in. This file is that rule, vendored for the same reason
 * `core/rank.js` is: the Client module table only carries `react`, and the
 * offline unit test must run without DSH installed. The rule is four lines of
 * comparison with no imports, so copying it keeps this list's order identical to
 * the shipped one instead of merely similar.
 *
 * One deliberate addition sits on top of it. The provider plugin this picker is
 * developed alongside (`@huai_xin/dsh-workbuddy`) is PINNED above both, because
 * its card is the one carrying live data here — balance, load, rate, sign-in,
 * renewal — and it is the deployment a user opens the list to compare. Pinning is
 * stated once, as a package prefix, exactly like `CARD_ACCENTS` and the state
 * service name: a provider registered under that package is pinned, a provider
 * registered under any other package is not.
 *
 * What is NOT here: the order of the model rows inside a provider. Those follow
 * the name (`sortByModelName`) or the search relevance, never this table.
 */

/**
 * The package whose providers lead the list.
 *
 * Stated as a prefix, not as the two ids `…/cn` and `…/intl`: the plugin decides
 * how many deployments it registers, and a third one must be pinned without an
 * edit here. Both the card key (the prefix itself) and any provider id under it
 * (`<prefix>/<region>`) therefore resolve to the same rank.
 */
const PINNED_PROVIDER = '@huai_xin/dsh-workbuddy'

/** The providers the shipped picker lifts, in its own order. */
const HOST_PROVIDERS = ['deepseek-account', 'deepseek-official']

/**
 * How early a provider is listed: lower is earlier.
 *
 * 0 is the pinned package, then the shipped two, then everything else at 3 —
 * a single number per provider, so the caller only has to compare.
 *
 * @param providerId - the provider id, or a card key (the package prefix).
 * @returns the rank; a missing id ranks with the rest.
 */
function providerRank(providerId) {
  const id = String(providerId ?? '')
  if (id === PINNED_PROVIDER || id.startsWith(`${PINNED_PROVIDER}/`)) return 0
  const at = HOST_PROVIDERS.indexOf(id)
  return at === -1 ? HOST_PROVIDERS.length + 1 : at + 1
}

/**
 * Order items by the provider each one belongs to.
 *
 * Ties keep their incoming order — the sort is made explicit about that with the
 * original index rather than relying on the engine's stability, because "the
 * catalogue's order is preserved" is part of the contract being reproduced, not
 * an implementation detail. A copy is returned; the caller's array is untouched.
 *
 * @param items - the items to order.
 * @param idOf - reads the provider id (or card key) out of an item.
 * @returns a new array, earliest provider first.
 */
function orderByProvider(items, idOf) {
  return items
    .map((item, index) => ({ item, index, rank: providerRank(idOf(item)) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.item)
}
