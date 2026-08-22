import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE_ROOTS = ['benchmarks', 'docs/src', 'examples', 'minis', 'packages', 'tools']
const SKIPPED_DIRECTORIES = new Set(['dist', 'node_modules', '.astro', '.nx'])
const RUNTIME_BARE_R3F = /^\s*import\s+(?!type\b).*\sfrom\s+['"]@react-three\/fiber['"]/m

function sourceFiles(directory: string): string[] {
  if (SKIPPED_DIRECTORIES.has(directory.split('/').at(-1)!)) return []
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.[cm]?[jt]sx?$/.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return []
    return [path]
  })
}

describe('R3F runtime entrypoints', () => {
  it('keeps production WebGPU code out of the legacy R3F entry graph', () => {
    const violations = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))).flatMap((path) =>
      RUNTIME_BARE_R3F.test(readFileSync(path, 'utf8')) ? [relative(ROOT, path)] : []
    )

    expect(violations).toEqual([])
  })
})
