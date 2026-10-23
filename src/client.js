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
       * The services this half reads, PLUS the ones the shipped directory service
       * reads on its own behalf.
       *
       * `remote` and `remote.session` look unused here — this file never mentions
       * them — but `models.directoryFor(sessionId)` calls into the shipped
       * resolver, and that call runs in THIS entry's fiber. Cordis only exposes a
       * service to a fiber that declares it, so dropping them makes every
       * `directoryFor` throw
       *
       *   cannot get property "remote.session" without inject
       *
       * from inside `inject`. The renderer catches that, retires the entry and
       * silently paints the shipped picker — the plugin "just disappears".
       * Declaring what the callee needs is part of calling it, so they stay.
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
        // `remote` / `remote.session` are declared here as well as on the plugin:
        // this callback runs in the fiber that `ctx.inject` creates, and the
        // directory resolver uses those two services through that context.
        ctx.inject(['slots', MODEL_DIRECTORIES, 'remote', 'remote.session'], (scope) => {
          const slots = scope.get('slots')
          const sessions = scope.get('sessions')
          /**
           * The locale SERVICE, handed to the component as an observable source.
           *
           * Its snapshot is `{ active, locales, revision }` — NOT `{ locale }`.
           * Reading the wrong field made every UI string fall back to Chinese no
           * matter which language the shell was set to.
           *
           * It is passed through as a `{ getSnapshot, subscribe }` pair rather
           * than resolved to a string here: `inject` is cached per session
           * binding, so a string captured now would never follow a language
           * switch made while the composer is on screen.
           */
          const locale = scope.get('locale')
          const localeSource = locale !== undefined &&
            typeof locale.getSnapshot === 'function' &&
            typeof locale.subscribe === 'function'
            ? locale
            : undefined
          const initialLocale = localeSource?.getSnapshot?.()?.active
          const localeId = typeof initialLocale === 'string' && initialLocale.length > 0
            ? initialLocale
            : 'zh-CN'

          if (slots === undefined) {
            report('槽位未注册：slots 缺失')
            return
          }

          /**
           * Register the seat.
           *
           * Two details matter:
           *
           *  - NO `children` table. The child slot `conversation.input.model.label`
           *    is declared by the shipped occupant, and a child declaration is
           *    EXCLUSIVE per slot key: `slots.register` throws
           *    `slot "…label" is already declared (by …)` the moment a second entry
           *    offers the same child. The throw escapes the slot callback and the
           *    picker stops rendering. Disposing first does not help either — the
           *    declaration belongs to the shipped entry, which never disposes.
           *
           *  - The service lookup happens INSIDE the callback. `models` may not be
           *    visible yet when `apply` runs; reading it here means the registration
           *    waits for it instead of binding to undefined.
           *
           * The cost of dropping the child declaration is that provider badges
           * mounted at `conversation.input.model.label` no longer render here. That
           * is the same trade the reference plugin makes, and it is what makes the
           * registration survive.
           */
          let disposeCurrent = null
          slots.inject(SLOT, () => {
            const models = scope.get(MODEL_DIRECTORIES)
            if (models === undefined) {
              report('modelDirectories 缺失，暂不注册')
              return () => {}
            }
            // The callback can fire more than once (a service re-appearing re-runs
            // it). Registering twice at the same priority throws
            // `single slot "…" already has a registration`, so the previous one is
            // released first. Without a children table this is safe — the child
            // declaration is what cannot be released.
            if (disposeCurrent !== null) {
              try {
                disposeCurrent()
              } catch {
                // Already gone.
              }
              disposeCurrent = null
            }
            report('槽位回调已运行，准备注册 occupant')
            disposeCurrent = slots.register({
              name: SLOT,
              priority: SHADOW_PRIORITY,
              inject: (sessionId) => {
                const directory = models.directoryFor(sessionId)
                const available = typeof sessions?.subagentAddress === 'function'
                  ? sessions.subagentAddress(sessionId) === undefined
                  : true
                return {
                  localeId,
                  localeSource,
                  available,
                  // The shipped registration hands over the STORE, not the
                  // controller; the component subscribes to it directly.
                  directory: directory.store,
                  load: () => {
                    if (available) directory.load().catch(() => {})
                  },
                  /**
                   * Submit one triple.
                   *
                   * The RESULT IS PASSED THROUGH UNCHANGED. `ModelDirectory.select`
                   * resolves to `{ ok: true, value }` or `{ ok: false, error }`,
                   * and the component — like the shipped one — reads `ok` to
                   * decide whether to close the panel and which failure to show.
                   * Mapping it to a boolean here made every successful pick look
                   * like a failure: the model switched but the list stayed open,
                   * and a settled effort level dropped its optimistic draft.
                   */
                  select: (selection) => available
                    ? directory.select(selection)
                    : Promise.resolve(undefined)
                }
              }
            }, ModelPicker)
            return () => {
              if (disposeCurrent !== null) {
                try { disposeCurrent() } catch { /* already gone */ }
                disposeCurrent = null
              }
            }
          })
        })
      }
    }
  }
})
