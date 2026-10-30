/**
 * Offline checks for the model-picker client half.
 *
 * This plugin is a UI replacement only: the data layer is the shipped
 * `ui-model-selection` implementation, reached through its `modelDirectories`
 * service. The contract to verify is therefore narrow and specific:
 *
 *  - it registers the composer seat BELOW the shipped priority (lowest renders),
 *  - it does NOT declare the `conversation.input.model.label` child: that child
 *    is already declared by the shipped occupant, and a second declaration
 *    throws, which takes the whole picker down,
 *  - it hands its component the SAME props bundle the shipped registration does,
 *  - it never registers a second directory service of its own,
 *  - the component renders from that bundle and submits selections through it.
 *
 * The sources live in `src/` and are concatenated into `client.js` by
 * `scripts/build.mjs`; this test imports the BUILT bundle, because that is what
 * the module loader serves.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import vm from 'node:vm'

const root = new URL('../../', import.meta.url)

// ---------------------------------------------------------------------------
// No shipped text file may start with a UTF-8 BOM.
// ---------------------------------------------------------------------------
// Checked BEFORE the manifest is parsed below, on purpose: a BOM makes
// `JSON.parse` fail with "Unexpected token '\uFEFF'", and the installer rejects
// the package and rolls the install back after the dependency was already
// resolved.
{
  const shipped = [
    'package.json', 'index.js', 'client.js', 'cordis.patch.yml',
    'README.md', 'AGENTS.md', 'icon.svg', 'LICENSE',
    'locale/en.json', 'locale/zh.json', 'scripts/build.mjs', 'test/unit/client.mjs'
  ]
  const walkSources = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
      if (entry.isDirectory()) walkSources(full)
      else shipped.push(decodeURIComponent(full.pathname.replace(/^.*\/dsh-model-picker\//, '')))
    }
  }
  walkSources(new URL('src/', root))
  for (const file of shipped) {
    const bytes = readFileSync(new URL(file, root))
    assert.ok(
      !(bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF),
      `${file} starts with a UTF-8 BOM — the installer's JSON.parse rejects package.json and rolls the install back`
    )
  }
}

const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

// The bundle must be built from the current sources: every source module carries
// a marker in the output, and no source may be newer than the bundle.
{
  const bundlePath = new URL('client.js', root)
  const bundle = readFileSync(bundlePath, 'utf8')
  const bundleTime = statSync(bundlePath).mtimeMs
  const sources = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) sources.push(full)
    }
  }
  walk(new URL('src/', root))
  assert.ok(sources.length >= 5, 'the source tree keeps its modules')
  for (const source of sources) {
    const name = decodeURIComponent(source.pathname.replace(/^.*\/dsh-model-picker\//, ''))
    assert.ok(bundle.includes(`//# module: ${name}`),
      `the bundle carries ${name} — run \`node scripts/build.mjs\` if this fails`)
    assert.ok(statSync(source).mtimeMs <= bundleTime + 1,
      `${name} is newer than client.js — rebuild the bundle`)
  }
}

// ---------------------------------------------------------------------------
// The bundle must be safe to execute as a CLASSIC script, twice in one page.
// ---------------------------------------------------------------------------
// The loader serves client.js as a classic script, so every top-level binding is
// a page-global lexical binding. Two failures follow from that, and neither is
// visible through the `import()` below — ESM gives the file module scope and
// caches the URL, which hides both:
//
//  - a second plugin bundle declaring one of these names would fail to parse,
//  - executing this bundle twice in one page throws
//    `Identifier '…' has already been declared` before any of it runs.
//
// The generated wrapper (`(() => { … })()`) keeps the scope private, so a second
// execution parses. It is NOT a no-op: the loader still rejects a duplicate
// `load()` for the same id — deliberately, see its own message, "bundle executed
// twice without invalidate?" — so this checks the PARSE, not registration.
{
  const bundle = readFileSync(new URL('client.js', root), 'utf8')
  let registrations = 0
  const sandbox = {
    window: {
      __ModuleLoader__: { load: () => { registrations += 1 } },
      addEventListener: () => {}
    },
    console: { error: () => {} },
    fetch: () => Promise.resolve()
  }
  sandbox.globalThis = sandbox
  const context = vm.createContext(sandbox)

  vm.runInContext(bundle, context, { filename: 'client.js' })
  assert.equal(registrations, 1, 'one execution registers the factory once')

  // The regression this guards: before the wrapper, this second call threw
  // `SyntaxError: Identifier 'CAPTION_VIEWBOX' has already been declared`, which
  // is what the host log showed on every page that re-ran the entry.
  assert.doesNotThrow(
    () => vm.runInContext(bundle, context, { filename: 'client.js' }),
    'executing the bundle twice in one realm must not be a redeclaration error'
  )
}

// ---------------------------------------------------------------------------
// A React small enough to run the component, in order, twice.
// ---------------------------------------------------------------------------
const hookState = []
let hookIndex = 0

const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat().filter((child) => child !== null && child !== undefined && child !== false)
  }),
  useState: (init) => {
    const at = hookIndex++
    if (!(at in hookState)) hookState[at] = typeof init === 'function' ? init() : init
    return [hookState[at], (next) => { hookState[at] = typeof next === 'function' ? next(hookState[at]) : next }]
  },
  useEffect: (fn) => { hookIndex += 1; fn() },
  useRef: (init) => {
    const at = hookIndex++
    if (!(at in hookState)) hookState[at] = { current: init }
    return hookState[at]
  },
  useMemo: (factory) => { hookIndex += 1; return factory() },
  useCallback: (fn) => { hookIndex += 1; return fn }
}

/** The catalogue a session directory hands its component. */
const catalog = {
  default: { provider: 'workbuddy-cn', model: 'hy3' },
  groups: [
    { id: 'workbuddy-cn', name: 'WorkBuddy (Mainland)', models: [
      { id: 'hy3', name: 'Hy3', reasoning: { efforts: [{ id: 'low', name: '快速' }, { id: 'high', name: '深思' }], defaultEffort: 'low' } },
      { id: 'glm-5.3', name: 'GLM-5.3' }
    ] },
    { id: 'deepseek-account', name: 'DeepSeek', models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }] }
  ],
  failures: []
}

/** A session directory shaped exactly like the shipped one. */
function createDirectory(initial) {
  let state = {
    current: initial?.current ?? null,
    routable: true,
    groups: catalog.groups,
    failures: [],
    status: 'ready',
    pending: null,
    error: null
  }
  const listeners = new Set()
  const publish = () => { for (const fn of [...listeners]) fn() }
  return {
    store: {
      getSnapshot: () => state,
      subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }
    },
    load: async () => {},
    select: async (selection) => {
      state = { ...state, current: selection, status: 'ready', pending: null }
      publish()
      return { ok: true, value: undefined }
    },
    // Test-only: let a scenario move the directory without going through select.
    __set: (next) => { state = { ...state, ...next }; publish() }
  }
}

const sessions = {
  subagentAddress: (id) => String(id).startsWith('sub-') ? 'addr' : undefined
}

globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {}, textContent: '', appendChild: () => {} }),
  head: { appendChild: () => {} },
  body: { appendChild: () => {} }
}
globalThis.window = { __ModuleLoader__: { load: (definition) => { globalThis.__picker = definition } } }

