/**
 * Host half of the model-picker bundle.
 *
 * The picker itself is browser code, but a bundle needs a Host half — and this
 * one earns its place as the diagnostic channel. A client plugin that never
 * registers is invisible from the Host side: the module may never have been
 * served, may have thrown while loading, or may have applied without its slot
 * callback ever running, and all three look identical from the outside. The
 * browser inside the packaged desktop app has no devtools, so the client half
 * POSTs each load stage here and the answer lands in the host log, right beside
 * the `host half applied` line this file writes.
 */

const ROUTE = '/model-picker'
const MAX_BODY_BYTES = 8 * 1024

function readJsonBody(req) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        resolve(undefined)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) { resolve(undefined); return }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', () => resolve(undefined))
  })
}

export function apply(ctx) {
  ctx.logger.info('[model-picker] host 半边已 apply — 客户端入口 ./client，等待浏览器自检上报')

  ctx.inject(['webServer'], (scope) => {
    const server = scope.webServer
    const dispose = server.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (req, res) => {
        // The same trust fence the provider plugin uses: only peers the running
        // Web GUI already admits may write into the host log.
        const connection = ctx.get('connection')
        if (connection !== undefined && typeof connection.requestRejection === 'function') {
          const rejection = connection.requestRejection(req)
          if (rejection !== undefined) {
            res.statusCode = rejection
            res.end()
            return
          }
        }
        const path = String(req.url ?? '').split('?')[0]
        if (req.method !== 'POST' || path !== `${ROUTE}/client-log`) {
          res.statusCode = 404
          res.end()
          return
        }
        const body = await readJsonBody(req)
        const stage = typeof body?.stage === 'string' ? body.stage.slice(0, 200) : '(no stage)'
        ctx.logger.info(`[model-picker] 客户端自检：${stage}`)
        res.statusCode = 204
        res.end()
      }
    })
    scope.effect(() => dispose, 'dsh-model-picker: client log route')
  })
}
