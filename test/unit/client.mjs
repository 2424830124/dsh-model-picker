/**
 * Offline checks for the model-picker client half.
 *
 * The contract a replacement picker must honour on the slot side: register BELOW
 * the shipped occupant's priority (lowest renders), declare no `children` (the
 * shipped occupant owns the label child's declaration; a second declaration
 * throws), and accept that the decorations therefore do not render here. These
 * are asserted on the real registration.
 *
 * The data layer is the second contract: one shared, Host-generation-scoped
 * catalogue cache with the shipped directory's four invalidation events plus
 * `connection/reset`, the catalogue default as the effective selection on a
 * session with no explicit choice, and the control hidden entirely on a session
 * that cannot change its model. Each is asserted with a scenario its own mount.
 *
 * The miniature React keeps hook state across passes, so a second render after
 * the catalogue promise settles shows the loaded list. That is enough to
 * exercise the selection path without a DOM or a real renderer.
 *
 * The sources live in `src/` and are concatenated into `client.js` by
 * `scripts/build.mjs`; this test imports the BUILT bundle, because that is what
 * the module loader serves. A stale bundle would make every assertion below pass
 * against code that never ships, so the first check verifies the bundle really
 * contains every source module.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

// The bundle must be built from the current sources. Running the bundler here
// would need a child process, which a confined runner may refuse, so this checks
// the invariant directly: every source file's newest mtime must not be newer
// than the bundle, and the bundle must carry each module.
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
  assert.ok(sources.length >= 8, 'the source tree keeps its modules')
  for (const source of sources) {
    const name = source.pathname.split('/').slice(-2).join('/')
    assert.ok(bundle.includes(`//# module: ${name}`) || bundle.includes(name.split('/').pop()),
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

const labelCalls = []
const selectCalls = []

const catalog = {
  // The catalogue default: what the Host uses for a session with no explicit
  // choice. The picker must show it as the effective selection.
  default: { provider: 'deepseek-account', model: 'deepseek-v4-pro' },
  groups: [
    { id: 'workbuddy-cn', name: 'WorkBuddy (Mainland)', models: [
      {
        id: 'hy3',
        name: 'Hy3',
        reasoning: {
          efforts: [{ id: 'low', name: '快速' }, { id: 'high', name: '深思' }],
          defaultEffort: 'low'
        }
      },
      { id: 'glm-5.3', name: 'GLM-5.3' }
    ] },
    { id: 'deepseek-account', name: 'DeepSeek', models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }] }
  ]
}

const listenedEvents = []
const remote = {
  session: {
    modelCatalog: async () => ({ ok: true, value: catalog }),
    selectModel: async (payload) => { selectCalls.push(payload); return { ok: true, value: undefined } }
  },
  // Record the invalidation subscriptions: the shipped directory re-reads on
  // four Host notifications, and the picker must mirror exactly that set.
  $on: (event) => { listenedEvents.push(event); return () => {} }
}

const selectionFace = {
  getSnapshot: () => ({ next: { provider: 'workbuddy-cn', model: 'hy3' } }),
  subscribe: () => () => {}
}
// A session that never chose: an empty projection frame, exactly what a blank
// session (or one started before the current Host generation) carries.
const emptyFace = {
  getSnapshot: () => ({}),
  subscribe: () => () => {}
}
const sessions = {
  binding: (id) => ({
    session: { projections: { faceOf: () => (id === 'fresh-session' ? emptyFace : selectionFace) } }
  }),
  // An addressed subagent session (any id starting with "sub-") cannot change
  // its model; the picker must compute `available: false` for it.
  subagentAddress: (id) => String(id).startsWith('sub-') ? 'addr' : undefined
}

globalThis.document = { addEventListener: () => {}, removeEventListener: () => {} }
globalThis.window = { __ModuleLoader__: { load: (definition) => { globalThis.__picker = definition } } }

await import(new URL('client.js', root).href)

const loaded = globalThis.__picker
assert.ok(loaded, 'the client half registers itself with the module loader')
assert.equal(loaded.id, pkg.name, 'the factory id is the package name')

const plugin = loaded.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})
// No fiber-level `inject`, on purpose.
//
// A required service that this context cannot see keeps the whole entry in
// `loading`: Cordis never calls `apply`, and the client Loader reports that as
// `web boot: 1 entry did not activate` — a renderer that never comes up. That is
// a UI plugin taking the entire boot hostage over a slot registration, so the
// slot service is awaited *inside* apply instead: an unmet dependency then costs
// only the registration.
assert.equal(plugin.inject, undefined, 'the client half declares no fiber-level dependency')

/** Mount the plugin against a locale and return its slot registration. */
function mount(locale) {
  const registrations = []
  const waited = []
  const slots = {
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
    inject: (slot, callback) => {
      assert.equal(slot, 'conversation.input.model')
      callback()
      return () => {}
    }
  }
  const ctx = {
    get: (name) => {
      if (name === 'locale') return { getLocale: () => ({ locale }) }
      if (name === 'sessions') return sessions
      if (name === 'slots') return slots
      // `remote.session` is its own service: reading it off `remote` through the
      // Cordis proxy throws without an `inject` entry, which is what crashed the
      // component. The picker takes it from the service table instead.
      if (name === 'remote') return remote
      if (name === 'remote.session') return remote.session
      return undefined
    },
    remote,
    slots,
    // The soft wait: apply asks the composition to run the install once the
    // service is visible, instead of making it a requirement of the fiber.
    inject: (deps, callback) => { waited.push(deps); callback(ctx) }
  }
  plugin.apply(ctx)
  assert.deepEqual(waited, [['slots', 'remote', 'remote.session']],
    'apply waits for the slot and both remote services without requiring them')
  assert.equal(registrations.length, 1)
  return registrations[0]
}

