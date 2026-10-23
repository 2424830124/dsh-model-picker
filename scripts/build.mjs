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
 *   4. Refuse to ship a file with a BOM, or a stylesheet template whose comments,
 *      backticks, or braces would make rules silently disappear at runtime.
 *
 * That is sound here because the sources are ordinary ES modules with static
 * relative imports and no name collisions across files. The checks below fail
 * loudly rather than emitting a subtly broken bundle.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = resolve(root, 'src/client.js')
const OUTPUT = resolve(root, 'client.js')

/** Local import specifiers: only these are bundled; anything else is a host module. */
const LOCAL_IMPORT = /^\s*import\s+([^'"]*?)\s*from\s*['"](\.[^'"]+)['"]\s*;?\s*$/gm
const BARE_IMPORT = /^\s*import\s+([^'"]*?)\s*from\s*['"]([^.'"][^'"]*)['"]\s*;?\s*$/gm
const SIDE_EFFECT_IMPORT = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm
/** A template literal, used to find the stylesheet strings embedded in a module. */
const TEMPLATE = /`([\s\S]*?)`/g

/**
 * Files the package ships that this script must never leave with a BOM.
 *
 * The unit test keeps its own copy on purpose: the two checks must be able to
 * fail independently, so a broken test cannot hide a broken build.
 */
const SHIPPED = [
  'package.json', 'index.js', 'client.js', 'cordis.patch.yml',
  'README.md', 'AGENTS.md', 'icon.svg', 'LICENSE',
  'locale/en.json', 'locale/zh.json'
]

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

/** Every template literal in a module that looks like CSS (it has a rule body). */
function cssTemplates(source) {
  return [...source.matchAll(TEMPLATE)]
    .map((match) => match[1])
    .filter((body) => body.includes('{') && body.includes('}'))
}

/**
 * Validate one stylesheet template.
 *
 * Two ways a template can produce CSS that silently does nothing, both checked
 * here because they share the same scan of the same string:
 *
 *  1. A nested or unterminated comment. A CSS comment closes at the FIRST `*`+`/`,
 *     so a second opener inside one swallows everything up to that single closer —
 *     the rules in that span simply do not exist, with no error anywhere.
 *  2. Unbalanced braces. A single stray `}` ends the rule it sits in and leaves
 *     every later rule orphaned — a full-bleed block instead of a track looks
 *     like a layout bug rather than a syntax one.
 *
 * A stray backtick cannot be checked from inside the body (the regex that found
 * the literal stops at the delimiter, so the body never contains one). It is
 * caught instead by counting delimiters over the whole module, below.
 *
 * @param css - the template body, exactly as the browser will see it.
 * @param where - the module path, for the error message.
 */
function validateCssTemplate(css, where) {
  let open = false
  let openAt = 0
  for (let i = 0; i < css.length; i += 1) {
    const two = css.slice(i, i + 2)
    if (!open && two === '/*') {
      open = true
      openAt = i
      i += 1
    } else if (open && two === '*/') {
      open = false
      i += 1
    } else if (open && two === '/*') {
      throw new Error(`${where}: nested CSS comment at offset ${i} (an inner /* inside the comment opened at ${openAt})`)
    }
  }
  if (open) {
    throw new Error(`${where}: unterminated CSS comment opened at offset ${openAt} — every rule after it is invisible at runtime`)
  }

  const visible = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let depth = 0
  let firstNegative = -1
  for (let i = 0; i < visible.length; i += 1) {
    if (visible[i] === '{') depth += 1
    else if (visible[i] === '}') {
      depth -= 1
      if (depth < 0 && firstNegative === -1) firstNegative = i
    }
  }
  if (firstNegative !== -1) {
    throw new Error(`${where}: unbalanced CSS braces — a closing brace at offset ${firstNegative} has no opener, so every rule after it is dropped`)
  }
  if (depth !== 0) {
    throw new Error(`${where}: unbalanced CSS braces — ${depth} unclosed block(s) at end of stylesheet`)
  }
}

/**
 * Refuse a stylesheet template that was terminated early.
 *
 * The classic cause: a backtick written inside a CSS comment. It closes the
 * stylesheet literal mid-sentence, everything after it stops being a string, and
 * the module fails to parse — the whole client half never registers, which from
 * the host log is indistinguishable from the bundle never being served.
 *
 * Counting delimiters is NOT enough: two stray backticks pair up happily and the
 * count stays even, while the CSS is mangled and the code between them is gone.
 * The structural test is what works: a stylesheet is bound with `const CSS = `
 * and its opening delimiter is followed by a newline. A backtick inside the body
 * is therefore always wrong, and the literal must close on its own line.
 *
 * Backticks in ordinary JS comments are fine and untouched — only the region
 * between this plugin's stylesheet delimiters is inspected.
 *
 * @param source - the module source.
 * @param where - the module path, for the error message.
 */
function validateTemplates(source, where) {
  const OPEN = /const\s+[A-Z_]*CSS\s*=\s*`\n/g
  for (const match of source.matchAll(OPEN)) {
    const bodyStart = match.index + match[0].length
    const rest = source.slice(bodyStart)
    // The literal closes at a backtick that ends the last rule line — never one
    // buried mid-sentence inside a comment. Scanning for the first backtick whose
    // following text is only optional whitespace, `)` or `;` matches both `}``
    // and a backtick on its own line.
    const closeRe = /`(?=\s*(?:[);,]|\n|$))/g
    const found = closeRe.exec(rest)
    if (found === null) {
      throw new Error(`${where}: the stylesheet literal opened here is never closed`)
    }
    const body = rest.slice(0, found.index)
    const stray = body.indexOf('`')
    if (stray !== -1) {
      const line = source.slice(0, bodyStart + stray).split('\n').length
      throw new Error(`${where}:${line}: backtick inside the stylesheet literal — it closes the template early and the module fails to load`)
    }
  }
}

