#!/usr/bin/env node
/**
 * Publication gate: prove the PACKED, PUBLISHED `three-flatland` artifact is Koota-free.
 *
 * Inspects what consumers actually receive — not workspace source. `pnpm pack`
 * applies publishConfig and the `files` allowlist, so the unpacked tarball IS the
 * published artifact (same insight as scripts/consumer-smoke.mjs, minus the
 * registry round-trip). Three edge classes are checked:
 *
 *   1. Manifest   — no `koota` entry in dependencies/peerDependencies of the
 *                   packed manifest, including optional peers.
 *   2. Types      — every declaration reachable from the packed `exports` map
 *                   (BFS over relative import/require/reference edges) must not
 *                   reference a koota module specifier or `/// <reference types>`.
 *   3. Runtime    — every shipped .js/.mjs/.cjs file and every shipped source
 *                   map (its `sources` paths and embedded `sourcesContent`)
 *                   must not reference koota.
 *
 * Only code artifacts enter the scan: README/CHANGELOG/codemod markdown may
 * mention Koota historically without failing, because prose is never part of
 * the runtime/type dependency graph. Koota remains free for unrelated
 * workspace apps and tools/ecs-bench — this gate reads ONLY the packed package
 * directory, never the repository at large (no repo-wide substring ban).
 *
 * Usage:
 *   node scripts/verify-no-koota-publication.mjs              # pack + verify
 *   node scripts/verify-no-koota-publication.mjs --dir <root> # verify an unpacked package dir
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE_DIR = join(ROOT, 'packages', 'three-flatland')

// One quoted-specifier regex covers every module-edge shape that quotes the
// name: static/dynamic import, export-from, require(), `declare module`,
// `/// <reference types>` attribute values, and subpaths like 'koota/react'.
const KOOTA_SPECIFIER = /(['"])koota(?:\/[^'"\n]*)?\1/g
// A koota token inside a sourcemap `sources` path segment.
const KOOTA_PATH_TOKEN = /(^|[/\\._-])koota([/\\._-]|$)/

export function findKootaReferences(source) {
  const references = []
  for (const match of source.matchAll(KOOTA_SPECIFIER)) {
    const line = source.slice(0, match.index).split('\n').length
    references.push({ match: match[0], line })
  }
  return references
}

/** Published dependency edges. Koota must not appear even as an optional peer. */
export function manifestKootaViolations(manifest) {
  const violations = []
  const fields = ['dependencies', 'peerDependencies']
  for (const field of fields) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (!KOOTA_PATH_TOKEN.test(`/${name}/`)) continue
      violations.push(
        `published package.json declares a Koota dependency edge: ${field}.${name} = "${range}" — ` +
          `remove it from packages/three-flatland/package.json, rebuild, and re-pack`
      )
    }
  }
  return violations
}

function normalizePaths(entries) {
  return entries.filter((entry) => typeof entry === 'string').map((entry) => entry.split(sep).join('/'))
}

function listFiles(root, filter) {
  return readdirSync(root, { recursive: true })
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.split(sep).join('/'))
    .filter(
      (entry) =>
        !entry.split('/').includes('node_modules') &&
        statSync(join(root, entry)).isFile() &&
        filter(entry)
    )
}

function typeTargets(value) {
  if (typeof value === 'string') return /\.(?:d\.ts|d\.mts|d\.cts)$/.test(value) ? [value] : []
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap(typeTargets)
}

