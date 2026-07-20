#!/usr/bin/env node
/**
 * Consumer smoke test — proves the packages we PUBLISH actually work for a real
 * consumer, by installing them the way npm actually would.
 *
 * Faithful simulation — NO dependency-path rewriting:
 *   1. Build + `pnpm pack` each publishable package → tarballs. pnpm applies
 *      publishConfig, so each tarball is the exact published artifact (dist only,
 *      no dev `source` condition; workspace:* deps rewritten to real versions).
 *   2. Start a throwaway Verdaccio registry. Our packages are served ONLY from
 *      local storage (no npmjs merge, so a consumer can't silently pull a real
 *      published version); everything else (three, react, tweakpane, …) uplinks
 *      to npmjs.
 *   3. `npm publish` each packed tarball to it, at its real declared version.
 *   4. Install each CONSUMER from that registry with its manifest UNCHANGED, then
 *      `npm run build` + a Playwright render check (production `dist/`, plus a
 *      live `npm run dev` Vite server for the scaffolds). Two kinds of consumer:
 *        • examples — copied OUT of the repo (escapes the workspace/catalog).
 *        • scaffolds — `create-three-flatland` is itself installed from the
 *          registry, and its published CLI is run to generate a fresh project
 *          per template. That project's manifest is whatever the CLI emitted;
 *          nothing rewrites it.
 *
 * Because nothing rewrites any consumer package.json, the in-repo pnpm workspace +
 * `pnpm.overrides` (declared version → workspace:*) path is never touched — the
 * examples work in both locations, and a scaffolded project is proven to install
 * from a registry rather than from `file:` tarball overrides. That distinction is
 * the whole point: a `file:` install happily passes with a wrong `files` array, a
 * bad `publishConfig`, a missing dependency, or an unresolvable range.
 *
 * Usage: node scripts/consumer-smoke.mjs [--only <sel>[,<sel>…]] [--no-render]
 *
 * `--only` selects examples by slug (`skia` = both react and three) or by nx
 * project name (`example-react-skia` = just that one), and scaffolds by
 * `scaffold` (both), `scaffold-react` / `flatland-template-react` (just that
 * one), or `create-three-flatland` (both). CI passes the affected set on PRs so
 * a package change render-tests only the consumers that depend on it; releases
 * pass nothing and sweep all of them, to catch anything the dependency graph
 * didn't predict.
 */

import { execFileSync, spawn } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, extname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const ONLY = onlyArg
  ? new Set(
      onlyArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  : null
const NO_RENDER = args.includes('--no-render')

const CLI_PKG = 'create-three-flatland'
const CLI_DIR = join(ROOT, 'packages', CLI_PKG)
const TEMPLATES = ['three', 'react']

// Leak guard lists — single source of truth, shared with the scaffolder's own
// unit test so the two can never drift.
import { BANNED_AS_DEPENDENCY as BANNED_AS_SCAFFOLD_DEPENDENCY, BANNED_EVERYWHERE as BANNED_IN_SCAFFOLD }
  from '../packages/create-three-flatland/src/leak-guard.ts'

// Assertions that aren't about one consumer building — tarball shape, scaffolded
// tree hygiene. Collected so a single failure doesn't abort the sweep, and folded
// into the final verdict.
const assertionFailures = []
const assertOk = (msg) => console.log(`  ✓ ${msg}`)
const assertFail = (msg) => {
  assertionFailures.push(msg)
  console.error(`  ✗ ${msg}`)
}

const run = (cmd, cmdArgs, cwd, extraEnv) =>
  execFileSync(cmd, cmdArgs, { cwd, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ...extraEnv } })

// ── 1. Discover publishable packages + build + pack them ────────────────────

function publishablePackages() {
  const out = []
  for (const dir of readdirSync(join(ROOT, 'packages'))) {
    const p = join(ROOT, 'packages', dir, 'package.json')
    if (!existsSync(p)) continue
    const pkg = JSON.parse(readFileSync(p, 'utf8'))
    if (pkg.private === true || !pkg.scripts?.build) continue
    out.push({ dir, name: pkg.name, version: pkg.version })
  }
  return out
}

// Resolve scope FIRST. Everything below — building 10 packages, packing them,
// standing up Verdaccio, publishing tarballs — is pure waste if the selection
// is empty, so decide before paying for any of it. (`discoverExamples` and
// `discoverScaffolds` are hoisted function declarations, defined further down
// with the other consumer helpers.)
const CONSUMERS = [...discoverExamples(), ...discoverScaffolds()]
const WANTS_SCAFFOLD = CONSUMERS.some((c) => c.kind === 'scaffold')