// Load whatever `exports["./client"]` points at: that is what the installer serves.
const clientEntry = pkg.exports['./client'].replace(/^\.\//, '')
await import(new URL(clientEntry, root).href)

const loaded = globalThis.__picker
assert.ok(loaded, 'the client half registers itself with the module loader')
assert.equal(loaded.id, pkg.name, 'the factory id is the package name')

const plugin = loaded.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

// The seat declares the services it reads — plus the ones the directory resolver
// reads on our behalf.
//
// `remote` / `remote.session` are not referenced anywhere in src/. They still have to
// be declared: `models.directoryFor()` runs inside this entry's fiber, and Cordis only
// hands a fiber the services it declared. Dropping them made every call throw
// `cannot get property "remote.session" without inject`; the renderer then retired
// the entry and painted the shipped picker, so the plugin appeared to vanish.
assert.ok(Array.isArray(plugin.inject), 'the client half declares its service dependencies')
for (const service of ['locale', 'sessions', 'slots', 'remote', 'remote.session']) {
  assert.ok(plugin.inject.includes(service), `it waits for "${service}"`)
}
assert.ok(!plugin.inject.includes('commandUi'),
  'it does not wait for "commandUi": this plugin contributes no /model command')

/**
 * The locale service, shaped like the shipped one.
 *
 * `getSnapshot()` returns `{ active, locales, revision }` — there is no `locale`
 * field. An earlier mock returned `{ locale }`, which is why a broken field read
 * here went unnoticed: the fake agreed with the bug.
 */
const makeLocaleService = (locale) => ({
  getSnapshot: () => ({ active: locale, locales: [], revision: 0 }),
  subscribe: () => () => {}
})

/**
 * A plugin context stub.
 *
 * Only `get` and `inject` are exercised. `plugin` and `provide` are tripwires:
 * the plugin must never mount a second directory resolver nor provide the
 * `modelDirectories` name, because both would fight the shipped one.
 */
function makeContext({ slots, models, locale = 'zh-CN' }) {
  const provided = []
  const localeService = makeLocaleService(locale)
  const ctx = {
    get: (name) => name === 'locale' ? localeService
      : name === 'sessions' ? sessions
      : name === 'slots' ? slots
      : name === 'modelDirectories' ? models
      : undefined,
    inject: (deps, callback) => {
      assert.ok(deps.includes('slots'), 'the registration waits for the slot registry')
      assert.ok(deps.includes('modelDirectories'), 'the registration waits for the directory service')
      callback(ctx)
      return () => {}
    },
    plugin: () => { throw new Error('this plugin must not mount a directory service of its own') },
    provide: (name) => { provided.push(name); return () => {} }
  }
  return { ctx, provided }
}

/**
 * Mount the plugin against a directory service and return its slot registration.
 *
 * `directoryFor` is the shipped service's entry point; the mock mirrors the
 * surface the registration actually uses.
 */
function mount({ directory, locale = 'zh-CN' } = {}) {
  const registrations = []
  const slots = {
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
    inject: (slot, callback) => {
      assert.equal(slot, 'conversation.input.model')
      callback()
      return () => {}
    }
  }
  const models = {
    directoryFor: (sessionId) => (directory ?? createDirectory({ current: { provider: 'workbuddy-cn', model: 'hy3' } }))
  }
  const { ctx, provided } = makeContext({ slots, models, locale })
  plugin.apply(ctx)
  assert.deepEqual(provided, [],
    'no service is provided: a second modelDirectories would fight the shipped one')
  assert.equal(registrations.length, 1, 'the composer seat is registered exactly once')
  return registrations[0]
}

const { options, component } = mount()

// ---------------------------------------------------------------------------
// A second slot callback must not throw.
// ---------------------------------------------------------------------------
// `slots.inject` re-runs its callback when the slot's declaration changes. If that
// happens (for example after a composition reload), the previous registration must
// be released first: registering twice at the same priority throws
// `single slot "…" already has a registration`.
{
  const registrations = []
  let slotCallback = null
  const slots = {
    register: (opts) => { registrations.push(opts); return () => {} },
    inject: (slot, callback) => { slotCallback = callback; callback(); return () => {} }
  }
  const models = { directoryFor: () => ({ store: createDirectory(), load: async () => {}, select: async () => ({}) }) }
  const { ctx } = makeContext({ slots, models })
  plugin.apply(ctx)
  assert.equal(registrations.length, 1, 'the first slot callback registers the seat')

  // The registry fires the callback again: this must not throw, and must not
  // accumulate a second live registration.
  assert.doesNotThrow(() => slotCallback(), 'a repeat slot callback does not throw')
  assert.ok(registrations.length <= 2, 'a repeat callback does not pile up registrations')
}

// ---------------------------------------------------------------------------
// The locale snapshot is read through the right field.
// ---------------------------------------------------------------------------
// `LocaleRuntime.getLocale()` returns `{ active, locales, revision }`. The
// component used to read `snapshot.locale`, which does not exist, so every
// string fell back to Chinese no matter which language the shell used.
{
  const english = mount({ locale: 'en-US' })
  const injected = english.options.inject('session-1')
  assert.equal(injected.localeId, 'en-US',
    'the active locale is read from the snapshot\'s "active" field')
  assert.equal(typeof injected.localeSource?.getSnapshot, 'function',
    'the locale service is handed over as a live source, so a language switch is followed')
}

// ---------------------------------------------------------------------------
// The registration contract.
// ---------------------------------------------------------------------------
// LOWEST priority renders, so shadowing the shipped occupant (priority 0) means
// registering below it.
assert.ok(options.priority < 0, 'a priority below the shipped occupant is what shadows it')
assert.equal(options.name, 'conversation.input.model', 'it registers the composer model seat')

// The seat does NOT declare the label child.
//
// Declaring `conversation.input.model.label` bumps the slot's declaration epoch,
// which re-fires the `slots.inject` callback; the second `register` then throws
// `slot "…label" is already declared`, the throw escapes the slot callback, and the
// picker stops rendering altogether. The registry never clears a child declaration
// on dispose, so releasing and re-registering cannot avoid it either.
//
// The reference thinking-slider plugin registers without a children table for the
// same reason. The trade-off is real — provider badges mounted on that child no
// longer render here — but a working picker without badges beats no picker.
assert.equal(options.children, undefined,
  'the seat must not declare the label child: doing so re-fires the slot callback and throws')

// The props bundle must be the one the shipped registration produces.
{
  const injected = options.inject('session-1')
  assert.equal(injected.available, true, 'a normal session is offered the control')
  assert.ok(injected.directory, 'the seat receives the directory store')
  assert.equal(typeof injected.directory.getSnapshot, 'function', 'the store is a snapshot source')
  assert.equal(typeof injected.directory.subscribe, 'function', 'the store is subscribable')
  assert.equal(typeof injected.load, 'function', 'the seat can ask the directory to load')
  assert.equal(typeof injected.select, 'function', 'the seat can submit a selection')

  const state = injected.directory.getSnapshot()
  for (const field of ['current', 'routable', 'groups', 'failures', 'status', 'pending', 'error']) {
    assert.ok(Object.hasOwn(state, field), `the directory store carries "${field}"`)
  }

  assert.equal(options.inject('sub-1').available, false,
    'an addressed subagent session cannot change its model and is not offered the control')
}

// ---------------------------------------------------------------------------
// `select` passes the directory's result through unchanged.
// ---------------------------------------------------------------------------
// `ModelDirectory.select` resolves to `{ ok: true, value }` or
// `{ ok: false, error }`. The registration used to map that to a boolean, so the
// component's `result?.ok === true` test never held: the model switched, but the
// panel stayed open and a settled effort level dropped its draft.
{
  const okDirectory = createDirectory({ current: null })
  const okMount = mount({ directory: okDirectory })
  const okInject = okMount.options.inject('session-1')
  const okResult = await okInject.select({ provider: 'workbuddy-cn', model: 'hy3' })
  assert.equal(okResult?.ok, true, 'a successful selection keeps its { ok: true } shape')

  const failing = {
    ...createDirectory({ current: null }),
    select: async () => ({ ok: false, error: { code: 'session/writer-held', message: 'held' } })
  }
  const failMount = mount({ directory: failing })
  const failResult = await failMount.options.inject('session-1')
    .select({ provider: 'workbuddy-cn', model: 'hy3' })
  assert.equal(failResult?.ok, false, 'a rejected selection keeps its { ok: false } shape')
  assert.equal(failResult?.error?.code, 'session/writer-held', 'the failure detail survives, for the notice to show')
}

// ---------------------------------------------------------------------------
// The component: rendering and selection.
// ---------------------------------------------------------------------------
const props = {
  locked: false,
  ...options.inject('session-1')
}

/**
 * Flatten a tree, expanding any element whose `type` is a function component.
 *
 * The miniature React never runs function components on its own — it only stores
 * them as `type` — so a tree containing `h(EffortSlider, …)` would hide the slider
 * inside an unexpanded node. Expanding here keeps the assertions about what the
 * user actually sees.
 */
const expand = (node, depth = 0) => {
  if (Array.isArray(node)) return node.map((child) => expand(child, depth))
  if (node === null || typeof node !== 'object') return node
  if (typeof node.type === 'function' && depth < 8) {
    const rendered = node.type({ ...node.props, children: node.children })
    return expand(rendered, depth + 1)
  }
  return { ...node, children: (node.children ?? []).map((child) => expand(child, depth)) }
}

const collect = (node, out = []) => {
  const tree = expand(node)
  const walk = (current) => {
    if (Array.isArray(current)) { for (const child of current) walk(child); return }
    if (current === null || typeof current !== 'object') return
    out.push(current)
    for (const child of current.children ?? []) walk(child)
  }
  walk(tree)
  return out
}
/** Every string a tree renders, at any depth (children may be bare strings). */
const texts = (node) => {
  const tree = expand(node)
  if (typeof tree === 'string') return [tree]
  if (tree === null || typeof tree !== 'object') return []
  const kids = Array.isArray(tree) ? tree : (tree.children ?? [])
  return kids.flatMap((child) => texts(child))
}

// The trigger names the current model.
hookState.length = 0
hookIndex = 0
const tree = component(props)
assert.ok(texts(tree).some((text) => text.includes('Hy3')), 'the trigger names the current model')

// Two independent controls: the model list and the reasoning level. The model
// control opens a listbox; the level control opens a slider dialog.
const isTrigger = (node) => node.type === 'button' &&
  (node.props['aria-haspopup'] === 'listbox' || node.props['aria-haspopup'] === 'dialog')
const triggers = collect(tree).filter(isTrigger)
assert.equal(triggers.length, 2, 'the model and the reasoning level are two separate controls')

// Opening the model panel offers every model, grouped by provider.
triggers[0].props.onClick()
hookIndex = 0
const openTree = component(props)
const optionButtons = collect(openTree).filter((node) => node.type === 'button' && node.props.role === 'option')
assert.equal(optionButtons.length, 3, 'every model of every group is offered')
assert.ok(texts(openTree).includes('WorkBuddy (Mainland)'), 'groups are labelled by provider')

// One card per provider, not one caption line in a flat column.
//
// Two providers routinely expose the same model names (the official catalogue
// lists a Flash under both DeepSeek and DeepSeek Account), and a flat list makes
// the boundary invisible. The card is the boundary, so it must exist per group,
// name its provider for the assistive tree, and own the group's option buttons.
{
  const cards = collect(openTree).filter((node) => node.props.role === 'group')
  assert.equal(cards.length, catalog.groups.length, 'every provider gets its own card')
  for (const card of cards) {
    assert.ok(typeof card.props['aria-label'] === 'string' && card.props['aria-label'].length > 0,
      'a card names the provider it groups')
    const options = collect(card).filter((node) => node.props.role === 'option')
    assert.equal(options.length, catalog.groups.find((group) => group.name === card.props['aria-label']).models.length,
      'a card holds exactly its own provider models')
  }
}
// ---------------------------------------------------------------------------
// Cards follow the SHIPPED provider order, with the companion plugin pinned first.
// ---------------------------------------------------------------------------
// The shipped picker does not list providers in catalogue order: it lifts
// `deepseek-account` and `deepseek-official` to the top and leaves everything else
// in registration order (`orderModelProviders`). Reproducing that here keeps the
// two lists agreeing — a user who learned the order in `/model` sees it again.
//
// One addition on top: the provider plugin this picker is built alongside is
// pinned above both, because its card is the one carrying the live balance, load
// and sign-in here. That is a deliberate divergence, so it is asserted explicitly
// rather than left implied by a fixture.
{
  const pinned = '@huai_xin/dsh-workbuddy'
  const orderDirectory = createDirectory({ current: { provider: `${pinned}/cn`, model: 'hy3' } })
  // Registered in an order that differs from the expected result in every way, so
  // a test that passed by accident (catalogue order, alphabetical order) fails.
  orderDirectory.__set({ groups: [
    { id: 'zeta-labs', name: 'Zeta Labs', models: [{ id: 'z1', name: 'Zeta One' }] },
    { id: 'deepseek-official', name: 'DeepSeek Official', models: [{ id: 'ds-off', name: 'DS Off' }] },
    { id: `${pinned}/intl`, name: 'WorkBuddy (Overseas)', models: [{ id: 'hy3', name: 'Hy3' }] },
    { id: 'alpha-co', name: 'Alpha Co', models: [{ id: 'a1', name: 'Alpha One' }] },
    { id: 'deepseek-account', name: 'DeepSeek', models: [{ id: 'ds-acc', name: 'DS Acc' }] },
    { id: `${pinned}/cn`, name: 'WorkBuddy (Mainland)', models: [{ id: 'hy3', name: 'Hy3' }] }
  ] })
  const orderMount = mount({ directory: orderDirectory })
  const orderProps = { ...props, ...orderMount.options.inject('session-1') }
  hookState.length = 0
  hookIndex = 0
  collect(orderMount.component(orderProps)).filter(isTrigger)[0].props.onClick()
  hookIndex = 0

  // Every read starts the hook cursor over: the mini React replays hooks by index,
  // so a render that begins mid-sequence reads another hook's slot and the tree
  // silently comes back in the wrong state.
  const render = () => {
    hookIndex = 0
    return orderMount.component(orderProps)
  }
  const cardTitles = () => collect(render())
    .filter((node) => node.props.role === 'group')
    .map((node) => node.props['aria-label'])

  assert.deepEqual(cardTitles(), [
    'WorkBuddy',
    'DeepSeek',
    'DeepSeek Official',
    'Zeta Labs',
    'Alpha Co'
  ], 'the pinned package leads, then the shipped two, then the catalogue order — merged cards keep one slot')

  // The pinned package is matched as a PREFIX, so both deployments land in the
  // same leading card and a third one would too, without an edit to the rule.
  // Inside the card the tabs keep catalogue order — this rule reorders cards, it
  // does not reorder the deployments a plugin registered.
  const lead = collect(render()).filter((node) => node.props.role === 'group')[0]
  assert.deepEqual(collect(lead)
    .filter((node) => String(node.props.className ?? '').split(' ').includes('dmp-card-tab'))
    .map((node) => node.children[0]), ['海外版', '大陆版'],
  'every deployment of the pinned package is in the leading card')

  // A search narrows the list but must not reshuffle it: the surviving card keeps
  // its place instead of jumping to the top as the only result.
  collect(render()).find((node) => node.type === 'input')
    .props.onChange({ target: { value: 'alpha' } })
  assert.deepEqual(cardTitles(), ['Alpha Co'],
    'a single match still reports its provider, so the ordering rule stays observable')
  collect(render()).find((node) => node.type === 'input')
    .props.onChange({ target: { value: '' } })
  assert.deepEqual(cardTitles(), [
    'WorkBuddy',
    'DeepSeek',
    'DeepSeek Official',
    'Zeta Labs',
    'Alpha Co'
  ], 'clearing the query restores the provider order')
}


// A client plugin has no writable Cordis config, so the durable store is the same
// localStorage the shipped client plugins use for their own UI state (sidebar
// width, composer drafts). A mount reads the set once; a toggle writes it back.
{
  const cells = new Map()
  globalThis.localStorage = {
    getItem: (key) => (cells.has(key) ? cells.get(key) : null),
    setItem: (key, value) => { cells.set(key, String(value)) },
    removeItem: (key) => { cells.delete(key) }
  }
  try {
    const foldMount = mount()
    const foldProps = { ...props, ...foldMount.options.inject('session-1') }
    hookState.length = 0
    hookIndex = 0
    collect(foldMount.component(foldProps)).filter(isTrigger)[0].props.onClick()
    hookIndex = 0
    const foldTree = foldMount.component(foldProps)
    const card = collect(foldTree).find((node) => node.props.role === 'group')
    // The shipped order, not the catalogue's: `deepseek-account` leads here
    // because this fixture's other provider is not under a pinned package. The
    // ordering rule itself is pinned in its own block below.
    assert.equal(card.props['aria-label'], 'DeepSeek', 'the first card follows the provider order')

    const toggle = collect(card).find((node) => node.type === 'button' && node.props['aria-expanded'] === true)
    assert.ok(toggle, 'an open card exposes a fold control')
    assert.equal(toggle.props.title, '收起', 'the control is labelled in the active language')

    toggle.props.onClick()
    hookIndex = 0
    const foldedTree = foldMount.component(foldProps)
    const foldedCard = collect(foldedTree).find((node) => node.props.role === 'group')
    assert.equal(collect(foldedCard).filter((node) => node.props.role === 'option').length, 0,
      'a folded card renders no model rows')
    assert.equal(cells.size, 1, 'the fold is written to storage')

    // The next start: a fresh mount reads the set back before any interaction.
    const nextMount = mount()
    const nextProps = { ...props, ...nextMount.options.inject('session-1') }
    hookState.length = 0
    hookIndex = 0
    collect(nextMount.component(nextProps)).filter(isTrigger)[0].props.onClick()
    hookIndex = 0
    const restored = nextMount.component(nextProps)
    const restoredCard = collect(restored).find((node) => node.props.role === 'group')
    assert.equal(collect(restoredCard).filter((node) => node.props.role === 'option').length, 0,
      'the fold survives a remount')

    // Searching opens every card for the duration of the query without discarding
    // the saved fold.
    hookIndex = 0
    const type = (text) => {
      hookIndex = 0
      const box = collect(nextMount.component(nextProps)).find((node) => node.type === 'input')
      box.props.onChange({ target: { value: text } })
      hookIndex = 0
      return nextMount.component(nextProps)
    }
    const searching = type('hy3')
    assert.ok(collect(searching).some((node) => node.props.role === 'option'),
      'a search shows matches even inside a folded card')
    const cleared = type('')
    assert.equal(collect(cleared).find((node) => node.props.role === 'group')
      .props.className.includes('dmp-card-folded'), true,
      'clearing the query restores the saved fold')

    // A fold control is not offered while a search forces the cards open.
    assert.ok(!collect(searching).some((node) => node.type === 'button'
      && String(node.props.className ?? '').includes('dmp-card-head')),
      'the header is not a fold control while searching')
  } finally {
    delete globalThis.localStorage
  }
}

// ---------------------------------------------------------------------------
// Providers registered under one package share a card, and their rows carry
// whatever that plugin publishes about them.
// ---------------------------------------------------------------------------
// The WorkBuddy plugin registers two providers for two deployments of one
// product. Two cards would mean two headers saying almost the same thing, two
// fold controls, and no way to compare the rows; the package prefix in the id is
// what groups them, so this file never learns the plugin's name.
{
  const pkg = '@huai_xin/dsh-workbuddy'
  const directory = createDirectory({ current: { provider: `${pkg}/cn`, model: 'hy3' } })
  directory.__set({ groups: [
    { id: `${pkg}/cn`, name: 'WorkBuddy (Mainland)', models: [
      { id: 'hy3', name: 'Hy3' },
      { id: 'pro', name: 'DeepSeek-V4-Pro' }
    ] },
    { id: `${pkg}/intl`, name: 'WorkBuddy (Overseas)', models: [
      { id: 'hy3', name: 'Hy3' }
    ] }
  ] })
  const mergedMount = mount({ directory })
  const accountCalls = []
  const renewCalls = []
  let refreshCalls = 0
  const mergedProps = {
    ...props,
    ...mergedMount.options.inject('session-1'),
    modelStateSource: {
      renew: async (region) => { renewCalls.push(region ?? null) },
      refresh: async () => { refreshCalls += 1 },
      refreshCredits: async (id) => { accountCalls.push(['credits', id]) },
      login: async (id) => { accountCalls.push(['login', id]) },
      getSnapshot: () => ({ version: 1, updatedAt: 1, providers: {
        [`${pkg}/cn`]: { region: 'cn', loggedIn: true, credits: 1666.68, models: {
          hy3: { name: 'Hy3', verdict: 'available', busy: 'idle', rate: 'free' },
          pro: { name: 'DeepSeek-V4-Pro', verdict: 'rate limited', busy: 'congested', rate: '0.23x' }
        } },
        [`${pkg}/intl`]: { region: 'intl', loggedIn: false, credits: 0, models: {
          hy3: { name: 'Hy3', verdict: 'unknown', busy: 'unknown', rate: 'unknown' }
        } }
      } }),
      subscribe: () => () => {}
    }
  }
  hookState.length = 0
  hookIndex = 0
  collect(mergedMount.component(mergedProps)).filter(isTrigger)[0].props.onClick()
  hookIndex = 0
  const mergedTree = mergedMount.component(mergedProps)
  assert.ok(refreshCalls >= 1,
    'opening the list asks the provider for fresh state instead of waiting for its poll')
  const cards = collect(mergedTree).filter((node) => node.props.role === 'group')
  assert.equal(cards.length, 1, 'two deployments of one package share one card')
  assert.equal(cards[0].props['aria-label'], 'WorkBuddy', 'the card is named by the shared prefix')
  assert.equal(cards[0].props['data-accent'], 'workbuddy', 'the provider plugin brings its own accent')
  assert.ok(!texts(cards[0]).includes(`${pkg}/cn`),
    'the header names the provider, it does not print the provider id')

  const tabs = collect(cards[0])
    .filter((node) => String(node.props.className ?? '').split(' ').includes('dmp-card-tab'))
  assert.deepEqual(tabs.map((node) => node.children[0]), ['大陆版', '海外版'],
    'a published region is named in the picker language, not the provider copy')
  assert.deepEqual(tabs.map((node) => node.props['aria-pressed']), [true, false],
    'the first deployment is the one showing')

  const mergedOptions = collect(cards[0]).filter((node) => node.props.role === 'option')
  assert.equal(mergedOptions.length, 2, 'only the deployment on screen renders its rows')
  assert.deepEqual(mergedOptions.map((node) => node.props.key),
    [`${pkg}/cn:pro`, `${pkg}/cn:hy3`],
    'a pick still carries the exact provider id it came from')
  assert.deepEqual(mergedOptions.map((node) => texts(node).join(' ').match(/DeepSeek-V4-Pro|Hy3/)?.[0]),
    ['DeepSeek-V4-Pro', 'Hy3'],
    'rows are listed by name, whatever order the provider registered them in')

  // Switching the tab swaps the rows, and the pick carries the other provider id.
  tabs[1].props.onClick()
  hookIndex = 0
  const overseasTree = mergedMount.component(mergedProps)
  const overseasCard = collect(overseasTree).filter((node) => node.props.role === 'group')[0]
  const overseasOptions = collect(overseasCard).filter((node) => node.props.role === 'option')
  assert.deepEqual(overseasOptions.map((node) => node.props.key), [`${pkg}/intl:hy3`],
    'the second tab lists that deployment and nothing else')

  // The account line under each tab: the balance for a signed-in deployment, a
  // way in for a signed-out one. Both actions belong to the provider plugin.
  {
    const credits = collect(mergedTree).filter((node) => String(node.props.className ?? '').includes('dmp-card-credits'))
    assert.deepEqual(credits.map((node) => node.children[0]), ['积分 1666.68'],
      'a signed-in deployment shows its balance')
    const login = collect(mergedTree).filter((node) => String(node.props.className ?? '').includes('dmp-card-login'))
    assert.deepEqual(login.map((node) => node.children[0]), ['登录'],
      'a signed-out deployment offers a sign-in')
    const refresh = collect(mergedTree).filter((node) => String(node.props.className ?? '').includes('dmp-card-refresh'))
    assert.equal(refresh.length, 1, 'only the signed-in deployment has a balance to refresh')

    await refresh[0].props.onClick()
    await login[0].props.onClick()
    assert.deepEqual(accountCalls, [['credits', `${pkg}/cn`], ['login', `${pkg}/intl`]],
      'the header calls the provider service with the exact provider id')

    // The renewal is a card-level action: one deployment means its own id, several
    // mean "every deployment this plugin manages".
    const renew = collect(mergedTree).filter((node) => String(node.props.className ?? '').includes('dmp-card-renew'))
    assert.deepEqual(renew.map((node) => node.children[0]), ['续期'],
      'the card header offers a renewal next to the fold control')
    await renew[0].props.onClick()
    assert.deepEqual(renewCalls, [null], 'a merged card renews every deployment it holds')
  }

  // A provider that publishes state asynchronously: before the first snapshot the
  // rows say "unknown" and the balance says "loading", so nothing appears late.
  {
    const loadingProps = {
      ...props,
      ...mergedMount.options.inject('session-1'),
      modelStateSource: {
        getSnapshot: () => ({ version: 1, updatedAt: 0, providers: {} }),
        subscribe: () => () => {},
        refresh: async () => {}
      }
    }
    hookState.length = 0
    hookIndex = 0
    collect(mergedMount.component(loadingProps)).filter(isTrigger)[0].props.onClick()
    hookIndex = 0
    const loadingTree = mergedMount.component(loadingProps)
    const loadingTails = collect(loadingTree)
      .filter((node) => String(node.props.className ?? '').split(' ').includes('dmp-item-tail'))
      .map((node) => node.children[0])
    assert.deepEqual(loadingTails, ['未知', '未知'], 'an unloaded row still shows a value slot')
    const loadingDots = collect(loadingTree)
      .filter((node) => String(node.props.className ?? '').includes('dmp-item-dot'))
      .map((node) => node.props['data-tone'])
    assert.deepEqual(loadingDots, ['unknown', 'unknown'], 'the load dot is grey, not absent')
    const loadingCredits = collect(loadingTree)
      .filter((node) => String(node.props.className ?? '').includes('dmp-card-credits'))
      .map((node) => node.children[0])
    assert.deepEqual(loadingCredits, ['积分 加载中…', '积分 加载中…'],
      'the balance says it is loading instead of showing a dash')
  }

  // No provider publishes state at all: plain rows, no invented "unknown".
  {
    const plainProps = { ...props, ...mergedMount.options.inject('session-1') }
    delete plainProps.modelStateSource
    hookState.length = 0
    hookIndex = 0
    collect(mergedMount.component(plainProps)).filter(isTrigger)[0].props.onClick()
    hookIndex = 0
    const plainTree = mergedMount.component(plainProps)
    assert.equal(collect(plainTree)
      .filter((node) => String(node.props.className ?? '').includes('dmp-item-tail')).length, 0,
    'a provider without state keeps plain rows')
  }

  // A signed-out deployment registers no models, so the catalogue drops it. Its
  // plugin still publishes it, and the tab has to come back — otherwise signing
  // out leaves no way to sign in again from this list.
  {
    const signedOut = createDirectory({ current: { provider: `${pkg}/cn`, model: 'hy3' } })
    signedOut.__set({ groups: [
      { id: `${pkg}/cn`, name: 'WorkBuddy (Mainland)', models: [{ id: 'hy3', name: 'Hy3' }] }
    ] })
    const signedMount = mount({ directory: signedOut })
    const signedProps = {
      ...props,
      ...signedMount.options.inject('session-1'),
      modelStateSource: {
        getSnapshot: () => ({ version: 1, updatedAt: 9, providers: {
          [`${pkg}/cn`]: { region: 'cn', loggedIn: true, credits: 10, models: {
            hy3: { name: 'Hy3', verdict: 'available', busy: 'idle', rate: 'free' }
          } },
          [`${pkg}/intl`]: { region: 'intl', loggedIn: false, credits: null, models: {} }
        } }),
        subscribe: () => () => {},
        refresh: async () => {},
        login: async () => {},
        refreshCredits: async () => {}
      }
    }
    hookState.length = 0
    hookIndex = 0
    collect(signedMount.component(signedProps)).filter(isTrigger)[0].props.onClick()
    hookIndex = 0
    const signedTree = signedMount.component(signedProps)
    const signedCard = collect(signedTree).filter((node) => node.props.role === 'group')[0]
    const signedTabs = collect(signedCard)
      .filter((node) => String(node.props.className ?? '').split(' ').includes('dmp-card-tab'))
      .map((node) => node.children[0])
    assert.deepEqual(signedTabs, ['大陆版', '海外版'], 'a signed-out deployment keeps its tab')
    const signIn = collect(signedCard)
      .filter((node) => String(node.props.className ?? '').includes('dmp-card-login'))
    assert.deepEqual(signIn.map((node) => node.children[0]), ['登录'],
      'and with it the way back in')
  }

  // Right after signing in, the credentials exist but the catalogue has not
  // registered the models yet. The card must survive that window instead of
  // vanishing; the tab says there is nothing to pick yet.
  {
    const mid = createDirectory({ current: { provider: `${pkg}/cn`, model: 'hy3' } })
    mid.__set({ groups: [
      { id: `${pkg}/cn`, name: 'WorkBuddy 大陆版', models: [{ id: 'hy3', name: 'Hy3' }] }
    ] })
    const midMount = mount({ directory: mid })
    const midProps = {
      ...props,
      ...midMount.options.inject('session-1'),
      modelStateSource: {
        getSnapshot: () => ({ version: 1, updatedAt: 11, providers: {
          [`${pkg}/cn`]: { region: 'cn', loggedIn: true, credits: 5, models: {
            hy3: { name: 'Hy3', verdict: 'available', busy: 'idle', rate: 'free' }
          } },
          [`${pkg}/intl`]: { region: 'intl', loggedIn: true, credits: 0, models: {} }
        } }),
        subscribe: () => () => {},
        refresh: async () => {},
        login: async () => {},
        refreshCredits: async () => {}
      }
    }
    hookState.length = 0
    hookIndex = 0
    collect(midMount.component(midProps)).filter(isTrigger)[0].props.onClick()
    hookIndex = 0
    const midTree = midMount.component(midProps)
    const midCard = collect(midTree).filter((node) => node.props.role === 'group')[0]
    assert.ok(midCard !== undefined, 'the card survives the gap between sign-in and registration')
    assert.deepEqual(collect(midCard)
      .filter((node) => String(node.props.className ?? '').split(' ').includes('dmp-card-tab'))
      .map((node) => node.children[0]), ['大陆版', '海外版'],
    'both deployments keep their tab while the catalogue catches up')
  }

  // A card with one deployment has no tab strip; its balance still shows.
  {
    const solo = createDirectory({ current: { provider: 'solo', model: 'a' } })
    solo.__set({ groups: [{ id: 'solo', name: 'Solo', models: [{ id: 'a', name: 'A' }] }] })
    const soloMount = mount({ directory: solo })
    const soloProps = {
      ...props,
      ...soloMount.options.inject('session-1'),
      modelStateSource: {
        getSnapshot: () => ({ version: 1, updatedAt: 3, providers: {
          solo: { loggedIn: true, credits: 42, models: { a: { name: 'A', verdict: 'available', busy: 'idle', rate: 'free' } } }
        } }),
        subscribe: () => () => {},
        refresh: async () => {},
        login: async () => {},
        refreshCredits: async () => {}
      }
    }
    hookState.length = 0
    hookIndex = 0
    collect(soloMount.component(soloProps)).filter(isTrigger)[0].props.onClick()
    hookIndex = 0
    const soloTree = soloMount.component(soloProps)
    const soloCredits = collect(soloTree)
      .filter((node) => String(node.props.className ?? '').includes('dmp-card-credits'))
    assert.deepEqual(soloCredits.map((node) => node.children[0]), ['积分 42'],
      'a single-deployment card still shows its balance')
    assert.equal(collect(soloTree)
      .filter((node) => String(node.props.className ?? '').includes('dmp-card-account-solo')).length, 1,
    'and the row sits under the header rather than in a missing tab strip')
  }

  // The tail: a callable model shows what it costs, a broken one shows why.
  const tails = collect(cards[0])
    .filter((node) => String(node.props.className ?? '').includes('dmp-item-tail'))
    .map((node) => node.children[0])
  assert.deepEqual(tails, ['限流', '免费'],
    'free is translated, and a verdict replaces the rate')
  assert.ok(!collect(cards[0]).some((node) => node.children?.[0] === '0.23x'),
    'an unusable model does not advertise its price')

  // The dot is the load level: reported levels are coloured, an unreported one is
  // grey rather than absent, so every decorated row keeps its shape.
  const dots = collect(cards[0]).filter((node) => String(node.props.className ?? '').includes('dmp-item-dot'))
  assert.deepEqual(dots.map((node) => node.props['data-tone']), ['congested', 'idle'],
    'the active deployment shows its reported load levels')
  assert.deepEqual(dots.map((node) => node.props.title), ['极度拥堵', '空闲'],
    'the tooltip names the degree the colour carries')
  const overseasDots = collect(overseasCard)
    .filter((node) => String(node.props.className ?? '').includes('dmp-item-dot'))
  assert.deepEqual(overseasDots.map((node) => node.props['data-tone']), ['unknown'],
    'a deployment that reports no load still gets a grey dot')
  assert.equal(overseasDots[0].props.title, '未知', 'and says so on hover')

  // A search drops the tabs so a match in the hidden deployment is not swallowed.
  hookIndex = 0
  const typeIn = (text) => {
    const box = collect(mergedMount.component(mergedProps)).find((node) => node.type === 'input')
    box.props.onChange({ target: { value: text } })
    hookIndex = 0
    return mergedMount.component(mergedProps)
  }
  const searched = typeIn('hy3')
  assert.equal(collect(searched)
    .filter((node) => String(node.props.className ?? '').split(' ').includes('dmp-card-tab')).length, 0,
    'the tab strip is gone while searching')
  assert.equal(collect(searched).filter((node) => node.props.role === 'option').length, 2,
    'both deployments can match a search')
  assert.deepEqual(collect(searched)
    .filter((node) => String(node.props.className ?? '').includes('dmp-card-section-label'))
    .map((node) => node.children[0]), ['大陆版', '海外版'],
    'without tabs, a caption says which deployment a row came from')
}

const searchBox = collect(openTree).find((node) => node.type === 'input')
assert.equal(searchBox?.props.placeholder, '搜索模型', 'the search box is localised')

// Selecting submits the full triple through the injected `select`, which is the
// shipped directory's own entry point. The component is never handed the Host
// remote, so there is no second path it could take — the pass-through contract is
// asserted separately where the registration is exercised.
await optionButtons[1].props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))