function patternRegex(pattern) {
  const escaped = pattern.replace(/^\.\//, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replaceAll('*', '.+')}$`)
}

function existingFile(candidate) {
  return existsSync(candidate) && statSync(candidate).isFile()
}

function withinPackage(packageRoot, file) {
  const path = relative(packageRoot, file)
  return path !== '' && !path.startsWith(`..${sep}`) && path !== '..'
}

/** Declaration emit keeps JavaScript extensions in relative imports; prefer the sibling declaration. */
function declarationCandidate(packageRoot, importer, specifier) {
  const base = resolve(dirname(importer), specifier)
  if (!withinPackage(packageRoot, base)) return undefined
  const declaration = base.replace(/\.(?:m?js|ts)$/, '.d.ts')
  const candidates = [declaration, `${base}.d.ts`, resolve(base, 'index.d.ts'), base]
  return candidates.find(existingFile)
}

const RELATIVE_DEPENDENCY_PATTERNS = [
  /(?:from\s+|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g,
  /\bimport\s+(['"])(\.\.?\/[^'"]+)\1/g,
  /\bimport\s+[A-Za-z_$][\w$]*\s*=\s*require\s*\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/g,
  /\/\/\/\s*<reference\s+path\s*=\s*(['"])(\.\.?\/[^'"]+)\1\s*\/?>/g,
]

function declarationRoots(packageRoot, manifest) {
  const exportsMap = manifest.exports ?? {}
  const all = listFiles(packageRoot, () => true)
  const roots = new Set()
  for (const target of Object.values(exportsMap).flatMap(typeTargets)) {
    if (target.includes('*')) {
      const matcher = patternRegex(target)
      for (const file of all) if (matcher.test(file)) roots.add(resolve(packageRoot, file))
    } else {
      const file = resolve(packageRoot, target)
      if (!existingFile(file)) throw new Error(`exported declaration is missing from the packed artifact: ${target}`)
      roots.add(file)
    }
  }
  if (roots.size === 0) throw new Error('packed exports map did not resolve to any public declaration roots')
  return [...roots]
}

function walkDeclarations(packageRoot, manifest, report) {
  const pending = declarationRoots(packageRoot, manifest)
  const visited = new Set()
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    const rel = relative(packageRoot, file).split(sep).join('/')
    const source = readFileSync(file, 'utf8')
    for (const { match, line } of findKootaReferences(source)) {
      report.push(`${rel}: reachable public declaration references Koota (${match}) at line ${line}`)
    }
    for (const pattern of RELATIVE_DEPENDENCY_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const dependency = declarationCandidate(packageRoot, file, match[2])
        if (dependency !== undefined) pending.push(dependency)
      }
    }
  }
  return visited.size
}

const RUNTIME_EXTENSIONS = ['.js', '.mjs', '.cjs']

function scanRuntimeJavaScript(packageRoot, report) {
  const files = listFiles(packageRoot, (entry) => RUNTIME_EXTENSIONS.some((ext) => entry.endsWith(ext)))
  let scanned = 0
  for (const entry of files) {
    scanned++
    const source = readFileSync(join(packageRoot, entry), 'utf8')
    for (const { match, line } of findKootaReferences(source)) {
      report.push(`${entry}: production JavaScript references Koota (${match}) at line ${line}`)
    }
  }
  return scanned
}

function scanSourceMaps(packageRoot, report) {
  const files = listFiles(packageRoot, (entry) => entry.endsWith('.map'))
  let scanned = 0
  for (const entry of files) {
    scanned++
    const rel = entry
    let map
    try {
      map = JSON.parse(readFileSync(join(packageRoot, entry), 'utf8'))
    } catch {
      report.push(`${rel}: could not be parsed as a source map — unable to verify a Koota-free runtime edge`)
      continue
    }
    for (const sourcePath of normalizePaths(map.sources ?? [])) {
      if (KOOTA_PATH_TOKEN.test(sourcePath)) {
        report.push(`${rel}: sourcemap lists a Koota source path: ${sourcePath}`)
      }
    }
    for (const content of map.sourcesContent ?? []) {
      if (typeof content !== 'string') continue
      for (const { match, line } of findKootaReferences(content)) {
        report.push(
          `${rel}: sourcemap sourcesContent embeds original source referencing Koota (${match}) at content line ${line}`
        )
      }
    }
  }
  return scanned
}

/**
 * Verify one unpacked package directory (the contents of a packed tarball's
 * `package/`). Returns every violation plus scan counts so callers can tell a
 * real green from a vacuous one.
 */
export function collectPublicationViolations(packageRoot) {
  const manifestPath = join(packageRoot, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`no package.json under ${packageRoot} — pass an unpacked package dir`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  const violations = manifestKootaViolations(manifest)
  const declarationsWalked = walkDeclarations(packageRoot, manifest, violations)
  const javascriptScanned = scanRuntimeJavaScript(packageRoot, violations)
  const sourceMapsScanned = scanSourceMaps(packageRoot, violations)

  return {
    violations,
    scanned: { manifest: true, declarationsWalked, javascriptScanned, sourceMapsScanned },
  }
}

function packInto(destination) {
  execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd: PACKAGE_DIR, stdio: 'pipe' })
  const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'))
  const stem = manifest.name.replace('@', '').replace('/', '-')
  const tarball = join(destination, `${stem}-${manifest.version}.tgz`)
  if (!existsSync(tarball)) throw new Error(`pnpm pack did not produce the expected ${tarball}`)
  return tarball
}

function unpack(tarball, destination) {
  execFileSync('tar', ['-xzf', tarball, '-C', destination])
  const packageRoot = join(destination, 'package')
  if (!existingFile(join(packageRoot, 'package.json'))) {
    throw new Error(`tarball ${tarball} did not unpack to a package/ directory`)
  }
  return packageRoot
}

function printReport(result, packageRoot) {
  const { violations, scanned } = result
  if (violations.length > 0) {
    console.error(`✗ three-flatland packed artifact exposes a Koota edge (${packageRoot}):`)
    for (const violation of violations) console.error(`  - ${violation}`)
    console.error('')
    console.error('The published package must be installable and typed with NO Koota edge:')
    console.error('  1. no koota entry in the packed package.json dependencies/peerDependencies')
    console.error('  2. no koota reference reachable from the packed exports-map declarations')
    console.error('  3. no koota reference in shipped production JavaScript or its source maps')
    console.error('Manifest changes are owned by the internal-ECS convergence workstream.')
    return 1
  }
  console.log(
    `✓ three-flatland packed artifact is Koota-free: manifest ok, ` +
      `${scanned.declarationsWalked} reachable declaration(s), ${scanned.javascriptScanned} js file(s), ` +
      `${scanned.sourceMapsScanned} source map(s) scanned.`
  )
  return 0
}

async function main(argv) {
  const dirIndex = argv.indexOf('--dir')
  if (dirIndex !== -1) {
    const packageRoot = resolve(argv[dirIndex + 1] ?? '')
    return printReport(collectPublicationViolations(packageRoot), packageRoot)
  }

  const scratch = mkdtempSync(join(tmpdir(), 'flatland-koota-gate-'))
  try {
    console.log('• packing three-flatland (publishConfig applied → the exact published artifact)…')
    const tarball = packInto(scratch)
    const unpackDir = join(scratch, 'unpack')
    mkdirSync(unpackDir)
    unpack(tarball, unpackDir)
    return printReport(collectPublicationViolations(join(unpackDir, 'package')), join(unpackDir, 'package'))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
  )
}
