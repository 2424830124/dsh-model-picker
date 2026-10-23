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
export const CSS = `
.dmp-root { position: relative; display: flex; align-items: center; gap: 6px; min-width: 0; }
/* One popover anchor per control: the model list and the level list open above
   their own button and never overlap each other. */
.dmp-control { position: relative; display: flex; align-items: center; min-width: 0; }
/* The model tag keeps a stable box too, for the same reason: switching models must
   not move the level tag beside it. It is capped rather than fixed so a long model
   name still gets room, but the cap is what the layout reserves. */
.dmp-trigger { display: flex; align-items: center; gap: 4px; min-width: 0;
  max-width: min(220px, 34cqw); height: 28px; padding: 0 4px 0 8px; border: 0;
  border-radius: var(--dsw-radius-sm, 6px); cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 13px; line-height: 20px; }
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
.dmp-trigger-effort { position: relative; width: 92px; box-sizing: border-box;
  padding: 0 18px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dmp-trigger-effort > .dmp-chevron { position: absolute; right: 4px; top: 50%;
  margin-top: -7px; }
/* The tag names the level; it is not a brightness meter. Taking the ramp colour here
   made "Low" render dim grey and "High" near white, so the control appeared to change
   weight as the level moved. The ramp stays on the track, where it means intensity. */
.dmp-trigger-effort-text { flex: 1 1 auto; min-width: 0; text-align: center;
  color: var(--dsw-alias-label-primary); font-weight: 600; }
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
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-chevron { flex: none; color: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary));
  transition: transform .12s; }
.dmp-chevron-open { transform: rotate(180deg); }
/* Content-sized, like the shipped menu: a two-model list must not be as wide as a
   twenty-model one. The caps only exist so a long model name cannot run off the
   viewport. */
.dmp-panel { position: absolute; bottom: calc(100% + 6px + var(--dmp-notice-lift, 0px)); z-index: 1000;
  width: max-content; min-width: min(240px, 100vw - 32px); max-width: min(360px, 92vw);
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
.dmp-group { padding: 6px 7px 2px; font-size: 11px; letter-spacing: .04em;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-item { display: flex; align-items: center; width: 100%; box-sizing: border-box;
  min-height: 34px; padding: 5px 7px; border: 0; border-radius: var(--dsw-radius-md, 8px);
  background: transparent; cursor: pointer; text-align: left;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
.dmp-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-item-current { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.dmp-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
   footnote next to the title. 26px / 14px keeps the pair balanced and still fits
   a long level name. */
.dmp-slider-value { margin-left: auto; display: inline-flex; align-items: center;
  height: 22px; box-sizing: border-box; padding: 0 8px; border-radius: 8px;
  font-size: 12px; line-height: 1; font-weight: 600; white-space: nowrap;
  letter-spacing: .01em;
  /* The pill is a label, not a rank meter: it must read the SAME at every level.
     It used to take the level's ramp colour, so Low rendered dim grey and Max near
     white — the same component looking like two different things depending on the
     setting. The ramp colour stays on the track, where it encodes intensity. */
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover); }
/* Reasoning effort: the slider.
   ---------------------------------------------------------------------------
   A thick pill-shaped track with a solid accent fill and a disc riding on it. The
   thick track is what makes the control legible at a glance — a hairline rail with
   a small dot reads as a status indicator, not something you can drag.

   The fill and the active label take the host's business-primary token — the same
   accent DSH uses for its own interactive highlights — so the control recolours
   with the theme instead of carrying a blue that only suits one of them. */
/* The knob is the rail's full height (32px). The two stop offsets are deliberately
   UNEQUAL:
     --dmp-stop-left  32px  the first stop sits a full knob diameter in from the
                            left cap, so the knob stops short of that end;
     --dmp-stop-right 16px  the last stop is one knob RADIUS in from the right cap,
                            so the knob reaches that end flush.
   That asymmetry is the requested behaviour, not an oversight. The dots, the
   labels, the fill and the native input's travel all derive from these two numbers,
   which is why they are variables rather than four copies of the same value. */
.dmp-slider { --dmp-rail-height: 28px; --dmp-thumb-size: 28px;
  --dmp-stop-left: 28px; --dmp-stop-right: 14px; }
/* Radius is a LITERAL 17px on a 32px-tall rail — deliberately ONE more than half the
   height, so the ends curve a touch harder than a true semicircle and read as round
   rather than as pillowed caps. Anything below half looks square; this is the
   user-tuned value.
   The two numbers are tied: change the height, move the radius with it.

   clip-path does the actual shaping. A border-radius of 16px on this 32px box was
   measured painting an ~10px corner in the host, so the ends kept reading as a
   rounded rectangle no matter what the declaration said. clip-path: inset(... round
   17px) is a different property: it clips the element AND its children to the same
   shape, so neither the track nor the fill can be squared off by whatever was
   winning on border-radius. border-radius stays as the fallback. */
.dmp-slider-rail { position: relative; height: var(--dmp-rail-height);
  margin: 12px 0 4px; border-radius: 15px; flex: none;
  clip-path: inset(0 round 15px);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
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
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  z-index: 1; transition: width .15s ease-out; pointer-events: none; }
.dmp-slider-dots { position: absolute; top: 0; bottom: 0; left: 0; right: 0;
  pointer-events: none; z-index: 2; }
/* Stops stay SMALL and GREY: they mark the stations, the knob is what you grab.
   The reached stop used to take the panel's surface colour, which is near-black in
   the dark theme — a black pinhole punched into the blue. Both states now use the
   label ramp, so a dot reads as grey on the track and as light grey on the fill. */
.dmp-slider-dot { position: absolute; top: 50%; width: 5px; height: 5px;
  border-radius: 50%; transform: translate(-50%, -50%);
  background: var(--dsw-alias-label-tertiary, currentColor); opacity: .55;
  transition: opacity .15s ease-out, background .15s ease-out; }
/* A reached stop sits on the coloured fill, so it lightens instead of going dark. */
.dmp-slider-dot-lit { background: var(--dsw-alias-label-secondary, currentColor); opacity: .9; }
/* The knob fills the rail's height and is drawn as an SVG, so no inherited
   border-radius, padding or box-sizing rule can square it off. Its size comes from
   --dmp-thumb-size; the stop offsets and the input's travel are derived from the
   same variable so the three cannot drift apart. */
.dmp-slider-thumb { position: absolute; top: 50%; left: var(--dmp-effort-at);
  width: var(--dmp-thumb-size); height: var(--dmp-thumb-size);
  margin-left: calc(var(--dmp-thumb-size) / -2);
  margin-top: calc(var(--dmp-thumb-size) / -2);
  display: block; overflow: visible; pointer-events: none; z-index: 5;
  /* The knob takes the panel's grey in dark and pure white in light, with a black
     ring in both. The two values swing with the host stylesheet's own media query,
     so no JS theme detection is involved. */
  --dmp-thumb-fill: var(--dsw-alias-bg-module-platform);
  --dmp-thumb-ring: #000;
  filter: drop-shadow(0 2px 4px color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent));
  transition: left .15s ease-out, transform .12s ease; }
.dmp-slider-rail:active .dmp-slider-thumb { transform: scale(1.06); }
.dmp-slider-rail:has(.dmp-slider-input:focus-visible) .dmp-slider-thumb {
  box-shadow: 0 0 0 3px color-mix(in srgb,
    var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)) 35%, transparent); }
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
  /* 12px, up from 11px: at 11 the stop names sat visibly below the heading's weight
     and were hard to hit by eye under a 32px rail. */
  font-size: 11px; line-height: 15px;
  font-family: Montserrat, var(--dsw-font-family-sans, system-ui, sans-serif);
  white-space: nowrap; cursor: pointer;
  max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
.dmp-slider-tick[data-edge="start"] { transform: none; margin-left: -4px; }
.dmp-slider-tick[data-edge="end"] { transform: translateX(-100%); margin-left: 4px; }
.dmp-slider-tick:hover:not(:disabled) { color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-interactive-bg-hover); }
.dmp-slider-tick:focus-visible { outline: 2px solid var(--dsw-alias-border-l3); outline-offset: -2px; }
.dmp-slider-tick:disabled { cursor: default; }
/* The active label is marked by COLOUR only, not weight.
   Bolding it made the selected label measurably wider and taller-looking than its
   neighbours, so the labels appeared to change size as the level moved. Keeping one
   weight keeps every label the same box; the accent colour carries the selection. */
.dmp-slider-tick-active {
  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.dmp-slider-hint { margin: 5px 0 0; padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-secondary); }
/* Light surfaces need a softer knob: a black ring reads as a hard edge on a
   near-white panel, so the light theme pulls the ring to the host's border colour
   and keeps the fill pure white. The two values swing with the host stylesheet's
   own media query, so no JS theme detection is involved. */
@media (prefers-color-scheme: light) {
  .dmp-slider-thumb {
    --dmp-thumb-fill: var(--dsw-alias-bg-base);
    --dmp-thumb-ring: var(--dsw-alias-border-l2);
  }
}
@media (prefers-reduced-motion: reduce) {
  .dmp-slider-fill, .dmp-slider-thumb { transition: none; }
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