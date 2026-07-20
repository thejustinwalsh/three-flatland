import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { formatTargetDir, isEmptyDir, isValidPackageName, scaffold, toValidPackageName } from './scaffold'

const TEMPLATES_ROOT = join(import.meta.dirname, '..', 'templates')

let work: string
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'ctf-'))
})
afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('name helpers', () => {
  it('validates npm package names', () => {
    expect(isValidPackageName('my-game')).toBe(true)
    expect(isValidPackageName('@scope/my-game')).toBe(true)
    expect(isValidPackageName('My Game')).toBe(false)
  })
  it('coerces invalid names', () => {
    expect(toValidPackageName('My Game!')).toBe('my-game-')
    expect(isValidPackageName(toValidPackageName('My Game!'))).toBe(true)
  })
  it('trims trailing slashes from target dirs', () => {
    expect(formatTargetDir('my-game/')).toBe('my-game')
  })
})

describe('scaffold', () => {
  for (const template of ['three', 'react'] as const) {
    it(`copies the ${template} template with the rename map applied`, () => {
      const root = join(work, 'app')
      scaffold({ targetDir: root, template, packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
      expect(existsSync(join(root, '.gitignore'))).toBe(true)
      expect(existsSync(join(root, '_gitignore'))).toBe(false)
      expect(existsSync(join(root, 'index.html'))).toBe(true)
      expect(existsSync(join(root, 'AGENTS.md'))).toBe(true)
      expect(existsSync(join(root, 'CLAUDE.md'))).toBe(true)
      expect(existsSync(join(root, 'public', 'sprite.svg'))).toBe(true)
    })

    it(`rewrites package.json name for ${template}`, () => {
      const root = join(work, 'app')
      scaffold({ targetDir: root, template, packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('my-game')
      expect(pkg.private).toBe(true)
      expect(pkg.version).toBe('0.0.0')
    })

    it(`emits no workspace-only wiring for ${template} (leak guard)`, () => {
      const root = join(work, 'app')
      scaffold({ targetDir: root, template, packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
      const banned = [
        'catalog:',
        'workspace:*',
        'workspace:^',
        'customConditions',
        "conditions: ['source']",
        'TURBO_MFE_PORT',
        'FL_DEVTOOLS',
        'GemBackground',
        '@three-flatland/devtools',
        'tweakpane',
      ]
      for (const file of walkFiles(root)) {
        const text = readFileSync(file, 'utf-8')
        for (const needle of banned) {
          expect(text, `${file} leaked "${needle}"`).not.toContain(needle)
        }
      }
    })

    it(`never copies node_modules, dist, or .turbo for ${template}`, () => {
      const root = join(work, 'app')
      scaffold({ targetDir: root, template, packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
      for (const dir of ['node_modules', 'dist', '.turbo']) {
        expect(existsSync(join(root, dir))).toBe(false)
      }
    })
  }

  it('refuses a non-empty target without overwrite', () => {
    const root = join(work, 'app')
    mkdirSync(root)
    writeFileSync(join(root, 'existing.txt'), 'x')
    expect(() =>
      scaffold({ targetDir: root, template: 'three', packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
    ).toThrow(/not empty/)
  })

  it('empties a non-empty target with overwrite, preserving .git', () => {
    const root = join(work, 'app')
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main')
    writeFileSync(join(root, 'stale.txt'), 'x')
    scaffold({
      targetDir: root,
      template: 'three',
      packageName: 'my-game',
      overwrite: true,
      templatesRoot: TEMPLATES_ROOT,
    })
    expect(existsSync(join(root, '.git', 'HEAD'))).toBe(true)
    expect(existsSync(join(root, 'stale.txt'))).toBe(false)
    expect(existsSync(join(root, 'index.html'))).toBe(true)
  })

  it('isEmptyDir treats .git-only dirs as empty', () => {
    const root = join(work, 'app')
    mkdirSync(join(root, '.git'), { recursive: true })
    expect(isEmptyDir(root)).toBe(true)
  })
})

/**
 * Template-independent scaffold semantics, exercised against a throwaway fixture
 * template built in the OS tmpdir. These stay green regardless of `templates/`.
 */
describe('scaffold semantics (fixture template)', () => {
  let templatesRoot: string

  beforeEach(() => {
    templatesRoot = join(work, 'fixture-templates')
    const three = join(templatesRoot, 'three')
    mkdirSync(join(three, 'src'), { recursive: true })
    mkdirSync(join(three, 'node_modules'), { recursive: true })
    mkdirSync(join(three, 'dist'), { recursive: true })
    mkdirSync(join(three, '.turbo'), { recursive: true })
    writeFileSync(join(three, 'node_modules', 'junk.js'), 'nope')
    writeFileSync(join(three, 'dist', 'bundle.js'), 'nope')
    writeFileSync(join(three, '.turbo', 'log.txt'), 'nope')
    writeFileSync(join(three, '_gitignore'), 'node_modules\ndist\n')
    writeFileSync(join(three, 'index.html'), '<!doctype html>')
    writeFileSync(join(three, 'src', 'main.ts'), 'export {}\n')
    writeFileSync(
      join(three, 'package.json'),
      JSON.stringify({ name: 'template-three', private: true, version: '0.0.0' }, null, 2) + '\n'
    )
  })

  it('renames _gitignore to .gitignore and preserves contents', () => {
    const root = join(work, 'app')
    scaffold({ targetDir: root, template: 'three', packageName: 'my-game', templatesRoot })
    expect(existsSync(join(root, '_gitignore'))).toBe(false)
    expect(readFileSync(join(root, '.gitignore'), 'utf-8')).toContain('node_modules')
  })

  it('skips node_modules, dist, and .turbo', () => {
    const root = join(work, 'app')
    scaffold({ targetDir: root, template: 'three', packageName: 'my-game', templatesRoot })
    for (const dir of ['node_modules', 'dist', '.turbo']) {
      expect(existsSync(join(root, dir))).toBe(false)
    }
    expect(existsSync(join(root, 'src', 'main.ts'))).toBe(true)
  })

  it('rewrites package.json name and returns the written file list', () => {
    const root = join(work, 'app')
    const result = scaffold({ targetDir: root, template: 'three', packageName: '@scope/my-game', templatesRoot })
    expect(result.root).toBe(root)
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).name).toBe('@scope/my-game')
    expect(result.written).toContain(join(root, 'index.html'))
    expect(result.written).toContain(join(root, '.gitignore'))
  })

  it('throws on an unknown template', () => {
    expect(() =>
      scaffold({
        targetDir: join(work, 'app'),
        template: 'svelte' as 'three',
        packageName: 'my-game',
        templatesRoot,
      })
    ).toThrow(/unknown template/)
  })

  it('refuses a non-empty target without overwrite', () => {
    const root = join(work, 'app')
    mkdirSync(root)
    writeFileSync(join(root, 'existing.txt'), 'x')
    expect(() => scaffold({ targetDir: root, template: 'three', packageName: 'my-game', templatesRoot })).toThrow(
      /not empty/
    )
  })

  it('overwrite empties the target but keeps .git', () => {
    const root = join(work, 'app')
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main')
    writeFileSync(join(root, 'stale.txt'), 'x')
    scaffold({ targetDir: root, template: 'three', packageName: 'my-game', overwrite: true, templatesRoot })
    expect(existsSync(join(root, '.git', 'HEAD'))).toBe(true)
    expect(existsSync(join(root, 'stale.txt'))).toBe(false)
    expect(existsSync(join(root, 'index.html'))).toBe(true)
  })

  it('ignoreExisting copies over the top, leaving unrelated files in place', () => {
    const root = join(work, 'app')
    mkdirSync(root)
    writeFileSync(join(root, 'stale.txt'), 'x')
    scaffold({ targetDir: root, template: 'three', packageName: 'my-game', ignoreExisting: true, templatesRoot })
    expect(existsSync(join(root, 'stale.txt'))).toBe(true)
    expect(existsSync(join(root, 'index.html'))).toBe(true)
  })

  it('creates missing parent directories for the target', () => {
    const root = join(work, 'nested', 'deep', 'app')
    scaffold({ targetDir: root, template: 'three', packageName: 'my-game', templatesRoot })
    expect(existsSync(join(root, 'index.html'))).toBe(true)
  })
})

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out
}