// Always say what the scope was. A scoped run and a full run otherwise look
// identical in the log, and "2/2 green" over a 2-consumer subset reads as far
// more coverage than it is.
if (ONLY) {
  console.log(`consumer-smoke: SCOPED to ${CONSUMERS.length} consumer(s) via --only ${[...ONLY].join(',')}`)
  if (CONSUMERS.length === 0) {
    console.log('consumer-smoke: nothing selected — exiting green (no affected consumers to test)')
    process.exit(0)
  }
} else {
  console.log(`consumer-smoke: FULL sweep — all ${CONSUMERS.length} consumers`)
}

const PKGS = publishablePackages()

console.log(`consumer smoke — ${PKGS.length} publishable packages`)

// CI runs this only after the build job is green, so packages are built. Locally
// it's a cache hit if already built. A package that can't build here (skia's
// wasm can't compile on macOS — it packs from the committed libs) is skipped.
console.log('• ensuring packages are built (nx cache hit if already built)…')
try {
  run('pnpm', ['nx', 'run-many', '-t', 'build', ...PKGS.flatMap((p) => ['-p', p.name])], ROOT)
} catch {
  console.warn('  ⚠ some package builds failed — packing what built')
}

const TARBALL_DIR = mkdtempSync(join(tmpdir(), 'wc-tarballs-'))
console.log(`• pnpm pack → ${TARBALL_DIR}`)
const tarballs = {} // name → absolute tarball path
const versionOf = Object.fromEntries(PKGS.map((p) => [p.name, p.version]))
const unpackable = []
for (const p of PKGS) {
  try {
    run('pnpm', ['pack', '--pack-destination', TARBALL_DIR], join(ROOT, 'packages', p.dir))
    // Match the EXACT filename (<stem>-<version>.tgz), not a prefix: `three-flatland-`
    // is a prefix of `three-flatland-devtools-`, `three-flatland-nodes-`, … so a
    // `.startsWith()` find would grab the wrong package's tarball depending on the
    // (filesystem-dependent) readdir order — green on macOS, wrong on Linux CI.
    const stem = p.name.replace('@', '').replace('/', '-')
    const expected = `${stem}-${p.version}.tgz`
    if (existsSync(join(TARBALL_DIR, expected))) tarballs[p.name] = join(TARBALL_DIR, expected)
    else unpackable.push(p.name)
  } catch {
    unpackable.push(p.name)
    console.warn(`  ⚠ could not pack ${p.name} — examples needing it will be skipped`)
  }
}
const UNPACKABLE = new Set(unpackable)

// ── 2. Local Verdaccio registry seeded with the packed tarballs ─────────────

const REG_STORAGE = mkdtempSync(join(tmpdir(), 'wc-verdaccio-'))
const REG_PORT = await freePort()
const REG_URL = `http://127.0.0.1:${REG_PORT}`
const REG_HOST = `127.0.0.1:${REG_PORT}`
// A userconfig npmrc used for publish (needs a token; Verdaccio accepts any with
// publish:$all). The token line is keyed by host so npm sends it to Verdaccio.
const PUBLISH_NPMRC = join(REG_STORAGE, 'publish.npmrc')
writeFileSync(PUBLISH_NPMRC, `registry=${REG_URL}/\n//${REG_HOST}/:_authToken="consumer-smoke"\n`)

const cfgPath = join(REG_STORAGE, 'config.yaml')
const regLog = join(REG_STORAGE, 'verdaccio.log')
writeFileSync(
  cfgPath,
  [
    `storage: ${join(REG_STORAGE, 'storage')}`,
    'uplinks:',
    '  npmjs:',
    '    url: https://registry.npmjs.org/',
    '    maxage: 60m',
    'packages:',
    // Our packages: served ONLY from local storage — no proxy, so a consumer can
    // never silently resolve a real published version instead of our build.
    "  '@three-flatland/*':",
    '    access: $all',
    '    publish: $all',
    '    unpublish: $all',
    "  'three-flatland':",
    '    access: $all',
    '    publish: $all',
    '    unpublish: $all',
    // Listed SEPARATELY from `three-flatland`: these are minimatch patterns, and
    // `three-flatland` does not match `create-three-flatland`. Without its own
    // entry the scaffolder would fall through to the `**` npmjs uplink and the
    // smoke would test whatever is published there, not the CLI we just built.
    `  '${CLI_PKG}':`,
    '    access: $all',
    '    publish: $all',
    '    unpublish: $all',
    // Everything else proxies npmjs (three, react, tweakpane, …).
    "  '**':",
    '    access: $all',
    '    publish: $all',
    '    proxy: npmjs',
    'max_body_size: 200mb',
    `log: { type: file, path: ${regLog}, level: warn }`,
    '',
  ].join('\n')
)