// A successful pick KEEPS the list open: picking is a comparison, not a commit.
{
  hookIndex = 0
  const afterPick = component(props)
  const stillOpen = collect(afterPick).find((node) => node.props.role === 'listbox')
  assert.ok(stillOpen !== undefined, 'choosing a model leaves the list open')
}

// ---------------------------------------------------------------------------
// Search ranks like the shipped menus, not by plain substring.
// ---------------------------------------------------------------------------
// `gpt61` cannot be a substring of `GPT-6.1-Sol`, but it IS an ordered
// subsequence — which is exactly what the host's own `/` menu accepts. The
// ranking is vendored from `rankByName` so the results match it step for step.
{
  const directory = createDirectory({ current: { provider: 'test', model: 'gpt61' } })
  directory.__set({ groups: [{ id: 'test', name: 'Test', models: [
    { id: 'gpt61', name: 'GPT-6.1-Sol' },
    { id: 'hy3', name: 'Hy3' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }
  ] }] })
  const searchMount = mount({ directory })
  const searchProps = { ...props, ...searchMount.options.inject('session-1') }
  hookState.length = 0
  hookIndex = 0
  collect(searchMount.component(searchProps)).filter(isTrigger)[0].props.onClick()

  const type = (text) => {
    hookIndex = 0
    const box = collect(searchMount.component(searchProps)).find((node) => node.type === 'input')
    box.props.onChange({ target: { value: text } })
    hookIndex = 0
    return collect(searchMount.component(searchProps))
      .filter((node) => node.props.role === 'option')
      .map((node) => texts(node).join(''))
  }

  assert.deepEqual(type('gpt61'), ['GPT-6.1-Sol'],
    'a query that only matches as a subsequence still finds the model')
  assert.deepEqual(type('dsp'), ['DeepSeek V4 Pro'],
    'the model id is a second search key beside the display name')
  assert.deepEqual(type('  '), ['DeepSeek V4 Pro', 'GPT-6.1-Sol', 'Hy3'],
    'a blank query restores the full list, sorted by name')
  assert.deepEqual(type('zzz'), [], 'a query that matches nothing yields no rows')
}

