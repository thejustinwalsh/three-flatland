/**
 * Scaffold smoke — validation layer 2 for `create-three-flatland`.
 *
 * Proves that what we *publish* scaffolds into a project that installs and builds,
 * without touching the public registry:
 *
 * 1. `pnpm pack` the CLI plus the transitive `three-flatland` / `@three-flatland/*`
 *    closure of the two template manifests. `pnpm pack` materializes `catalog:` and
 *    `workspace:*` refs, so the tarballs are byte-equivalent to a real publish.
 * 2. Assert the CLI tarball is clean — it carries the templates (incl. `_gitignore`
 *    and the agent guidance files) and leaks no `dist`, `node_modules` or `.turbo`.
 * 3. Run the built CLI non-interactively for each template into a scratch dir.
 * 4. Inject `pnpm.overrides` mapping every packed name → `file:<tarball>`. This is
 *    why the gate is registry-independent: on a release PR the just-bumped version
 *    is not published yet, and a registry install would deadlock exactly when this
 *    gate matters most.
 * 5. `pnpm install` then `pnpm run build` in the scaffolded project.
 * 6. Assert `dist/index.html` exists and no workspace-only wiring leaked into the
 *    scaffolded tree.
 *
 * The banned-string list is the twin of the one in
 * `packages/create-three-flatland/src/scaffold.test.ts` — this script must run
 * standalone under `tsx`, so the list is duplicated rather than imported. Keep them
 * in sync.
 *
 * Cross-reference: `feat/nx-migration` owns registry-install testing via Verdaccio
 * (`pnpm test:consumer`). Fold this into that harness when the branch merges.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const CLI_DIR = join(REPO_ROOT, 'packages', 'create-three-flatland')
const CLI_DIST = join(CLI_DIR, 'dist', 'index.js')
const TEMPLATES = ['three', 'react'] as const

/** Workspace roots that may contain a publishable `@three-flatland/*` package. */
const PACKAGE_ROOTS = [join(REPO_ROOT, 'packages'), REPO_ROOT]

/**
 * Twin of the banned lists in packages/create-three-flatland/src/scaffold.test.ts.
 * Workspace-only wiring is never legitimate in any scaffolded file.
 */
const BANNED = [
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
 * Packages deliberately excluded from the starter. These must not be DEPENDENCIES,
 * but prose may name them — AGENTS.md's package routing map is required by the spec
 * to list @three-flatland/devtools. Checked against package.json only.
 */
const BANNED_AS_DEPENDENCY = ['@three-flatland/devtools', 'tweakpane']

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo'])

const failures: string[] = []
function fail(message: string): void {
  failures.push(message)
  console.error(`  ✗ ${message}`)
}
function ok(message: string): void {
  console.log(`  ✓ ${message}`)
}
function step(message: string): void {
  console.log(`[scaffold-smoke] ${message}`)
}

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    // execFileSync's message is just the command line; the actionable text is in the
    // captured streams, so surface them or the failure is undiagnosable from CI logs.
    const { stdout, stderr } = error as { stdout?: string; stderr?: string }
    const detail = [stdout, stderr].filter(Boolean).join('\n').trim()
    throw new Error(`\`${command} ${args.join(' ')}\` failed in ${cwd}\n${detail}`)
  }
}

type Manifest = {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  pnpm?: { overrides?: Record<string, string> }
}

function readManifest(dir: string): Manifest | undefined {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf-8')) as Manifest
}

function isOurs(name: string): boolean {
  return name === 'three-flatland' || name.startsWith('@three-flatland/')
}

/** name → package directory, for every workspace package that publishes under our namespace. */
function discoverPackages(): Map<string, string> {
  const found = new Map<string, string>()
  for (const root of PACKAGE_ROOTS) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue
      const dir = join(root, entry.name)
      const manifest = readManifest(dir)
      if (!manifest?.name || manifest.private === true) continue
      if (!isOurs(manifest.name) && manifest.name !== 'create-three-flatland') continue
      if (!found.has(manifest.name)) found.set(manifest.name, dir)
    }
  }
  return found
}

