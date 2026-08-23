#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'

const packageDirectory = resolve(process.argv[2] ?? '.')
const forbidden = process.argv.slice(3)
if (forbidden.length === 0) {
  throw new Error('verify-public-declaration-boundary requires at least one forbidden text pattern')
}

const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'))
const exportsMap = manifest.publishConfig?.exports ?? manifest.exports ?? {}
const exportKeys = Object.keys(exportsMap)
if (exportKeys.some((key) => key === './ecs' || key.startsWith('./ecs/'))) {
  throw new Error('three-flatland: private ECS has a package export')
}

let cachedAllFiles

function allFiles() {
  return (cachedAllFiles ??= readdirSync(packageDirectory, { recursive: true })
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.split(sep).join('/')))
}

function typeTargets(value) {
  if (typeof value === 'string') return value.endsWith('.d.ts') ? [value] : []
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap(typeTargets)
}

function patternRegex(pattern) {
  const escaped = pattern.replace(/^\.\//, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replaceAll('*', '.+')}$`)
}

const roots = new Set()
for (const target of Object.values(exportsMap).flatMap(typeTargets)) {
  if (target.includes('*')) {
    const matcher = patternRegex(target)
    for (const file of allFiles()) {
      if (matcher.test(file)) roots.add(resolve(packageDirectory, file))
    }
  } else {
    const file = resolve(packageDirectory, target)
    if (!existsSync(file)) throw new Error(`three-flatland: exported declaration is missing: ${target}`)
    roots.add(file)
  }
}
if (roots.size === 0) {
  throw new Error('three-flatland: package exports did not resolve to any declaration roots')
}

function existingFile(candidate) {
  return existsSync(candidate) && statSync(candidate).isFile()
}

function declarationCandidate(importer, specifier) {
  const base = resolve(dirname(importer), specifier)
  // Declaration emit keeps JavaScript extensions in relative imports. Prefer
  // the sibling declaration before an existing `.js` implementation or the
  // reachability walk can cross from the public type graph into runtime code.
  const declaration = base.replace(/\.(?:m?js|ts)$/, '.d.ts')
  const candidates = [declaration, `${base}.d.ts`, resolve(base, 'index.d.ts'), base]
  return candidates.find(existingFile)
}

const forbiddenDirectories = forbidden
  .filter((pattern) => pattern.includes('/'))
  .map((pattern) => resolve(packageDirectory, 'dist', pattern))

function within(file, directory) {
  const path = relative(directory, file)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..')
}

function containsForbidden(source, pattern) {
  if (pattern.includes('/')) return source.includes(pattern)
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![$\\w])${escaped}(?![$\\w])`).test(source)
}

const pending = [...roots]
const visited = new Set()
const parent = new Map()
const violations = []
while (pending.length > 0) {
  const file = pending.pop()
  if (file === undefined || visited.has(file)) continue
  visited.add(file)
  for (const directory of forbiddenDirectories) {
    if (within(file, directory)) {
      const chain = []
      let current = file
      while (current !== undefined) {
        chain.push(relative(packageDirectory, current))
        current = parent.get(current)
      }
      violations.push(
        `${relative(packageDirectory, file)} resolves inside ${relative(packageDirectory, directory)} via ${chain
          .reverse()
          .join(' -> ')}`
      )
    }
  }
  const source = readFileSync(file, 'utf8')
  for (const pattern of forbidden) {
    if (containsForbidden(source, pattern)) {
      violations.push(`${relative(packageDirectory, file)} contains ${JSON.stringify(pattern)}`)
    }
  }

  const dependencyPatterns = [
    /(?:from\s+|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g,
    /\bimport\s+(['"])(\.\.?\/[^'"]+)\1/g,
    /\bimport\s+[A-Za-z_$][\w$]*\s*=\s*require\s*\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/g,
    /\/\/\/\s*<reference\s+path\s*=\s*(['"])(\.\.?\/[^'"]+)\1\s*\/?>/g,
  ]
  for (const dependencyPattern of dependencyPatterns) {
    for (const match of source.matchAll(dependencyPattern)) {
      const dependency = declarationCandidate(file, match[2])
      if (dependency !== undefined) {
        if (!parent.has(dependency) && !roots.has(dependency)) parent.set(dependency, file)
        pending.push(dependency)
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(`three-flatland: private declaration leak:\n${violations.join('\n')}`)
}

console.log(`three-flatland: ${visited.size} reachable public declaration files exclude ${forbidden.join(', ')}`)