// The level control shows the level in effect, and opening it reveals a slider
// over the model's declared levels. A fresh mount is used because the click above
// moved the directory's current selection to a model with no reasoning metadata.
{
  const levelMount = mount()
  const levelProps = { ...props, ...levelMount.options.inject('session-1') }
  hookState.length = 0
  hookIndex = 0
  const levelTree = levelMount.component(levelProps)
  const levelTrigger = collect(levelTree).filter(isTrigger)[1]
  assert.ok(texts(levelTree).some((text) => text.includes('快速')),
    'the level control shows the level in effect (the adapter default)')

  levelTrigger.props.onClick()
  hookIndex = 0
  const levelPanel = levelMount.component(levelProps)
  // The slider is a real range input; its max is the last level index.
  const range = collect(levelPanel).find((node) => node.type === 'input' && node.props.type === 'range')
  assert.ok(range, 'the level control is a slider')
  assert.equal(range.props.max, 1, 'the slider spans the two levels the model declares')
  assert.equal(range.props.defaultValue, 0, 'the slider sits on the level in effect')
  assert.equal(range.props['aria-label'], '思考强度', 'the slider has a localised accessible name')
  assert.equal(range.props['aria-valuetext'], '快速', 'screen readers receive the current level name')
  // The input is a native range, so arrow keys / Home / End work without extra
  // handlers; what matters is that it is enabled and reports every stop.
  assert.equal(range.props.disabled, false, 'a normal session can adjust the level')
  assert.equal(typeof range.props.onInput, 'function', 'every stop the pointer passes is reported')
  const ticks = collect(levelPanel).filter((node) => node.props.className?.includes('dmp-slider-tick'))
  assert.equal(ticks.length, 2, 'each declared effort remains a clickable label')
  assert.equal(ticks[0].props['aria-pressed'], true, 'the active level is addressable')
  assert.equal(ticks[1].props['aria-pressed'], false, 'inactive levels are not announced as selected')
  assert.equal(ticks[0].props['data-edge'], 'start', 'the first label stays inside the popover')
  assert.equal(ticks[1].props['data-edge'], 'end', 'the last label stays inside the popover')
  assert.ok(texts(levelPanel).includes('更高的强度通常需要更多思考时间。'), 'the effort hint is localised')
  assert.ok(texts(levelPanel).some((text) => text.includes('深思')),
    'every declared level is labelled under the rail')

  // Dragging the slider submits ONCE, on release, and must NOT close the panel.
  // Two earlier bugs are pinned here: closing on the first stop made the popover
  // vanish before the animation played, and committing on every `input` event
  // queued a Host request per stop while the directory flipped to `selecting`.
  let submitted
  const recording = {
    ...levelProps,
    select: async (selection) => { submitted = selection; return { ok: true, value: undefined } }
  }
  hookIndex = 0
  const dragging = levelMount.component(recording)
  const dragRange = collect(dragging).find((node) => node.type === 'input' && node.props.type === 'range')

  // Moving the pointer reports the stop for the visuals, without a Host call.
  dragRange.props.onInput({ target: { value: '1' } })
  assert.equal(submitted, undefined, 'a drag in progress does not submit anything')

  // Releasing commits exactly once.
  await dragRange.props.onChange({ target: { value: '1' } })
  assert.deepEqual(submitted, { provider: 'workbuddy-cn', model: 'hy3', reasoningEffort: 'high' },
    'releasing the slider submits the level it landed on, with the current model')

  // The panel is still open: the slider is still in the tree after the change.
  hookIndex = 0
  const afterDrag = levelMount.component(recording)
  assert.ok(collect(afterDrag).some((node) => node.type === 'input' && node.props.type === 'range'),
    'the level popover stays open after a level change')
}