/**
 * Transitive `@three-flatland` closure of the template manifests. Computed, not
 * hardcoded, so a new template dependency is packed automatically. `packages/skia`
 * is public but expensive to pack — it stays out because nothing in the closure
 * reaches it.
 */
function computeClosure(packages: Map<string, string>): Set<string> {
  const queue: string[] = []
  for (const template of TEMPLATES) {
    const manifest = readManifest(join(CLI_DIR, 'templates', template))
    if (!manifest) throw new Error(`missing template manifest for "${template}"`)
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      if (isOurs(name)) queue.push(name)
    }
  }

  const closure = new Set<string>()
  while (queue.length > 0) {
    const name = queue.shift()!
    if (closure.has(name)) continue
    const dir = packages.get(name)
    if (dir === undefined) {
      fail(`template depends on "${name}" but no publishable workspace package provides it`)
      continue
    }
    closure.add(name)
    const manifest = readManifest(dir)!
    for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      if (isOurs(dep) && !closure.has(dep)) queue.push(dep)
    }
  }
  return closure
}

function pack(dir: string, destination: string): string {
  const stdout = run('pnpm', ['pack', '--pack-destination', destination], dir)
  const tarball = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.tgz'))
    .pop()
  if (tarball === undefined) throw new Error(`pnpm pack produced no tarball in ${dir}\n${stdout}`)
  return resolve(destination, tarball)
}

function tarEntries(tarball: string): string[] {
  return run('tar', ['-tzf', tarball], REPO_ROOT)
    .split('\n')
    .map((line) => line.trim().replace(/^package\//, ''))
    .filter(Boolean)
}

function checkCliTarball(tarball: string): void {
  const entries = tarEntries(tarball)
  const required = ['dist/index.js']
  for (const template of TEMPLATES) {
    required.push(
      `templates/${template}/_gitignore`,
      `templates/${template}/package.json`,
      `templates/${template}/index.html`,
      `templates/${template}/AGENTS.md`,
      `templates/${template}/CLAUDE.md`
    )
  }
  for (const entry of required) {
    if (entries.includes(entry)) ok(`tarball carries ${entry}`)
    else fail(`published CLI tarball is missing "${entry}"`)
  }

  // A real `.gitignore` inside the templates would be stripped by npm at pack time,
  // which is exactly why the template ships `_gitignore` and the scaffolder renames it.
  const leaked = entries.filter(
    (entry) =>
      entry.startsWith('templates/') &&
      (/(^|\/)node_modules(\/|$)/.test(entry) ||
        /(^|\/)dist(\/|$)/.test(entry) ||
        /(^|\/)\.turbo(\/|$)/.test(entry) ||
        /(^|\/)\.gitignore$/.test(entry))
  )
  if (leaked.length === 0) ok('tarball leaks no template dist/node_modules/.turbo/.gitignore entries')
  else fail(`published CLI tarball leaks build output: ${leaked.slice(0, 10).join(', ')}`)
}

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkFiles(full)
    else if (entry.isFile()) yield full
  }
}

function checkNoLeaks(root: string, template: string): void {
  let leaked = false
  for (const file of walkFiles(root)) {
    // Skip the files the smoke itself authored or that record its file: tarball paths.
    if (/(pnpm-lock\.yaml|pnpm-workspace\.yaml)$/.test(file)) continue
    const text = readFileSync(file, 'utf-8')
    for (const needle of BANNED) {
      if (text.includes(needle)) {
        fail(`${template}: scaffolded ${file.slice(root.length + 1)} leaked "${needle}"`)
        leaked = true
      }
    }
  }
  // Published templates ship AGENTS.md and CLAUDE.md as byte-identical copies,
  // so a scaffolded project never depends on an `@AGENTS.md` import resolving.
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf-8')
  const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf-8')
  if (agents !== claude) {
    fail(`${template}: AGENTS.md and CLAUDE.md are not byte-identical in the scaffolded project`)
    leaked = true
  } else {
    ok(`${template}: AGENTS.md and CLAUDE.md are byte-identical`)
  }

  const manifest = readFileSync(join(root, 'package.json'), 'utf-8')
  for (const needle of BANNED_AS_DEPENDENCY) {
    if (manifest.includes(needle)) {
      fail(`${template}: scaffolded package.json depends on "${needle}"`)
      leaked = true
    }
  }
  if (!leaked) ok(`${template}: no workspace-only wiring in the scaffolded tree`)
}

