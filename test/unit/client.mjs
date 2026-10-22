/**
 * Offline checks for the model-picker client half.
 *
 * The contract a replacement picker must honour is "declare and render
 * `conversation.input.model.label`". That cannot be checked from the file text —
 * it happens inside the component — so this test drives the real component with a
 * miniature React and asserts the label slot was rendered, with the same payload
 * and the same `placement` values the shipped picker passes.
 *
 * The miniature React keeps hook state across passes, so a second render after the
 * catalogue promise settles shows the loaded list. That is enough to exercise the
 * selection path without a DOM or a real renderer.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

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

const remote = {
  session: {
    modelCatalog: async () => ({ ok: true, value: catalog }),
    selectModel: async (payload) => { selectCalls.push(payload); return { ok: true, value: undefined } }
  },
  $on: () => () => {}
}

const selectionFace = {
  getSnapshot: () => ({ next: { provider: 'workbuddy-cn', model: 'hy3' } }),
  subscribe: () => () => {}
}
const sessions = { binding: () => ({ session: { projections: { faceOf: () => selectionFace } } }) }

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

// Pass 1: nothing loaded yet, so the trigger falls back to the raw id.
hookState.length = 0
hookIndex = 0
const first = component(props)
assert.ok(texts(first).some((text) => text.includes('hy3')), 'the trigger names the current model while loading')

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

// The level control: its own button, its own list, and it carries the level.
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
assert.deepEqual(selectCalls[1], { sessionId: 'session-1', provider: 'workbuddy-cn', model: 'hy3', reasoningEffort: 'high' },
  'choosing a level keeps the model and adds the reasoning effort')

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
