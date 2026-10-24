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
export function createAnchoredPanel(React, options) {
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
