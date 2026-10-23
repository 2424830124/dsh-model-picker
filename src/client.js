/**
 * Client entry: the module-loader registration and the plugin object.
 *
 * This file is the only browser entry the Client module loader knows about for
 * this package. Everything it uses lives in sibling modules under `src/`, and
 * `scripts/build.mjs` concatenates them into the served `client.js`.
 *
 * Why the picker shadows this slot at all: `conversation.input.model` is a
 * `single` slot whose shipped occupant carries `replaceRisk: shadows-shipped-ui`.
 * Shadowing it is a visual choice, so it lives in a bundle that can be turned
 * off again without touching any provider registration.
 *
 * On the `conversation.input.model.label` child slot: the shipped picker declares
 * it and provider plugins decorate it. This picker cannot join them — a child
 * slot may be declared exactly once and the shipped occupant keeps its
 * declaration even while shadowed, so a second declaration throws at
 * registration. The renderer then hands an entry a `renderSlot` binding only for
 * children that entry declared itself, so not declaring means not rendering. The
 * decorations therefore do not appear here and each model is shown by its plain
 * name. That is an accepted consequence of shadowing this slot, not an oversight.
 */
import { createCatalog } from './core/catalog.js'
import { createDirectoryService } from './core/directories.js'
import { isAvailable } from './core/selection.js'
import { createModelPicker } from './ui/ModelPicker.js'

const PLUGIN = 'dsh-model-picker'
const SLOT = 'conversation.input.model'
/** The shipped service that owns per-session model directories. */
const MODEL_DIRECTORIES = 'modelDirectories'
/**
 * BELOW the shipped occupant's `priority: 0`.
 *
 * For a `single` slot the LOWEST priority renders — the registry says so in its
 * own error text ("register at a different priority to shadow it (lowest
 * renders)"), and `entriesOfSlot` returns the first survivor of a
 * priority-sorted list. A larger number would have lost to the shipped picker
 * instead of shadowing it.
 */
const SHADOW_PRIORITY = -1

/**
 * Load-stage report.
 *
 * The packaged desktop app has no devtools, so a client half that fails to
 * register is indistinguishable from one that never loaded. Each stage is posted
 * to the Host half, which logs it next to its own `host 半边已 apply` line: the
 * pair tells the two cases apart immediately.
 *
 * @param stage - a short description of the load stage reached.
 */
