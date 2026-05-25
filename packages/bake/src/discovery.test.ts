import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverBakers } from './discovery.js'

describe('discoverBakers', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'flatland-bake-test-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  function writePkg(path: string, contents: object): void {
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), JSON.stringify(contents, null, 2))
  }

  it('returns no bakers when no node_modules exists', () => {
    const { bakers, conflicts } = discoverBakers(tmp)
    expect(bakers).toEqual([])
    expect(conflicts).toEqual([])
  })

  it('picks up a baker declared by a dependency', () => {
    writePkg(join(tmp, 'node_modules', 'fake-slug'), {
      name: 'fake-slug',
      flatland: {
        bake: [
          {
            name: 'font',
            description: 'Bake fonts',
            entry: './dist/cli.js',
          },
        ],
      },
    })

    const { bakers } = discoverBakers(tmp)
    expect(bakers).toHaveLength(1)
    expect(bakers[0]!.name).toBe('font')
    expect(bakers[0]!.packageName).toBe('fake-slug')
    expect(bakers[0]!.resolvedEntry.endsWith('fake-slug/dist/cli.js')).toBe(
      true
    )
  })

  it('picks up a baker from a scoped package', () => {
    writePkg(join(tmp, 'node_modules', '@three-flatland', 'fake-normals'), {
      name: '@three-flatland/fake-normals',
      flatland: {
        bake: [
          {
            name: 'normal',
            description: 'Bake normals',
            entry: './dist/cli.js',
          },
        ],
      },
    })

    const { bakers } = discoverBakers(tmp)
    expect(bakers).toHaveLength(1)
    expect(bakers[0]!.name).toBe('normal')
    expect(bakers[0]!.packageName).toBe('@three-flatland/fake-normals')
  })

  it('reports a conflict when two packages register the same name', () => {
    writePkg(join(tmp, 'node_modules', 'pkg-a'), {
      name: 'pkg-a',
      flatland: {
        bake: [{ name: 'font', description: 'A', entry: './dist/cli.js' }],
      },
    })
    writePkg(join(tmp, 'node_modules', 'pkg-b'), {
      name: 'pkg-b',
      flatland: {
        bake: [{ name: 'font', description: 'B', entry: './dist/cli.js' }],
      },
    })

    const { bakers, conflicts } = discoverBakers(tmp)
    expect(bakers).toHaveLength(1)
    // First in readdirSync order wins; either is acceptable, both packages
    // must appear in the conflict message.
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toContain('pkg-a')
    expect(conflicts[0]).toContain('pkg-b')
  })

  it('ignores packages that do not declare flatland.bake', () => {
    writePkg(join(tmp, 'node_modules', 'bystander'), {
      name: 'bystander',
    })
    const { bakers } = discoverBakers(tmp)
    expect(bakers).toEqual([])
  })

  it('self-discovers a baker declared by the CWD package', () => {
    // CWD is a package with its own flatland.bake — must be picked up
    // without requiring a node_modules symlink.
    writePkg(tmp, {
      name: 'self-pkg',
      flatland: {
        bake: [
          { name: 'self', description: 'Self baker', entry: './dist/cli.js' },
        ],
      },
    })

    const { bakers } = discoverBakers(tmp)
    expect(bakers).toHaveLength(1)
    expect(bakers[0]!.name).toBe('self')
    expect(bakers[0]!.packageName).toBe('self-pkg')
  })

  it('tolerates broken package.json files', () => {
    const badDir = join(tmp, 'node_modules', 'broken')
    mkdirSync(badDir, { recursive: true })
    writeFileSync(join(badDir, 'package.json'), '{ not json')

    const { bakers, conflicts } = discoverBakers(tmp)
    expect(bakers).toEqual([])
    expect(conflicts).toEqual([])
  })

  it('accepts legacy flatland.bakers shape with a deprecation warning', () => {
    writePkg(join(tmp, 'node_modules', 'legacy-pkg'), {
      name: 'legacy-pkg',
      flatland: {
        bakers: [
          { name: 'legacy', description: 'Legacy', entry: './dist/baker.js' },
        ],
      },
    })

    const { bakers, conflicts } = discoverBakers(tmp)
    expect(bakers).toHaveLength(1)
    expect(bakers[0]!.name).toBe('legacy')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toContain('legacy-pkg')
    expect(conflicts[0]).toContain('flatland.bake')
    expect(conflicts[0]).toContain('flatland.bakers')
  })

  it('prefers flatland.bake when both shapes are present', () => {
    writePkg(join(tmp, 'node_modules', 'mixed-pkg'), {
      name: 'mixed-pkg',
      flatland: {
        bake: [{ name: 'new', description: 'New', entry: './dist/cli.js' }],
        bakers: [
          { name: 'old', description: 'Old', entry: './dist/baker.js' },
        ],
      },
    })

    const { bakers, conflicts } = discoverBakers(tmp)
    expect(bakers).toHaveLength(1)
    expect(bakers[0]!.name).toBe('new')
    // No deprecation warning when the canonical shape exists alongside.
    expect(conflicts).toEqual([])
  })
})
