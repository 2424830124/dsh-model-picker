/**
 * The picker's stylesheet.
 *
 * Host theme tokens only, plus the two composer variables the row sets when its
 * controls no longer fit on one line. Every class is prefixed `dmp-` so a copied
 * host pattern can never collide with the host's own rules.
 *
 * Sizing follows the shipped menu rather than inventing its own scale: the panel
 * is `max-content` wide (so a short list stays narrow instead of stretching to a
 * fixed width), rows are 34px tall with 5px/7px padding, and the panel pads 4px.
 * Those numbers are what makes the replacement feel like part of the composer
 * instead of a dialog dropped on top of it.
 */
export const CSS = `
.dmp-root { position: relative; display: flex; align-items: center; gap: 2px; min-width: 0; }
/* One popover anchor per control: the model list and the level list open above
   their own button and never overlap each other. */
.dmp-control { position: relative; display: flex; align-items: center; min-width: 0; }
.dmp-trigger { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: min(360px, 45cqw);
  height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: var(--dsw-radius-sm, 6px); cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 13px; line-height: 20px; }
.dmp-trigger-effort { max-width: min(150px, 28cqw); padding: 0 4px 0 6px; font-size: 12px;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary)); }
.dmp-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-trigger:disabled { color: var(--dsw-alias-label-dimmed, var(--dsw-alias-state-idle-primary)); cursor: default; }
.dmp-trigger-icon { display: var(--dsh-composer-model-icon-display, none); flex: none; }
.dmp-trigger-text { display: var(--dsh-composer-model-text-display, block);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-chevron { flex: none; color: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary));
  transition: transform .12s; }
.dmp-chevron-open { transform: rotate(180deg); }
/* Content-sized, like the shipped menu: a two-model list must not be as wide as a
   twenty-model one. The caps only exist so a long model name cannot run off the
   viewport. */
.dmp-panel { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 40;
  width: max-content; min-width: min(240px, 100vw - 32px); max-width: min(360px, 92vw);
  max-height: min(320px, 60vh); display: flex; flex-direction: column; padding: 4px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
  box-shadow: var(--dsw-elevation-prominent, 0 8px 28px rgba(0,0,0,.18));
  color: var(--dsw-alias-label-primary); overflow: hidden; }
.dmp-search { flex: none; padding: 0 0 4px; }
.dmp-search input { width: 100%; box-sizing: border-box; padding: 5px 7px; font: inherit; font-size: 12.5px;
  color: var(--dsw-alias-label-primary); background: transparent;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md, 8px); outline: none; }
.dmp-search input:focus-visible { border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.dmp-list { flex: 1; overflow-y: auto; }
.dmp-group { padding: 6px 7px 2px; font-size: 11px; letter-spacing: .04em;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-item { display: flex; align-items: center; gap: 6px; width: auto; min-width: 100%; box-sizing: border-box;
  min-height: 34px; padding: 5px 7px; border: 0; border-radius: var(--dsw-radius-md, 8px);
  background: transparent; cursor: pointer; text-align: left;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
.dmp-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-item-current { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.dmp-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-item-note { margin-left: auto; padding-left: 8px; font-size: 11px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
/* The level list holds short labels, so it stays narrower than the model list.
   It also anchors to its own right edge: the control sits near the right side of
   the composer row, so a left-anchored panel would run off the viewport. */
.dmp-panel-narrow { left: auto; right: 0; min-width: min(160px, 60vw); max-width: min(220px, 80vw);
  max-height: min(260px, 50vh); }
.dmp-note { padding: 8px 7px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dmp-note-error { color: var(--dsw-alias-state-error-primary); }
.dmp-retry { margin-top: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm, 6px); background: transparent; color: inherit;
  font: inherit; font-size: 12px; cursor: pointer; }
`
