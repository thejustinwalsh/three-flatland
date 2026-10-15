import { describe, expect, it } from 'vitest'
import { publicPackages, verifyPackedFiles, verifyPackedManifest } from './lib/release-packages.mjs'

describe('release package checks', () => {
  const core = { name: 'three-flatland', version: '0.1.0-alpha.11' }
  const skills = { name: '@three-flatland/skills', version: '0.1.0-alpha.4', dir: 'skills' }
  const privatePkg = { name: '@three-flatland/schemas', private: true }
  const workspaces = [core, skills, privatePkg]

  it('includes public packages without a build script and outside packages/', () => {
    expect(publicPackages(workspaces)).toEqual([core, skills])
  })

  it('rejects unresolved publish dependencies and private workspace edges', () => {
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      expect(() => verifyPackedManifest({ ...core, [field]: { three: 'catalog:' } }, core, workspaces)).toThrow(
        'unresolved'
      )
      expect(() =>
        verifyPackedManifest({ ...core, [field]: { [privatePkg.name]: '^1.0.0' } }, core, workspaces)
      ).toThrow('private workspace')
    }
  })

  it('rejects the wrong artifact and source exports', () => {
    expect(() => verifyPackedManifest(skills, core, workspaces)).toThrow('expected three-flatland@')
    expect(() =>
      verifyPackedManifest({ ...core, exports: { '.': { source: './src/index.ts' } } }, core, workspaces)
    ).toThrow('source condition')
  })

  it('accepts a registry-ready packed manifest', () => {
    expect(() => verifyPackedManifest({ ...core, dependencies: { three: '^0.185.1' } }, core, workspaces)).not.toThrow()
  })

  it('does not confuse the private repository root with the public core package', () => {
    expect(() =>
      verifyPackedManifest({ ...skills, dependencies: { 'three-flatland': '^0.1.0-alpha.11' } }, skills, [
        ...workspaces,
        { name: 'three-flatland', private: true },
      ])
    ).not.toThrow()
  })

  it('requires the migration recipes and every exported entrypoint in the tarball', () => {
    const files = [
      'package/dist/index.js',
      'package/dist/react/Sprite.js',
      'package/codemods/README.md',
      'package/codemods/koota-peer-dependency-removal.md',
      'package/codemods/effect-vector-whole-tuple.md',
    ]
    const manifest = { ...core, exports: { '.': './dist/index.js', './react/*': './dist/react/*.js' } }
    expect(() => verifyPackedFiles(manifest, files)).not.toThrow()
    expect(() => verifyPackedFiles(manifest, files.slice(0, -1))).toThrow('effect-vector-whole-tuple.md')
    expect(() => verifyPackedFiles(manifest, files.slice(1))).toThrow('dist/index.js')
  })
})
