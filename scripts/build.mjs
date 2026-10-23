#!/usr/bin/env node
/**
 * Bundle `src/` into the single `client.js` the Client module loader serves.
 *
 * Why a build step at all: the loader hands a package exactly one browser
 * bundle (`exports["./client"]`) and executes it as a classic script. It has no
 * ESM resolution of its own for plugin sources, so the source tree cannot be
 * imported at runtime. Keeping the sources split and concatenating them here
 * gives maintainability without asking the host for a feature it does not have.
 *
 * The bundling model is deliberately tiny — no parser, no tree shaking, no
 * dependency resolution beyond this plugin's own files:
 *
 *   1. Read the entry module and every local `./x.js` import it reaches,
 *      depth first, in dependency order.
 *   2. Strip the `import`/`export` syntax the bundle does not need (the whole
 *      tree shares one function scope inside the loader factory).
 *   3. Emit them in that order, then the entry's own body.
 *
 * That is sound here because the sources are ordinary ES modules with static
 * relative imports and no name collisions across files. The checks below fail
 * loudly rather than emitting a subtly broken bundle.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = resolve(root, 'src/client.js')
const OUTPUT = resolve(root, 'client.js')

/** Local import specifiers: only these are bundled; anything else is a host module. */
const LOCAL_IMPORT = /^\s*import\s+([^'"]*?)\s*from\s*['"](\.[^'"]+)['"]\s*;?\s*$/gm
const BARE_IMPORT = /^\s*import\s+([^'"]*?)\s*from\s*['"]([^.'"][^'"]*)['"]\s*;?\s*$/gm
const SIDE_EFFECT_IMPORT = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm

/** Collect modules depth first so dependencies precede their importers. */
function collect(file, seen = new Set(), order = []) {
  if (seen.has(file)) return order
  seen.add(file)
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(LOCAL_IMPORT)) {
    const target = resolve(dirname(file), match[2])
    if (!existsSync(target)) throw new Error(`missing module ${match[2]} imported by ${relative(root, file)}`)
    collect(target, seen, order)
  }
  order.push({ file, source })
  return order
}

/** Rewrite one module into bundle form: drop imports, turn exports into consts. */
function transform({ file, source }) {
  const where = relative(root, file)
  let out = source

  // A bare import would need the host module table; the entry receives React
  // through the loader's `require`, so any bare import is a mistake here.
  for (const match of out.matchAll(BARE_IMPORT)) {
    throw new Error(`${where}: bare import "${match[2]}" is not supported — take host modules from the factory's require`)
  }
  for (const match of out.matchAll(SIDE_EFFECT_IMPORT)) {
    if (!match[1].startsWith('.')) throw new Error(`${where}: bare side-effect import "${match[1]}" is not supported`)
  }

  out = out.replace(LOCAL_IMPORT, '')
  out = out.replace(SIDE_EFFECT_IMPORT, '')

  // `export const x = …` / `export function f(…)` / `export class C`
  out = out.replace(/^(\s*)export\s+(const|let|var|function|class|async function)\s/gm, '$1$2 ')
  // `export { a, b }` — the names are already in scope.
  out = out.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  // `export default` has no meaning inside the shared scope.
  if (/^\s*export\s+default\b/m.test(out)) throw new Error(`${where}: "export default" is not supported in a bundled module`)

  return out.trimEnd()
}

const order = collect(ENTRY)
const body = order
  .map((module) => {
    const name = relative(root, module.file).split('\\').join('/')
    // A stable per-module marker: the test asserts the bundle carries every
    // source module, and a reader can tell where each section came from.
    return `//# module: ${name}\n${transform(module)}`
  })
  .join('\n\n')

const header = `/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: the modules under src/. Rebuild with \`node scripts/build.mjs\`.
 * This bundle is what the Client module loader serves; it is the only browser
 * entry the loader knows about for this package.
 */
`

writeFileSync(OUTPUT, `${header}${body}\n`, 'utf8')
console.log(`bundled ${order.length} module(s) -> ${relative(root, OUTPUT)}`)
for (const { file } of order) console.log(`  ${relative(root, file)}`)