let verdaccio
async function startRegistry() {
  const bin = resolve(ROOT, 'node_modules/.bin/verdaccio')
  console.log(`• starting Verdaccio on ${REG_URL} …`)
  // Bind to 127.0.0.1 explicitly — a bare port defaults to `localhost`, which on
  // macOS resolves to ::1 (IPv6), so a 127.0.0.1 client never connects.
  verdaccio = spawn(bin, ['--config', cfgPath, '--listen', `${REG_URL}/`], { stdio: 'ignore' })
  verdaccio.on('exit', (code) => {
    if (code && code !== 0 && !shuttingDown) console.error(`  ⚠ Verdaccio exited early (code ${code})`)
  })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${REG_URL}/-/ping`)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await sleep(300)
  }
  throw new Error('Verdaccio did not become ready within 30s')
}

let shuttingDown = false
// Scratch dirs created lazily later (e.g. the installed-CLI home) append here so
// they're torn down on every exit path, including SIGINT.
const cleanupDirs = [TARBALL_DIR, REG_STORAGE]
// Every Vite dev server we spawn, so cleanup() can reap them on ANY exit path —
// success, collected failure, thrown error, or SIGINT. Same posture as Verdaccio.
// Declared HERE, not next to its users further down: several early `process.exit`
// paths above run cleanup() before that point, and a `const` in the temporal dead
// zone would turn teardown into a ReferenceError.
const devServers = new Set()
function cleanup() {
  shuttingDown = true
  try {
    verdaccio?.kill('SIGTERM')
  } catch {
    /* already gone */
  }
  // Vite dev servers are spawned detached; without this an aborted run leaves an
  // orphaned vite holding a port. `killTree` is hoisted, so it's safe here.
  for (const rec of devServers) killTree(rec.child, 'SIGKILL')
  for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true })
}
process.on('exit', cleanup)
process.on('SIGINT', () => process.exit(130))
process.on('SIGTERM', () => process.exit(143))

await startRegistry()

console.log(`• publishing ${Object.keys(tarballs).length} tarballs to the local registry…`)
// `--tag alpha`: our packages are prerelease (0.1.0-alpha.*) and npm refuses to
// publish a prerelease without an explicit dist-tag. The tag is irrelevant to
// resolution — examples install by version range, which matches across all
// published versions regardless of tag.
const publishFailed = []
for (const [name, tgz] of Object.entries(tarballs)) {
  try {
    run(
      'npm',
      [
        'publish',
        tgz,
        '--tag',
        'alpha',
        '--registry',
        `${REG_URL}/`,
        '--userconfig',
        PUBLISH_NPMRC,
        '--loglevel',
        'warn',
      ],
      ROOT
    )
  } catch (err) {
    const msg = (err.stdout || '') + (err.stderr || '') || err.message
    console.error(`  ✗ failed to publish ${name}:\n${msg.slice(-600)}`)
    publishFailed.push(name)
  }
}
if (publishFailed.length) {
  // A pack succeeded but publish failed → the registry is missing packages the
  // examples need. That's a harness failure, not a clean skip; fail loudly rather
  // than silently skipping every example and reporting green.
  console.error(`\n✗ failed to publish to the local registry: ${publishFailed.join(', ')}`)
  process.exit(1)
}

// Verify every published package@version is actually resolvable BEFORE installing
// examples. npm publish can return 0 before Verdaccio has flushed the packument to
// storage, and an immediate `npm install` then hits ETARGET (green on a fast macOS
// FS, red on CI). Poll the packument until the version appears, and fail loudly
// with the exact package if it never does — never a silent all-examples failure.
async function packumentHas(name, version) {
  const enc = name.replace('/', '%2f')
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${REG_URL}/${enc}`)
      if (r.ok) {
        const j = await r.json()
        if (j?.versions?.[version]) return true
      }
    } catch {
      /* not queryable yet */
    }
    await sleep(250)
  }
  return false
}
const notReady = []
for (const name of Object.keys(tarballs)) {
  if (!(await packumentHas(name, versionOf[name]))) notReady.push(`${name}@${versionOf[name]}`)
}
if (notReady.length) {
  console.error(`\n✗ published but not resolvable in the registry: ${notReady.join(', ')}`)
  process.exit(1)
}

// ── 3. Per-consumer: materialize, install from the registry (manifest UNCHANGED) ─

function discoverExamples() {
  const out = []
  for (const type of ['react', 'three']) {
    const base = join(ROOT, 'examples', type)
    if (!existsSync(base)) continue
    for (const slug of readdirSync(base)) {
      if (slug === 'template') continue // scaffolding, not a shipped example
      const dir = join(base, slug)
      if (!existsSync(join(dir, 'package.json'))) continue
      // Match by slug (`skia` → both react+three) or nx project name
      // (`example-react-skia` → only that one), so CI can pass `nx affected`
      // output straight through without translating it.
      if (ONLY && !ONLY.has(slug) && !ONLY.has(`example-${type}-${slug}`)) continue
      out.push({ kind: 'example', type, slug, dir })
    }
  }
  return out
}

/**
 * One consumer per template: a project generated by the PUBLISHED CLI, installed
 * from the registry. Selectable by `scaffold` (both), the nx project name
 * `flatland-template-<t>` or `scaffold-<t>` (one), or `create-three-flatland`
 * (both) — so CI can pass `nx affected` output straight through here too.
 */