const { options, component } = mount('zh-CN')

// ---------------------------------------------------------------------------
// The directory layer: the store contract the shipped picker also reads.
// ---------------------------------------------------------------------------
// Without a shipped `modelDirectories` service the plugin must provide its own
// under the same name, and its `directoryFor` must return the shipped store
// shape. These fields are what the seat and the /model popup both read, so a
// replacement that invented a narrower shape could not be swapped in.
const noopSubscribe = () => () => {}
const fallbackDirectory = options.inject('session-1').directory
assert.ok(fallbackDirectory, 'the picker resolves a per-session directory')
assert.deepEqual(
  Object.keys(fallbackDirectory.store.getSnapshot()).sort(),
  ['current', 'error', 'failures', 'groups', 'pending', 'routable', 'status'],
  'the directory store carries the shipped picker\'s fields'
)
assert.equal(typeof fallbackDirectory.select, 'function', 'selection goes through the directory, not the component')

// A second call for the same session returns the same directory: one projection
// per session, shared by every reader (the seat and the /model popup).
assert.equal(options.inject('session-1').directory, fallbackDirectory,
  'one directory per session is shared by every reader')
assert.notEqual(options.inject('session-2').directory, fallbackDirectory,
  'a different session gets its own directory')

// LOWEST priority renders, so shadowing means going below the shipped 0.
assert.ok(options.priority < 0, 'a priority below the shipped occupant is what shadows it')

// No child declaration: the shipped occupant already declares the label slot,
// and a second declaration throws (`slot "..." is already declared`) — which is
// what used to remove the shipped occupant and leave the slot empty.
assert.equal(options.children, undefined, 'the label child slot is left to the shipped occupant')