// The thumb tracks the pointer DURING a drag, before any Host round trip.
//
// This is the "slider does not follow the mouse" regression: the painted thumb
// used to be positioned from the confirmed selection, which only changes after the
// Host answers, so it snapped back on every render. The slider now owns a drag
// position of its own; `onInput` must move it without submitting anything.
{
  const liveMount = mount()
  const liveProps = { ...props, ...liveMount.options.inject('session-1') }
  let submitted
  const recording = {
    ...liveProps,
    select: async (selection) => { submitted = selection; return { ok: true, value: undefined } }
  }
  hookState.length = 0
  hookIndex = 0
  // Open the level popover.
  collect(liveMount.component(recording)).filter(isTrigger)[1].props.onClick()

  hookIndex = 0
  const open = liveMount.component(recording)
  const range = collect(open).find((node) => node.type === 'input' && node.props.type === 'range')
  assert.equal(range.props.defaultValue, 0, 'the slider starts on the confirmed level')

  // Move the pointer to the last stop: visuals must follow, Host must not be called.
  hookIndex = 0
  const beforeMove = liveMount.component(recording)
  const liveRange = collect(beforeMove).find((node) => node.type === 'input' && node.props.type === 'range')
  liveRange.props.onInput({ target: { value: '1' } })
  assert.equal(submitted, undefined, 'a drag in progress does not submit anything')

  hookIndex = 0
  const moved = liveMount.component(recording)
  const slider = collect(moved).find((node) => typeof node.props.className === 'string'
    && node.props.className.split(' ').includes('dmp-slider'))
  assert.equal(slider?.props.style['--dmp-effort-at'], '100%',
    'the thumb follows the pointer before the Host confirms')
  assert.ok(String(slider?.props.className).includes('dmp-slider-dragging'),
    'a drag is flagged so the knob, fill and emitter snap instead of easing')
}