function discoverScaffolds() {
  const out = []
  for (const template of TEMPLATES) {
    const dir = join(CLI_DIR, 'templates', template)
    if (!existsSync(join(dir, 'package.json'))) continue
    const selectors = ['scaffold', `scaffold-${template}`, `flatland-template-${template}`, CLI_PKG]
    if (ONLY && !selectors.some((s) => ONLY.has(s))) continue
    out.push({ kind: 'scaffold', type: 'scaffold', slug: template, dir })
  }
  return out
}

const WORK = mkdtempSync(join(tmpdir(), 'wc-run-'))
const results = []

/**
 * Install the PUBLISHED create-three-flatland from the registry and return its bin
 * entry. Deliberately not `packages/create-three-flatland/dist/index.js`: running
 * the installed copy proves the tarball's `files` array actually ships a runnable
 * CLI plus its templates, which is the failure mode a repo-local invocation hides.
 */
let cliEntry
function ensureCli() {
  if (cliEntry) return cliEntry
  const home = mkdtempSync(join(tmpdir(), 'wc-cli-'))
  cleanupDirs.push(home)
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'scaffold-host', version: '0.0.0', private: true }))
  writeFileSync(join(home, '.npmrc'), `registry=${REG_URL}/\n@three-flatland:registry=${REG_URL}/\n`)
  console.log(`• installing ${CLI_PKG}@${versionOf[CLI_PKG]} from the local registry…`)
  run(
    'npm',
    [
      'install',
      `${CLI_PKG}@${versionOf[CLI_PKG]}`,
      '--no-audit',
      '--no-fund',
      '--loglevel',
      'error',
      '--registry',
      `${REG_URL}/`,
    ],
    home
  )
  cliEntry = join(home, 'node_modules', CLI_PKG, 'dist', 'index.js')
  if (!existsSync(cliEntry)) throw new Error(`installed ${CLI_PKG} has no dist/index.js`)
  return cliEntry
}

