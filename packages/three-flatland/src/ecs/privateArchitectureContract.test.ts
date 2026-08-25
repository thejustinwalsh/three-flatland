import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = new URL('../', import.meta.url)
const packageRoot = new URL('../../', import.meta.url)
const repositoryRoot = new URL('../../../../', import.meta.url)

function productionTypeScriptFiles(directory: URL): URL[] {
  const files: URL[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) {
      files.push(...productionTypeScriptFiles(child))
      continue
    }
    if (!entry.name.endsWith('.ts') || /\.(?:test|type-test)(?:-d)?\.ts$/.test(entry.name)) continue
    files.push(child)
  }
  return files
}

function markdownFiles(directory: URL): URL[] {
  const files: URL[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) {
      files.push(...markdownFiles(child))
      continue
    }
    if (!/\.mdx?$/.test(entry.name)) continue
    files.push(child)
  }
  return files
}

describe('private ECS architecture contract', () => {
  it('keeps Koota out of three-flatland production source', () => {
    const importsKoota: string[] = []
    for (const file of productionTypeScriptFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8')
      if (/\b(?:from\s*|import\s*\()\s*['"]koota['"]/.test(source)) {
        importsKoota.push(fileURLToPath(file))
      }
    }

    expect(importsKoota).toEqual([])
  })

  it('does not publish an ECS or private-runtime subpath', () => {
    const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) as {
      exports: Record<string, unknown>
      publishConfig: { exports: Record<string, unknown> }
    }

    for (const exportsMap of [manifest.exports, manifest.publishConfig.exports]) {
      expect(Object.keys(exportsMap).some((key) => key === './ecs' || key.startsWith('./ecs/'))).toBe(false)
      expect(JSON.stringify(exportsMap)).not.toContain('src/ecs/runtime')
      expect(JSON.stringify(exportsMap)).not.toContain('dist/ecs/runtime')
    }
  })

  it('preserves Koota provenance in public private-ECS documentation', () => {
    const publicDocumentation = [
      new URL('README.md', repositoryRoot),
      new URL('packages/three-flatland/README.md', repositoryRoot),
      new URL('packages/three-flatland/CHANGELOG.md', repositoryRoot),
      ...markdownFiles(new URL('packages/three-flatland/codemods/', repositoryRoot)),
      ...markdownFiles(new URL('docs/src/content/docs/', repositoryRoot)),
      ...markdownFiles(new URL('.changeset/', repositoryRoot)),
    ]
    const privateEcsDocument =
      /\b(?:private|internal)\s+(?:(?:typed|data-oriented|renderer)\s+)*(?:ECS|runtime|renderer core)\b|\bKoota-backed renderer coordination\b/i
    const missingAttribution: string[] = []
    let checkedDocuments = 0

    for (const file of publicDocumentation) {
      const source = readFileSync(file, 'utf8')
      if (!privateEcsDocument.test(source) && !/(?:private-ecs|koota-free)/.test(file.pathname)) continue
      checkedDocuments++

      const linksKoota = source.includes('https://github.com/pmndrs/koota')
      const recordsFoundation =
        /\b(?:made|makes)\b[^.]*\b(?:design|specialization)\b[^.]*\bpossible\b/i.test(source) ||
        /\b(?:grew|grows)\s+from\b/i.test(source) ||
        /\bdesign foundation\b/i.test(source)
      const preservesRole =
        /\b(?:recommended|good fit)\b[^.]*\b(?:general-purpose|application|gameplay)\b[^.]*\bECS\b/i.test(source)

      if (!linksKoota || !recordsFoundation || !preservesRole) {
        missingAttribution.push(fileURLToPath(file))
      }
    }

    expect(checkedDocuments).toBeGreaterThan(0)
    expect(missingAttribution).toEqual([])
  })

  it('keeps animated-tile frame updates on reusable typed-array projections', () => {
    const source = readFileSync(new URL('../tilemap/TileLayer.ts', import.meta.url), 'utf8')
    const projectionStart = source.indexOf('class TileAnimationProjection')
    const start = source.indexOf('  update(deltaMs: number): void {', projectionStart)
    const end = source.indexOf('\n  clear(): void {', start)

    expect(projectionStart).toBeGreaterThanOrEqual(0)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(source.slice(start, end)).not.toMatch(/\bnew (?:Array|Map|Set)\b/)
    expect(source).toContain('private _positionAnimationIds = new Uint32Array(0)')
    expect(source).toContain('private _changedAnimations = new Uint8Array(0)')
    expect(source).toContain('private _dirtyChunks = new Uint8Array(0)')
  })
})