// Switching models starts the new model at ITS default level.
//
// `selection.reasoningEffort` belongs to the SESSION, not the model. After a
// switch it still carries the previous model's level, and two things go wrong if
// that value is inherited:
//
//  - the new model may not declare it at all, so the tag rendered blank and
//    looked like the control had disappeared;
//  - even when both models declare it, inheriting silently starts the new model
//    at a level the user never chose for it.
//
// Both cases are covered here: `xhigh` (not declared by the target) and `high`
// (declared by both, still must not be inherited).
{
  const switchTo = (previousLevel) => {
    const directory = createDirectory({ current: { provider: 'test', model: 'reasoner', reasoningEffort: previousLevel } })
    directory.__set({ groups: [{ id: 'test', models: [{ id: 'reasoner', name: 'Reasoner',
      reasoning: {
        efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
        defaultEffort: 'low'
      } }] }] })
    const mounted = mount({ directory })
    const viewProps = { ...props, ...mounted.options.inject('session-1') }
    // First render teaches the component which model it is showing.
    hookState.length = 0
    hookIndex = 0
    mounted.component(viewProps)
    // The session moves to a DIFFERENT model; its level set has a default of low.
    directory.__set({ current: { provider: 'test', model: 'other', reasoningEffort: previousLevel } })
    directory.__set({ groups: [{ id: 'test', models: [{
      id: 'other',
      name: 'Other',
      reasoning: {
        efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
        defaultEffort: 'low'
      }
    }] }] })
    hookIndex = 0
    return collect(mounted.component(viewProps))
  }

  const afterUndeclared = switchTo('xhigh')
  const tagA = afterUndeclared.filter(isTrigger)[1]
  assert.ok(tagA, 'the level tag is present for a model that declares levels')
  assert.equal(texts(tagA).join(''), 'Low',
    'a level the new model does not declare falls back to its default instead of rendering blank')

  const afterShared = switchTo('high')
  const tagB = afterShared.filter(isTrigger)[1]
  assert.equal(texts(tagB).join(''), 'Low',
    'a level the new model DOES declare is still not inherited across a model switch')
}

// A model that declares levels but NO default still shows one.
//
// `reasoningEfforts` can list stops without naming a default — the
// `openai-responses` models in a real profile do exactly that (five levels, no
// default). Reading `defaultEffort` verbatim left the id undefined, so the tag
// rendered with an empty label even though the slider had five stops. The first
// declared level is the fallback, because that is what an unspecified request uses.
{
  const directory = createDirectory({ current: { provider: 'test', model: 'sol', reasoningEffort: undefined } })
  directory.__set({ groups: [{ id: 'test', models: [{
    id: 'sol',
    name: 'GPT-6.1-Sol',
    reasoning: {
      // No `defaultEffort` at all — this is the shape that broke.
      efforts: [
        { id: 'low', name: 'Low' },
        { id: 'medium', name: 'Medium' },
        { id: 'high', name: 'High' },
        { id: 'xhigh', name: 'X-High' },
        { id: 'max', name: 'Max' }
      ]
    }
  }] }] })
  const mounted = mount({ directory })
  const viewProps = { ...props, ...mounted.options.inject('session-1') }
  hookState.length = 0
  hookIndex = 0
  const tree = mounted.component(viewProps)
  const tag = collect(tree).filter(isTrigger)[1]
  assert.ok(tag, 'the level tag is present when levels are declared without a default')
  assert.equal(texts(tag).join(''), 'Low',
    'a missing default falls back to the first declared level instead of rendering blank')
}

