import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  collectPublicationViolations,
  findKootaReferences,
  manifestKootaViolations,
} from './verify-no-koota-publication.mjs'

const CLEAN_MANIFEST = {
  name: 'three-flatland',
  version: '0.1.0-alpha.10',
  exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
}

const fixtureRoots: string[] = []

function makePackage(files: Record<string, string>, manifest: Record<string, unknown> = {}): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'koota-gate-fixture-'))
  fixtureRoots.push(fixtureRoot)
  const root = join(fixtureRoot, 'package')
  const allFiles = { 'dist/index.d.ts': 'export {}\n', ...files }
  for (const [path, content] of Object.entries(allFiles)) {
    const file = join(root, path)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, content)
  }
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ ...CLEAN_MANIFEST, ...manifest }, null, 2)}\n`)
  return root
}

function fixture(files: Record<string, string>, manifest?: Record<string, unknown>): string {
  return makePackage(files, manifest)
}

afterAll(() => {
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true })
})

describe('findKootaReferences', () => {
  it.each([
    "import { createWorld } from 'koota'",
    "export type { World } from 'koota'",
    "const k = await import('koota')",
    'const k = await import(`koota/react`)',
    "require('koota')",
    "import { useQuery } from 'koota/react'",
    "declare module 'koota' {}",
    '/// <reference types="koota" />',
  ])('detects %s', (source) => {
    expect(findKootaReferences(source)).toHaveLength(1)
  })

  it.each([
    "import { Mesh } from 'three'",
    '// history note: this module used to wrap koota worlds',
    'const kootaVersion = "0.6.5"',
    "import type { KootaWorld } from './types'",
  ])('ignores unquoted or non-module mention %s', (source) => {
    expect(findKootaReferences(source)).toEqual([])
  })

  it('reports a one-based line number', () => {
    expect(findKootaReferences("import 'three'\nimport 'koota'\n")).toEqual([{ match: "'koota'", line: 2 }])
  })
})

describe('manifestKootaViolations', () => {
  it('fails a required koota peer dependency', () => {
    const violations = manifestKootaViolations({ peerDependencies: { koota: '^0.6.5' } })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('peerDependencies.koota')
  })

  it('fails a required koota runtime dependency and the koota/react subpath', () => {
    expect(manifestKootaViolations({ dependencies: { koota: '^0.6.5' } })).toHaveLength(1)
    expect(manifestKootaViolations({ dependencies: { 'koota/react': '^0.6.5' } })).toHaveLength(1)
  })

  it('fails an optional koota peer because it remains a published dependency edge', () => {
    expect(
      manifestKootaViolations({
        peerDependencies: { koota: '^0.6.5' },
        peerDependenciesMeta: { koota: { optional: true } },
      })
    ).toHaveLength(1)
  })

  it('fails an optional runtime dependency because consumers can still install it', () => {
    const violations = manifestKootaViolations({ optionalDependencies: { koota: '^0.6.5' } })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('optionalDependencies.koota')
  })

  it('allows unrelated peers and ignores devDependencies consumers never install', () => {
    expect(
      manifestKootaViolations({
        peerDependencies: { three: 'catalog:', react: 'catalog:' },
        devDependencies: { koota: '^0.6.5' },
      })
    ).toEqual([])
  })
})

describe('size-limit Koota accounting', () => {
  it('never externalizes Koota from a measured bundle', () => {
    const config = readFileSync(resolve(import.meta.dirname, '..', '.size-limit.cjs'), 'utf8')

    expect(config).not.toMatch(/['"]koota(?:\/[^'"]*)?['"]/)
  })
})

describe('collectPublicationViolations — forbidden edges', () => {
  it('catches a reachable declaration reference through a relative chain from an export root', () => {
    const root = fixture({
      'dist/index.d.ts': "export { Sprite } from './sprites/sprite.js';\n",
      'dist/sprites/sprite.d.ts': "import type { World } from 'koota';\nexport declare class Sprite { world: World }\n",
      'dist/index.js': 'export {}\n',
    })
    const { violations, scanned } = collectPublicationViolations(root)
    expect(scanned.declarationsWalked).toBe(2)
    expect(violations.some((v) => v.includes('dist/sprites/sprite.d.ts'))).toBe(true)
    expect(violations.some((v) => v.includes("'koota'"))).toBe(true)
  })

  it('catches production JavaScript importing koota, including subpaths and dynamic import', () => {
    const root = fixture({
      'dist/index.js':
        "import { createWorld } from 'koota'\n" +
        "export const load = () => import('koota/react')\n" +
        'export const loadTemplate = () => import(`koota/react`)\n',
    })
    const { violations, scanned } = collectPublicationViolations(root)
    expect(scanned.javascriptScanned).toBe(1)
    expect(violations.filter((v) => v.startsWith('dist/index.js:'))).toHaveLength(3)
  })

  it('catches a sourcemap whose embedded original source references koota', () => {
    const root = fixture({
      'dist/index.js': 'export {}\n//# sourceMappingURL=index.js.map\n',
      'dist/index.js.map': JSON.stringify({
        version: 3,
        sources: ['../src/index.ts'],
        sourcesContent: ["// generated wrapper\nexport * from 'koota'\n"],
        names: [],
        mappings: '',
      }),
    })
    const { violations } = collectPublicationViolations(root)
    expect(violations.some((v) => v.includes('dist/index.js.map') && v.includes('sourcesContent'))).toBe(true)
  })

  it('catches a sourcemap whose sources path points into koota', () => {
    const root = fixture({
      'dist/index.js': 'export {}\n',
      'dist/index.js.map': JSON.stringify({
        version: 3,
        sources: ['../node_modules/koota/dist/world.js'],
        sourcesContent: [null],
        mappings: '',
      }),
    })
    const { violations } = collectPublicationViolations(root)
    expect(violations.some((v) => v.includes('node_modules/koota/dist/world.js'))).toBe(true)
  })

  it('fails closed on an unparseable source map instead of waving it through', () => {
    const root = fixture({ 'dist/index.js': 'export {}\n', 'dist/index.js.map': '{ not json' })
    const { violations } = collectPublicationViolations(root)
    expect(violations.some((v) => v.includes('could not be parsed as a source map'))).toBe(true)
  })
})

describe('collectPublicationViolations — allowed content', () => {
  it('allows historical prose in shipped README/CHANGELOG markdown', () => {
    const root = fixture({
      'README.md': '# three-flatland\n\nPreviously required koota; `npm install three-flatland three koota`.\n',
      'CHANGELOG.md': '## 0.1.0\n- Updated koota dependency to v0.6.5\n',
      'codemods/README.md': 'Codemods may discuss migrating off `koota` imports.\n',
      'dist/index.js': 'export {}\n',
    })
    const { violations, scanned } = collectPublicationViolations(root)
    expect(violations).toEqual([])
    expect(scanned.javascriptScanned).toBe(1)
  })

  it('allows koota use in an unrelated workspace application and benchmark outside the packed artifact', () => {
    const root = makePackage({ 'dist/index.js': 'export {}\n' })
    // Siblings of the package root simulate tools/ecs-bench and minis/breakout:
    // heavy koota usage that must never trip this gate.
    const bench = join(root, '..', 'ecs-bench')
    const app = join(root, '..', 'breakout-app')
    mkdirSync(join(bench, 'adapters'), { recursive: true })
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(
      join(bench, 'adapters', 'koota.ts'),
      "import { trait } from 'koota'\nexport const Position = trait()\n"
    )
    writeFileSync(
      join(bench, 'package.json'),
      JSON.stringify({ name: 'benchmark-ecs', dependencies: { koota: '^0.6.5' } })
    )
    writeFileSync(join(app, 'src', 'world.ts'), "import { createWorld, type World } from 'koota'\n")
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({ name: 'mini-breakout', dependencies: { koota: '^0.6.5', 'koota/react': '^0.6.5' } })
    )

    const { violations } = collectPublicationViolations(root)
    expect(violations).toEqual([])
  })

  it('walks wildcard export declaration patterns without flagging clean graphs', () => {
    const root = fixture(
      {
        'dist/materials/index.d.ts': "export { kind } from './kind.js';\n",
        'dist/materials/kind.d.ts': 'export declare const kind: string;\n',
        'dist/index.d.ts': 'export {};\n',
        'dist/index.js': 'export {}\n',
      },
      {
        exports: {
          '.': { types: './dist/index.d.ts', default: './dist/index.js' },
          './materials/*': { types: './dist/materials/*.d.ts', default: './dist/materials/*.js' },
        },
      }
    )
    const { violations, scanned } = collectPublicationViolations(root)
    expect(violations).toEqual([])
    expect(scanned.declarationsWalked).toBeGreaterThanOrEqual(3)
  })

  it('does not leave the package root when following relative declarations', () => {
    const root = makePackage({
      'dist/index.d.ts': "export * from '../outside/leak.d.ts';\nexport {};\n",
      'dist/index.js': 'export {}\n',
    })
    mkdirSync(join(root, '..', 'outside'), { recursive: true })
    writeFileSync(join(root, '..', 'outside', 'leak.d.ts'), "import type { W } from 'koota'\n")
    const { violations, scanned } = collectPublicationViolations(root)
    expect(scanned.declarationsWalked).toBe(1)
    expect(violations).toEqual([])
  })
})
