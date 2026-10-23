/**
 * The chevron that turns when its panel is open.
 *
 * @param props - `{ h, open }`: the createElement function and the open flag.
 * @returns the svg element.
 */
export function Chevron({ h, open }) {
  return h('svg', {
    className: `dmp-chevron${open ? ' dmp-chevron-open' : ''}`,
    viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true
  }, h('path', {
    d: 'M4 6.5L8 10.5L12 6.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }))
}