// The effort view also handles a lone stop, many stops, and a locked composer.
{
  const effortView = (efforts, activeId, locked = false, locale = 'zh-CN') => {
    const directory = createDirectory({ current: {
      provider: 'test', model: 'reasoner', reasoningEffort: activeId
    } })
    directory.__set({ groups: [{ id: 'test', models: [{ id: 'reasoner', name: 'Reasoner',
      reasoning: { efforts, defaultEffort: efforts[0]?.id } }] }] })
    const mounted = mount({ directory, locale })
    const viewProps = { ...props, ...mounted.options.inject('session-1'), locked }
    hookState.length = 0
    hookIndex = 0
    const trigger = collect(mounted.component(viewProps)).filter(isTrigger)[1]
    // Test setup opens the view even when the trigger is disabled, so the panel's
    // own disabled state is checked as well as the trigger's.
    trigger.props.onClick()
    hookIndex = 0
    return { trigger, nodes: collect(mounted.component(viewProps)), viewProps, mounted }
  }
  const one = effortView([{ id: 'high', name: 'High' }], 'high')
  const loneSlider = one.nodes.find((node) => node.props.className === 'dmp-slider')
  assert.equal(loneSlider.props.style['--dmp-effort-at'], '50%', 'a lone stop is centred')
  assert.equal(one.nodes.find((node) => node.props.type === 'range').props.disabled, true,
    'a lone effort has no draggable range')
  assert.equal(one.nodes.find((node) => node.props['aria-pressed'] === true).props['data-edge'], undefined,
    'a lone label is centred rather than edge-aligned')

  const levels = ['off', 'minimal', 'low', 'medium', 'high', 'max'].map((id) => ({ id, name: id }))
  const many = effortView(levels, 'max', true, 'en-US')
  const manyRange = many.nodes.find((node) => node.props.type === 'range')
  assert.equal(manyRange.props.max, 5, 'all six provider-declared levels remain available')
  assert.equal(manyRange.props.defaultValue, 5, 'the last level maps to the rail endpoint')
  assert.equal(manyRange.props['aria-label'], 'Reasoning effort', 'English effort copy is wired')
  assert.equal(many.trigger.props.disabled, true, 'the effort trigger respects a locked composer')
  assert.equal(manyRange.props.disabled, true, 'the range respects a locked composer')
  assert.ok(many.nodes.filter((node) => node.props.className?.includes('dmp-slider-tick'))
    .every((node) => node.props.disabled === true), 'all jump targets respect a locked composer')

  const css = readFileSync(new URL('src/ui/styles.js', root), 'utf8').split('/* Reasoning effort:')[1]
  // Theme tokens everywhere, with two deliberate exceptions.
  //
  // 1. Pure black and pure white. Those read the same in both themes (an outline must
  //    look like an outline, a knob must look raised), so a token would only make them
  //    less predictable.
  // 2. The two tier accents. These are not this plugin's invention — they are the
  //    dark-background hues Codex's own TUI uses for its Ultra (violet) and Max
  //    (amber) tiers, adopted so the two highest levels match that convention. The
  //    host exposes no token for them, and inventing one via color-mix would drift
  //    from the source values. Any other mid-tone literal is still rejected.
  const TIER_ACCENTS = ['ba82ff', 'f7c473']
  const literals = [...css.matchAll(/(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi)].map((m) => m[0])
  const forbidden = literals.filter((value) => {
    const hex = /^#([0-9a-f]{3,8})$/i.exec(value)
    if (hex === null) return true
    const digits = hex[1].length === 3
      ? hex[1].split('').map((digit) => digit + digit).join('')
      : hex[1].slice(0, 6)
    const lower = digits.toLowerCase()
    return !['000000', 'ffffff'].includes(lower) && !TIER_ACCENTS.includes(lower)
  })
  assert.deepEqual(forbidden, [],
    'effort styles use theme tokens, never mid-tone literal colours')
  // The tier colours must actually be wired to the two top stops, not merely allowed
  // by the filter above. The block is matched from its selector through its closing
  // brace, so a rule that loses its colour fails even if the value still appears
  // somewhere else in the sheet.
  const flat = css.replace(/\s+/g, ' ')
  const tierBlock = (tier) => {
    const at = flat.indexOf(`[data-tier="${tier}"]`)
    if (at < 0) return ''
    const close = flat.indexOf('}', at)
    return close < 0 ? '' : flat.slice(at, close)
  }
  assert.match(tierBlock('top'), /ba82ff/, 'the top level takes the violet tier accent')
  assert.match(tierBlock('high'), /f7c473/, 'the second-highest level takes the amber tier accent')
  assert.ok(css.includes('prefers-reduced-motion'), 'the effort view respects reduced motion')
}

// Every panel asks the host to lift the composer's stacking context.
//
// The chat's "jump to latest" button is a SIBLING of the composer seat and paints at
// z-index 8, while the seat sits at z-index 7. A panel is a descendant of the seat, so
// no z-index of its own can paint over that button — a child cannot escape its
// parent's stacking context. The host exposes one supported hook: the seat is raised
// to z-index 9 when it CONTAINS `[data-trigger-menu]`, so each panel carries it.
for (const [label, className, index] of [
  ['model', 'dmp-panel', 0],
  ['effort', 'dmp-panel dmp-panel-slider', 1]
]) {
  // A fresh mount per panel: the shared fixture's catalogue carries no reasoning
  // levels, so the level trigger only exists on a mount whose model declares them.
  const mounted = mount()
  const viewProps = { ...props, ...mounted.options.inject('session-1') }

  hookState.length = 0
  hookIndex = 0
  const trigger = collect(mounted.component(viewProps)).filter(isTrigger)[index]
  assert.ok(trigger, `the ${label} trigger renders`)

  trigger.props.onClick()
  hookIndex = 0
  const panel = collect(mounted.component(viewProps))
    .find((node) => node.props.className === className)
  assert.ok(panel, `the ${label} panel opens`)
  assert.equal(panel.props['data-trigger-menu'], '',
    `the ${label} panel asks the host to raise the composer above the jump-to-latest button`)
}
// Reset the panel state for the tests that follow.
hookState.length = 0
hookIndex = 0

// ---------------------------------------------------------------------------
// The slider's DOM value follows a level chosen WITHOUT a drag.
// ---------------------------------------------------------------------------
// The range input is uncontrolled, so its internal value is written once on
// mount. Clicking a label under the rail (or a level arriving from /model)
// changes `activeId` without a gesture, and the next key press would otherwise
// start from the stale stop. A drag must NOT be written to — that is what keeps
// the thumb glued to the pointer.
{
  const directory = createDirectory({ current: { provider: 'test', model: 'reasoner', reasoningEffort: 'low' } })
  directory.__set({ groups: [{ id: 'test', models: [{ id: 'reasoner', name: 'Reasoner',
    reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'low' } }] }] })
  const mounted = mount({ directory })
  const viewProps = { ...props, ...mounted.options.inject('session-1') }
  hookState.length = 0
  hookIndex = 0
  collect(mounted.component(viewProps)).filter(isTrigger)[1].props.onClick()

  // Stand in for the DOM node React would attach: the sync effect writes `value`.
  const node = { value: '0' }
  const findRange = (tree) => collect(tree).find((candidate) =>
    candidate.type === 'input' && candidate.props.type === 'range')

  hookIndex = 0
  const opened = mounted.component(viewProps)
  // `collect` expands the function components, which is what runs their hooks —
  // reading the tree without it would never execute the slider's sync effect.
  const range = findRange(opened)
  assert.ok(range, 'the slider renders inside the open level panel')
  // The ref is attached by React in the real runtime; here it is wired by hand,
  // then the component re-renders so the sync effect can run against it.
  range.props.ref.current = node

  // Click the second label: the level changes, no drag happened.
  hookIndex = 0
  const ticks = collect(mounted.component(viewProps))
    .filter((candidate) => candidate.props.className?.includes('dmp-slider-tick'))
  ticks[1].props.onClick()
  // A render pass is what runs the slider's effects; `collect` expands into the
  // slider component, `component` alone would only build the outer tree.
  hookIndex = 0
  collect(mounted.component(viewProps))
  assert.equal(node.value, '1',
    'a level chosen by clicking its label is written back to the range input')
}

// ---------------------------------------------------------------------------
// Settling a LEVEL must not disturb the MODEL trigger.
// ---------------------------------------------------------------------------
// The directory reports one `selecting` status for both kinds of selection, and
// `pending` carries the triple. Treating them alike made every slider stop flip
// the model button to "Switching…" and dim it, so dragging the level back and
// forth made the model name flash on each commit — even though the model never
// changed.
{
  const directory = createDirectory({
    current: { provider: 'workbuddy-cn', model: 'hy3', reasoningEffort: 'low' }
  })
  const mounted = mount({ directory })
  const viewProps = { ...props, ...mounted.options.inject('session-1') }
  hookState.length = 0
  hookIndex = 0
  mounted.component(viewProps)

  const renderTriggers = () => {
    hookIndex = 0
    const nodes = collect(mounted.component(viewProps))
    return nodes.filter(isTrigger)
  }

  // The same model, a different level: `pending` names the model already in effect.
  directory.__set({
    status: 'selecting',
    pending: { provider: 'workbuddy-cn', model: 'hy3', reasoningEffort: 'high' }
  })
  const [modelTrig, effortTrig] = renderTriggers()
  assert.equal(modelTrig.props.disabled, false,
    'settling a level does not disable the model trigger')
  assert.ok(!texts(modelTrig).some((text) => text.includes('切换中')),
    'settling a level does not flip the model trigger to "switching"')
  assert.ok(texts(modelTrig).some((text) => text.includes('Hy3')),
    'the model trigger keeps naming the model while a level settles')
  assert.equal(effortTrig.props.disabled, false,
    'the level trigger stays live while its own change settles, so a drag is not cut short')

  // A different model is a genuine switch, and the trigger says so without moving:
  // it stays enabled, keeps naming the model, and raises `aria-busy`. Swapping the
  // label to "switching…" resized and dimmed the button on every pick, which with
  // the panel staying open read as a flicker.
  directory.__set({
    status: 'selecting',
    pending: { provider: 'deepseek-account', model: 'deepseek-v4-pro' }
  })
  const [switchingTrig] = renderTriggers()
  assert.equal(switchingTrig.props.disabled, false,
    'a model switch does not disable the trigger, so the composer does not blink')
  assert.equal(switchingTrig.props['aria-busy'], true,
    'a model switch is announced to assistive tech instead')
  assert.ok(!texts(switchingTrig).some((text) => text.includes('切换中')),
    'the trigger keeps naming the model while the switch settles')
}

