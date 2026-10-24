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