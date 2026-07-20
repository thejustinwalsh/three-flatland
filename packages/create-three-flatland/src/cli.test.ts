import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BIN = join(import.meta.dirname, '..', 'dist', 'index.js')
const hasDist = existsSync(BIN)

/**
 * Every run gets stdin as /dev/null and a hard timeout. A CLI that prompts would
 * either block until the timeout (test fails) or read EOF and abort (test fails) —
 * a green run is therefore real proof of non-interactivity, not an artifact of an
 * inherited TTY.
 */
function runCli(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
    encoding: 'utf-8',
    env: { ...process.env, npm_config_user_agent: undefined, CI: '1' },
  })
}

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out
}

/** Markers @clack emits only on the interactive path. None may appear non-interactively. */
const PROMPT_MARKERS = ['Project name:', 'Select a template:', 'Package name:', 'is not empty. How should we proceed?']

// Bin-level contract tests need the built CLI. `pnpm build` produces it; CI runs
// Test after Build. Locally: `pnpm --filter create-three-flatland build` first.
describe.skipIf(!hasDist)('create-three-flatland bin (create-vite interop contract)', () => {
  let work: string
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'ctf-bin-'))
  })
  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it('is fully non-interactive when target dir and template are both supplied', () => {
    const out = runCli(['my-game', '--template', 'three'], work)
    for (const marker of PROMPT_MARKERS) {
      expect(out, `CLI prompted with "${marker}"`).not.toContain(marker)
    }
    expect(out).toContain('Scaffolded three template')
    expect(existsSync(join(work, 'my-game', 'index.html'))).toBe(true)
    expect(existsSync(join(work, 'my-game', '.gitignore'))).toBe(true)
    expect(existsSync(join(work, 'my-game', '_gitignore'))).toBe(false)
    expect(existsSync(join(work, 'my-game', 'src', 'main.ts'))).toBe(true)
    expect(existsSync(join(work, 'my-game', 'public', 'sprite.svg'))).toBe(true)
    const pkg = JSON.parse(readFileSync(join(work, 'my-game', 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('my-game')
    expect(pkg.private).toBe(true)
    expect(pkg.version).toBe('0.0.0')
  })

  it('honors the -t alias and the react template', () => {
    const out = runCli(['my-app', '-t', 'react'], work)
    for (const marker of PROMPT_MARKERS) {
      expect(out, `CLI prompted with "${marker}"`).not.toContain(marker)
    }
    expect(existsSync(join(work, 'my-app', 'src', 'App.tsx'))).toBe(true)
    expect(existsSync(join(work, 'my-app', 'src', 'main.tsx'))).toBe(true)
    expect(existsSync(join(work, 'my-app', 'vite.config.ts'))).toBe(true)
  })

  it('resolves a nested positional target dir relative to cwd', () => {
    runCli([join('nested', 'deep', 'my-game'), '--template', 'three'], work)
    expect(existsSync(join(work, 'nested', 'deep', 'my-game', 'index.html'))).toBe(true)
  })

  it('fails loudly on a non-empty dir without --overwrite, succeeds with it', () => {
    runCli(['my-game', '--template', 'three'], work)
    writeFileSync(join(work, 'my-game', 'stale.txt'), 'x')
    expect(() => runCli(['my-game', '--template', 'three'], work)).toThrow()

    runCli(['my-game', '--template', 'three', '--overwrite'], work)
    expect(existsSync(join(work, 'my-game', 'index.html'))).toBe(true)
    expect(existsSync(join(work, 'my-game', 'stale.txt'))).toBe(false)
  })

  it('preserves .git when overwriting', () => {
    const root = join(work, 'my-game')
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main')
    writeFileSync(join(root, 'stale.txt'), 'x')
    runCli(['my-game', '--template', 'three', '--overwrite'], work)
    expect(readFileSync(join(root, '.git', 'HEAD'), 'utf-8')).toContain('refs/heads/main')
    expect(existsSync(join(root, 'stale.txt'))).toBe(false)
    expect(existsSync(join(root, 'index.html'))).toBe(true)
  })

  it('coerces an invalid dir-derived package name non-interactively', () => {
    const out = runCli(['My Game', '--template', 'three'], work)
    expect(out, 'CLI prompted for a package name').not.toContain('Package name:')
    const pkg = JSON.parse(readFileSync(join(work, 'My Game', 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('my-game')
  })

  it('prints help and exits 0 for --help', () => {
    const out = runCli(['--help'], work)
    expect(out).toContain('Usage: create-three-flatland')
    expect(out).toContain('--template')
    expect(out).toContain('--overwrite')
    expect(readdirSync(work)).toEqual([])
  })

  for (const template of ['three', 'react'] as const) {
    it(`scaffolds no workspace-only wiring from the bin for ${template} (leak guard)`, () => {
      runCli(['my-game', '--template', template], work)
      const root = join(work, 'my-game')

      // Workspace artifacts must never be copied.
      for (const dir of ['node_modules', 'dist', '.turbo']) {
        expect(existsSync(join(root, dir)), `${dir} leaked into the scaffold`).toBe(false)
      }

      const banned = [
        'customConditions', // published three-flatland has no src/ — this breaks the scaffold
        'resolve.conditions',
        "conditions: ['source']",
        'conditions: ["source"]',
        'workspace:', // covers workspace:* and workspace:^
        'catalog:',
        '/three/template/', // microfrontend dev base paths
        '/react/template/',
        'TURBO_MFE_PORT',
      ]
      for (const file of walkFiles(root)) {
        const text = readFileSync(file, 'utf-8')
        for (const needle of banned) {
          expect(text, `${file} leaked "${needle}"`).not.toContain(needle)
        }
      }

      // The vite config (react only) must not pin a non-default base.
      const viteConfig = join(root, 'vite.config.ts')
      if (existsSync(viteConfig)) {
        expect(readFileSync(viteConfig, 'utf-8')).not.toMatch(/\bbase\s*:/)
      }

      // Every dependency range must be a real, installable semver range.
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      expect(Object.keys(deps).length).toBeGreaterThan(0)
      for (const [name, range] of Object.entries(deps)) {
        expect(range, `${name} has a non-registry range`).toMatch(/^(\^|~|>=)?\d+\.\d+\.\d+/)
      }
    })
  }
})
