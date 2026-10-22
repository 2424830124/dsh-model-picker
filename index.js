/**
 * Host half of the model-picker bundle.
 *
 * Everything this plugin does happens in the browser: it shadows the composer's
 * model slot, re-declares that slot's inline label child so other plugins'
 * decorations still render, and talks to the Host through the existing Client
 * remotes (`session.modelCatalog`, `session.selectModel`). A Host half exists
 * because a bundle needs one; it registers nothing.
 */
export function apply() {}