/** Assert the published CLI tarball carries the templates and leaks no build output. */
function checkCliTarball() {
  const tgz = tarballs[CLI_PKG]
  if (!tgz) {
    assertFail(`${CLI_PKG} was not packed — cannot inspect the published tarball`)
    return
  }
  const entries = run('tar', ['-tzf', tgz], ROOT)
    .split('\n')
    .map((l) => l.trim().replace(/^package\//, ''))
    .filter(Boolean)

  const required = ['dist/index.js']
  for (const t of TEMPLATES) {
    required.push(
      `templates/${t}/_gitignore`,
      `templates/${t}/package.json`,
      `templates/${t}/index.html`,
      `templates/${t}/AGENTS.md`,
      `templates/${t}/CLAUDE.md`
    )
  }
  const absent = required.filter((e) => !entries.includes(e))
  if (absent.length) assertFail(`published CLI tarball is missing: ${absent.join(', ')}`)
  else assertOk(`tarball carries dist/index.js + all ${TEMPLATES.length} templates' files`)

  // A real `.gitignore` inside the templates would be stripped by npm at pack time,
  // which is why the template ships `_gitignore` and the scaffolder renames it.
  const leaked = entries.filter(
    (e) => e.startsWith('templates/') && /(^|\/)(node_modules|dist|\.turbo|\.nx|\.gitignore)(\/|$)/.test(e)
  )
  if (leaked.length) assertFail(`published CLI tarball leaks build output: ${leaked.slice(0, 10).join(', ')}`)
  else assertOk('tarball leaks no template node_modules/dist/.turbo/.nx/.gitignore entries')
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkFiles(full)
    else if (entry.isFile()) yield full
  }
}

/** No workspace-only wiring survived into the project a consumer actually receives. */
function checkScaffoldedTree(root, template) {
  let clean = true
  for (const file of walkFiles(root)) {
    // package-lock.json records the registry URL, not workspace wiring.
    if (file.endsWith('package-lock.json')) continue
    const text = readFileSync(file, 'utf8')
    for (const needle of BANNED_IN_SCAFFOLD) {
      if (text.includes(needle)) {
        assertFail(`${template}: scaffolded ${file.slice(root.length + 1)} leaked "${needle}"`)
        clean = false
      }
    }
  }

  // Published templates ship AGENTS.md and CLAUDE.md as byte-identical copies, so a
  // scaffolded project never depends on an `@AGENTS.md` import resolving.
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8')
  const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8')
  if (agents === claude) assertOk(`${template}: AGENTS.md and CLAUDE.md are byte-identical`)
  else {
    assertFail(`${template}: AGENTS.md and CLAUDE.md are not byte-identical in the scaffolded project`)
    clean = false
  }

  // Dependencies only — prose may legitimately name these (AGENTS.md's routing map
  // is required to list @three-flatland/devtools).
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
  for (const banned of BANNED_AS_SCAFFOLD_DEPENDENCY) {
    if (deps.includes(banned)) {
      assertFail(`${template}: scaffolded package.json depends on "${banned}"`)
      clean = false
    }
  }
  if (clean) assertOk(`${template}: no workspace-only wiring in the scaffolded tree`)
}

if (WANTS_SCAFFOLD) {
  console.log('\n• inspecting the published CLI tarball…')
  checkCliTarball()
}

for (const ex of CONSUMERS) {
  const id = ex.kind === 'scaffold' ? `scaffold/${ex.slug}` : `${ex.type}/${ex.slug}`
  const dest = join(WORK, `${ex.type}-${ex.slug}`)
  // Skip consumers that need a flatland package we couldn't pack/publish — else
  // npm would 404 (our packages don't proxy npmjs) and the failure would be
  // about the harness, not the consumer. For a scaffold, the template manifest is
  // what the generated project's manifest is derived from, plus the CLI itself.
  const exDeps = (() => {
    const p = JSON.parse(readFileSync(join(ex.dir, 'package.json'), 'utf8'))
    return { ...p.dependencies, ...p.devDependencies }
  })()
  const needed = Object.keys(exDeps).concat(ex.kind === 'scaffold' ? [CLI_PKG] : [])
  const missing = needed.filter((d) => UNPACKABLE.has(d))
  if (missing.length) {
    results.push({ id, build: 'skip' })
    console.log(`  – [${id}] skipped (needs unpublished ${missing.join(', ')})`)
    continue
  }
  try {
    if (ex.kind === 'scaffold') {
      // Generate the project with the PUBLISHED CLI, into WORK. Non-interactive
      // (target dir + --template), which the CLI requires when stdin is not a TTY.
      console.log(`• [${id}] running the published CLI…`)
      run(process.execPath, [ensureCli(), `${ex.type}-${ex.slug}`, '--template', ex.slug], WORK)
      if (!existsSync(join(dest, 'package.json'))) throw new Error(`CLI produced no package.json at ${dest}`)
    } else {
      // Copy the example out of the repo (skip any local node_modules/dist).
      cpSync(ex.dir, dest, {
        recursive: true,
        filter: (src) => !/(^|\/)(node_modules|dist)(\/|$)/.test(src.slice(ex.dir.length)),
      })
    }
    // Either way the package.json is left UNTOUCHED — no `file:` overrides, no
    // dependency rewriting. Everything resolves by declared range from Verdaccio.
    //
    // Set BOTH the default and the @three-flatland-scoped registry. The scoped
    // one is essential: our packages ARE published to real npmjs at older
    // versions (e.g. @three-flatland/devtools@0.1.0-alpha.3), so if a scoped
    // package fell through to npmjs it would resolve the wrong version and the
    // example's `^1.0.0-alpha.5` would ETARGET. A project-level .npmrc has the
    // highest precedence, so this wins over any inherited scoped config.
    writeFileSync(join(dest, '.npmrc'), `registry=${REG_URL}/\n@three-flatland:registry=${REG_URL}/\n`)

    console.log(`• [${id}] npm install (from local registry)…`)
    // Force the registry on the COMMAND LINE, not just via .npmrc: CI sets a
    // higher-precedence `npm_config_registry` env var (env beats a project
    // .npmrc), so the .npmrc `registry=` alone let the default registry stay
    // npmjs — where our packages exist at OLDER versions (three-flatland maxes at
    // 0.1.0-alpha.6 there) → the example's ^0.1.0-alpha.8 ETARGET'd. A CLI flag
    // beats env. The @three-flatland scope is pinned in the .npmrc (no env
    // competes for a scoped key); third-party scopes use the default → npmjs uplink.
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error', '--registry', `${REG_URL}/`], dest)
    console.log(`• [${id}] npm run build…`)
    run('npm', ['run', 'build'], dest)
    if (!existsSync(join(dest, 'dist', 'index.html'))) throw new Error('build produced no dist/index.html')
    results.push({ id, dest, kind: ex.kind, build: 'ok' })
    console.log(`  ✓ [${id}] built against the published packages`)
    // Run AFTER the build: an install can materialize wiring the CLI didn't emit
    // (a stray lockfile entry, a postinstall-written file), and that counts.
    if (ex.kind === 'scaffold') checkScaffoldedTree(dest, ex.slug)
  } catch (err) {
    const msg = (err.stdout || '') + (err.stderr || '') || err.message
    results.push({ id, build: 'fail', error: msg.slice(-1500) })
    console.error(`  ✗ [${id}] FAILED\n${msg.slice(-1500)}`)
  }
}

// ── 4. Render check (Playwright) — pixels, not blank, no console errors ──────

/**
 * A frame must clear BOTH bars to count as painted. Calibrated by measuring the
 * real templates on headless Chromium at 1280×720 (230400 pixels sampled), then
 * measuring a deliberately blanked frame — the canvas swapped for a solid #16191e
 * fill — through the same code:
 *
 *   painted (three + react, prod dist AND dev server)  distinct=34  maxStd≈41.25
 *   blanked (mutation test)                            distinct=28  maxStd≈2.01
 *
 * `maxStd` is the term that discriminates, by a factor of ~20. `distinct` barely
 * separates the two and is NOT load-bearing: the templates overlay a fullscreen
 * button and a loading div on the canvas, and an element screenshot composites
 * those in, so even a dead frame carries a few dozen colours from page chrome.
 * It's kept only as a cheap floor against a screenshot that is literally one
 * colour. Do not raise it and assume it's guarding anything — it isn't.
 *
 * The stddev bar sits ~5× under what the templates produce and ~4× over the
 * blanked frame, so antialiasing, dpr, or a GPU-backend swap can't flip the
 * verdict in either direction.
 */
const MIN_DISTINCT_COLORS = 8
const MIN_CHANNEL_STDDEV = 8

/**
 * Pixel statistics for a PNG, decoded in a scratch browser page.
 *
 * The canvas front buffer genuinely can't be read back in headless (which is why
 * `toDataURL`/`drawImage` on the LIVE canvas is useless here) — but
 * `page.screenshot()` composites it correctly, and the resulting PNG is an
 * ordinary image that a 2D canvas will happily decode. Doing the decode in the
 * browser we already run avoids adding a Node PNG-decode dependency to the root.
 *
 * Colours are quantised to 5 bits/channel so gradient + AA noise doesn't inflate
 * the count; the stddev term is what actually proves tonal spread.
 */
async function pngStats(scratch, pngBuffer) {
  return scratch.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const w = img.naturalWidth
    const h = img.naturalHeight
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, w, h).data
    // Sample on a stride so a retina-sized frame stays a few milliseconds.
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 200_000)))
    const buckets = new Set()
    const sum = [0, 0, 0]
    const sumSq = [0, 0, 0]
    let n = 0
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4
        const rgb = [px[i], px[i + 1], px[i + 2]]
        buckets.add(((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3))
        for (let k = 0; k < 3; k++) {
          sum[k] += rgb[k]
          sumSq[k] += rgb[k] * rgb[k]
        }
        n++
      }
    }
    const std = sum.map((s, k) => Math.sqrt(Math.max(0, sumSq[k] / n - (s / n) ** 2)))
    return {
      w,
      h,
      sampled: n,
      distinct: buckets.size,
      maxStd: +Math.max(...std).toFixed(2),
    }
  }, pngBuffer.toString('base64'))
}

