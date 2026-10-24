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
import { createCaptionMark } from './CaptionMark.js'

export function createEffortSlider(React) {
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

    return h('div', {
      // `dmp-slider-dragging` drops the left transition on the knob, the fill and
      // the emitter together. Without it the knob eases to its new stop over 150ms
      // while a transition-free emitter jumps there at once, so the particles left
      // from a position the knob had not reached yet.
      className: `dmp-slider${dragging === null ? '' : ' dmp-slider-dragging'}`,
      'aria-disabled': disabled === true,
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
            // box is drawn at 32px — so the disc's radius is exactly 16px, the same
            // as the rail's end cap. Smaller and the blue cap peeks out as a thin
            // rim around the knob at the first stop; larger and the knob spills
            // past the pill.
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