function smokeTemplate(template: string, scratch: string, tarballs: Map<string, string>): void {
  step(`${template}: scaffolding`)
  const workspace = join(scratch, `scaffold-${template}`)
  mkdirSync(workspace, { recursive: true })
  run(process.execPath, [CLI_DIST, 'smoke-app', '--template', template], workspace)

  const root = join(workspace, 'smoke-app')
  if (!existsSync(join(root, 'package.json'))) {
    fail(`${template}: CLI produced no package.json at ${root}`)
    return
  }

  // Install the packed tarballs instead of the registry: on a release PR the bumped
  // version is not published yet, and a registry install would fail there and only there.
  // The overrides also cover transitive `@three-flatland/*` deps, which a plain
  // dependency rewrite would leave pointing at the registry.
  //
  // pnpm >= 10.28 no longer reads the `pnpm` key from package.json — overrides live in
  // pnpm-workspace.yaml. `packages: []` makes the scaffolded project the (only) root
  // project, so this stays a single-project install.
  const overrides = [...tarballs].map(
    ([name, tarball]) => `  ${JSON.stringify(name)}: ${JSON.stringify(`file:${tarball}`)}`
  )
  writeFileSync(join(root, 'pnpm-workspace.yaml'), `packages: []\noverrides:\n${overrides.join('\n')}\n`)

  // `--ignore-scripts`: pnpm >= 10.28 exits non-zero on ERR_PNPM_IGNORED_BUILDS when a
  // transitive dep has an unapproved build script (vite → esbuild), and neither
  // `onlyBuiltDependencies` in pnpm-workspace.yaml nor in package.json suppresses it
  // (verified against pnpm 10.28.1). Skipping scripts outright is deterministic and
  // costs nothing here: esbuild ships its binary in a platform package, so `vite build`
  // — the thing this gate actually asserts — does not need the postinstall.
  step(`${template}: pnpm install`)
  run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], root)

  step(`${template}: vite build`)
  run('pnpm', ['run', 'build'], root)

  if (existsSync(join(root, 'dist', 'index.html'))) ok(`${template}: dist/index.html built`)
  else fail(`${template}: build produced no dist/index.html`)

  checkNoLeaks(root, template)
}

function main(): number {
  if (!existsSync(CLI_DIST)) {
    console.error(`[scaffold-smoke] ${CLI_DIST} not found — run \`pnpm build\` first.`)
    return 1
  }

  const scratch = mkdtempSync(join(tmpdir(), 'flatland-scaffold-smoke-'))
  try {
    const packages = discoverPackages()
    const closure = computeClosure(packages)
    step(`packing ${closure.size + 1} packages: create-three-flatland, ${[...closure].join(', ')}`)

    const tarballs = new Map<string, string>()
    for (const name of closure) tarballs.set(name, pack(packages.get(name)!, scratch))
    const cliTarball = pack(CLI_DIR, scratch)

    step('inspecting the published CLI tarball')
    checkCliTarball(cliTarball)

    for (const template of TEMPLATES) {
      try {
        smokeTemplate(template, scratch, tarballs)
      } catch (error) {
        fail(`${template}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  console.log('')
  if (failures.length > 0) {
    console.error(`[scaffold-smoke] FAILED (${failures.length}):`)
    for (const failure of failures) console.error(`  - ${failure}`)
    return 1
  }
  for (const template of TEMPLATES) console.log(`[scaffold-smoke] ${template}: OK`)
  return 0
}

process.exit(main())