/**
 * Screenshot the canvas and prove the frame is non-trivial. Not a golden-image
 * match — the claim is only "something was actually drawn", which a solid clear
 * colour cannot satisfy.
 */
async function paintCheck(page, scratch) {
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box || box.width <= 0 || box.height <= 0) return { ok: false, why: 'canvas has no layout box', stats: null }
  const shot = await canvas.screenshot({ type: 'png' })
  const stats = await pngStats(scratch, shot)
  const ok = stats.distinct >= MIN_DISTINCT_COLORS && stats.maxStd >= MIN_CHANNEL_STDDEV
  return {
    ok,
    stats,
    why: ok
      ? null
      : `frame is uniform — distinct=${stats.distinct} (need ≥${MIN_DISTINCT_COLORS}), ` +
        `maxStd=${stats.maxStd} (need ≥${MIN_CHANNEL_STDDEV})`,
  }
}

// A page error (uncaught exception) is always fatal. Console errors are too,
// EXCEPT resource-load failures — loaders here intentionally probe for an
// optional baked sibling (e.g. <sheet>.normal.png) and fall back to runtime
// synthesis, so a 404 there is by design, not a broken example.
const isFatalConsole = (t) => !/Failed to load resource|net::ERR_|ERR_ABORTED|status of 40\d/i.test(t)

/**
 * Load a URL, collect errors, and assert real pixels. Shared verbatim by the
 * production-dist check and the dev-server check so neither can drift into being
 * the weaker assertion.
 */
/**
 * Hover the canvas centre and prove the frame CHANGES. The scaffolded templates
 * tint and grow the sprite on pointerover, so a changed frame means R3F's
 * raycaster and Flatland's camera agree about where the sprite is. That is the
 * exact coupling most likely to break silently — a static render check passes
 * happily while pointer events are dead.
 */
