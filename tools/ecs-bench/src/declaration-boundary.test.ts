import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const verifier = resolve(import.meta.dirname, '../../../scripts/verify-public-declaration-boundary.mjs')
const fixtures: string[] = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { force: true, recursive: true })
})

function fixtureSource(worldDeclaration: string): string {
  const root = mkdtempSync(join(tmpdir(), 'flatland-declaration-boundary-'))
  fixtures.push(root)
  mkdirSync(join(root, 'dist/ecs/runtime'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ publishConfig: { exports: { '.': { types: './dist/index.d.ts' } } } }, null, 2)}\n`
  )
  writeFileSync(join(root, 'dist/index.d.ts'), "export * from './ecs/world.js'\n")
  writeFileSync(join(root, 'dist/ecs/world.d.ts'), worldDeclaration)
  writeFileSync(join(root, 'dist/ecs/runtime/index.d.ts'), 'export interface PrivateWorld {}\n')
  return root
}

function fixture(relativeRuntimeImport: string): string {
  return fixtureSource(`export type { PrivateWorld } from '${relativeRuntimeImport}'\n`)
}

describe('public declaration boundary verifier', () => {
  it.each(['./runtime', './runtime/index', './runtime/index.js', '../ecs/runtime'])(
    'rejects a reachable private runtime through %s',
    (relativeRuntimeImport) => {
      const root = fixture(relativeRuntimeImport)
      expect(() =>
        execFileSync(process.execPath, [verifier, root, 'ecs/runtime'], {
          encoding: 'utf8',
          stdio: 'pipe',
        })
      ).toThrow(/resolves inside dist\/ecs\/runtime/)
    }
  )

  it('rejects a direct private runtime specifier', () => {
    const root = fixture('three-flatland/ecs/runtime')
    expect(() =>
      execFileSync(process.execPath, [verifier, root, 'ecs/runtime'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow(/contains "ecs\/runtime"/)
  })

  it('rejects a reachable private runtime through a side-effect import', () => {
    const root = fixtureSource("import './runtime'\n")
    expect(() =>
      execFileSync(process.execPath, [verifier, root, 'ecs/runtime'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow(/resolves inside dist\/ecs\/runtime/)
  })

  it('rejects a reachable private runtime through an import-equals declaration', () => {
    const root = fixtureSource("import PrivateRuntime = require('./runtime')\nexport = PrivateRuntime\n")
    expect(() =>
      execFileSync(process.execPath, [verifier, root, 'ecs/runtime'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow(/resolves inside dist\/ecs\/runtime/)
  })

  it('rejects a reachable private runtime through a triple-slash path reference', () => {
    const root = fixtureSource('/// <reference path="./runtime/index.d.ts" />\n')
    expect(() =>
      execFileSync(process.execPath, [verifier, root, 'ecs/runtime'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow(/resolves inside dist\/ecs\/runtime/)
  })
})
