import { CAPTION_GLYPHS, CAPTION_VIEWBOX } from './caption-glyphs.js'

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
export function createCaptionMark(React) {
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