async function hoverCheck(page, scratch) {
  const before = await paintCheck(page, scratch)
  const box = await page.locator('canvas').boundingBox()
  if (!box) return { ok: false, why: 'no canvas box to hover' }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(700) // the hover lerp needs a few frames
  const after = await paintCheck(page, scratch)
  if (!before.stats || !after.stats) return { ok: false, why: 'could not sample frames' }
  const delta = Math.abs(after.stats.maxStd - before.stats.maxStd)
  const changed = delta > 0.25 || after.stats.distinct !== before.stats.distinct
  return changed
    ? { ok: true, why: `hover changed the frame (Δ maxStd ${delta.toFixed(2)})` }
    : { ok: false, why: `hover did not change the frame — pointer events are not reaching the sprite (Δ maxStd ${delta.toFixed(2)})` }
}

async function probe(browser, scratch, url, { waitUntil, hover = false }) {
  const page = await browser.newPage()
  const pageErrors = []
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  try {
    await page.goto(url, { waitUntil, timeout: 30000 })
    await page.waitForSelector('canvas', { timeout: 20000 })
    // Let the render loop run a few frames before sampling.
    await page.waitForTimeout(1500)
    const paint = await paintCheck(page, scratch)
    const fatal = [...pageErrors, ...consoleErrors.filter(isFatalConsole)]
    if (fatal.length) return { ok: false, error: `errors:\n${fatal.slice(0, 5).join('\n')}`, stats: paint.stats }
    if (!paint.ok) return { ok: false, error: paint.why, stats: paint.stats }
    if (hover) {
      const h = await hoverCheck(page, scratch)
      if (!h.ok) return { ok: false, error: h.why, stats: paint.stats }
      return { ok: true, stats: paint.stats, hover: h.why }
    }
    return { ok: true, stats: paint.stats }
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 800), stats: null }
  } finally {
    await page.close()
  }
}

const fmtStats = (s) => (s ? `distinct=${s.distinct} maxStd=${s.maxStd} (${s.w}×${s.h}, ${s.sampled} px sampled)` : 'n/a')

async function renderCheck(built) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  // One scratch page for PNG decoding, reused across consumers. Kept separate
  // from the page under test so its own console stays out of the assertions.
  const scratch = await browser.newPage()
  try {
    for (const r of built) {
      const distDir = join(r.dest, 'dist')
      if (!existsSync(join(distDir, 'index.html'))) {
        r.render = 'fail'
        r.error = 'no dist/index.html after build'
        console.log(`  ✗ [${r.id}] render`)
        continue
      }
      const server = staticServer(distDir)
      const port = server.address().port
      let res
      try {
        // Scaffolds additionally prove pointer events reach the sprite.
        const hover = r.kind === 'scaffold'
        res = await probe(browser, scratch, `http://localhost:${port}/`, { waitUntil: 'networkidle', hover })
      } finally {
        server.close()
      }
      r.render = res.ok ? 'ok' : 'fail'
      if (!res.ok) r.error = res.error
      console.log(
        `  ${res.ok ? '✓' : '✗'} [${r.id}] render — ${fmtStats(res.stats)}` +
          `${res.hover ? ` · ${res.hover}` : ''}${res.ok ? '' : `\n      ${res.error}`}`
      )
    }

    // ── dev-server check — scaffolds only ────────────────────────────────────
    //
    // Production-only coverage is blind to everything dev mode does differently:
    // React StrictMode double-mounts (so an effect that isn't idempotent blows up
    // only here), HMR wiring is live, and Vite serves unbundled ESM straight from
    // source. Restricted to the two scaffolds — the examples' dev path is covered
    // elsewhere and spinning a Vite server per example would balloon the sweep.
    for (const r of built.filter((x) => x.kind === 'scaffold')) {
      const dev = await startDevServer(r.dest, r.id)
      if (!dev.ok) {
        r.dev = 'fail'
        r.error = dev.error
        console.log(`  ✗ [${r.id}] dev — ${dev.error}`)
        continue
      }
      try {
        // 'load' rather than 'networkidle': Vite's dev client holds an open HMR
        // channel, and unbundled ESM means a long tail of module requests.
        const res = await probe(browser, scratch, dev.url, { waitUntil: 'load', hover: true })
        r.dev = res.ok ? 'ok' : 'fail'
        if (!res.ok) r.error = res.error
        console.log(
          `  ${res.ok ? '✓' : '✗'} [${r.id}] dev (${dev.url}) — ${fmtStats(res.stats)}` +
            `${res.hover ? ` · ${res.hover}` : ''}${res.ok ? '' : `\n      ${res.error}`}`
        )
      } finally {
        await stopDevServer(dev)
      }
    }
  } finally {
    await scratch.close()
    await browser.close()
  }
}

