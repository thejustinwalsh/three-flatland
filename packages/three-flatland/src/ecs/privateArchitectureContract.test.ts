import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = new URL('../', import.meta.url)
const packageRoot = new URL('../../', import.meta.url)

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

  it('keeps animated-tile frame updates on reusable scratch sets', () => {
    const source = readFileSync(new URL('../tilemap/TileLayer.ts', import.meta.url), 'utf8')
    const start = source.indexOf('  update(deltaMs: number): void {')
    const end = source.indexOf('\n  /**\n   * Get tile GID', start)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(source.slice(start, end)).not.toMatch(/\bnew Set\b/)
    expect(source).toContain('private readonly _changedAnimationGids = new Set<number>()')
    expect(source).toContain('private readonly _dirtyAnimationChunks = new Set<string>()')
  })
})
