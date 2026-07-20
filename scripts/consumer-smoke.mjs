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
 *      `npm run build` + a Playwright render check. Two kinds of consumer:
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

/**
 * Workspace-only wiring that must never appear in a scaffolded file. Twin of the
 * list in packages/create-three-flatland/src/scaffold.test.ts — that one guards the
 * templates as authored, this one guards the project a consumer actually receives
 * after a real registry install.
 */
const BANNED_IN_SCAFFOLD = [
  'catalog:',
  'workspace:*',
  'workspace:^',
  'customConditions',
  "conditions: ['source']",
  'TURBO_MFE_PORT',
  'FL_DEVTOOLS',
  'GemBackground',
]

/**
 * Deliberately excluded from the starter. These must not be DEPENDENCIES, but prose
 * may name them — AGENTS.md's package routing map is required to list
 * @three-flatland/devtools. Checked against package.json only.
 */
const BANNED_AS_SCAFFOLD_DEPENDENCY = ['@three-flatland/devtools', 'tweakpane']

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
function cleanup() {
  shuttingDown = true
  try {
    verdaccio?.kill('SIGTERM')
  } catch {
    /* already gone */
  }
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
    if (/package-lock\.json$/.test(file)) continue
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
    results.push({ id, dest, build: 'ok' })
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

async function renderCheck(built) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  for (const r of built) {
    const distDir = join(r.dest, 'dist')
    if (!existsSync(join(distDir, 'index.html'))) {
      r.render = 'fail'
      r.error = 'no dist/index.html after build'
      continue
    }
    const server = staticServer(distDir)
    const port = server.address().port
    const page = await browser.newPage()
    const pageErrors = []
    const consoleErrors = []
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    try {
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForSelector('canvas', { timeout: 20000 })
      // Let the render loop run a few frames, then confirm a real render surface.
      // We can't read WebGPU/WebGL pixels back reliably in headless (the front
      // buffer isn't preserved for drawImage), so "painted" is a live canvas of
      // non-zero size; the real failure signal is an uncaught error at init/run.
      await page.waitForTimeout(1500)
      const painted = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        return !!c && c.width > 0 && c.height > 0
      })
      // A page error (uncaught exception) is always fatal. Console errors are too,
      // EXCEPT resource-load failures — loaders here intentionally probe for an
      // optional baked sibling (e.g. <sheet>.normal.png) and fall back to runtime
      // synthesis, so a 404 there is by design, not a broken example.
      const fatalConsole = consoleErrors.filter(
        (t) => !/Failed to load resource|net::ERR_|ERR_ABORTED|status of 40\d/i.test(t)
      )
      const fatal = [...pageErrors, ...fatalConsole]
      if (fatal.length) {
        r.render = 'fail'
        r.error = `errors:\n${fatal.slice(0, 5).join('\n')}`
      } else if (!painted) {
        r.render = 'fail'
        r.error = 'canvas present but not painted (blank)'
      } else {
        r.render = 'ok'
      }
    } catch (err) {
      r.render = 'fail'
      r.error = String(err).slice(0, 800)
    } finally {
      await page.close()
      server.close()
    }
    console.log(`  ${r.render === 'ok' ? '✓' : '✗'} [${r.id}] render`)
  }
  await browser.close()
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
const failed = results.filter((r) => r.build === 'fail' || (!NO_RENDER && r.build === 'ok' && r.render !== 'ok'))
const passed = results.length - failed.length - skipped.length
console.log(`\n${'─'.repeat(60)}`)
console.log(
  `Consumer smoke: ${passed} passed, ${failed.length} failed, ${skipped.length} skipped (of ${results.length})`
)
for (const f of failed) console.log(`  ✗ ${f.id} — ${f.build === 'fail' ? 'build' : 'render'} failed`)
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
console.log('All packable consumers install + build' + (NO_RENDER ? '' : ' + render') + ' from the local registry. ✓')
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
