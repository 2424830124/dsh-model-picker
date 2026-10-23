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

    return h('div', {
      className: 'dmp-slider',
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
