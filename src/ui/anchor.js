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
  const { useState, useEffect, useRef } = React
  const { open, fallbackWidth = 280, margin = 8, deps = [] } = options

  const [anchor, setAnchor] = useState({ offset: 0, ready: false })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setAnchor({ offset: 0, ready: false })
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
      const maxLeft = viewport - width - margin
      const clamped = Math.max(margin, Math.min(centred, Math.max(margin, maxLeft)))
      setAnchor({ offset: clamped - centred, ready: true })
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
      left: '50%',
      right: 'auto',
      transform: `translateX(calc(-50% + ${anchor.offset}px))`,
      visibility: anchor.ready ? 'visible' : 'hidden'
    }
  }
}
