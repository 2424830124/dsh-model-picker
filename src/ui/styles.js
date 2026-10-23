/**
 * The picker's stylesheet.
 *
 * Host theme tokens only, plus the two composer variables the row sets when its
 * controls no longer fit on one line. Every class is prefixed `dmp-` so a copied
 * host pattern can never collide with the host's own rules.
 */
export const CSS = `
.dmp-root { position: relative; display: flex; align-items: center; gap: 2px; min-width: 0; }
/* One popover anchor per control: the model list and the level list open above
   their own button and never overlap each other. */
.dmp-control { position: relative; display: flex; align-items: center; min-width: 0; }
.dmp-trigger { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: min(360px, 45cqw);
  height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 13px; line-height: 20px; }
.dmp-trigger-effort { max-width: min(150px, 28cqw); padding: 0 4px 0 6px; font-size: 12px;
  color: var(--dsw-alias-label-secondary); }
.dmp-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-trigger:disabled { color: var(--dsw-alias-state-idle-primary); cursor: default; }
.dmp-trigger-icon { display: var(--dsh-composer-model-icon-display, none); flex: none; }
.dmp-trigger-text { display: var(--dsh-composer-model-text-display, block);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-chevron { flex: none; color: var(--dsw-alias-label-secondary); transition: transform .12s; }
.dmp-chevron-open { transform: rotate(180deg); }
.dmp-panel { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 40;
  width: min(420px, 84vw); max-height: 320px; display: flex; flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
  box-shadow: 0 8px 28px rgba(0,0,0,.18); overflow: hidden; }
.dmp-search { flex: none; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dmp-search input { width: 100%; box-sizing: border-box; padding: 6px 8px; font: inherit; font-size: 12.5px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2, transparent);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; outline: none; }
.dmp-search input:focus-visible { border-color: var(--dsw-alias-brand-primary); }
.dmp-list { flex: 1; overflow-y: auto; padding: 4px 0 6px; }
.dmp-group { padding: 6px 12px 2px; font-size: 11px; letter-spacing: .04em;
  color: var(--dsw-alias-label-secondary); }
.dmp-item { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
  padding: 6px 12px; border: 0; background: transparent; cursor: pointer; text-align: left;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
.dmp-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dmp-item-current { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.dmp-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-item-note { margin-left: auto; padding-left: 8px; font-size: 11px;
  color: var(--dsw-alias-label-secondary); }
/* The level list holds short labels, so it stays narrow and tight. */
.dmp-panel-narrow { width: min(220px, 60vw); max-height: 260px; }
.dmp-note { padding: 10px 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dmp-note-error { color: var(--dsw-alias-state-error-primary); }
.dmp-retry { margin-top: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
`