/** `npm run dev` on a pre-picked free port; resolves once Vite reports listening. */
async function startDevServer(dest, id) {
  const port = await freePort()
  console.log(`• [${id}] npm run dev…`)
  // detached: the npm wrapper spawns vite as a child, so killing the npm pid
  // alone orphans vite. Its own process group lets us signal the whole tree.
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    cwd: dest,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, BROWSER: 'none', NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  const rec = { child, log: '' }
  devServers.add(rec)
  // Strip ANSI as it arrives. Vite colourises the ready banner even onto a pipe,
  // and it wraps the PORT itself in escapes ("localhost:\e[1m5173\e[22m/"), so a
  // regex over the raw stream silently never matches and the wait times out.
  const capture = (buf) => {
    // Vite colourises its ready banner even onto a pipe, wrapping the port
    // digits themselves — strip SGR sequences so the URL regex can match.
    // eslint-disable-next-line no-control-regex
    rec.log += buf.toString().replace(/\u001b\[[0-9;]*m/g, '')
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)

  let exited = false
  child.on('exit', () => {
    exited = true
  })

  // Parse the port Vite ACTUALLY bound. `--port` is a request, not a guarantee —
  // without --strictPort Vite silently increments past a busy port, and a check
  // pointed at the requested port would then be testing whatever else is there.
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const m = rec.log.match(/Local:\s+(http:\/\/[^\s/]+)\/?/i)
    if (m) return { ...rec, ok: true, url: `${m[1]}/` }
    if (exited) {
      await stopDevServer(rec)
      return { ok: false, error: `dev server exited before listening:\n${rec.log.slice(-800)}` }
    }
    await sleep(200)
  }
  await stopDevServer(rec)
  return { ok: false, error: `dev server never reported a URL within 90s:\n${rec.log.slice(-800)}` }
}

async function stopDevServer(rec) {
  if (!rec?.child) return
  devServers.delete(rec)
  killTree(rec.child)
  // Give the group a beat to unwind before the harness moves on, so a port isn't
  // still held when the next consumer picks one.
  for (let i = 0; i < 25 && rec.child.exitCode === null && rec.child.signalCode === null; i++) await sleep(100)
  if (rec.child.exitCode === null && rec.child.signalCode === null) killTree(rec.child, 'SIGKILL')
}

function killTree(child, signal = 'SIGTERM') {
  try {
    // Negative pid = the whole process group (npm + the vite it spawned).
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* already gone */
    }
  }
}

function staticServer(dir) {
  const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
  }
  const srv = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0])
    if (p === '/' || p.endsWith('/')) p += 'index.html'
    const file = join(dir, p)
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.statusCode = 404
      return res.end('not found')
    }
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
    res.end(readFileSync(file))
  })
  srv.listen(0)
  return srv
}

if (!NO_RENDER) {
  const built = results.filter((r) => r.build === 'ok')
  if (built.length) {
    console.log(`\n• render-checking ${built.length} built consumers…`)
    await renderCheck(built)
  }
}

// ── 5. Report ───────────────────────────────────────────────────────────────

const skipped = results.filter((r) => r.build === 'skip')
// A scaffold only passes if its dev server rendered too. `r.dev` is undefined for
// examples (never dev-checked) and for every consumer under --no-render, so the
// clause is scoped to records that actually ran one.
const failed = results.filter(
  (r) =>
    r.build === 'fail' ||
    (!NO_RENDER && r.build === 'ok' && (r.render !== 'ok' || (r.dev !== undefined && r.dev !== 'ok')))
)
const passed = results.length - failed.length - skipped.length
console.log(`\n${'─'.repeat(60)}`)
console.log(
  `Consumer smoke: ${passed} passed, ${failed.length} failed, ${skipped.length} skipped (of ${results.length})`
)
for (const f of failed) {
  const stage = f.build === 'fail' ? 'build' : f.render !== 'ok' ? 'render' : 'dev'
  console.log(`  ✗ ${f.id} — ${stage} failed${f.error ? `\n      ${String(f.error).split('\n')[0]}` : ''}`)
}
if (assertionFailures.length) {
  console.log(`  ✗ ${assertionFailures.length} assertion(s) failed:`)
  for (const a of assertionFailures) console.log(`      - ${a}`)
}
if (unpackable.length) console.log(`  (unpublished packages: ${unpackable.join(', ')})`)
if (failed.length || assertionFailures.length) {
  console.log(`\nWorkdir kept for inspection: ${WORK}`)
  console.log(`Verdaccio log: ${regLog}`)
  process.exit(1)
}
if (passed === 0) {
  // Nothing actually exercised the packages — a false green. Treat as failure.
  console.error('✗ no consumer was built — every one was skipped. Nothing was tested.')
  process.exit(1)
}
rmSync(WORK, { recursive: true, force: true })
console.log(
  'All packable consumers install + build' +
    (NO_RENDER ? '' : ' + render (prod dist, and a live dev server for the scaffolds)') +
    ' from the local registry. ✓'
)
// Exit explicitly: the spawned Verdaccio child keeps the event loop alive, so
// without this the process hangs after printing success until the job's timeout
// cancels it (green script, "cancelled" CI job). The `exit` handler kills it.
process.exit(0)

// ── helpers ─────────────────────────────────────────────────────────────────

function freePort() {
  return new Promise((res, rej) => {
    const s = netServer()
    s.once('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
  })
}