// ---------------------------------------------------------------------------
// A rejected selection raises a collapsed notice above the panels.
// ---------------------------------------------------------------------------
// The notice is the ONLY surface for a failure: the panels carry catalogue
// errors, never a raw `code: message` from a rejected switch. Toggling it shows
// the detail, and it also must not leave the model list open as if it succeeded.
{
  const mounted = mount()
  const viewProps = { ...props, ...mounted.options.inject('session-1') }
  const rejecting = {
    ...viewProps,
    select: async () => ({ ok: false, error: { code: 'session/writer-held', message: 'another writer holds this session' } })
  }
  hookState.length = 0
  hookIndex = 0
  collect(mounted.component(rejecting)).filter(isTrigger)[0].props.onClick()

  hookIndex = 0
  const withOptions = collect(mounted.component(rejecting))
  const rows = withOptions.filter((candidate) => candidate.props.role === 'option')
  await rows[0].props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))

  hookIndex = 0
  const failed = collect(mounted.component(rejecting))
  const notice = failed.find((candidate) => candidate.props.className === 'dmp-notice')
  assert.ok(notice, 'a rejected switch raises a notice')
  assert.ok(failed.some((candidate) => candidate.props.role === 'listbox'),
    'the list stays open after a rejection, so another model can be picked without reopening it')
  assert.equal(texts(notice).join(''), '切换失败', 'the notice is collapsed to its summary by default')
  assert.ok(!texts(notice).some((text) => text.includes('writer-held')),
    'the raw provider error is not shown until the notice is expanded')

  const toggle = collect(notice).find((candidate) => candidate.type === 'button')
  assert.equal(toggle.props['aria-expanded'], false, 'the notice starts collapsed')
  toggle.props.onClick()
  hookIndex = 0
  const expanded = collect(mounted.component(rejecting))
    .find((candidate) => candidate.props.className === 'dmp-notice')
  assert.ok(texts(expanded).some((text) => text.includes('session/writer-held: another writer holds this session')),
    'expanding the notice reveals the raw error')

  // The failure belongs to the notice, not to the panels: none of the model
  // panel's own notes may repeat it.
  assert.ok(!failed.some((candidate) => candidate.props.className?.includes('dmp-note-error')),
    'a selection failure is not rendered as a panel note')
}

// An unavailable session renders nothing at all.
hookState.length = 0
hookIndex = 0
assert.equal(component({ ...props, available: false }), null,
  'an addressed subagent session renders no picker control')

// The other locale is wired too.
{
  const english = mount({ locale: 'en-US' })
  hookState.length = 0
  hookIndex = 0
  const englishProps = { ...props, ...english.options.inject('session-1') }
  const englishTrigger = collect(english.component(englishProps)).find(isTrigger)
  englishTrigger.props.onClick()
  hookIndex = 0
  const englishBox = collect(english.component(englishProps)).find((node) => node.type === 'input')
  assert.equal(englishBox?.props.placeholder, 'Search models',
    'the English dictionary is used for an English locale')
}

// ---------------------------------------------------------------------------
// Both popovers centre on their trigger instead of hugging a fixed side.
// ---------------------------------------------------------------------------
// A fixed side anchor drifts away from the button the user pressed, and near a
// screen edge it pushes the panel out of the window. The shared hook measures the
// trigger, centres the panel on it, then clamps the result.
{
  const panelStyle = (tree, className) => {
    const node = collect(tree).find((candidate) => candidate.props.className === className)
    return node?.props.style
  }

  const mounted = mount()
  const viewProps = { ...props, ...mounted.options.inject('session-1') }

  // The model list.
  hookState.length = 0
  hookIndex = 0
  collect(mounted.component(viewProps)).filter(isTrigger)[0].props.onClick()
  hookIndex = 0
  const modelStyle = panelStyle(mounted.component(viewProps), 'dmp-panel')
  assert.ok(modelStyle, 'the model panel renders')
  // Anchored in PIXELS, not percentages: the containing block is the control row,
  // whose width follows the button labels, and a percentage anchor slid the panel
  // sideways whenever a pick changed the model name under it.
  assert.match(String(modelStyle.left), /^-?\d+px$/, 'the model panel is anchored in pixels')
  assert.equal(modelStyle.transform, undefined, 'no centring transform is left to fight the anchor')

  // The level slider.
  hookState.length = 0
  hookIndex = 0
  const levelMount = mount()
  const levelProps = { ...props, ...levelMount.options.inject('session-1') }
  collect(levelMount.component(levelProps)).filter(isTrigger)[1].props.onClick()
  hookIndex = 0
  const sliderStyle = panelStyle(levelMount.component(levelProps), 'dmp-panel dmp-panel-slider')
  assert.ok(sliderStyle, 'the slider panel renders')
  assert.match(String(sliderStyle.left), /^-?\d+px$/, 'the slider panel is anchored in pixels too')
}

// ---------------------------------------------------------------------------
// The heading: vector art in Chinese, plain text everywhere else.
// ---------------------------------------------------------------------------
// The four glyphs in `caption-glyphs.js` are CJK outlines, so they read as words
// only in Chinese. Every other language prints the dictionary string instead —
// the mark is decoration, and decoration that spells the wrong thing is worse
// than plain text.
{
  const openHeading = (locale) => {
    const mounted = mount({ locale })
    const viewProps = { ...props, ...mounted.options.inject('session-1') }
    hookState.length = 0
    hookIndex = 0
    collect(mounted.component(viewProps)).filter(isTrigger)[1].props.onClick()
    hookIndex = 0
    return collect(mounted.component(viewProps))
  }

  const zhNodes = openHeading('zh-CN')
  // `collect` expands function components, so the mark is identified by what it
  // renders (the SVG class) rather than by the component reference.
  assert.ok(zhNodes.some((node) => node.props.className === 'dmp-caption-mark'),
    'the Chinese heading keeps the vector mark')
  assert.ok(!zhNodes.some((node) => node.props.className === 'dmp-caption-text'),
    'the Chinese heading does not also print the string')

  const enNodes = openHeading('en-US')
  assert.ok(!enNodes.some((node) => node.props.className === 'dmp-caption-mark'),
    'an English heading is not drawn from CJK outlines')
  const caption = enNodes.find((node) => node.props.className === 'dmp-caption-text')
  assert.ok(caption, 'an English heading prints the localised string')
  assert.deepEqual(texts(caption), ['Reasoning effort'], 'the English heading is the English string')
}

// ---------------------------------------------------------------------------
// Manifest and display resources, per the bundle checklist.
// ---------------------------------------------------------------------------
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.dsh.client.platform, 'web')
// The client-module scanner locates a package with
// `createRequire(...).resolve('<name>/package.json')` and silently skips the entry
// when that throws, so a missing self-export means the client half is never served.
assert.equal(pkg.exports['./package.json'], './package.json', 'the manifest must export itself for the client-module scanner')
assert.ok(pkg.exports['./client'], 'the client entry must stay exported')
assert.ok(existsSync(new URL(pkg.exports['./client'], root)), 'the client entry file exists')
assert.ok(pkg.files.includes('client.js') && pkg.files.includes('icon.svg'), 'every runtime file and asset ships')
assert.ok(pkg.files.includes('locale/*.json'))
assert.ok(existsSync(new URL('cordis.patch.yml', root)), 'the patch exists')
assert.ok(existsSync(new URL('icon.svg', root)), 'the icon exists')
assert.ok(readFileSync(new URL('icon.svg', root), 'utf8').trimStart().startsWith('<svg'), 'the icon is an SVG image')
for (const file of ['en', 'zh']) {
  const meta = JSON.parse(readFileSync(new URL(`locale/${file}.json`, root), 'utf8')).meta
  assert.ok(meta.title.length > 0 && meta.description.length > 0, `${file} carries the display metadata`)
}

console.log('client.mjs: OK — 槽位注册、子槽位声明、目录契约、选择与双语均已校验')
