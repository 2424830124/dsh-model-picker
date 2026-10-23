/**
 * Client entry: the module-loader registration and the plugin object.
 *
 * This plugin replaces ONLY the composer's model-selection UI. Everything behind
 * it — the per-session directory, the catalogue cache, the invalidation events,
 * the selection RPC — is the shipped `ui-model-selection` implementation, reached
 * through its `modelDirectories` service.
 *
 * That split works because the shipped plugin keeps its slot registration and its
 * component apart: the registration's `inject` hands the component a plain props
 * bundle (`available`, a `directory` store, `load`, `select`), and the component
 * may render however it likes. This entry registers the same slot with the same
 * `inject` contract and substitutes its own component.
 *
 * Why not copy the shipped bundle instead: a copy registers a second
 * `ModelDirectoryResolver` under the same service name, the two fight over it,
 * and the shipped plugin parks in `loading` — which fails the whole renderer
 * boot. Reusing the service avoids that, and keeps tracking upstream fixes.
 */
import { createModelPicker } from './ui/ModelPicker.js'

const PLUGIN = 'dsh-model-picker'
const SLOT = 'conversation.input.model'
const LABEL_CHILD_SLOT = 'conversation.input.model.label'
/** The service the shipped picker exposes for per-session model directories. */
const MODEL_DIRECTORIES = 'modelDirectories'
/**
 * BELOW the shipped occupant's `priority: 0`.
 *
 * For a `single` slot the LOWEST priority renders — the registry says so in its
 * own error text ("register at a different priority to shadow it (lowest
 * renders)"). A larger number would lose to the shipped picker instead of
 * shadowing it.
 */
const SHADOW_PRIORITY = -1

/**
 * Load-stage report.
 *
 * The packaged desktop app has no devtools, so a client half that fails to
 * register is indistinguishable from one that never loaded. Each stage is posted
 * to the Host half, which logs it beside its own line: the pair tells the two
 * cases apart immediately.
 *
 * @param stage - a short description of the load stage reached.
 */
const report = (stage) => {
  try {
    console.error(`[model-picker] ${stage}`)
  } catch {
    // no console in some hosts
  }
  try {
    void fetch('/model-picker/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
      keepalive: true
    }).catch(() => {})
  } catch {
    // diagnostics must never break the picker
  }
}

/**
 * The failure worth capturing happens *outside* apply: the client composition
 * builds this plugin object, then never applies it, and whatever it threw on the
 * way is only visible in the page.
 *
 * @param value - the thrown value, in any shape.
 * @returns a short description safe to log.
 */
const describe = (value) => {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

report('client.js 已执行，开始注册 factory')

try {
  window.addEventListener('error', (event) => {
    report(`页面 error：${describe(event?.error ?? event?.message)}`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    report(`页面 unhandledrejection：${describe(event?.reason)}`)
  })
} catch {
  // a missing window hook must never stop the plugin from registering
}

window.__ModuleLoader__.load({
  id: '@huai_xin/dsh-model-picker',
  factory(require) {
    report('factory 已运行，正在装配插件对象')
    const React = require('react')
    const ModelPicker = createModelPicker(React)

    return {
      name: PLUGIN,
      /**
       * Wait for the services the seat needs.
       *
       * The same set the shipped registration waits for, minus `commandUi` (this
       * plugin contributes no `/model` command). Declaring them as fiber
       * dependencies is safe: every one is registered by the time the composer
       * renders, and a missing one is a composition error worth failing loudly
       * rather than half-working.
       */
      inject: ['locale', 'sessions', 'slots', 'remote', 'remote.session'],
      apply(ctx) {
        report(`apply 已调用（slots=${ctx.get('slots') === undefined ? '尚未就绪' : '就绪'}）`)

        /**
         * Register the seat through the shipped directory service.
         *
         * `ctx.inject` runs this callback once the named services are visible, so
         * the registration lands at the same point the shipped one would. It is
         * also re-run if a service goes away and returns, which is what keeps the
         * seat from binding to `undefined` across a reconnect.
         */
        ctx.inject(['slots', MODEL_DIRECTORIES], (scope) => {
          const slots = scope.get('slots')
          const models = scope.get(MODEL_DIRECTORIES)
          const sessions = scope.get('sessions')
          const locale = scope.get('locale')
          const localeId = typeof locale?.getLocale === 'function'
            ? String(locale.getLocale()?.locale ?? 'zh-CN')
            : 'zh-CN'

          if (slots === undefined || models === undefined) {
            report(`槽位未注册：slots=${slots === undefined ? '缺失' : '就绪'} modelDirectories=${models === undefined ? '缺失' : '就绪'}`)
            return
          }

          slots.inject(SLOT, () => {
            report('槽位回调已运行，准备注册 occupant')
            /**
             * The same registration shape the shipped picker uses, including the
             * `conversation.input.model.label` child declaration.
             *
             * That declaration is what keeps provider decorations working:
             * `renderSlot` is only authorised for a child the entry declared
             * itself, so a replacement that skipped it would silently delete
             * every badge and availability hint mounted there.
             */
            const dispose = slots.register({
              name: SLOT,
              priority: SHADOW_PRIORITY,
              children: {
                [LABEL_CHILD_SLOT]: { kind: 'single', scope: 'session', inline: true }
              },
              inject: (sessionId) => {
                const directory = models.directoryFor(sessionId)
                const available = typeof sessions?.subagentAddress === 'function'
                  ? sessions.subagentAddress(sessionId) === undefined
                  : true
                return {
                  sessionId,
                  localeId,
                  available,
                  // The shipped registration hands over the STORE, not the
                  // controller; the component subscribes to it directly.
                  directory: directory.store,
                  load: () => {
                    if (available) directory.load().catch(() => {})
                  },
                  select: (selection) => available
                    ? directory.select(selection)
                    : Promise.resolve(undefined)
                }
              }
            }, ModelPicker)
            report(`occupant 已注册（priority ${SHADOW_PRIORITY}）`)
            return dispose
          })
        })
      }
    }
  }
})
