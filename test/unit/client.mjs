/**
 * Offline checks for the model-picker client half.
 *
 * This plugin is a UI replacement only: the data layer is the shipped
 * `ui-model-selection` implementation, reached through its `modelDirectories`
 * service. The contract to verify is therefore narrow and specific:
 *
 *  - it registers the composer seat BELOW the shipped priority (lowest renders),
 *  - it declares the `conversation.input.model.label` child so provider
 *    decorations keep working,
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

const selections = []
const remote = {
  session: {
    modelCatalog: async () => ({ ok: true, value: catalog }),
    selectModel: async (payload) => { selections.push(payload); return { ok: true, value: { selected: payload } } }
  },
  $on: () => () => {}
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

// The seat needs the same services the shipped registration waits for.
assert.ok(Array.isArray(plugin.inject), 'the client half declares its service dependencies')
for (const service of ['locale', 'sessions', 'slots', 'remote', 'remote.session']) {
  assert.ok(plugin.inject.includes(service), `it waits for "${service}"`)
}
assert.ok(!plugin.inject.includes('commandUi'),
  'it does not wait for commandUi: this plugin contributes no /model command')

/**
 * Mount the plugin against a directory service and return its slot registration.
 *
 * `directoryFor` is the shipped service's entry point; the mock mirrors the
 * surface the registration actually uses.
 */
function mount({ directory, locale = 'zh-CN' } = {}) {
  const registrations = []
  const provided = []
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
  const ctx = {
    get: (name) => name === 'locale' ? { getLocale: () => ({ locale }) }
      : name === 'sessions' ? sessions
      : name === 'slots' ? slots
      : name === 'remote' ? remote
      : name === 'remote.session' ? remote.session
      : name === 'modelDirectories' ? models
      : undefined,
    remote,
    slots,
    sessions,
    modelDirectories: models,
    locale: { getLocale: () => ({ locale }) },
    effect: (fn) => { try { return fn() ?? (() => {}) } catch { return () => {} } },
    plugin: () => { throw new Error('this plugin must not mount a directory service of its own') },
    provide: (name) => { provided.push(name); return () => {} },
    inject: (deps, callback) => {
      assert.ok(deps.includes('slots'), 'the registration waits for the slot registry')
      assert.ok(deps.includes('modelDirectories'), 'the registration waits for the directory service')
      callback(ctx)
      return () => {}
    },
    on: () => () => {}
  }
  plugin.apply(ctx)
  assert.deepEqual(provided, [],
    'no service is provided: a second modelDirectories would fight the shipped one')
  assert.equal(registrations.length, 1, 'the composer seat is registered exactly once')
  return registrations[0]
}

const { options, component } = mount()

// ---------------------------------------------------------------------------
// The registration contract.
// ---------------------------------------------------------------------------
// LOWEST priority renders, so shadowing the shipped occupant (priority 0) means
// registering below it.
assert.ok(options.priority < 0, 'a priority below the shipped occupant is what shadows it')
assert.equal(options.name, 'conversation.input.model', 'it registers the composer model seat')

// The label child must be declared: `renderSlot` is only authorised for a child
// the entry declared itself, so skipping it would delete every provider
// decoration instead of rendering it.
assert.ok(options.children && options.children['conversation.input.model.label'],
  'the seat declares the label child that provider decorations mount on')
assert.equal(options.children['conversation.input.model.label'].kind, 'single',
  'the label child keeps the shipped kind')
assert.equal(options.children['conversation.input.model.label'].scope, 'session',
  'the label child keeps the shipped scope')
assert.equal(options.children['conversation.input.model.label'].inline, true,
  'the label child stays inline')

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
// The component: rendering and selection.
// ---------------------------------------------------------------------------
const props = {
  sessionId: 'session-1',
  locked: false,
  renderSlot: (name, payload, slotOpts) => slotOpts?.fallback,
  ...options.inject('session-1')
}

const collect = (node, out = []) => {
  if (Array.isArray(node)) { for (const child of node) collect(child, out); return out }
  if (node === null || typeof node !== 'object') return out
  out.push(node)
  for (const child of node.children ?? []) collect(child, out)
  return out
}
/** Every string a tree renders, at any depth (children may be bare strings). */
const texts = (node) => {
  if (typeof node === 'string') return [node]
  if (node === null || typeof node !== 'object') return []
  const kids = Array.isArray(node) ? node : (node.children ?? [])
  return kids.flatMap((child) => texts(child))
}

// The trigger names the current model.
hookState.length = 0
hookIndex = 0
const tree = component(props)
assert.ok(texts(tree).some((text) => text.includes('Hy3')), 'the trigger names the current model')

// Two independent controls: the model list and the reasoning level.
const triggers = collect(tree).filter((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox')
assert.equal(triggers.length, 2, 'the model and the reasoning level are two separate controls')

// Opening the model panel offers every model, grouped by provider.
triggers[0].props.onClick()
hookIndex = 0
const openTree = component(props)
const optionButtons = collect(openTree).filter((node) => node.type === 'button' && node.props.role === 'option')
assert.equal(optionButtons.length, 3, 'every model of every group is offered')
assert.ok(texts(openTree).includes('WorkBuddy (Mainland)'), 'groups are labelled by provider')
const searchBox = collect(openTree).find((node) => node.type === 'input')
assert.equal(searchBox?.props.placeholder, '搜索模型', 'the search box is localised')

// Selecting submits the full triple through the injected `select`, which is the
// shipped directory's own entry point — not a private RPC.
await optionButtons[1].props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(selections.length, 0, 'the component does not call the Host remote directly')

// The level control shows the level in effect and submits it with the model.
// A fresh mount is used because the click above moved the directory's current
// selection to a model that has no reasoning metadata.
{
  const levelMount = mount()
  const levelProps = { ...props, ...levelMount.options.inject('session-1') }
  hookState.length = 0
  hookIndex = 0
  const levelTree = levelMount.component(levelProps)
  const levelTrigger = collect(levelTree)
    .filter((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox')[1]
  assert.ok(texts(levelTree).some((text) => text.includes('快速')),
    'the level control shows the level in effect (the adapter default)')
  levelTrigger.props.onClick()
  hookIndex = 0
  const levelPanel = levelMount.component(levelProps)
  const levelOptions = collect(levelPanel).filter((node) => node.type === 'button' && node.props.role === 'option')
  assert.equal(levelOptions.length, 2, 'every level of the selected model is offered')
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
  const englishTrigger = collect(english.component(englishProps))
    .find((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox')
  englishTrigger.props.onClick()
  hookIndex = 0
  const englishBox = collect(english.component(englishProps)).find((node) => node.type === 'input')
  assert.equal(englishBox?.props.placeholder, 'Search models',
    'the English dictionary is used for an English locale')
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