const props = {
  sessionId: 'session-1',
  locked: false,
  renderSlot: (name, payload, slotOpts) => {
    labelCalls.push({ name, payload, fallback: slotOpts?.fallback })
    return slotOpts?.fallback
  },
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

// Pass 1: nothing loaded yet. The shipped picker says "loading" here rather
// than naming a model it has not read yet or claiming none is available, and a
// replacement must not invent a third answer.
hookState.length = 0
hookIndex = 0
const first = component(props)
assert.ok(texts(first).some((text) => text.includes('正在读取模型列表')), 'the trigger reports loading before the directory resolves')
assert.ok(!texts(first).some((text) => text.includes('当前没有可用模型')), 'an unresolved directory is not reported as "no model available"')

// Pass 2: the catalogue promise settled, so the trigger names the model.
await new Promise((resolve) => setTimeout(resolve, 0))
hookIndex = 0
const loadedTree = component(props)
assert.ok(texts(loadedTree).some((text) => text.includes('Hy3')), 'the loaded catalogue names the current model')

// Pass 3: opening the model panel renders the groups; the miniature React has no
// reactivity, so the click is applied and the component rendered again.
const triggers = collect(loadedTree).filter((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox')
assert.equal(triggers.length, 2, 'the model and the reasoning level are two separate controls')
triggers[0].props.onClick()
hookIndex = 0
const tree = component(props)

const optionButtons = collect(tree).filter((node) => node.type === 'button' && node.props.role === 'option')
assert.equal(optionButtons.length, 3, 'every model of every group is offered')
assert.ok(texts(tree).includes('WorkBuddy (Mainland)'), 'groups are labelled by provider')
const searchBox = collect(tree).find((node) => node.type === 'input')
assert.equal(searchBox?.props.placeholder, '搜索模型', 'the search box is localised')

// The compatibility contract, asserted on the real render.
const placements = labelCalls.map((call) => call.payload.placement)
assert.ok(labelCalls.every((call) => call.name === 'conversation.input.model.label'), 'only the inline label slot is rendered')
assert.deepEqual([...new Set(placements)].sort(), ['option', 'trigger'], 'both placements the shipped picker uses are passed')
const triggerCall = labelCalls.find((call) => call.payload.placement === 'trigger')
assert.equal(triggerCall.payload.model.id, 'hy3', 'the trigger decorates the current model')
assert.equal(triggerCall.payload.provider.id, 'workbuddy-cn')
assert.equal(triggerCall.payload.selected, true)
assert.ok(labelCalls.every((call) => typeof call.payload.selected === 'boolean'), 'every call states whether it is the selection')
assert.ok(labelCalls.every((call) => call.fallback !== undefined), 'a fallback keeps the name visible without a decoration')

// Selecting goes through the Host remote, not a private path.
await optionButtons[1].props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(selectCalls, [{ sessionId: 'session-1', provider: 'workbuddy-cn', model: 'glm-5.3' }],
  'choosing a model calls session.selectModel with the session, provider and model')

// The picker must show the choice immediately, before the Host republishes the
// projection. Reading the projection again here would write the OLD selection
// back over the acknowledged one, which looks exactly like "the click did
// nothing". GLM-5.3 has no reasoning metadata, so its level control disappears —
// that is the visible proof the trigger switched models.
hookIndex = 0
const afterSelect = component(props)
assert.ok(texts(afterSelect).some((text) => text.includes('GLM-5.3')),
  'the trigger names the model the Host acknowledged, before the projection is republished')
assert.equal(collect(afterSelect)
  .filter((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox').length, 1,
  'a model without reasoning levels shows no level control')

// The level control: its own button, its own list, and it carries the level.
// Choose the model that HAS levels first, so the control is present.
hookState.length = 0
hookIndex = 0
const backTree = component(props)
const backTrigger = collect(backTree)
  .find((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox')
backTrigger.props.onClick()
hookIndex = 0
const backPanel = component(props)
const backOptions = collect(backPanel).filter((node) => node.type === 'button' && node.props.role === 'option')
await backOptions[0].props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))

hookIndex = 0
const idleTree = component(props)
const levelTrigger = collect(idleTree)
  .filter((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox')[1]
assert.ok(texts(idleTree).some((text) => text.includes('快速')), 'the level control shows the level in effect (the adapter default)')
levelTrigger.props.onClick()
hookIndex = 0
const levelTree = component(props)
const levelOptions = collect(levelTree).filter((node) => node.type === 'button' && node.props.role === 'option')
assert.equal(levelOptions.length, 2, 'every level of the selected model is offered')
await levelOptions[1].props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(selectCalls[selectCalls.length - 1], { sessionId: 'session-1', provider: 'workbuddy-cn', model: 'hy3', reasoningEffort: 'high' },
  'choosing a level keeps the model and adds the reasoning effort')

// ---------------------------------------------------------------------------
// Data-layer contract 1: the invalidation events.
// ---------------------------------------------------------------------------
// The shipped directory re-reads on exactly these four notifications plus
// `connection/reset` (handled through ctx.on, not remote.$on). Missing one left
// the picker offering models the Host would refuse after a settings or
// credentials edit. The set is asserted, not the count: the subscription may be
// installed through more than one context while the delivery path is being
// pinned down, and duplicates of the same event are harmless.
assert.deepEqual([...new Set(listenedEvents)].sort(),
  ['credentials/record-updated', 'credentials/reference-updated', 'llm/adapters-updated', 'settings/document-updated'],
  'the picker subscribes to the same four invalidation events as the shipped directory')

// ---------------------------------------------------------------------------
// Data-layer contract 1b: an invalidation actually changes the offered list.
// ---------------------------------------------------------------------------
// Subscribing is not the same as refreshing. This is the reported failure: a
// sibling provider plugin removes a model, announces `llm/adapters-updated`, and
// the picker keeps offering the removed model. The scenario below drives the
// real event path and asserts the model disappears from the rendered options.
{
  // A Host that can change its catalogue between calls, the way a provider panel
  // switching a model off does.
  const liveCatalog = {
    default: { provider: 'workbuddy-cn', model: 'hy3' },
    groups: [
      { id: 'workbuddy-cn', name: 'WorkBuddy (Mainland)', models: [
        { id: 'hy3', name: 'Hy3', reasoning: { efforts: [{ id: 'low', name: '快速' }], defaultEffort: 'low' } },
        { id: 'glm-5.3', name: 'GLM-5.3' }
      ] }
    ]
  }
  const handlers = new Map()
  // Count Host reads: the event must cause one, on its own.
  let catalogReads = 0
  const liveRemote = {
    session: {
      modelCatalog: async () => { catalogReads += 1; return { ok: true, value: liveCatalog } },
      selectModel: async () => ({ ok: true, value: undefined })
    },
    $on: (event, handler) => {
      handlers.set(event, handler)
      return () => { handlers.delete(event) }
    }
  }
  const liveSessions = {
    binding: () => ({ session: { projections: { faceOf: () => selectionFace } } }),
    subagentAddress: () => undefined
  }
  const registrations = []
  const slots = {
    register: (opts, comp) => { registrations.push({ options: opts, component: comp }); return () => {} },
    inject: (_slot, cb) => { cb(); return () => {} }
  }
  const ctx = {
    get: (name) => name === 'locale' ? { getLocale: () => ({ locale: 'en-US' }) }
      : name === 'sessions' ? liveSessions
      : name === 'slots' ? slots
      : name === 'remote' ? liveRemote
      : name === 'remote.session' ? liveRemote.session
      : undefined,
    remote: liveRemote,
    slots,
    inject: (_deps, cb) => cb(ctx)
  }
  plugin.apply(ctx)
  const liveProps = { ...registrations[0].options.inject('live-1'), sessionId: 'live-1', locked: false }

  hookState.length = 0
  hookIndex = 0
  component(liveProps)
  await new Promise((resolve) => setTimeout(resolve, 0))

  // Open the panel and count what the Host currently offers.
  hookIndex = 0
  const beforeTree = component(liveProps)
  collect(beforeTree).find((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox')?.props.onClick()
  hookIndex = 0
  const beforePanel = component(liveProps)
  const beforeOptions = collect(beforePanel).filter((node) => node.type === 'button' && node.props.role === 'option')
  assert.equal(beforeOptions.length, 2, 'both models are offered before the provider changes its list')

  // The sibling provider drops glm-5.3 and announces the change.
  liveCatalog.groups = [{ id: 'workbuddy-cn', name: 'WorkBuddy (Mainland)', models: [
    { id: 'hy3', name: 'Hy3', reasoning: { efforts: [{ id: 'low', name: '快速' }], defaultEffort: 'low' } }
  ] }]
  assert.ok(handlers.has('llm/adapters-updated'), 'the picker subscribed to the invalidation event')
  handlers.get('llm/adapters-updated')()

  // The event alone must re-read the Host. This is asserted on the catalogue
  // contract, not through a render: the component also reloads on mount, so a
  // render-based check would pass even with the event handler doing nothing.
  const readsBefore = catalogReads
  assert.ok(handlers.has('llm/adapters-updated'), 'the picker subscribed to the invalidation event')
  handlers.get('llm/adapters-updated')()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.ok(catalogReads > readsBefore,
    'the invalidation event itself re-reads the catalogue (no render involved)')
  const groupsAfter = registrations[0].options.inject('live-1').catalog.store.getSnapshot().value?.groups ?? []
  assert.equal(groupsAfter.flatMap((group) => group.models).length, 1,
    'the invalidation event re-reads the catalogue and drops the removed model')

  hookIndex = 0
  const afterPanel = component(liveProps)
  const afterOptions = collect(afterPanel).filter((node) => node.type === 'button' && node.props.role === 'option')
  assert.equal(afterOptions.length, 1, 'the removed model leaves the list after the invalidation event')
  assert.ok(!texts(afterPanel).some((text) => text.includes('GLM-5.3')),
    'the removed model is no longer rendered anywhere in the panel')
}

// ---------------------------------------------------------------------------
// Data-layer contract 2: the catalogue default as the effective selection.
// ---------------------------------------------------------------------------
// A session with no explicit choice has an empty projection; the picker must
// fall back to `catalog.default` — the shipped directory's behaviour — instead
// of showing "no model available" on every new session.
const blankFace = { getSnapshot: () => ({}), subscribe: () => () => {} }
sessions.binding = (id) => ({
  session: { projections: { faceOf: () => (String(id).startsWith('blank-') ? blankFace : selectionFace) } }
})
hookState.length = 0
hookIndex = 0
const blankProps = { ...props, ...options.inject('blank-1') }
const blankTree = component(blankProps)
assert.ok(texts(blankTree).some((text) => text.includes('DeepSeek V4 Pro')),
  'a session with no explicit choice shows the catalogue default as the effective selection')
sessions.binding = () => ({ session: { projections: { faceOf: () => selectionFace } } })

// ---------------------------------------------------------------------------
// Data-layer contract 3: an unavailable session renders nothing.
// ---------------------------------------------------------------------------
// An addressed subagent session cannot change its model (the Host rejects the
// RPC); the shipped picker renders nothing there, and so must this one.
hookState.length = 0
hookIndex = 0
const subProps = { ...props, ...options.inject('sub-1') }
const subTree = component(subProps)
assert.equal(subTree, null, 'an addressed subagent session renders no picker control')
hookState.length = 0
hookIndex = 0

// ---------------------------------------------------------------------------
// Data-layer contract 4: the latest selection wins.
// ---------------------------------------------------------------------------
// Two fast clicks must not let the first reply overwrite the second choice. The
// directory drops a settlement whose generation is stale; a bare `busy` flag
// cannot express that, which is why this is asserted on the directory itself.
{
  // The projection must follow the Host, or the assertion cannot observe the
  // race at all: a face frozen on one model makes `sync()` rewrite `current` to
  // that model after every settlement, which hides whether the stale reply won.
  let projectedSelection = { provider: 'workbuddy-cn', model: 'hy3' }
  const raceFace = {
    getSnapshot: () => ({ next: projectedSelection }),
    subscribe: () => () => {}
  }
  const raceSessions = {
    binding: () => ({ session: { projections: { faceOf: () => raceFace } } }),
    subagentAddress: () => undefined
  }

  const race = []
  const slow = { delay: 25, provider: 'workbuddy-cn', model: 'hy3' }
  const fast = { delay: 0, provider: 'workbuddy-cn', model: 'glm-5.3' }
  const raceRemote = {
    session: {
      modelCatalog: async () => ({ ok: true, value: catalog }),
      selectModel: async (payload) => {
        race.push(payload.model)
        const hit = [slow, fast].find((entry) => entry.model === payload.model)
        await new Promise((resolve) => setTimeout(resolve, hit?.delay ?? 0))
        // The Host honours the request when it settles; the slower request
        // settles last, which is exactly the overwrite the guard must prevent.
        projectedSelection = { provider: payload.provider, model: payload.model }
        return { ok: true, value: undefined }
      }
    },
    $on: () => () => {}
  }
  const raceMount = (() => {
    const registrations = []
    const slots = {
      register: (opts, comp) => { registrations.push({ options: opts, component: comp }); return () => {} },
      inject: (_slot, cb) => { cb(); return () => {} }
    }
    const ctx = {
      get: (name) => name === 'locale' ? { getLocale: () => ({ locale: 'en-US' }) }
        : name === 'sessions' ? raceSessions
        : name === 'slots' ? slots
        : name === 'remote' ? raceRemote
        : name === 'remote.session' ? raceRemote.session
        : undefined,
      remote: raceRemote,
      slots,
      inject: (_deps, cb) => cb(ctx)
    }
    plugin.apply(ctx)
    return registrations[0]
  })()
  const raceDirectory = raceMount.options.inject('race-1').directory
  await raceDirectory.load()
  const first = raceDirectory.select(slow)
  const second = raceDirectory.select(fast)
  await Promise.all([first, second])
  const settled = raceDirectory.store.getSnapshot()
  assert.deepEqual(race, ['hy3', 'glm-5.3'], 'both selections reach the Host')
  assert.equal(settled.pending, null, 'no selection is left pending after both settle')
  assert.equal(settled.status, 'ready', 'the directory ends ready, not stuck selecting')
  // The stale reply settles last and must not publish over the newer choice.
  assert.equal(settled.current?.model, 'glm-5.3',
    'the newest selection wins even when an older reply settles after it')
}

// ---------------------------------------------------------------------------
// Data-layer contract 5: the shipped service is reused, not duplicated.
// ---------------------------------------------------------------------------
// When `modelDirectories` is already registered, the picker must use it — that
// is what keeps the seat and the /model popup on one selection state — and must
// not provide a second service under the same name (which throws).
{
  const shippedCalls = []
  const shipped = {
    directoryFor: (id) => {
      shippedCalls.push(id)
      return { store: { getSnapshot: () => ({ current: null, groups: [], failures: [], status: 'idle', pending: null, error: null, routable: null }), subscribe: () => () => {} }, select: async () => ({ ok: true }) }
    }
  }
  let provided = null
  const registrations = []
  const slots = {
    register: (opts, comp) => { registrations.push({ options: opts, component: comp }); return () => {} },
    inject: (_slot, cb) => { cb(); return () => {} }
  }
  const ctx = {
    get: (name) => name === 'locale' ? { getLocale: () => ({ locale: 'en-US' }) }
      : name === 'sessions' ? sessions
      : name === 'slots' ? slots
      : name === 'remote' ? remote
      : name === 'remote.session' ? remote.session
      : name === 'modelDirectories' ? shipped
      : undefined,
    remote,
    slots,
    provide: (name, value) => { provided = { name, value }; return () => {} },
    inject: (_deps, cb) => cb(ctx)
  }
  plugin.apply(ctx)
  assert.equal(provided, null, 'an existing modelDirectories service is not replaced')
  const mounted = registrations[0].options.inject('shared-1')
  assert.ok(shippedCalls.includes('shared-1'), 'the shipped directoryFor resolved the session')
  assert.equal(mounted.directory, undefined ?? mounted.directory, 'the picker received the shipped directory')
  assert.ok(mounted.directory && typeof mounted.directory.store.getSnapshot === 'function',
    'the picker reads the shipped directory store')
}

// The other locale is wired too (the panel starts closed, so open it first).
const english = mount('en-US')
hookState.length = 0
hookIndex = 0
const englishProps = { ...props, ...english.options.inject('session-1') }
const englishTrigger = collect(english.component(englishProps))
  .find((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox')
englishTrigger.props.onClick()
hookIndex = 0
const englishTree = english.component(englishProps)
const englishBox = collect(englishTree).find((node) => node.type === 'input')
assert.equal(englishBox?.props.placeholder, 'Search models', 'the English dictionary is used for an English locale')

// ---------------------------------------------------------------------------
// Manifest and display resources, per the bundle checklist.
// ---------------------------------------------------------------------------
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.dsh.client.platform, 'web')
// The client-module scanner locates a package with
// `createRequire(...).resolve('<name>/package.json')` and silently skips the entry
// when that throws, so a missing self-export means the client half is never served:
// no error anywhere, the plugin simply never reaches the browser.
assert.equal(pkg.exports['./package.json'], './package.json', 'the manifest must export itself for the client-module scanner')
assert.equal(pkg.exports['./client'], './client.js', 'the client entry must stay exported')
// No client-plugin dependency is declared on purpose. This plugin needs the slot,
// not the plugin that declares it: `ctx.slots.inject` already waits for the
// declaration, so an `inject` entry would only add an ordering edge for the client
// composition to satisfy — and one it failed on.
assert.deepEqual(pkg.dsh.client.inject, [], 'the client half declares no plugin dependency')
assert.ok(pkg.files.includes('client.js') && pkg.files.includes('icon.svg'), 'every runtime file and asset ships')
assert.ok(pkg.files.includes('locale/*.json'))
assert.ok(existsSync(new URL('cordis.patch.yml', root)), 'the patch exists')
assert.ok(existsSync(new URL('icon.svg', root)), 'the icon exists')
assert.ok(readFileSync(new URL('icon.svg', root), 'utf8').trimStart().startsWith('<svg'), 'the icon is an SVG image')
for (const file of ['en', 'zh']) {
  const meta = JSON.parse(readFileSync(new URL(`locale/${file}.json`, root), 'utf8')).meta
  assert.ok(meta.title.length > 0 && meta.description.length > 0, `${file} carries the display metadata`)
}

console.log('client.mjs: OK — 槽位注册、子槽位兼容契约、选择调用、双语与清单均已校验')