/**
 * Refuse to emit two declarations of the same top-level name.
 *
 * Every module is concatenated into ONE factory function body, so the modules share
 * a single scope: if two of them declare `const X`, the whole bundle throws
 * `SyntaxError: Identifier 'X' has already been declared` and the module never
 * registers at all. The host then falls back to the shipped occupant, which looks
 * like "the plugin disappeared" with no useful error on screen.
 *
 * That happened once (a stale duplicate of a module's content), so it is checked on
 * every build and reported with both line numbers and the owning module.
 */
function validateDeclarations(bundle, modules) {
  // Which module owns a given line of the bundle, for the error message.
  const owner = (line) => {
    let current = '?'
    for (const { marker, from, to } of modules) {
      if (line >= from && line <= to) { current = marker; break }
    }
    return current
  }
  const pattern = /^(?:export\s+)?(?:const|let|var|class|function|async\s+function)\s+([A-Za-z_$][\w$]*)/gm
  const first = new Map()
  for (const match of bundle.matchAll(pattern)) {
    const name = match[1]
    const line = bundle.slice(0, match.index).split('\n').length
    if (first.has(name)) {
      const previous = first.get(name)
      throw new Error(
        `duplicate top-level declaration "${name}": ` +
        `${owner(previous.line)} (line ${previous.line}) and ${owner(line)} (line ${line}). ` +
        'All modules share one factory scope, so the bundle would fail to parse.'
      )
    }
    first.set(name, { line })
  }
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

/**
 * Refuse to leave a BOM in any file the package ships.
 *
 * The installer validates the installed package with a plain `JSON.parse`, and a
 * leading U+FEFF makes that throw "Unexpected token" — the install is rejected
 * and rolled back after the dependency was already resolved. On Windows the
 * usual cause is an editor or a `Set-Content -Encoding UTF8` call writing the
 * mark back into `package.json`, so this check runs on every build rather than
 * being discovered at publish time.
 */
const BOM = Buffer.from([0xEF, 0xBB, 0xBF])
const polluted = SHIPPED.filter((name) => {
  const path = resolve(root, name)
  if (!existsSync(path)) return false
  const head = readFileSync(path).subarray(0, 3)
  return head.equals(BOM)
})
if (polluted.length > 0) {
  throw new Error(`these files start with a UTF-8 BOM, which breaks the installer: ${polluted.join(', ')}`)
}

// One pass over the modules already in memory: the imports were stripped from
// `source` above, but the template literals are untouched by that, and reading
// each file a second time is how a check ends up validating stale bytes.
for (const { file, source } of order) {
  const where = relative(root, file).split('\\').join('/')
  validateTemplates(source, where)
  for (const css of cssTemplates(source)) validateCssTemplate(css, where)
}

/**
 * Write LAST, after every check has passed.
 *
 * The checks used to run after the write, which made a broken stylesheet a
 * broken client.js on disk: the build failed and printed the reason, but the
 * host had already been handed a bundle that does not parse. Writing at the end
 * keeps the previous good bundle in place when a source file is bad.
 *
 * The write goes through a temporary file and a rename: the host serves
 * `client.js` straight from disk on every page load, so a window can read it
 * while it is being replaced. `rename` on the same volume is atomic, so a reader
 * sees either the old file or the new one and never a half-written mix.
 */
const text = `${header}${body}\n`

// Line ranges of each module inside the assembled text, so a duplicate-declaration
// error can name both the module and the line rather than a bundle offset.
const moduleRanges = []
{
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const marker = '//# module: '
    if (lines[index].startsWith(marker)) {
      moduleRanges.push({ marker: lines[index].slice(marker.length), from: index + 1, to: lines.length })
    }
  }
  for (let index = 0; index < moduleRanges.length - 1; index += 1) {
    moduleRanges[index].to = moduleRanges[index + 1].from - 2
  }
}
validateDeclarations(text, moduleRanges)

const temp = `${OUTPUT}.tmp`
writeFileSync(temp, text, 'utf8')
renameSync(temp, OUTPUT)
console.log(`bundled ${order.length} module(s) -> ${relative(root, OUTPUT)}`)
for (const { file } of order) console.log(`  ${relative(root, file)}`)
