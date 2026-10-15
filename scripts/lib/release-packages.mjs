import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Let pnpm expand its own workspace globs, including public packages outside
// packages/ and packages with no build target (for example, skills/).
export function workspacePackages(root) {
  const projects = JSON.parse(execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }))
  return projects.map(({ path }) => ({
    dir: path,
    ...JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')),
  }))
}

export function publicPackages(workspaces) {
  return workspaces.filter((pkg) => pkg.private !== true)
}

// Inspect the packed manifest, after pnpm has applied publishConfig and
// rewritten workspace/catalog versions. Source manifests cannot prove this.
export function verifyPackedManifest(packed, expected, workspaces) {
  const errors = []
  if (packed.name !== expected.name || packed.version !== expected.version) {
    errors.push(`expected ${expected.name}@${expected.version}, got ${packed.name}@${packed.version}`)
  }
  // The private repository root shares the public core package's name.
  const publicNames = new Set(publicPackages(workspaces).map((pkg) => pkg.name))
  const privateNames = new Set(workspaces.filter((pkg) => pkg.private === true && !publicNames.has(pkg.name)).map((pkg) => pkg.name))
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(packed[field] ?? {})) {
      if (/^(?:workspace|catalog|file|link):/.test(range)) errors.push(`${field}.${name}: unresolved ${range}`)
      if (privateNames.has(name)) errors.push(`${field}.${name}: private workspace package cannot be installed`)
    }
  }
  if (/"source"\s*:/.test(JSON.stringify(packed.exports))) errors.push('published exports contain a source condition')
  if (errors.length) throw new Error(`${expected.name}: ${errors.join('; ')}`)
}

export function verifyPackedFiles(manifest, entries) {
  const files = new Set(entries.map((entry) => entry.replace(/^package\//, '')))
  const targets = []
  function collect(value) {
    if (typeof value === 'string') targets.push(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  for (const field of ['main', 'module', 'types', 'bin', 'exports']) collect(manifest[field])
  if (manifest.name === 'three-flatland') {
    targets.push('codemods/README.md', 'codemods/koota-peer-dependency-removal.md', 'codemods/effect-vector-whole-tuple.md')
  }
  for (const target of targets) {
    const path = target.replace(/^\.\//, '')
    const pattern = new RegExp(`^${path.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
    if (![...files].some((file) => pattern.test(file))) throw new Error(`${manifest.name}: packed target is missing: ${target}`)
  }
}
