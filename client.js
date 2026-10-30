/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: the modules under src/. Rebuild with `node scripts/build.mjs`.
 * This bundle is what the Client module loader serves; it is the only browser
 * entry the loader knows about for this package.
 *
 * The modules below are wrapped in one IIFE. The loader executes this file as a
 * CLASSIC script, so without the wrapper every top-level binding would land in
 * the page's global lexical scope: another plugin bundle declaring the same
 * name would fail to parse, and executing this bundle twice in one page would
 * throw "Identifier '…' has already been declared" before a single line ran.
 * The wrapper keeps that scope private. It does not make a second execution
 * harmless — the loader already rejects a duplicate `load()` for the same id —
 * it just confines the damage to this bundle.
 */
(() => {
//# module: src/core/rank.js
/**
 * Fuzzy ranking for the model search box.
 *
 * This is the shipped `rankByName` from `@deepseek-ai/dsh-client-ui-primitives`
 * (the `/` menu's own search), vendored verbatim rather than required: the
 * Client module table only carries `react`, and pulling a host package into the
 * offline unit test would make it impossible to run without DSH installed. The
 * algorithm is self-contained — no imports, no state — so copying it keeps the
 * picker's results identical to the shipped menus while the source tree stays
 * dependency-free.
 *
 * What it does, per the original doc comment: the query must be a
 * case-insensitive ORDERED SUBSEQUENCE of the candidate's name (or its `label`
 * when it carries one). Prefix hits rank first, then the strongest alignment
 * score over either key, then the source order of the input.
 *
 * Upstream: `packages/client/ui-primitives/src/rank-by-name.ts`.
 */

/** Extra weight for name starts and separator boundaries. */
function boundaryBonus(name, index) {
  return index === 0 || name.charAt(index - 1) === '-' || name.charAt(index - 1) === '_' ? 8 : 0
}

/**
 * Score the strongest ordered-subsequence alignment in O(name × query).
 *
 * Boundary and adjacent matches earn weight; skipped and leading characters
 * cost weight.
 *
 * @param name - the lowercased candidate name.
 * @param query - the lowercased query.
 * @returns the score, or undefined when the query is not a subsequence.
 */
function alignmentScore(name, query) {
  if (query.length > name.length) return undefined
  const noMatch = Number.NEGATIVE_INFINITY
  let previous = Array(name.length).fill(noMatch)
  for (let index = 0; index < name.length; index += 1) {
    if (name.charAt(index) === query.charAt(0)) previous[index] = 1 + boundaryBonus(name, index) - index
  }
  for (let queryIndex = 1; queryIndex < query.length; queryIndex += 1) {
    const current = Array(name.length).fill(noMatch)
    let left = noMatch
    let leftLeft = noMatch
    let bestGapped = noMatch
    for (const [index, prior] of previous.entries()) {
      if (leftLeft !== noMatch) bestGapped = Math.max(bestGapped, leftLeft + index - 2)
      if (name.charAt(index) === query.charAt(queryIndex)) {
        const bonus = 1 + boundaryBonus(name, index)
        let score = noMatch
        if (left !== noMatch) score = left + bonus + 4
        if (bestGapped !== noMatch) score = Math.max(score, bestGapped + bonus + 1 - index)
        current[index] = score
      }
      leftLeft = left
      left = prior
    }
    previous = current
  }
  let best = noMatch
  for (const score of previous) best = Math.max(best, score)
  return best === noMatch ? undefined : best
}

/**
 * Rank named items by a search query.
 *
 * @param items - candidates in source order; an item's optional `label` is a
 *   second search key beside its `name`.
 * @param rawQuery - the text typed into the search box, matched case-insensitively.
 * @returns the matching items: prefix hits first, then by alignment score, then
 *   in source order. The input list itself for an empty query.
 */
function rankByName(items, rawQuery) {
  const query = String(rawQuery ?? '').toLowerCase()
  if (query === '') return items
  const ranked = []
  items.forEach((item, index) => {
    const name = String(item?.name ?? item?.id ?? '')
    const keys = item?.label === undefined ? [name] : [name, String(item.label)]
    let prefix = false
    let score
    for (const key of keys) {
      const lower = key.toLowerCase()
      const keyScore = alignmentScore(lower, query)
      if (keyScore === undefined) continue
      prefix ||= lower.startsWith(query)
      score = score === undefined ? keyScore : Math.max(score, keyScore)
    }
    if (score !== undefined) ranked.push({ item, index, prefix, score })
  })
  ranked.sort((left, right) => Number(right.prefix) - Number(left.prefix) ||
    right.score - left.score ||
    left.index - right.index)
  return ranked.map((match) => match.item)
}

//# module: src/core/order.js
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

//# module: src/ui/Chevron.js
/**
 * The chevron that turns when its panel is open.
 *
 * @param props - `{ h, open }`: the createElement function and the open flag.
 * @returns the svg element.
 */
function Chevron({ h, open }) {
  return h('svg', {
    className: `dmp-chevron${open ? ' dmp-chevron-open' : ''}`,
    viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true
  }, h('path', {
    d: 'M4 6.5L8 10.5L12 6.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }))
}

//# module: src/ui/Refresh.js
/**
 * The circular arrow that re-reads a deployment's balance.
 *
 * Drawn rather than typed: the text glyphs for "refresh" differ in shape and
 * baseline between the Windows and macOS system fonts, and this control sits on
 * a 16px line where that difference is the whole icon.
 *
 * @param props - `{ h, spinning }`: the createElement function and a busy flag.
 * @returns the svg element.
 */
function Refresh({ h, spinning }) {
  return h('svg', {
    className: `dmp-refresh-icon${spinning ? ' dmp-refresh-spinning' : ''}`,
    viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true
  },
    h('path', {
      d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.75', fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.6, 'stroke-linecap': 'round'
    }),
    h('path', {
      d: 'M13.4 2.4v2.8h-2.8', fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }))
}

//# module: src/ui/anchor.js
/**
 * The nearest ancestor that scrolls vertically.
 *
 * The popover is rendered inside the conversation's scroll container. Anything
 * that pokes past that container's right edge becomes horizontal overflow, and
 * because the container declares overflow-y: auto the other axis computes to
 * auto as well — the browser then paints a horizontal scrollbar, the container
 * loses exactly that much height, and the whole chat jumps upward for a frame.
 * Clamping to the container keeps the panel inside it.
 *
 * @param node - the trigger element.
 * @returns the scrolling ancestor, or `null` when there is none.
 */
function scrollParentOf(node) {
  if (node === null || node === undefined || typeof getComputedStyle !== 'function') return null
  let current = node.parentElement
  while (current !== null && current !== undefined) {
    const overflow = getComputedStyle(current).overflowY
    if ((overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay')
      && current.clientHeight > 0) return current
    current = current.parentElement
  }
  return null
}

/**
 * Anchor a popover to the centre of its trigger, clamped to the viewport.
 *
 * Both popovers in this picker open ABOVE their button, and both are wider than
 * the button they belong to. Anchoring by a fixed side (`left: 0` or `right: 0`)
 * makes the panel drift away from the control the user just pressed, and near
 * either screen edge it runs off the window entirely.
 *
 * The hook measures the trigger, centres the panel on it, then shifts the result
 * so the panel stays inside the viewport with a small margin. It returns:
 *
 *  - `ref`     — attach to the trigger element,
 *  - `panelRef`— attach to the panel element (its width depends on content),
 *  - `style`   — spread onto the panel: centring transform, clamp offset, and
 *                `visibility` gated on the first measurement so the panel never
 *                paints at the wrong place for a frame.
 *
 * @param React - the React runtime.
 * @param options - `{ open, fallbackWidth, deps }`.
 * @returns `{ ref, panelRef, style }`.
 */
function createAnchoredPanel(React, options) {
  const { useState, useEffect, useLayoutEffect, useRef } = React
  const { open, fallbackWidth = 280, margin = 8, deps = [] } = options

  /**
   * Park the panel OFF-SCREEN LEFT until it has been measured.
   *
   * It used to start at `left: 0`, and the very first frame — before the effect
   * had measured anything — was already inside the conversation's scroll
   * container and poking out of its right edge. That frame is enough for the
   * browser to add a horizontal scrollbar, which steals height from the scroll
   * container and lifts the whole chat for a moment; the next frame moves the
   * panel back and the scrollbar disappears. Users read that as "the panel makes
   * the chat jump". Negative overflow is clipped and never scrollable, so a panel
   * parked on the left cannot produce a scrollbar at all.
   */
  const PARKED = -9999
  const [anchor, setAnchor] = useState({ left: PARKED, ready: false })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  // Layout effect where available: measure BEFORE the frame is painted, so the
  // panel is never seen (nor measured by the scroll container) at the parked spot.
  const useCommitEffect = typeof useLayoutEffect === 'function' ? useLayoutEffect : useEffect

  useCommitEffect(() => {
    if (!open) {
      setAnchor({ left: PARKED, ready: false })
      return undefined
    }
    const measure = () => {
      const trigger = triggerRef.current
      if (trigger === null || typeof trigger.getBoundingClientRect !== 'function') return
      const rect = trigger.getBoundingClientRect()
      const viewport = (typeof window !== 'undefined' && window.innerWidth)
        || (typeof document !== 'undefined' && document.documentElement?.clientWidth)
        || 0
      if (viewport === 0) return

      // Read the panel's real width: it depends on content (a five-level slider is
      // wider than a three-level one). `visibility: hidden` does not affect
      // `getBoundingClientRect`, so the width is available before the first paint.
      // The ref is attached in the same commit the panel is rendered in, so it is
      // set by the time this effect runs.
      const panel = panelRef.current
      const measured = panel !== null && panel !== undefined
        && typeof panel.getBoundingClientRect === 'function'
        ? panel.getBoundingClientRect().width
        : 0
      const width = measured > 0 ? measured : Math.min(fallbackWidth, viewport - 32)

      const centre = rect.left + rect.width / 2
      const centred = centre - width / 2
      // Stay inside the scrolling ancestor as well as the viewport: overflowing
      // it costs a horizontal scrollbar, and that scrollbar is what made the
      // chat jump when a panel opened.
      const scroller = scrollParentOf(trigger)
      const bounds = scroller !== null && typeof scroller.getBoundingClientRect === 'function'
        ? scroller.getBoundingClientRect()
        : null
      const floor = Math.max(margin, bounds === null ? margin : bounds.left + margin)
      const ceiling = Math.min(viewport - width - margin,
        bounds === null ? viewport - width - margin : bounds.right - width - margin)
      const clamped = Math.max(floor, Math.min(centred, Math.max(floor, ceiling)))
      // Anchor in PIXELS from the panel's containing block, not with `left: 50%`.
      // The containing block is the control row, whose width follows the label on
      // the buttons: a percentage anchor slid the panel sideways whenever that
      // label changed (a model switch, a level name), which reads as a flicker
      // even though nothing re-rendered. Measuring once per open keeps it still.
      const parent = panel !== null && panel !== undefined ? panel.offsetParent : null
      const origin = parent !== null && parent !== undefined
        && typeof parent.getBoundingClientRect === 'function'
        ? parent.getBoundingClientRect().left
        : rect.left
      setAnchor({ left: Math.round(clamped - origin), ready: true })
    }

    measure()
    // Second pass after layout: the first can see the min-width instead of the
    // real width when the content is wider than the minimum.
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(measure)
      : undefined
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', measure)
      return () => {
        window.removeEventListener('resize', measure)
        if (raf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
      }
    }
    return undefined
    // `deps` carries content-dependent values (level count, model count) that
    // change the panel's width without changing `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...deps])

  return {
    ref: triggerRef,
    panelRef,
    style: {
      left: `${anchor.left}px`,
      right: 'auto',
      visibility: anchor.ready ? 'visible' : 'hidden'
    }
  }
}

//# module: src/ui/caption-glyphs.js
/**
 * The panel heading as vector art.
 *
 * Why a path and not text: Montserrat has no CJK glyphs, so the four
 * characters cannot get the brand face from a font stack. These outlines were
 * taken from Noto Sans SC — the closest geometric match available — with a
 * rounded stroke applied so the joins read like Montserrat's.
 *
 * Filled with `currentColor`, so the mark follows the theme exactly as the text
 * beside it does, and holds its shape at any zoom or DPI.
 */
const CAPTION_VIEWBOX = '0 0 3891 910'

/** One entry per character: horizontal offset, baseline, and outline. */
const CAPTION_GLYPHS = [
  { x: -61, y: 833, d: 'M293 248 L323 248 L323 15 Q323 -5 350 -18 L398 -18 Q409 -18 474 -18 Q553 -18 623 -18 L638 -18 Q666 -18 694 2 Q706 64 708 127 Q713 124 723 118 Q733 114 737 113 Q734 48 718 -22 Q679 -48 639 -48 Q633 -48 585 -48 Q520 -48 454 -48 Q406 -48 401 -48 Q360 -48 312 -38 Q293 -11 293 16 Z M379 294 L399 312 Q439 292 523 240 Q597 187 621 164 L601 143 Q578 165 504 219 Q419 273 379 294 Z M754 238 L780 249 Q811 211 872 120 Q921 33 933 -1 L905 -15 Q892 19 845 107 Q785 199 754 238 Z M175 233 L200 225 Q189 186 156 94 Q113 7 87 -25 L61 -13 Q88 19 131 105 Q164 196 175 233 Z M183 557 L183 386 L808 386 L808 557 Z M183 755 L183 586 L808 586 L808 755 Z M154 784 L837 784 L837 357 L154 357 Z M483 773 L513 773 L513 372 L483 372 Z' },
  { x: 939, y: 833, d: 'M748 205 L778 205 Q778 205 777 198 Q777 189 776 186 Q761 78 730 -23 L708 -42 Q695 -52 668 -58 L645 -59 Q622 -59 521 -56 L463 -52 Q462 -45 458 -29 L453 -22 Q493 -26 569 -30 Q626 -31 638 -31 Q658 -31 679 -28 L686 -23 Q706 -8 733 92 L748 200 Z M313 205 L759 205 L759 176 L306 176 Z M368 361 L845 361 L845 331 L354 331 Z M73 519 L933 519 L933 489 L73 489 Z M166 698 L705 698 L705 669 L166 669 Z M442 831 L472 831 L472 505 L442 505 Z M857 778 L882 763 Q806 670 620 508 Q410 368 185 252 L68 206 Q66 210 58 219 Q49 229 44 232 Q163 276 392 390 Q602 529 784 689 L857 778 Z M360 361 L392 361 Q375 314 333 211 L317 176 L285 176 Q304 214 344 317 L360 361 Z' },
  { x: 1939, y: 833, d: 'M378 -13 Q440 -9 608 3 Q799 17 896 25 L895 -3 Q803 -10 618 -25 Q451 -38 385 -43 Z M783 134 L808 148 Q838 116 894 40 Q940 -33 952 -62 L926 -77 Q914 -48 869 26 Q812 102 783 134 Z M456 406 L456 220 L863 220 L863 406 Z M427 435 L892 435 L892 190 L427 190 Z M477 747 L477 578 L837 578 L837 747 Z M448 776 L867 776 L867 549 L448 549 Z M642 560 L672 560 L672 -14 L642 -16 Z M84 324 L323 324 L323 294 L84 294 Z M315 324 L345 324 Q345 324 344 317 Q344 307 343 304 Q336 186 319 43 Q299 -29 285 -43 Q276 -53 252 -62 L233 -62 Q217 -63 157 -61 L124 -58 Q123 -52 120 -35 L115 -29 Q153 -32 216 -34 L228 -34 Q241 -34 256 -31 L262 -24 Q273 -13 291 59 Q308 201 315 317 Z M97 551 L127 551 Q123 510 110 415 Q97 327 91 295 L61 295 Q68 328 82 417 Q93 511 97 551 Z M110 551 L329 551 L329 747 L64 747 L64 776 L358 776 L358 522 L110 522 Z' },
  { x: 2939, y: 833, d: 'M200 551 L928 551 L928 522 L200 522 Z M220 259 L816 259 L816 229 L220 229 Z M386 659 L416 659 L416 376 L720 376 L720 659 L749 659 L749 347 L386 347 Z M807 259 L814 259 L820 261 L839 248 Q797 173 657 65 Q481 -8 286 -53 L187 -65 Q186 -60 178 -44 L174 -38 Q269 -28 461 14 Q633 83 768 184 L807 252 Z M371 228 Q422 151 598 39 Q825 -31 952 -45 Q949 -48 942 -58 Q936 -67 934 -71 Q808 -54 579 19 Q398 135 345 216 Z M155 718 L941 718 L941 688 L155 688 Z M141 718 L171 718 L171 441 Q171 385 164 254 Q144 117 106 -15 L74 -72 Q72 -69 62 -63 Q53 -57 49 -56 Q81 0 117 128 Q136 260 141 386 L141 441 Z M484 824 L512 833 Q531 805 570 737 L579 714 L551 702 Q541 726 504 796 L484 824 Z' },
]

//# module: src/ui/CaptionMark.js

/**
 * The panel heading, drawn as vector art.
 *
 * Montserrat has no CJK glyphs, so a font stack cannot give these four characters
 * the host's brand face — they always fall back to the platform UI font. This
 * renders them from outlines instead, so the heading keeps one shape everywhere and
 * can be styled like a mark rather than a run of text.
 *
 * The fill is `currentColor`: the mark inherits whatever colour the surrounding
 * element already resolved from the theme tokens, so light and dark follow
 * automatically and no JS has to read the theme.
 *
 * The text is still exposed to assistive tech through `aria-label` and a `<title>`,
 * because the glyphs themselves carry no semantics.
 *
 * @param props - `{ h, label, className, height }`.
 * @returns the SVG element tree.
 */
function createCaptionMark(React) {
  const h = React.createElement

  return function CaptionMark({ label, className = 'dmp-caption-mark', height = 19 }) {
    // The outlines use font units with Y pointing up, so each glyph is flipped on
    // its own baseline. Doing it per glyph keeps the path data verbatim.
    const glyphs = CAPTION_GLYPHS.map((glyph, index) => h('path', {
      key: index,
      transform: `translate(${glyph.x} ${glyph.y}) scale(1 -1)`,
      d: glyph.d
    }))

    return h('svg', {
      className,
      viewBox: CAPTION_VIEWBOX,
      height,
      // Width follows the viewBox ratio, so `height` alone is enough to size it.
      role: 'img',
      'aria-label': label,
      focusable: 'false'
    },
      h('title', null, label),
      h('g', {
        // A rounded stroke widens the strokes and softens every join, which is what
        // brings the geometric Noto skeleton closer to Montserrat's weight.
        fill: 'currentColor',
        stroke: 'currentColor',
        strokeWidth: 76,
        strokeLinejoin: 'round',
        strokeLinecap: 'round'
      }, glyphs))
  }
}

//# module: src/ui/EffortSlider.js
/**
 * A discrete reasoning slider over the model's declared levels.
 *
 * The visuals inherit the Host theme. A real range input owns pointer and
 * keyboard interaction; the thin track and thumb are its painted layer. Labels
 * remain clickable jump targets.
 *
 * ## Why this component keeps its own position
 *
 * Every stop submits a selection to the Host, and the Host answers a round trip
 * later. Two things follow from that, and both were visible as "the thumb does
 * not follow the mouse":
 *
 *  - A CONTROLLED input (`value={index}`) gets the old index written back on
 *    every parent render, so the thumb snaps backwards mid-drag.
 *  - Re-submitting on every pixel of travel queues a request per stop, and the
 *    directory flips to `selecting` in between — which used to disable the input
 *    and kill the gesture after the first stop.
 *
 * So the input is uncontrolled and this component tracks the live stop itself.
 * `onInput` updates local state only (instant, no Host involved); the commit to
 * the Host happens once, on `onChange` — the event browsers fire when the pointer
 * is released. A drag is therefore always smooth, and one gesture is one request.
 *
 * The one thing the uncontrolled input cannot do on its own is follow a level
 * chosen WITHOUT a drag — clicking a label under the rail, or a level arriving
 * from `/model`. Those change `activeId` while the input's internal value still
 * points at the old stop, so the next key press would start from there. A ref
 * writes the value back whenever no drag is in progress; it is never written
 * during a gesture, which is exactly what keeps the thumb glued to the pointer.
 *
 * @param props - `{ h, efforts, activeId, disabled, onChange, t, caption }`.
 * @returns the slider element tree.
 */

/**
 * Which accent a reasoning level uses, as a string the stylesheet matches on.
 *
 * The two highest stops are the only ones that differ: `top` (the last) takes the
 * violet, `high` (the one before) the amber. Every other level — and the single-level
 * case — returns undefined, which is what leaves the default blue in place and makes
 * the two marked stops read as "above normal" rather than as two arbitrary colours in
 * a five-colour ramp.
 *
 * It lives at module scope because it is shared: the slider marks itself with it, and
 * so does the composer trigger, which renders outside this component's subtree.
 *
 * @param index - the level's position, 0-based.
 * @param count - how many levels the model declares.
 * @returns 'top' | 'high' | undefined
 */
function tierFor(index, count) {
  if (count <= 1) return undefined
  if (index === count - 1) return 'top'
  if (index === count - 2) return 'high'
  return undefined
}

function createEffortSlider(React) {
  const h = React.createElement
  const CaptionMark = createCaptionMark(React)
  const { useState, useEffect, useRef } = React

  /**
   * The exhaust table.
   *
   * Fixed numbers, never `Math.random()`: a render has to be pure, and the stream
   * must look identical every time the panel opens.
   *
   * `dy0` is what makes the particles leave the knob's whole CROSS-SECTION rather
   * than one point in its centre — it spreads the spawn points down the knob's
   * height. `dx` / `dy` / `sz` / `rot` stop the squares from marching in step, and
   * the per-particle `--i` turns one keyframe into a continuous stream (see the
   * negative `animation-delay` in the stylesheet).
   *
   * The entries are ordered so that taking the FIRST N of them always gives a spread
   * across the whole cross-section: the level only ever slices this table, it never
   * reorders it. `dy0` therefore alternates up/down rather than counting from -11 to
   * 11, which would leave a low level emitting only from the top edge.
   */
  const EMIT = [
    { dy0: 0, dx: -143, dy: 1, sz: 3, rot: 0 },
    { dy0: -8, dx: -118, dy: -4, sz: 4, rot: 45 },
    { dy0: 8, dx: -124, dy: 5, sz: 3, rot: 90 },
    { dy0: -4, dx: -98, dy: -2, sz: 4, rot: 0 },
    { dy0: 4, dx: -108, dy: 3, sz: 4, rot: 45 },
    { dy0: -11, dx: -130, dy: -6, sz: 3, rot: 90 },
    { dy0: 11, dx: -136, dy: 7, sz: 3, rot: 0 },
    { dy0: -2, dx: -88, dy: -1, sz: 3, rot: 45 },
    { dy0: 2, dx: -95, dy: 2, sz: 4, rot: 0 },
    { dy0: -6, dx: -150, dy: -3, sz: 3, rot: 90 },
    { dy0: 6, dx: -114, dy: 4, sz: 4, rot: 45 },
    { dy0: -9, dx: -104, dy: -5, sz: 3, rot: 0 },
    { dy0: 9, dx: -128, dy: 6, sz: 3, rot: 90 },
    { dy0: -1, dx: -91, dy: 0, sz: 4, rot: 45 },
    { dy0: 1, dx: -101, dy: 1, sz: 3, rot: 0 },
    { dy0: -5, dx: -110, dy: -2, sz: 4, rot: 90 },
    { dy0: 5, dx: -121, dy: 3, sz: 3, rot: 0 },
    { dy0: -3, dx: -85, dy: -1, sz: 3, rot: 45 },
    // A second pass over the same cross-section, offset in time by the per-particle
    // delay: it doubles the density without making the stream look striped, and gives
    // the high levels enough material to read as a real plume.
    { dy0: -10, dx: -108, dy: -5, sz: 3, rot: 0 },
    { dy0: 10, dx: -104, dy: 5, sz: 3, rot: 45 },
    { dy0: -7, dx: -140, dy: -3, sz: 4, rot: 90 },
    { dy0: 7, dx: -134, dy: 4, sz: 4, rot: 0 },
    { dy0: -5, dx: -95, dy: -2, sz: 3, rot: 45 },
    { dy0: 5, dx: -91, dy: 2, sz: 3, rot: 90 },
    { dy0: -12, dx: -128, dy: -6, sz: 3, rot: 0 },
    { dy0: 12, dx: -121, dy: 6, sz: 3, rot: 45 },
    { dy0: -3, dx: -146, dy: -1, sz: 4, rot: 90 },
    { dy0: 3, dx: -143, dy: 1, sz: 4, rot: 0 },
    { dy0: -1, dx: -101, dy: 0, sz: 3, rot: 45 },
    { dy0: 1, dx: -98, dy: 0, sz: 3, rot: 0 },
    // A third pass. The high levels need enough material to read as a dense plume
    // rather than a sparse spray, and because only a slice of this table is rendered
    // the extra entries cost the low levels nothing. The timing stagger in the
    // stylesheet spreads every pass out, so density rises without banding.
    { dy0: -9, dx: -114, dy: -4, sz: 4, rot: 0 },
    { dy0: 9, dx: -110, dy: 4, sz: 3, rot: 45 },
    { dy0: -4, dx: -136, dy: -2, sz: 3, rot: 90 },
    { dy0: 4, dx: -130, dy: 2, sz: 4, rot: 0 },
    { dy0: -11, dx: -124, dy: -5, sz: 3, rot: 45 },
    { dy0: 11, dx: -118, dy: 5, sz: 3, rot: 90 },
    { dy0: -6, dx: -95, dy: -3, sz: 4, rot: 0 },
    { dy0: 6, dx: -91, dy: 3, sz: 3, rot: 45 },
    { dy0: -2, dx: -140, dy: -1, sz: 3, rot: 90 },
    { dy0: 2, dx: -134, dy: 1, sz: 4, rot: 0 },
    { dy0: -8, dx: -104, dy: -4, sz: 3, rot: 45 },
    { dy0: 8, dx: -101, dy: 4, sz: 3, rot: 90 },
    // A fourth pass, different seam. Each pass re-covers the same cross-section at a
    // different spacing so the stream stays dense instead of clumping into bands; the
    // per-particle delay in the stylesheet then interleaves all four.
    { dy0: -10, dx: -121, dy: -5, sz: 3, rot: 0 },
    { dy0: 10, dx: -114, dy: 5, sz: 4, rot: 45 },
    { dy0: -5, dx: -143, dy: -2, sz: 3, rot: 90 },
    { dy0: 5, dx: -136, dy: 2, sz: 3, rot: 0 },
    { dy0: -12, dx: -108, dy: -6, sz: 3, rot: 45 },
    { dy0: 12, dx: -104, dy: 6, sz: 3, rot: 90 },
    { dy0: -7, dx: -128, dy: -3, sz: 4, rot: 0 },
    { dy0: 7, dx: -124, dy: 3, sz: 3, rot: 45 },
    { dy0: -1, dx: -88, dy: 0, sz: 4, rot: 90 },
    { dy0: 1, dx: -91, dy: 0, sz: 3, rot: 0 },
    { dy0: -9, dx: -134, dy: -4, sz: 3, rot: 45 },
    { dy0: 9, dx: -130, dy: 4, sz: 4, rot: 90 },
    { dy0: -4, dx: -98, dy: -2, sz: 3, rot: 0 },
    { dy0: 4, dx: -95, dy: 2, sz: 3, rot: 45 },
    { dy0: -11, dx: -118, dy: -5, sz: 4, rot: 90 },
    { dy0: 11, dx: -110, dy: 5, sz: 3, rot: 0 },
    { dy0: -3, dx: -150, dy: -1, sz: 3, rot: 45 },
    { dy0: 3, dx: -140, dy: 1, sz: 4, rot: 90 }
  ]

  /**
   * How much of the exhaust a level gets.
   *
   * The amount of work a level asks for is the one thing the control is saying, so
   * the exhaust scales with it and the spread between the ends is deliberately wide:
   * the lowest level emits a handful of squares barely past the knob, the highest
   * emits the whole table and throws them roughly three times as far. A narrow range
   * (the first version went 0.28..1.00) made every level look the same at a glance.
   *
   * @param index - the level's position, 0-based.
   * @param count - how many levels the model declares.
   * @returns `{ share, reach }`, both 0..1.
   */
  const exhaustFor = (index, count) => {
    if (count <= 1) return { share: 0.5, reach: 0.5 }
    const at = index / (count - 1)
    // The curve is EASED rather than linear so the ends separate visually, and the
    // floor is low enough that the lowest level is a scatter of a few squares rather
    // than a plume. The reach tops out at 1.0 (the table's own distances) so the
    // furthest level still lands inside the rail rather than being clipped by it.
    const eased = at * at
    return { share: 0.08 + eased * 0.92, reach: 0.22 + at * 0.78 }
  }

  /**
   * The streaks left behind the squares.
   *
   * These read as a SHEET of parallel lines, not as a wedge: every streak is the same
   * length and the same opacity, and they are evenly spaced down the knob's full
   * height. An earlier version tapered them (long in the middle, short at the edges)
   * so the silhouette converged on the knob like a flame, which is not what the bar
   * should look like — the exhaust leaves the whole cross-section at once.
   *
   * The trail is reserved for the TOP level only (see `withTrail` below): it marks the
   * ceiling of the scale, and drawing it at every level left nothing to escalate to.
   *
   * `off` is a PIXEL offset from the knob's centre line, not a percentage: the emitter
   * is a zero-height box, so a percentage resolves against zero and stacks every
   * streak on the centre. The spread covers the knob's diameter (28px) edge to edge.
   */
  const TRAIL = [
    { off: -12 }, { off: -9 }, { off: -6 }, { off: -3 },
    { off: 0 },
    { off: 3 }, { off: 6 }, { off: 9 }, { off: 12 }
  ]

  return function EffortSlider({ efforts, activeId, disabled, onChange, t, caption }) {
    const count = efforts.length
    const incoming = Math.max(0, efforts.findIndex((effort) => effort.id === activeId))

    /**
     * The stop under the pointer, which is ahead of `activeId` while dragging.
     *
     * `null` means "no drag in progress, follow the prop".
     */
    const [dragging, setDragging] = useState(null)
    const index = dragging ?? incoming
    const active = efforts[index]
    const activeName = active?.name ?? active?.id ?? ''
    const inputRef = useRef(null)

    // A prop change from outside (another entry changed the level, the session
    // switched model) wins over a stale drag value.
    useEffect(() => { setDragging(null) }, [activeId, efforts.length])

    // The DOM value follows the level unless a gesture owns it. Writing during a
    // drag would fight the pointer, so `dragging` gates it.
    useEffect(() => {
      if (dragging !== null) return
      const input = inputRef.current
      if (input !== null && typeof input === 'object' && 'value' in input) {
        input.value = String(incoming)
      }
    }, [incoming, dragging])

    // A model with just one effort keeps its stop in the middle.
    const position = (at) => count <= 1 ? '50%' : `${(at / (count - 1)) * 100}%`

    // The level drives the exhaust: more of the table, and thrown further.
    const exhaust = exhaustFor(index, count)
    /**
     * The trail belongs to the top level only.
     *
     * It is the visual ceiling of the scale — the thing the last stop has that no
     * other stop does. Drawing it at every level (the first version) made the top
     * level feel like more of the same instead of the end of the range.
     */
    const withTrail = count > 1 && index === count - 1
    /**
     * Which accent the current level uses.
     *
     * The two highest stops are the only ones that differ. Everything below keeps the
     * normal blue, which is what makes the two marked stops read as "above normal"
     * rather than as two arbitrary colours in a five-colour ramp.
     */
    const tier = tierFor(index, count)

    return h('div', {
      // `dmp-slider-dragging` drops the left transition on the knob, the fill and
      // the emitter together. Without it the knob eases to its new stop over 150ms
      // while a transition-free emitter jumps there at once, so the particles left
      // from a position the knob had not reached yet.
      className: `dmp-slider${dragging === null ? '' : ' dmp-slider-dragging'}`,
      'aria-disabled': disabled === true,
      // The stylesheet picks the accent from this: 'top' and 'high' are the two
      // levels with their own colour, everything else leaves it unset.
      'data-tier': tier,
      style: { '--dmp-effort-at': position(index) }
    },
      h('div', { className: 'dmp-slider-head' },
        h('span', { className: 'dmp-slider-caption' },
          // The vector marks are CJK outlines; a Latin heading is plain text.
          caption === undefined
            ? h(CaptionMark, { label: t.effortHeading, height: 16 })
            : h('span', { className: 'dmp-caption-text' }, caption)),
        h('span', { className: 'dmp-slider-value' }, activeName)),

      h('div', { className: 'dmp-slider-rail' },
        /**
         * The rail's outline, drawn as vector art.
         *
         * This started as a `box-shadow` inset, which is a RASTER edge: at 1px it
         * lands on the pixel grid but reads flat, and at 1.5px it falls between
         * pixels and smears into a grey band. The knob's ring never had that problem
         * because it is an SVG stroke — a vector edge, crisp at any scale.
         *
         * So the outline uses the same primitive as the knob: a `<rect>` with a
         * stroked edge, sized to the rail and scaled to it by `preserveAspectRatio`
         * being off. `vector-effect: non-scaling-stroke` keeps the stroke exactly
         * 1px however the rect is stretched, so the line stays hairline-crisp instead
         * of being squashed by the horizontal stretch. `rx` is a percentage of the
         * half-height, matching the rail's own rounded ends.
         */
        h('svg', {
          className: 'dmp-slider-outline',
          'aria-hidden': true,
          preserveAspectRatio: 'none'
        },
        h('rect', {
          // Half the stroke on each axis: an SVG stroke straddles the path, so a 2px
          // line on the exact edge would be half-clipped by the rail's clip-path.
          x: 1,
          y: 1,
          width: 'calc(100% - 2px)',
          height: 'calc(100% - 2px)',
          rx: 14,
          ry: 14,
          fill: 'none',
          stroke: 'var(--dsw-alias-border-l3)',
          strokeWidth: 2,
          vectorEffect: 'non-scaling-stroke'
        })),
        /**
         * The moving parts live in an INSET track.
         *
         * Stops are drawn inside the rail rather than on its very edge — a dot
         * sitting flush against the rounded end reads as part of the border, not
         * as a stop. The track is inset by the knob's radius on both sides, which
         * is also exactly the knob's own travel: the native range input spans the
         * rail with a thumb that size, so its centre runs from inset to width
         * minus inset. Keeping all three — fill, dots, knob — on THIS box means
         * the percentage positions from `--dmp-effort-at` line up without any
         * per-element inset arithmetic.
         */
        h('div', { className: 'dmp-slider-track' },
          h('div', { className: 'dmp-slider-fill', 'aria-hidden': true }),
          /**
           * The exhaust.
           *
           * An empty box pinned at the knob's position (`--dmp-effort-at`), carrying
           * the particle squares. It is a SIBLING of the knob inside the same inset
           * track, so it shares the knob's coordinate space and its transition —
           * which is what keeps the spawn point under the knob while it moves.
           * The rail's clip-path trims whatever drifts past the end cap.
           *
           * How MANY particles exist and how FAR they travel both scale with the
           * level: `--dmp-emit-reach` multiplies every particle's `dx` / `dy` in the
           * stylesheet, and only the first `share` of the table is rendered at all.
           * Keeping the unused entries out of the DOM (rather than hiding them) also
           * means a low level runs a couple of animations instead of eighteen.
           */
          h('span', {
            className: 'dmp-emit',
            'aria-hidden': true,
            // The top level is what turns the trail on; CSS cross-fades the change.
            'data-trail': withTrail ? 'on' : 'off',
            style: { '--dmp-emit-reach': exhaust.reach }
          },
          EMIT.slice(0, Math.max(2, Math.round(EMIT.length * exhaust.share)))
            .map((particle, at) => h('i', {
              key: at,
              className: 'dmp-emit-p',
              style: {
                '--i': at,
                '--dx': `${particle.dx}px`,
                '--dy0': `${particle.dy0}px`,
                '--dy': `${particle.dy}px`,
                '--sz': `${particle.sz}px`,
                '--rot': `${particle.rot}deg`
              }
            })),
            // The trail is always in the DOM; `data-trail` fades it in at the top level
            // only. Mounting it conditionally made it pop in and out as the knob
            // crossed the last stop, which was the one abrupt moment in the control.
            TRAIL.map((streak, at) => h('i', {
              key: `trail-${at}`,
              className: 'dmp-emit-trail',
              style: { '--n': at, '--off': `${streak.off}px` }
            }))),
          h('div', { className: 'dmp-slider-dots', 'aria-hidden': true },
            efforts.map((effort, at) => h('span', {
              key: effort.id,
              className: `dmp-slider-dot${at <= index ? ' dmp-slider-dot-lit' : ''}`,
              style: { left: position(at) }
            }))),
          /**
           * The knob is an SVG circle, not a border-radius box.
           *
           * A `<div>` with `border-radius` is only round as long as nothing else
           * controls its box, and something in the host does: the same CSS that is
           * perfectly round in isolation rendered as a rounded rectangle inside the
           * app, at every radius value tried. An SVG circle's shape comes from its
           * geometry, so no `border-radius`, `padding`, or inherited box rule can
           * square it off.
           */
          h('svg', {
            className: 'dmp-slider-thumb',
            viewBox: '0 0 28 28',
            'aria-hidden': true
          },
          h('circle', {
            // Outer edge = r + stroke/2 = 13.25 + 0.75 = 14 units, and the 28-unit
            // box is drawn at 28px (--dmp-thumb-size) — so the disc's radius is
            // exactly 14px, matching the rail's half-height of 14px. Smaller and
            // the blue cap peeks out as a thin rim around the knob at the first
            // stop; larger and the knob spills past the pill.
            cx: 14,
            cy: 14,
            r: 13.25,
            // Fill and ring come from CSS so the two themes can differ: the dark
            // theme keeps the knob the panel's own grey with a black ring, the light
            // theme flips the fill to white and keeps the black ring.
            fill: 'var(--dmp-thumb-fill, currentColor)',
            stroke: 'var(--dmp-thumb-ring, #000)',
            strokeWidth: 1.5
          }))),
        h('input', {
          type: 'range',
          ref: inputRef,
          className: 'dmp-slider-input',
          min: 0,
          max: Math.max(0, count - 1),
          step: 1,
          // Uncontrolled: the DOM owns the position during a gesture, so a parent
          // render cannot snap it back. `defaultValue` seeds it on mount, and the
          // effect above re-seeds it whenever the level changes from outside.
          defaultValue: incoming,
          disabled: disabled === true || count <= 1,
          'aria-label': t.effortHeading,
          'aria-valuetext': activeName,
          // Live feedback only — no Host call, so the thumb tracks at full speed.
          onInput: (event) => {
            const at = Number(event.target.value)
            if (Number.isFinite(at)) setDragging(at)
          },
          // The commit: browsers fire `change` on release (and on every key press).
          onChange: (event) => {
            const at = Number(event.target.value)
            const next = efforts[at]
            setDragging(null)
            if (next !== undefined) onChange(next.id)
          }
        })),

      h('div', { className: 'dmp-slider-legend' },
        efforts.map((effort, at) => h('button', {
          key: effort.id,
          type: 'button',
          className: `dmp-slider-tick${at === index ? ' dmp-slider-tick-active' : ''}`,
          disabled: disabled === true,
          'aria-pressed': at === index,
          'data-edge': count <= 1 ? undefined : at === 0 ? 'start' : at === count - 1 ? 'end' : undefined,
          title: effort.name ?? effort.id,
          style: { left: position(at) },
          onClick: () => onChange(effort.id)
        }, effort.name ?? effort.id))),
      h('p', { className: 'dmp-slider-hint' }, t.effortHint))
  }
}

//# module: src/ui/styles.js
/**
 * The picker's stylesheet.
 *
 * Host theme tokens only, plus the two composer variables the row sets when its
 * controls no longer fit on one line. Every class is prefixed dmp- so a copied
 * host pattern can never collide with the host's own rules.
 *
 * Sizing follows the shipped menu rather than inventing its own scale: the panel
 * is max-content wide (so a short list stays narrow instead of stretching to a
 * fixed width), rows are 34px tall with 5px/7px padding, and the panel pads 4px.
 * Those numbers are what makes the replacement feel like part of the composer
 * instead of a dialog dropped on top of it.
 */
const CSS = `
/* The accent, shared by everything that marks "current" or "active": the selected
   model row, the slider's fill and active label, and the two tier tags.
 *
 * The alias token is one step too pale on a dark panel: in the dark theme
 * --dsw-alias-state-business-primary resolves to the deepseek-400 step, which reads
 * as washed out against the panel surface. The ramp's next step down, deepseek-450,
 * is the same hue with the weight the bar needs. The alias token stays as the
 * fallback so a future ramp change still lands on something.
 *
 * It is deliberately the STATIC ramp step and not a theme alias: light and dark
 * then resolve to the same blue, which is what keeps the selected model the same
 * colour in both themes instead of following the label colour to near-white.
 * The preview pages carry these same values, which is why a preview can look right
 * while the app looks pale — the demo used to hard-code a blue of its own. */
.dmp-root { --dmp-accent: var(--dsw-static-deepseek-450,
    var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)));
  position: relative; display: flex; align-items: center; gap: 6px; min-width: 0; }
/* One popover anchor per control: the model list and the level list open above
   their own button and never overlap each other. */
.dmp-control { position: relative; display: flex; align-items: center; min-width: 0; }
/* The model tag keeps a stable box too, for the same reason: switching models must
   not move the level tag beside it. It is capped rather than fixed so a long model
   name still gets room, but the cap is what the layout reserves. */
/* FIXED width, not content-sized.
 *
 * A content-sized button meant the whole control row changed width with every
 * model name, and the panel is anchored inside that row — so switching to a
 * shorter name slid the open list sideways under the pointer. The box is fixed
 * and the label truncates instead; the row, and therefore the panel, never move.
 * The container query unit keeps it from eating a narrow composer. */
.dmp-trigger { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0;
  width: min(160px, 34cqw); box-sizing: border-box; flex: none;
  height: 28px; padding: 0 2px 0 6px; border: 0;
  border-radius: var(--dsw-radius-sm, 6px); cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary);
  /* The same type as the panel it opens: the trigger is the panel's title, so a
     different size made the list look like it belonged to another control. */
  font: inherit; font-size: 12.5px; font-weight: 600; line-height: 20px; }
/* The level tag has a FIXED width.
   Level names differ in length ("Low" vs "X-High"), so a content-sized tag made
   the whole composer row shift every time the level changed — and pushed the
   model button sideways with it. A fixed box keeps both controls still.

   The width is sized to the longest name a provider is likely to send: "Medium"
   measures ~50px at 12px/600, and the earlier 74px box only left 44px for text,
   so it rendered as "Medi…". 92px leaves 56px, which also covers "Extreme" and
   "Minimal".

   The label is CENTRED in the button, which needs the caret out of the flex flow:
   a normal flex child reserves 18px on the right only, so centring the label in
   what was left pushed it ~7px left of the button's true centre. Absolutely
   positioning the caret and giving the button 18px padding on BOTH sides makes
   the label's own box symmetric, so text-align: center lands on the button's
   centre. 18px is exactly the caret's own width (14px) plus its 4px inset, which
   also stops a long label from running underneath it.
   The caret keeps its transform free for the open-state rotation by centring
   with margin-top instead of translateY. */
.dmp-trigger-effort { position: relative; width: 80px; box-sizing: border-box;
  padding: 0 18px 0 12px; font-size: 12px; font-weight: 600;
  color: var(--dsw-alias-label-secondary); }
/* The caret sits flush against the right edge and the label box is padded away
   from it, so the two read as separate elements instead of touching. */
.dmp-trigger-effort > .dmp-chevron { position: absolute; right: 0; top: 50%;
  margin-top: -7px; }
/* The tag names the level; it is not a brightness meter. Taking the ramp colour here
   made "Low" render dim grey and "High" near white, so the control appeared to change
   weight as the level moved. The ramp stays on the track, where it means intensity.

   The two tier levels are the exception, and they are the point of the tiers: the name
   itself takes the tier accent, so the button in the composer row carries the same
   colour as the bar inside the panel it opens. */
.dmp-trigger-effort-text { flex: 1 1 auto; min-width: 0; text-align: center;
  color: var(--dsw-alias-label-primary); font-weight: 600;
  /* Declared on the BASE rule, not on the tier rule below: a transition only runs if
     the element has one in the state it ends up in. Putting it on the tier selector
     would fade INTO the accent but snap back to plain when the level leaves the tier. */
  transition: color .34s ease; }
.dmp-trigger-effort[data-tier="top"] .dmp-trigger-effort-text,
.dmp-trigger-effort[data-tier="high"] .dmp-trigger-effort-text {
  color: var(--dmp-accent); }
/* Hover and open share ONE background, and it is the translucent interactive
   token, not the opaque layer-2 surface.
   The layer-2 token resolves to the composer's own surface colour in both themes
   (light white on white, dark 2c2c2e on 2c2c2e), so hovering this tag painted
   nothing at all — the level button was the only control in the row with no
   pointer feedback. The translucent token composes over whatever is behind it
   and matches the model tag beside it. */
.dmp-trigger-effort:hover:not(:disabled),
.dmp-trigger-effort[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-interactive-bg-active));
  color: var(--dsw-alias-label-primary); }
.dmp-trigger-effort:focus-visible { outline: 2px solid var(--dsw-alias-border-l2); outline-offset: 2px; }
.dmp-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-trigger:disabled { color: var(--dsw-alias-label-dimmed, var(--dsw-alias-state-idle-primary)); cursor: default; }
.dmp-trigger-text { display: var(--dsh-composer-model-text-display, block);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  /* The label hugs the chevron at the right edge of the fixed box; the slack sits
     on the left, so the name and the arrow read as one unit. */
  text-align: right; }
.dmp-chevron { flex: none; color: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary));
  transition: transform .12s; }
.dmp-chevron-open { transform: rotate(180deg); }
/* Content-sized, like the shipped menu: a two-model list must not be as wide as a
   twenty-model one. The caps only exist so a long model name cannot run off the
   viewport. */
.dmp-panel { position: absolute; bottom: calc(100% + 6px + var(--dmp-notice-lift, 0px)); z-index: 1000;
  width: max-content; min-width: min(300px, 100vw - 32px); max-width: min(420px, 92vw);
  max-height: min(320px, 60vh); display: flex; flex-direction: column; padding: 4px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-1));
  box-shadow: var(--dsw-elevation-panel, var(--dsw-shadow-lv3));
  color: var(--dsw-alias-label-primary); overflow: hidden; }
.dmp-search { flex: none; padding: 0 0 4px; }
.dmp-search input { width: 100%; box-sizing: border-box; padding: 5px 7px; font: inherit; font-size: 12.5px;
  color: var(--dsw-alias-label-primary); background: transparent;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md, 8px); outline: none; }
.dmp-search input:focus-visible { border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
/* The scroll container.
 *
 * The scrollbar is NOT styled here. The host owns scrollbar appearance through two
 * CSS variables that its own stylesheets consume, so setting them on the panel is
 * the whole job: the shell then paints a thin, rounded, theme-aware bar that matches
 * every other DSH popover. Writing -webkit-scrollbar rules as well would override
 * the host's treatment and is what made this panel look different from the rest of
 * the app.
 *
 * This mirrors the shipped picker and the thinking-slider plugin, which both do
 * exactly this much. */
.dmp-list { flex: 1; overflow-y: auto; min-height: 0;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
/* One card per provider.
 *
 * The card edge — not a caption line — is what separates providers. With two
 * providers exposing the same model names (the official catalogue does exactly
 * that: DeepSeek and DeepSeek Account), a flat list of rows with a small grey
 * caption in between reads as one continuous column and the eye loses the
 * boundary. The surface comes from the layer token so it reads as a panel
 * *inside* the panel, and the header keeps the provider name for one-model
 * groups, where the card alone would carry no label.
 *
 * Cards stack instead of using a flex gap: the list box is the scroll
 * container and must stay a plain block, so its scroll height is the sum of
 * the cards. */
.dmp-card { border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.dmp-card + .dmp-card { margin-top: 6px; }
/* The header is the fold control. It is a button unless a search is running, in
 * which case the component renders the same box as a plain div — hence the
 * button-only cursor/hover rules instead of one shared hover. */
.dmp-card-head { display: flex; align-items: center; gap: 6px;
  width: 100%; box-sizing: border-box; padding: 7px 9px 3px;
  border: 0; background: transparent; text-align: left; font: inherit;
  font-size: 11px; letter-spacing: .04em;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
/* The fold area is its own button inside the row, so a second action (renew) can
   sit beside it without nesting one button in another. */
.dmp-card-head-toggle { display: flex; flex: 1 1 auto; align-items: center; gap: 6px;
  min-width: 0; padding: 0; border: 0; background: transparent; text-align: left;
  font: inherit; font-size: inherit; letter-spacing: inherit; color: inherit; }
button.dmp-card-head-toggle { cursor: pointer; }
button.dmp-card-head-toggle:hover { color: var(--dsw-alias-label-secondary); }
button.dmp-card-head-toggle:focus-visible { outline: 2px solid var(--dsw-alias-border-l2);
  outline-offset: -2px; }
/* The chevron repeats the fold action; it is decorative for assistive tech. */
.dmp-card-chevron { display: inline-flex; flex: none; align-items: center; justify-content: center;
  padding: 0; border: 0; background: transparent; color: inherit; }
button.dmp-card-chevron { cursor: pointer; }
button.dmp-card-chevron:hover { color: var(--dsw-alias-label-secondary); }
/* A quiet pill, not a filled button: renewing is upkeep, not the point of the row. */
.dmp-card-renew { flex: none; padding: 0 7px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px; background: transparent; cursor: pointer; font: inherit;
  font-size: 10px; letter-spacing: .02em; color: var(--dsw-alias-label-tertiary,
    var(--dsw-alias-label-secondary)); }
.dmp-card-renew:hover:not(:disabled) { color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dmp-card-renew:disabled { opacity: .6; cursor: default; }
.dmp-card-head-text { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.dmp-card-head .dmp-chevron { flex: none; width: 12px; height: 12px; }
/* A folded card has no body, so the header supplies the bottom padding too. */
.dmp-card-folded .dmp-card-head { padding-bottom: 7px; }
/* A card whose provider plugin has its own identity colour. A third deliberate
 * literal, beside the pure black/white and the two tier hues: this teal IS that
 * plugin's accent, and no theme token resolves to it. Scoped to the attribute, so
 * every other provider keeps the shared accent. */
.dmp-card[data-accent="workbuddy"] { --dmp-accent: #12bfa0; }
/* The items sit inset from the card edge so their hover pill never touches the
 * border; the bottom padding closes the card under the last row. */
.dmp-card-body { padding: 0 3px 3px; }
/* A card can hold several providers when one plugin registers them under a single
 * package (two deployments of one product). Each gets a small label; the shared
 * title already said the rest. */
/* A card can hold several providers when one plugin registers them under a single
 * package. They are TABS, not stacked sections: the provider panel does the same,
 * and stacking two near-identical model lists doubles the height for a difference
 * nobody reads twice. The active tab is underlined with the shared accent. */
/* Two columns, one per deployment. Each column is a tab label, the account line
 * under it, and the accent underline spanning the column — the shape the provider
 * panel uses, so a plate of "大陆版 / 海外版" reads the same in both places. */
.dmp-card-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 112px));
  justify-content: center; gap: 10px; padding: 2px 10px 0;
  margin-bottom: 2px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dmp-card-tabcol { position: relative; display: flex; flex-direction: column;
  align-items: center; gap: 2px; padding-bottom: 6px; }
.dmp-card-tabcol-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px;
  height: 2px; border-radius: 1px;
  background: var(--dmp-accent,
    var(--dsw-static-deepseek-450, var(--dsw-alias-state-business-primary))); }
.dmp-card-tab { width: 100%; padding: 3px 0 2px; border: 0; background: transparent;
  text-align: center; font: inherit; font-size: 13px; letter-spacing: .02em; cursor: pointer;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-card-tab:focus-visible { outline: 2px solid var(--dsw-alias-border-l2); outline-offset: -2px; }
.dmp-card-tabcol-active .dmp-card-tab { color: var(--dsw-alias-label-primary); font-weight: 600; }
/* The account line: balance plus a refresh, or a sign-in button. */
.dmp-card-account { display: flex; align-items: center; gap: 5px; min-height: 16px;
  font-size: 10.5px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
/* A filled chip in the card's accent, like the provider panel's own sign-in
   button: it is the one thing on this header that asks to be pressed. */
.dmp-card-login { padding: 1px 10px; border: 0; border-radius: 4px; cursor: pointer;
  font: inherit; font-size: 10.5px; font-weight: 600; color: #fff;
  background: var(--dmp-accent,
    var(--dsw-static-deepseek-450, var(--dsw-alias-state-business-primary))); }
.dmp-card-login:hover:not(:disabled) { filter: brightness(1.08); }
.dmp-card-login:disabled { opacity: .6; cursor: default; }
.dmp-card-refresh { display: inline-flex; align-items: center; justify-content: center;
  padding: 1px; border: 0; border-radius: 4px; background: transparent; cursor: pointer;
  color: inherit; }
.dmp-card-refresh:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dmp-card-refresh:disabled { cursor: default; }
/* Turning while the request is out: the same motion the panel's own refresh uses. */
.dmp-refresh-spinning { animation: dmp-spin .9s linear infinite; }
@keyframes dmp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.dmp-card-section + .dmp-card-section { margin-top: 2px; }
/* Only while searching: the tabs are gone, so the caption names the deployment. */
.dmp-card-section-label { padding: 4px 7px 1px; font-size: 10.5px; letter-spacing: .06em;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-item { display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box;
  min-height: 34px; padding: 5px 7px; border: 0; border-radius: var(--dsw-radius-md, 8px);
  background: transparent; cursor: pointer; text-align: left;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
.dmp-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
/* The selected model keeps one colour in both themes: the accent is the static
   ramp step, not a theme alias (see --dmp-accent above). The fallback repeats the
   chain so the row still reads as selected if the variable is ever missing — the
   accent is declared on .dmp-root, and a panel rendered outside it would otherwise
   fall back to plain label text and lose the only colour cue. */
.dmp-item-current { color: var(--dmp-accent,
    var(--dsw-static-deepseek-450, var(--dsw-alias-state-business-primary)));
  font-weight: 600; }
.dmp-item-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
/* Row decoration from a provider plugin's published state, in that panel's own
 * tag vocabulary: a small load dot, a pill for a verdict, mono text for a price.
 * Colours are theme tokens, never literals — the panel's own greens/ambers are
 * hard-coded, which is fine there and not fine in a token-only stylesheet. */
.dmp-item-dot { flex: none; width: 6px; height: 6px; border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary); }
.dmp-item-dot[data-tone="idle"] { background: var(--dsw-alias-state-success-primary); }
.dmp-item-dot[data-tone="busy"] { background: var(--dsw-alias-state-warn-primary); }
.dmp-item-dot[data-tone="congested"] { background: var(--dsw-alias-state-error-primary); }
.dmp-item-dot[data-tone="unknown"] { background: var(--dsw-alias-state-idle-primary); }
.dmp-item-tail { flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: 11px; line-height: 17px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary); }
.dmp-item-tail-rate { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
/* Nothing published yet: the slot keeps its width and says "unknown" instead of
   being absent, so the row does not grow a chip a second after it appears. */
.dmp-item-tail-pending { color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-card-credits-pending { color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
/* A deployment that publishes no models yet — signed out, or signed in while the
   catalogue catches up. Says so instead of leaving a blank body. */
.dmp-card-empty { padding: 6px 7px 8px; font-size: 12px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
/* A one-deployment card has no tab strip; the account line sits under the header. */
.dmp-card-account-solo { padding: 0 8px 4px; }
/* The pill: tinted from its own text colour, so one rule covers idle, warn and
 * bad without three hand-picked backgrounds. */
.dmp-item-tail-pill { padding: 0 7px; border-radius: 999px; font-weight: 500;
  background: color-mix(in srgb, currentColor 14%, transparent); }
.dmp-item-tail-accent { color: var(--dmp-accent,
    var(--dsw-static-deepseek-450, var(--dsw-alias-state-business-primary))); }
.dmp-item-tail-bad { color: var(--dsw-alias-state-error-primary); }
.dmp-item-tail-warn { color: var(--dsw-alias-state-warn-primary); }
.dmp-item-tail-muted { color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
/* A selected row already carries the accent on its name; the tail keeps its own
 * tone so "selected but rate limited" still reads as rate limited. */
.dmp-note { padding: 8px 7px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-note-error { color: var(--dsw-alias-state-error-primary); }
.dmp-retry { margin-top: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm, 6px); background: transparent; color: inherit;
  font: inherit; font-size: 12px; cursor: pointer; }

/* The padding is what keeps the heading and the hint off the panel edge; the values
   are generous because this panel has no menu rows to create natural breathing room. */
.dmp-panel-slider { width: max-content; box-sizing: border-box;
  min-width: min(322px, 100vw - 32px); max-width: min(374px, 100vw - 32px);
  padding: 17px 19px 15px; border-radius: var(--dsw-radius-lg, 12px); }
/* The type stack, in two parts.
 *
 * The level names are Latin ("Low", "Medium", "X-High") and get the host's own
 * brand face, Montserrat, which the theme plugin already ships at 300/400/500 —
 * so this costs no download and matches the host's own headings. The CJK copy
 * ("思考强度", the hint line) has no glyphs in Montserrat, so the stack falls
 * through to the platform UI face, which is what the host uses for body text.
 *
 * Nothing here sets a size: that stays with each element, so a host font-size
 * change still reaches this control. The slider inherits this from the panel it is
 * always rendered inside, so it is not named here. */
.dmp-panel {
  font-family: Montserrat, var(--dsw-font-family-sans, system-ui, -apple-system,
    'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif); }
.dmp-slider { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.dmp-slider-head { display: flex; align-items: center; gap: 14px; margin-bottom: 5px; }
/* The heading is vector art, not text: see CaptionMark.js for why. It only needs a
   colour — which it takes from the theme token below through currentColor — and a
   display box that sits it on the same line as the value pill. */
.dmp-slider-caption { display: flex; align-items: center;
  color: var(--dsw-alias-label-primary); }
.dmp-caption-mark { display: block; width: auto; }
/* The Latin heading, used wherever the vector mark would be unreadable. It takes
   the heading's own size so the two stay interchangeable on the same line. */
.dmp-caption-text { display: block; font-size: 13px; font-weight: 600; line-height: 16px;
  letter-spacing: .01em; white-space: nowrap; }
/* The value pill is sized close to the heading beside it, so the two read as one
   line: the earlier 19px box with 11.5px type made the current level look like a
   footnote next to the title. 22px / 12px keeps the pair balanced against the
   16px heading and still fits a long level name. */
.dmp-slider-value { margin-left: auto; display: inline-flex; align-items: center;
  height: 22px; box-sizing: border-box; padding: 0 8px; border-radius: 8px;
  font-size: 12px; line-height: 1; font-weight: 600; white-space: nowrap;
  letter-spacing: .01em;
  /* The pill is a label, not a rank meter, so it reads the same at every level — EXCEPT
     the two that carry a tier accent: those take the accent colour in the panel's top
     right corner too, which is what ties the label to the bar below it. Without a tier
     the colour is the plain primary label. */
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  /* On the base rule for the same reason as the trigger text: the fade has to work in
     both directions, including the return to the plain label colour. */
  transition: color .34s ease; }
.dmp-slider[data-tier="top"] .dmp-slider-value,
.dmp-slider[data-tier="high"] .dmp-slider-value { color: var(--dmp-accent); }
/* Reasoning effort: the slider.
   ---------------------------------------------------------------------------
   A thick pill-shaped track with a solid accent fill and a disc riding on it. The
   thick track is what makes the control legible at a glance — a hairline rail with
   a small dot reads as a status indicator, not something you can drag.

   The fill and the active label take the host's business-primary token — the same
   accent DSH uses for its own interactive highlights — so the control recolours
   with the theme instead of carrying a blue that only suits one of them. */
/* The knob is the rail's full height (28px). Both ends keep the knob clear of the
   rail's cap, but by DIFFERENT amounts — that asymmetry is the requested behaviour,
   not an oversight:
     --dmp-stop-left  28px  the first stop sits a full knob diameter in from the
                            left cap, so the knob stops well short of that end;
     --dmp-stop-right 16px  the last stop sits just past the knob's radius (14), so a
                            hairline of track shows beyond the knob at the top level.
   The right gap is deliberately the same weight as the knob's own ring: at 14 the
   knob landed exactly on the cap and the two outlines met, which read as a smudge
   rather than as a stop. The dots, the labels, the fill and the native input's
   travel all derive from these two numbers, which is why they are variables rather
   than four copies of the same value. */
.dmp-slider { --dmp-rail-height: 28px; --dmp-thumb-size: 28px;
  --dmp-stop-left: 28px; --dmp-stop-right: 16px; }
/* The two top levels get their own accent.
   Borrowed from Codex's TUI, which reserves colour for its highest tiers rather than
   painting a ramp across every stop: its Ultra is a violet family and its Max is an
   amber one. Here the LAST stop takes Ultra's violet and the second-to-last takes
   Max's amber, so the two highest levels are the ones that look different — a level
   below that keeps the normal blue, which is what makes the distinction mean
   something.
   The values are the dark-background hues from Codex's tier table. Each tier carries
   a three-hue set there for its gradient animation; only the first is used here, since
   this control does not run that animation.
   data-tier is set by the component on the slider AND on the trigger, because the
   same accent has to reach the level button in the composer row, which is outside the
   panel's subtree. */
.dmp-slider[data-tier="top"],
.dmp-trigger-effort[data-tier="top"] { --dmp-accent: #ba82ff; }
.dmp-slider[data-tier="high"],
.dmp-trigger-effort[data-tier="high"] { --dmp-accent: #f7c473; }
/* Radius is a LITERAL 15px on a 28px-tall rail — deliberately ONE more than half the
   height, so the ends curve a touch harder than a true semicircle and read as round
   rather than as pillowed caps. Anything below half looks square; this is the
   user-tuned value.
   The two numbers are tied: change the height, move the radius with it.

   clip-path does the actual shaping. A border-radius of 16px on a 32px box was
   measured painting an ~10px corner in the host, so the ends kept reading as a
   rounded rectangle no matter what the declaration said. clip-path: inset(0 round
   15px) is a different property: it clips the element AND its children to the same
   shape, so neither the track nor the fill can be squared off by whatever was
   winning on border-radius. border-radius stays as the fallback. */
.dmp-slider-rail { position: relative; height: var(--dmp-rail-height);
  margin: 12px 0 4px; border-radius: 15px; flex: none;
  clip-path: inset(0 round 15px);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
/* The outline: vector, like the knob's ring.
   An inset box-shadow is a raster edge — 1px reads flat and 1.5px falls between
   pixels and smears. This SVG stretches to the rail with preserveAspectRatio none
   and keeps its stroke at exactly 1px through vector-effect, so the line is as
   crisp as the knob's circle. It sits above the fill so it stays visible across the
   blue, and pointer-events none keeps the range input reachable underneath. */
.dmp-slider-outline { position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 7; overflow: visible; }
/* The stop axis. Its ends are the two stop offsets, which is why 0% is the first
   stop and 100% the last — the knob's travel, the dots, the labels and the fill all
   read from this one box. */
.dmp-slider-track { position: absolute; top: 0; bottom: 0;
  left: var(--dmp-stop-left); right: var(--dmp-stop-right); }
/* The fill starts at the RAIL's left edge and ends on the knob's centre line.

   Starting it at the stop axis left a grey stub at the left cap, and the rail's
   clip gives that end its shape, so the run is pulled back to the rail's edge.

   It carries NO radius of its own: it is a plain rectangle clipped by the rail,
   which is what makes its left cap identical to the track's. */
.dmp-slider-fill { position: absolute; top: 0; height: var(--dmp-rail-height);
  left: calc(var(--dmp-stop-left) * -1);
  width: calc(var(--dmp-effort-at) + var(--dmp-stop-left));
  background: var(--dmp-accent);
  /* Two different clocks on purpose. The WIDTH follows the knob at 150ms so the fill
     stays glued to it; the COLOUR gets its own slower curve, because the accent only
     changes when the knob crosses into the top two levels and a snap there read as a
     glitch rather than a state change. */
  z-index: 1; transition: width .15s ease-out, background-color .34s ease;
  pointer-events: none; }
.dmp-slider-dots { position: absolute; top: 0; bottom: 0; left: 0; right: 0;
  pointer-events: none; z-index: 2; }
/* Stops stay SMALL and GREY, and they are only visible AHEAD of the knob: the blue
   fill already says "you are this far", so a dot sitting on it read as dust on the
   colour. Unreached stops keep working as tick marks on the empty part of the track,
   which is where they still carry information. */
.dmp-slider-dot { position: absolute; top: 50%; width: 5px; height: 5px;
  border-radius: 50%; transform: translate(-50%, -50%);
  background: var(--dsw-alias-label-tertiary, currentColor); opacity: .55;
  transition: opacity .15s ease-out; }
.dmp-slider-dot-lit { opacity: 0; }
/* The exhaust: a zero-size point pinned to the knob, carrying the particles.
   It sits ABOVE the fill and BELOW the knob, so squares are born behind the disc and
   drift out from under it. Its left offset carries the SAME transition as the knob — that
   is the whole alignment contract: both are driven by --dmp-effort-at, so as long as
   they animate with the same duration and easing the spawn point stays under the
   knob while it travels. (A drag drops the transition on both; see the dragging
   rule below, which is what fixed particles appearing ahead of the knob.) */
.dmp-emit { position: absolute; top: 50%; left: var(--dmp-effort-at);
  width: 0; height: 0; z-index: 3; pointer-events: none;
  transition: left .15s ease-out; }
/* One square. The dy0 offset spreads the spawn points down the knob cross-section;
   the extra dy/dx send each one its own way so they do not travel as a block.

   The colour is FIXED WHITE, not a theme token. The particles are meant to read as
   light thrown off the bar, and the theme's primary label flips to near-black on a
   light surface — which painted black specks over a pale blue fill. White is the one
   value that works against both surfaces, so it is deliberately not themed.
   --dmp-emit-reach (set per level) multiplies the travel: a low level throws its
   squares a short way, a high level throws them much further. */
.dmp-emit-p { position: absolute; left: 0; top: 0;
  width: var(--sz, 4px); height: var(--sz, 4px); border-radius: 1px;
  background: #fff;
  box-shadow: 0 0 4px #fff;
  opacity: 0; transform: translate(-50%, -50%);
  /* Speed and rate.
     The duration is how fast one square crosses its path; the delay is how far apart
     consecutive squares are in time. Shortening both raises the speed AND the firing
     rate: 1.7s / 106ms read as a lazy drift, 1.05s / 58ms reads as a jet. The delay
     stays well under the duration on purpose — it has to, or the stream develops a
     visible seam where one cycle hands over to the next. */
  animation: dmp-emit 1.05s cubic-bezier(.22,.08,.62,1) infinite;
  animation-delay: calc(var(--i) * -58ms); }
/* The streaks left behind the sheet of squares.
   A SHEET of parallel lines, not a wedge: all nine are the same length, the same
   weight and the same opacity, evenly spaced across the knob's diameter. An earlier
   version tapered them and let each drift, which made the silhouette converge on the
   knob like a flame; the exhaust should leave the whole cross-section at once, so the
   lines are deliberately uniform. Only the total length follows the level's reach.

   The offset is a PIXEL amount around the centre, not a percentage: the emitter is a
   zero-height box, and a percentage top resolves against that zero height, which
   collapsed every streak onto the centre line.

   The trail is ALWAYS in the DOM and fades in and out through opacity, rather than
   being mounted only for the top level. Mounting it on the fly made it pop into
   existence the instant the knob reached the last stop and vanish the instant it left
   — the one jarring moment in an otherwise smooth control. Because opacity carries
   the on/off state, the pulse animation drives filter instead, so the two never
   fight over the same property. */
.dmp-emit-trail { position: absolute; right: 4px; top: 50%;
  width: calc(150px * var(--dmp-emit-reach, 1));
  height: 2px; border-radius: 1px;
  transform: translateY(calc(-50% + var(--off, 0px)));
  background: linear-gradient(270deg,
    #fff 0%,
    #fff 8%,
    color-mix(in srgb, #fff 62%, transparent) 26%,
    color-mix(in srgb, #fff 30%, transparent) 50%,
    color-mix(in srgb, #fff 11%, transparent) 74%,
    transparent 100%);
  opacity: 0;
  transition: opacity .55s ease;
  /* The same softness the single bar had: enough to melt the lines into one volume of
     light at the knob, not enough to lose them as separate lines further out. */
  filter: blur(1.5px);
  animation: dmp-emit-pulse 1.7s ease-in-out infinite;
  /* Staggered per streak so they shimmer out of step instead of pulsing as one band. */
  animation-delay: calc(var(--n, 0) * -140ms); }
/* The top level is the only one that shows the trail, but the change is a fade. */
.dmp-emit[data-trail="on"] .dmp-emit-trail { opacity: .78; }
@keyframes dmp-emit {
  0% { transform: translate(-50%, -50%) translate(0, var(--dy0)) scale(1); opacity: 0; }
  14% { opacity: .95; }
  70% { opacity: .5; }
  100% { transform: translate(-50%, -50%)
    translate(calc(var(--dx) * var(--dmp-emit-reach, 1)),
      calc(var(--dy0) + var(--dy) * var(--dmp-emit-reach, 1)))
    scale(.2) rotate(var(--rot)); opacity: 0; } }
/* The pulse drives filter, not opacity: opacity now carries the fade in and out
   of the trail, and an animation on the same property would override the transition
   and snap instead of fading. Brightness reads the same way at this scale. */
@keyframes dmp-emit-pulse {
  0%, 100% { filter: blur(1.5px) brightness(1); }
  50% { filter: blur(1.5px) brightness(1.5); } }
/* A drag is direct manipulation: the knob, the fill and the emitter all snap to the
   pointer instead of easing, which keeps the particles born exactly at the knob.

   The colour transitions are deliberately NOT cancelled here. Dragging across the two
   tier stops changes the accent MID-gesture, and killing every transition on the fill
   would make that the one moment the colour jumps — which is exactly when the user is
   looking at it. Only the geometric properties snap. */
.dmp-slider-dragging .dmp-slider-thumb { transition: none; }
.dmp-slider-dragging .dmp-slider-fill { transition: width 0s, background-color .34s ease; }
.dmp-slider-dragging .dmp-emit { transition: left 0s; }
/* The knob fills the rail's height and is drawn as an SVG, so no inherited
   border-radius, padding or box-sizing rule can square it off. Its size comes from
   --dmp-thumb-size; the stop offsets and the input's travel are derived from the
   same variable so the three cannot drift apart. */
.dmp-slider-thumb { position: absolute; top: 50%; left: var(--dmp-effort-at);
  width: var(--dmp-thumb-size); height: var(--dmp-thumb-size);
  margin-left: calc(var(--dmp-thumb-size) / -2);
  margin-top: calc(var(--dmp-thumb-size) / -2);
  display: block; overflow: visible; pointer-events: none; z-index: 5;
  /* The knob is the panel's own grey, ringed in the same grey at partial opacity.
     Three attempts landed here. Pure black read as a hole (a dark ring on a dark disc
     on a dark panel is no shape at all). A light grey read as a foreign object — it
     matched neither the fill nor the track. Using the PANEL's own surface colour keeps
     the knob in the same family as everything around it, and the partial opacity does
     the separating: the ring is legible over the pale fill and over the dark track
     without ever becoming a hard contour.
     The two values swing with the host stylesheet's own media query, so no JS theme
     detection is involved. */
  --dmp-thumb-fill: var(--dsw-alias-bg-module-platform);
  --dmp-thumb-ring: color-mix(in srgb, var(--dsw-alias-bg-module-platform) 45%, transparent);
  filter: drop-shadow(0 2px 4px color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent));
  transition: left .15s ease-out, transform .12s ease; }
.dmp-slider-rail:active .dmp-slider-thumb { transform: scale(1.06); }
.dmp-slider-rail:has(.dmp-slider-input:focus-visible) .dmp-slider-thumb {
  box-shadow: 0 0 0 3px color-mix(in srgb,
    var(--dmp-accent) 35%, transparent); }
/* The range input spans from the first stop's reach to the rail's right edge, and
   its native thumb is the knob's size. That makes its invisible thumb's centre
   travel exactly from --dmp-stop-left to (width - stop-right) — the same axis the
   knob is drawn on. Spanning the full rail instead would start the travel one
   radius short of the first stop, and the pointer would disagree with the knob. */
.dmp-slider-input { position: absolute; z-index: 6; top: 0;
  left: calc(var(--dmp-stop-left) - var(--dmp-thumb-size) / 2);
  width: calc(100% - var(--dmp-stop-left) + var(--dmp-thumb-size) / 2);
  height: var(--dmp-rail-height); margin: 0; cursor: pointer;
  -webkit-appearance: none; appearance: none; background: transparent;
  /* Two-level invisibility: opacity alone leaves the native thumb able to paint
     through on some engines, which reads as a stray rectangle riding the track. */
  opacity: 0; color: transparent; border: 0; }
.dmp-slider-input::-webkit-slider-runnable-track { background: transparent; border: 0; }
/* The native thumb is sized to the painted one so pointer travel matches, then made
   fully transparent: leaving it visible is what produced a square riding the track. */
.dmp-slider-input::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
  width: var(--dmp-thumb-size); height: var(--dmp-thumb-size);
  background: transparent; border: 0; }
.dmp-slider-input::-moz-range-thumb { width: var(--dmp-thumb-size); height: var(--dmp-thumb-size); border: 0; }
.dmp-slider-input:disabled { cursor: default; }
.dmp-slider[aria-disabled="true"] { opacity: .5; }
/* The legend shares the track's inset so a label sits under the stop it names. */
.dmp-slider-legend { position: relative; height: 16px;
  margin: 0 var(--dmp-stop-right) 0 var(--dmp-stop-left); }
/* The level labels are Latin, so they take Montserrat explicitly — inheriting from
   the panel would pull the platform face back in. */
.dmp-slider-tick { position: absolute; top: 0; transform: translateX(-50%);
  padding: 1px 4px; border: 0; border-radius: 6px; background: transparent;
  /* One brightness for every unselected label: the tertiary token sat too close to
     the panel background, so the secondary token lifts all of them equally. */
  color: var(--dsw-alias-label-secondary);
  /* 11px keeps every stop name on one line under the 28px rail without crowding
     the heading above it; the labels sit below the track, so they can go smaller
     than the panel's body copy. */
  font-size: 11px; line-height: 15px;
  font-family: Montserrat, var(--dsw-font-family-sans, system-ui, sans-serif);
  white-space: nowrap; cursor: pointer;
  max-width: 45%; overflow: hidden; text-overflow: ellipsis;
  /* The colour fade lives HERE, on the base rule, so the label that loses the active
     class fades out as well as the one that gains it — the highlight hands over with a
     cross-fade instead of blinking. Hover still answers quickly through the faster
     background transition. */
  transition: color .3s ease, background-color .15s ease; }
/* Every label is centred on its stop.
   The two end labels used to be re-anchored instead (no transform at the start, a full
   translate at the end) so their text could not overflow the legend. That kept them
   inside the box, but it also pulled them off their dots: the last label sat entirely
   to the LEFT of its stop, which is exactly what makes "Max" look misaligned against
   the dot above it. The legend already spans the stop axis and the labels are short,
   so plain centring fits — and every label now shares one rule. */
.dmp-slider-tick[data-edge="start"] { transform: translateX(-50%); margin-left: 0; }
.dmp-slider-tick[data-edge="end"] { transform: translateX(-50%); margin-left: 0; }
.dmp-slider-tick:hover:not(:disabled) { color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-interactive-bg-hover); }
.dmp-slider-tick:focus-visible { outline: 2px solid var(--dsw-alias-border-l3); outline-offset: -2px; }
.dmp-slider-tick:disabled { cursor: default; }
/* The active label is marked by COLOUR only, not weight.
   Bolding it made the selected label measurably wider and taller-looking than its
   neighbours, so the labels appeared to change size as the level moved. Keeping one
   weight keeps every label the same box; the accent colour carries the selection.
   The cross-fade comes from the transition on the base rule above. */
.dmp-slider-tick-active { color: var(--dmp-accent); }
.dmp-slider-hint { margin: 5px 0 0; padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-secondary); }
/* Light surfaces follow the same rule with their own panel colour: white fill, ringed
   in that same white at partial opacity. On a near-white panel the ring still reads
   because it sits over the blue fill for most of the travel, and where it crosses the
   empty track the drop shadow supplies the edge instead. */
@media (prefers-color-scheme: light) {
  .dmp-slider-thumb {
    --dmp-thumb-fill: var(--dsw-alias-bg-base);
    --dmp-thumb-ring: color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent);
  }
}
@media (prefers-reduced-motion: reduce) {
  /* Every accent transition goes too, not just the geometry: a colour cross-fade is
     still motion, and the tier change is perfectly legible without it. */
  .dmp-slider-fill, .dmp-slider-thumb,
  .dmp-slider-tick, .dmp-slider-value,
  .dmp-trigger-effort-text { transition: none; }
  /* The exhaust is decoration: with motion turned down it is simply not drawn. */
  .dmp-emit { display: none; }
}
/* ---------------------------------------------------------------------------
   Rejected-selection notice
   ---------------------------------------------------------------------------
   A failed switch is reported ABOVE the panels, never inside them: the list and
   the slider are for choosing, and a raw "code: message" dumped among the rows
   both crowds the list and scrolls away. Collapsed it is one quiet line; the
   detail is opt-in.

   It is absolutely positioned above the row so it takes no width from the
   composer, and --dmp-notice-lift (measured in ModelPicker) is what raises an
   open panel over its measured height instead of on top of it. */
.dmp-notice { position: absolute; bottom: calc(100% + 6px); left: 0; right: auto;
  z-index: 1100; display: flex; flex-direction: column; align-items: flex-start;
  width: max-content; max-width: min(360px, 92vw); box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-1));
  box-shadow: var(--dsw-elevation-panel, var(--dsw-shadow-lv2));
  overflow: hidden; }
.dmp-notice-toggle { display: flex; align-items: center; gap: 6px; width: 100%;
  box-sizing: border-box; padding: 6px 8px; border: 0; background: transparent;
  color: var(--dsw-alias-state-error-primary); font: inherit; font-size: 12px;
  line-height: 18px; text-align: left; cursor: pointer; }
.dmp-notice-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dmp-notice-toggle:focus-visible { outline: 2px solid var(--dsw-alias-border-l2); outline-offset: -2px; }
.dmp-notice-toggle .dmp-chevron { margin-left: auto; }
.dmp-notice-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The raw provider error: monospaced so a "code: message" pair is readable, and
   selectable so it can be copied into a bug report. */
.dmp-notice-detail { width: 100%; box-sizing: border-box; padding: 6px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11.5px; line-height: 16px; white-space: pre-wrap; word-break: break-word;
  color: var(--dsw-alias-label-secondary); user-select: text; }`

//# module: src/ui/dict.js
/**
 * The picker's two dictionaries.
 *
 * Kept as a plain object rather than the Client locale service because the
 * strings are this component's own copy, not a namespace other plugins
 * translate. Adding a language is one more entry here.
 *
 * Only keys the component actually reads belong here: an entry nobody looks up
 * is a string that silently rots, and a reviewer cannot tell it is dead.
 */
const DICT = {
  'zh-CN': {
    placeholder: '搜索模型',
    empty: '没有匹配的模型',
    loading: '正在读取模型列表…',
    retry: '重试',
    noCatalog: '当前没有可用模型',
    trigger: (name) => `${name}（点此切换模型）`,
    effortTitle: (name) => `思考档位：${name}（点此调整）`,
    effortHeading: '思考强度',
    effortHint: '更高的强度通常需要更多思考时间。',
    switchFailed: '切换失败',
    expand: '展开',
    collapse: '收起',
    rateFree: '免费',
    rateUnknown: '未知',
    busyIdle: '空闲',
    busyBusy: '繁忙',
    busyCongested: '拥堵',
    /* The wording a tooltip uses: the two-character labels drop the degree that
       the dot's colour already carries, a tooltip can afford to say it. */
    busyBusyDetail: '轻微拥堵',
    busyCongestedDetail: '极度拥堵',
    /**
     * Deployment names for a card whose providers are regions of one product.
     *
     * The provider publishes `region` ('cn' / 'intl') plus an English display
     * name; the picker's own language decides how those are written, so the tab
     * never reads "Mainland" inside an otherwise Chinese panel.
     */
    regionCn: '大陆版',
    regionIntl: '海外版',
    credits: '积分',
    creditsUnknown: '—',
    creditsLoading: '加载中…',
    noModels: '暂无可用模型',
    refreshCredits: '刷新积分',
    renew: '续期',
    renewing: '续期中…',
    login: '登录',
    loginPending: '登录中…',
    /**
     * The published verdict tokens, in the picker's own words.
     *
     * The provider plugin publishes stable English tokens and never its UI copy,
     * so a consumer can translate them itself; this is that translation. An
     * unknown token falls through and is printed as-is rather than being forced
     * into 可用 — a new verdict should look odd, not lie.
     */
    verdict: {
      available: '可用',
      unusable: '不可用',
      'no permission': '无权限',
      'credentials rejected': '凭据失效',
      'out of credits': '积分不足',
      'rate limited': '限流',
      unknown: '未知'
    }
  },
  en: {
    placeholder: 'Search models',
    empty: 'No matching model',
    loading: 'Loading models…',
    retry: 'Retry',
    noCatalog: 'No model is currently available',
    trigger: (name) => `${name} (click to switch model)`,
    effortTitle: (name) => `Reasoning level: ${name} (click to change)`,
    effortHeading: 'Reasoning effort',
    effortHint: 'Higher effort usually takes more time to think.',
    switchFailed: 'Switch failed',
    expand: 'Expand',
    collapse: 'Collapse',
    rateFree: 'Free',
    rateUnknown: 'Unknown',
    busyIdle: 'Idle',
    busyBusy: 'Busy',
    busyCongested: 'Congested',
    busyBusyDetail: 'Slightly congested',
    busyCongestedDetail: 'Heavily congested',
    regionCn: 'Mainland',
    regionIntl: 'Overseas',
    credits: 'Credits',
    creditsUnknown: '—',
    creditsLoading: 'Loading…',
    noModels: 'No models yet',
    refreshCredits: 'Refresh credits',
    renew: 'Renew',
    renewing: 'Renewing…',
    login: 'Sign in',
    loginPending: 'Signing in…',
    verdict: {
      available: 'Available',
      unusable: 'Unusable',
      'no permission': 'No permission',
      'credentials rejected': 'Credentials rejected',
      'out of credits': 'Out of credits',
      'rate limited': 'Rate limited',
      unknown: 'Unknown'
    }
  }
}

/**
 * Resolve a dictionary from a locale id.
 *
 * @param localeId - the active locale, e.g. `zh-CN` or `en-US`.
 * @returns the matching dictionary, English when the language is unknown.
 */
function dictionaryFor(localeId) {
  return DICT[String(localeId ?? '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en']
}

//# module: src/ui/ModelPicker.js








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
function createModelPicker(React) {
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
     * The cards are then ordered by provider, not by the catalogue: the shipped
     * picker lifts `deepseek-account` / `deepseek-official` to the top and leaves
     * the rest in registration order (`orderModelProviders`), and this plugin pins
     * its own companion provider above both. See `core/order.js` — the ranking
     * lives there so the model list and the shipped menus agree.
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
      // Provider order, not catalogue order — and it holds while searching too, so
      // a card does not jump around as the query narrows the list to it.
      return orderByProvider(order, (card) => card.key)
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

//# module: src/client.js
/**
 * Client entry: the module-loader registration and the plugin object.
 *
 * This plugin replaces ONLY the composer's model-selection UI. Everything behind
 * it — the per-session directory, the catalogue cache, the invalidation events,
 * the selection RPC — is the shipped `ui-model-selection` implementation, reached
 * through its `modelDirectories` service.
 *
 * That split works because the shipped plugin keeps its slot registration and its
 * component apart: the registration's `inject` hands the component a plain props
 * bundle (`available`, a `directory` store, `load`, `select`), and the component
 * may render however it likes. This entry registers the same slot with the same
 * `inject` contract and substitutes its own component.
 *
 * Why not copy the shipped bundle instead: a copy registers a second
 * `ModelDirectoryResolver` under the same service name, the two fight over it,
 * and the shipped plugin parks in `loading` — which fails the whole renderer
 * boot. Reusing the service avoids that, and keeps tracking upstream fixes.
 */

const PLUGIN = 'dsh-model-picker'
const SLOT = 'conversation.input.model'
/** The service the shipped picker exposes for per-session model directories. */
const MODEL_DIRECTORIES = 'modelDirectories'
/**
 * A provider plugin's published per-model state, if that plugin is installed.
 *
 * Not a dependency: it is read through `scope.get()` and every consumer tolerates
 * `undefined`. The name is scoped by its package so two plugins can never fight
 * over a bare `state`.
 */
const PROVIDER_STATE = '@huai_xin/dsh-workbuddy/state'
/**
 * Wrap a possibly-late service in the `{ getSnapshot, subscribe }` pair the
 * component expects.
 *
 * The lookup is deferred to call time rather than captured once: provider plugins
 * are separate bundles, and load order is not something this plugin may assume.
 * When the service is absent both members degrade to "no data" instead of
 * throwing, which is what keeps the decoration optional.
 *
 * @param scope - the ctx that owns the registration.
 * @param name - the service name to resolve on each call.
 * @returns an observable the component can subscribe to.
 */
function createProviderStateSource(scope, name) {
  /**
   * The last non-empty snapshot seen.
   *
   * `getSnapshot` is asked again on every render, and the service answers with an
   * empty map until its own (asynchronous, several-round-trip) load settles — on a
   * fresh page that is a visible second of undecorated rows. Keeping the last real
   * answer means a list opened a second time paints complete immediately, and the
   * refresh that follows only updates numbers in place.
   */
  let cached
  const resolve = () => {
    try {
      return scope.get(name)
    } catch {
      return undefined
    }
  }
  const read = () => {
    const snapshot = resolve()?.getSnapshot?.()
    if (snapshot === null || snapshot === undefined) return cached
    const providers = snapshot.providers
    if (providers !== null && providers !== undefined && Object.keys(providers).length > 0) {
      cached = snapshot
      return snapshot
    }
    // Empty is "not loaded yet" rather than "everything logged out": a real
    // signed-out deployment still appears, with loggedIn false.
    return cached ?? snapshot
  }
  return {
    getSnapshot: read,
    subscribe: (listener) => resolve()?.subscribe?.(listener) ?? (() => {}),
    // Side actions the provider publishes for a selector to offer: re-read a
    // balance, start a sign-in. Both degrade to a resolved promise when the
    // plugin is absent, so a caller never has to branch on its presence.
    refresh: () => resolve()?.refresh?.() ?? Promise.resolve(),
    renew: (region) => resolve()?.renew?.(region) ?? Promise.resolve(),
    refreshCredits: (region) => resolve()?.refreshCredits?.(region) ?? Promise.resolve(),
    login: (region) => resolve()?.login?.(region) ?? Promise.resolve()
  }
}
/**
 * BELOW the shipped occupant's `priority: 0`.
 *
 * For a `single` slot the LOWEST priority renders — the registry says so in its
 * own error text ("register at a different priority to shadow it (lowest
 * renders)"). A larger number would lose to the shipped picker instead of
 * shadowing it.
 */
const SHADOW_PRIORITY = -1

/**
 * Load-stage report.
 *
 * The packaged desktop app has no devtools, so a client half that fails to
 * register is indistinguishable from one that never loaded. Each stage is posted
 * to the Host half, which logs it beside its own line: the pair tells the two
 * cases apart immediately.
 *
 * @param stage - a short description of the load stage reached.
 */
const report = (stage) => {
  try {
    console.error(`[model-picker] ${stage}`)
  } catch {
    // no console in some hosts
  }
  try {
    void fetch('/model-picker/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
      keepalive: true
    }).catch(() => {})
  } catch {
    // diagnostics must never break the picker
  }
}

/**
 * The failure worth capturing happens *outside* apply: the client composition
 * builds this plugin object, then never applies it, and whatever it threw on the
 * way is only visible in the page.
 *
 * @param value - the thrown value, in any shape.
 * @returns a short description safe to log.
 */
const describe = (value) => {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

report('client.js 已执行，开始注册 factory')

try {
  window.addEventListener('error', (event) => {
    report(`页面 error：${describe(event?.error ?? event?.message)}`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    report(`页面 unhandledrejection：${describe(event?.reason)}`)
  })
} catch {
  // a missing window hook must never stop the plugin from registering
}

window.__ModuleLoader__.load({
  id: '@huai_xin/dsh-model-picker',
  factory(require) {
    report('factory 已运行，正在装配插件对象')
    const React = require('react')
    const ModelPicker = createModelPicker(React)

    return {
      name: PLUGIN,
      /**
       * The services this half reads, PLUS the ones the shipped directory service
       * reads on its own behalf.
       *
       * `remote` and `remote.session` look unused here — this file never mentions
       * them — but `models.directoryFor(sessionId)` calls into the shipped
       * resolver, and that call runs in THIS entry's fiber. Cordis only exposes a
       * service to a fiber that declares it, so dropping them makes every
       * `directoryFor` throw
       *
       *   cannot get property "remote.session" without inject
       *
       * from inside `inject`. The renderer catches that, retires the entry and
       * silently paints the shipped picker — the plugin "just disappears".
       * Declaring what the callee needs is part of calling it, so they stay.
       */
      inject: ['locale', 'sessions', 'slots', 'remote', 'remote.session'],
      apply(ctx) {
        report(`apply 已调用（slots=${ctx.get('slots') === undefined ? '尚未就绪' : '就绪'}）`)

        /**
         * Register the seat through the shipped directory service.
         *
         * `ctx.inject` runs this callback once the named services are visible, so
         * the registration lands at the same point the shipped one would. It is
         * also re-run if a service goes away and returns, which is what keeps the
         * seat from binding to `undefined` across a reconnect.
         */
        // `remote` / `remote.session` are declared here as well as on the plugin:
        // this callback runs in the fiber that `ctx.inject` creates, and the
        // directory resolver uses those two services through that context.
        ctx.inject(['slots', MODEL_DIRECTORIES, 'remote', 'remote.session'], (scope) => {
          const slots = scope.get('slots')
          const sessions = scope.get('sessions')
          /**
           * The locale SERVICE, handed to the component as an observable source.
           *
           * Its snapshot is `{ active, locales, revision }` — NOT `{ locale }`.
           * Reading the wrong field made every UI string fall back to Chinese no
           * matter which language the shell was set to.
           *
           * It is passed through as a `{ getSnapshot, subscribe }` pair rather
           * than resolved to a string here: `inject` is cached per session
           * binding, so a string captured now would never follow a language
           * switch made while the composer is on screen.
           */
          const locale = scope.get('locale')
          const localeSource = locale !== undefined &&
            typeof locale.getSnapshot === 'function' &&
            typeof locale.subscribe === 'function'
            ? locale
            : undefined
          const initialLocale = localeSource?.getSnapshot?.()?.active
          const localeId = typeof initialLocale === 'string' && initialLocale.length > 0
            ? initialLocale
            : 'zh-CN'

          if (slots === undefined) {
            report('槽位未注册：slots 缺失')
            return
          }

          /**
           * Register the seat.
           *
           * Two details matter:
           *
           *  - NO `children` table. The child slot `conversation.input.model.label`
           *    is declared by the shipped occupant, and a child declaration is
           *    EXCLUSIVE per slot key: `slots.register` throws
           *    `slot "…label" is already declared (by …)` the moment a second entry
           *    offers the same child. The throw escapes the slot callback and the
           *    picker stops rendering. Disposing first does not help either — the
           *    declaration belongs to the shipped entry, which never disposes.
           *
           *  - The service lookup happens INSIDE the callback. `models` may not be
           *    visible yet when `apply` runs; reading it here means the registration
           *    waits for it instead of binding to undefined.
           *
           * The cost of dropping the child declaration is that provider badges
           * mounted at `conversation.input.model.label` no longer render here. That
           * is the same trade the reference plugin makes, and it is what makes the
           * registration survive.
           */
          let disposeCurrent = null
          slots.inject(SLOT, () => {
            const models = scope.get(MODEL_DIRECTORIES)
            if (models === undefined) {
              report('modelDirectories 缺失，暂不注册')
              return () => {}
            }
            // The callback can fire more than once (a service re-appearing re-runs
            // it). Registering twice at the same priority throws
            // `single slot "…" already has a registration`, so the previous one is
            // released first. Without a children table this is safe — the child
            // declaration is what cannot be released.
            if (disposeCurrent !== null) {
              try {
                disposeCurrent()
              } catch {
                // Already gone.
              }
              disposeCurrent = null
            }
            report('槽位回调已运行，准备注册 occupant')
            disposeCurrent = slots.register({
              name: SLOT,
              priority: SHADOW_PRIORITY,
              inject: (sessionId) => {
                const directory = models.directoryFor(sessionId)
                const available = typeof sessions?.subagentAddress === 'function'
                  ? sessions.subagentAddress(sessionId) === undefined
                  : true
                return {
                  localeId,
                  localeSource,
                  available,
                  // Optional provider-published state (login, credits, per-model
                  // availability/busy/rate). Late-bound: the providing bundle may
                  // apply before or after this one, and it must never be listed in
                  // `inject` — a service that never appears would then keep this
                  // seat from registering at all. Absent ⇒ rows render as plain
                  // text, which is the supported fallback.
                  modelStateSource: createProviderStateSource(scope, PROVIDER_STATE),
                  // The shipped registration hands over the STORE, not the
                  // controller; the component subscribes to it directly.
                  directory: directory.store,
                  load: () => {
                    if (available) directory.load().catch(() => {})
                  },
                  /**
                   * Submit one triple.
                   *
                   * The RESULT IS PASSED THROUGH UNCHANGED. `ModelDirectory.select`
                   * resolves to `{ ok: true, value }` or `{ ok: false, error }`,
                   * and the component — like the shipped one — reads `ok` to
                   * decide whether to close the panel and which failure to show.
                   * Mapping it to a boolean here made every successful pick look
                   * like a failure: the model switched but the list stayed open,
                   * and a settled effort level dropped its optimistic draft.
                   */
                  select: (selection) => available
                    ? directory.select(selection)
                    : Promise.resolve(undefined)
                }
              }
            }, ModelPicker)
            return () => {
              if (disposeCurrent !== null) {
                try { disposeCurrent() } catch { /* already gone */ }
                disposeCurrent = null
              }
            }
          })
        })
      }
    }
  }
})
})()
