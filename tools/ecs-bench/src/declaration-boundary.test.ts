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

function nestedWildcardFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'flatland-declaration-boundary-'))
  fixtures.push(root)
  mkdirSync(join(root, 'dist/nested/ecs/runtime'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ publishConfig: { exports: { './*': { types: './dist/*.d.ts' } } } }, null, 2)}\n`
  )
  writeFileSync(join(root, 'dist/nested/world.d.ts'), "export * from './ecs/runtime/index.js'\n")
  writeFileSync(join(root, 'dist/nested/ecs/runtime/index.d.ts'), 'export interface PrivateWorld {}\n')
  return root
}

describe('public declaration boundary verifier', () => {
  it('accepts a public declaration graph that never reaches the private runtime', () => {
    const root = fixtureSource('export interface PublicWorld {}\n')
    const output = execFileSync(process.execPath, [verifier, root, 'ecs/runtime'], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    expect(output).toMatch(/reachable public declaration files exclude ecs\/runtime/)
  })

  it('matches forbidden API names as identifiers without rejecting prefixed private members', () => {
    const privateRoot = fixtureSource('export declare class PublicBatch { private _reserveSlot; }\n')
    expect(() =>
      execFileSync(process.execPath, [verifier, privateRoot, 'reserveSlot'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).not.toThrow()

    const publicRoot = fixtureSource('export declare class PublicBatch { reserveSlot(): number; }\n')
    expect(() =>
      execFileSync(process.execPath, [verifier, publicRoot, 'reserveSlot'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow(/contains "reserveSlot"/)
  })

  it.each([
    'WorldHandle',
    'EntityHandle',
    'TraitHandle',
    'RegistryHandle',
    'createWorld',
    'buildBatchQueryView',
    'tileLayer',
  ])('rejects the private API identifier %s anywhere in the reachable declaration graph', (identifier) => {
    const root = fixtureSource(`export interface PublicLeak { ${identifier}: unknown }\n`)
    expect(() =>
      execFileSync(process.execPath, [verifier, root, identifier], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow(new RegExp(`contains "${identifier}"`))
  })

  it('rejects a reachable internal registry-handle declaration', () => {
    const root = fixtureSource("export type { RegistryHandle } from './internal/registry-handle.js'\n")
    mkdirSync(join(root, 'dist/internal'), { recursive: true })
    writeFileSync(
      join(root, 'dist/internal/registry-handle.d.ts'),
      'export interface RegistryHandle { readonly opaque: true }\n'
    )
    expect(() =>
      execFileSync(process.execPath, [verifier, root, 'internal/registry-handle'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow(/contains "internal\/registry-handle"/)
  })

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

  it('checks nested declaration roots exposed through wildcard exports', () => {
    const root = nestedWildcardFixture()
    expect(() =>
      execFileSync(process.execPath, [verifier, root, 'ecs/runtime'], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    ).toThrow(/private declaration leak/)
  })
})