const report = (stage) => {
  // The renderer console reaches the desktop app log, which is captured in every
  // diagnostics bundle. A POST to the Host half is kept as the richer channel,
  // but it cannot be the only one: it is a second thing that can fail (trust
  // fence, no route yet, offline), and a missing report then looks exactly like
  // "apply was never called".
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
 * way is only visible in the page — which the packaged desktop app gives no
 * devtools for. Both global hooks forward to the host log instead.
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
       * No fiber-level `inject`.
       *
       * A required service that is not visible from this context keeps the whole
       * entry in `loading`: Cordis never calls `apply`, and the client Loader
       * turns that into `web boot: 1 entry did not activate`, i.e. a dead
       * renderer. Waiting *inside* apply means an unmet dependency costs only the
       * registration instead of the entire boot.
       */
      apply(ctx) {
        report(`apply 已调用（slots=${ctx.get('slots') === undefined ? '尚未就绪' : '就绪'}）`)

        /**
         * The catalogue is built HERE, in `apply`, but it reads the `remote`
         * service LAZILY.
         *
         * Two facts pull in opposite directions and this is the seam between
         * them:
         *
         *  - Event subscriptions must be installed from the plugin's own `apply`
         *    fiber. The gateway registers a forwarded-event listener in the
         *    CALLING fiber's private event domain, and a subscription made from a
         *    `ctx.inject` callback lands in a different domain: `$on` returns a
         *    disposer, so it looks successful, but the listener never fires.
         *  - `remote` is frequently NOT visible yet when `apply` runs. Capturing
         *    `ctx.get('remote')` here froze `undefined`, and every catalogue load
         *    then answered "modelCatalog is unavailable".
         *
         * So the catalogue holds a resolver, not the face, and the subscription
         * is attached as soon as the service appears.
         */
        const remoteFace = () => {
          try { return ctx.get('remote') } catch { return undefined }
        }
        const catalog = createCatalog(remoteFace, (message) => { report(message) })
        /**
         * Attach the invalidation listeners, retrying once the remote exists.
         *
         * `ctx.inject` runs the callback as soon as the named services are
         * visible, which is the point at which `$on` can be reached — and it runs
         * in this same `apply` fiber, so the subscription still lands in the
         * dispatching domain.
         */
        let detachCatalog = () => {}
        const attachCatalog = () => {
          const remote = remoteFace()
          if (remote === undefined) return false
          detachCatalog = catalog.attach(remote, (event) => {
            report(`收到失效事件 ${event}`)
          })
          report(`失效订阅：已挂到 remote.$on`)
          return true
        }
        if (!attachCatalog()) {
          report('remote 尚未就绪，等它出现后再挂失效订阅')
          if (typeof ctx.inject === 'function') {
            ctx.inject(['remote'], () => { attachCatalog() })
          }
        }
        const detachReset = typeof ctx.on === 'function'
          ? ctx.on('connection/reset', () => { catalog.resetGeneration() })
          : undefined
        const sessions = (() => {
          try { return ctx.get('sessions') } catch { return undefined }
        })()
        const shipped = (() => {
          try { return ctx.get(MODEL_DIRECTORIES) } catch { return undefined }
        })()
        const directories = shipped !== undefined && typeof shipped.directoryFor === 'function'
          ? shipped
          : createDirectoryService(catalog, sessions, remoteFace)
        const ownsDirectories = directories !== shipped
        report(`目录来源：${ownsDirectories ? '本插件自带实现' : '复用官方 modelDirectories'}`)
        const detachDirectories = ownsDirectories && typeof ctx.provide === 'function'
          ? ctx.provide(MODEL_DIRECTORIES, directories)
          : undefined
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => {
            detachCatalog()
            detachReset?.()
            detachDirectories?.()
          }, 'dsh-model-picker: catalogue and directories')
        }

        const install = (scope) => {
          try {
            const at = scope ?? ctx
            const slots = at.slots ?? ctx.get('slots')
            if (slots === undefined) {
              report('slots 服务仍不可用，槽位未注册')
              return
            }
            const locale = ctx.get('locale')
            const localeId = typeof locale?.getLocale === 'function'
              ? String(locale.getLocale()?.locale ?? 'zh-CN')
              : 'zh-CN'
            /**
             * Neither `ctx.remote` nor `ctx.remote.session` can be read through
             * the property proxy without an `inject` entry — Cordis throws
             * `cannot get property "remote.session" without inject`, which crashed
             * this component on its first render and got the entry abdicated.
             *
             * `ctx.get(...)` returns `undefined` instead of throwing, so the
             * picker degrades to its "could not load the model list" state rather
             * than taking the whole slot down.
             */
            const remoteSession = at['remote.session'] ?? ctx.get('remote.session') ?? remoteFace()?.session

            slots.inject(SLOT, () => {
              report('槽位回调已运行，准备注册 occupant')
              /**
               * NO `children` declaration, on purpose.
               *
               * A child slot may be declared exactly once, and the shipped picker
               * already declares `conversation.input.model.label` for its own
               * occupant. Declaring it here threw during registration, which is
               * what removed the shipped occupant and left the slot empty.
               *
               * The consequence is that provider decorations mounted on the label
               * child do not render while this picker is in charge. Rendering them
               * would require owning the declaration, i.e. the shipped
               * `ui-model-selection` occupant being absent entirely.
               */
              const dispose = slots.register({
                name: SLOT,
                priority: SHADOW_PRIORITY,
                inject: (sessionId) => {
                  const sessionSessions = ctx.get('sessions')
                  /**
                   * The per-session directory is the data face of this picker.
                   *
                   * `directoryFor` is the shipped service's own entry point; when
                   * this plugin had to provide the service, the fallback has the
                   * same signature, so the component never knows the difference.
                   */
                  const directory = directories.directoryFor(sessionId)
                  // The shipped directory projects inside its constructor and on
                  // its subscriptions; it exposes no `sync`. Only this plugin's
                  // fallback has one, so probe instead of assuming — calling it
                  // unconditionally threw on the shipped service and took the
                  // whole slot registration down with it.
                  if (typeof directory?.sync === 'function') directory.sync()
                  /**
                   * The directory's own snapshot, reported once per registration.
                   *
                   * This is the line that tells the two "not refreshed" failure
                   * modes apart: if the group count here stops matching what the
                   * Host now offers, the directory is stale; if it tracks the Host
                   * while the panel still shows old rows, the panel is not
                   * rendering the update.
                   */
                  const snapshot = directory?.store?.getSnapshot?.()
                  report(`目录快照：${Array.isArray(snapshot?.groups) ? snapshot.groups.length : 0} 组 / 状态 ${snapshot?.status ?? '?'}`)
                  return {
                    sessionId,
                    localeId,
                    remote: remoteFace(),
                    remoteSession,
                    sessions: sessionSessions,
                    catalog,
                    directory,
                    available: isAvailable(sessionSessions, sessionId)
                  }
                }
              }, ModelPicker)
              report('occupant 已注册（priority ' + SHADOW_PRIORITY + '）')
              return dispose
            })
          } catch (error) {
            report(`槽位注册抛错：${error instanceof Error ? `${error.message}` : String(error)}`)
          }
        }

        // Soft wait: `apply` has already run, so a service that never shows up
        // can no longer fail the boot. The remotes are included because the
        // picker cannot do anything without them, and waiting here keeps the
        // failure to a missing control instead of a crashed one.
        if (typeof ctx.inject === 'function') ctx.inject(['slots', 'remote', 'remote.session'], install)
        else install(ctx)
      }
    }
  }
})
