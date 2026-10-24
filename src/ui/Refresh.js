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
export function Refresh({ h, spinning }) {
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
