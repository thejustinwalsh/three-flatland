import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
// src/ is one level inside the package root — `pnpm exec` must run from the
// package so it resolves the local node_modules/.bin/flatland-bake link.
const pkgRoot = join(__dirname, '..')
const fixture = join(__dirname, '__fixtures__/tiny.png')

describe('flatland-bake encode integration', () => {
  it('runs as a child process and writes the expected file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-int-'))
    const out = join(dir, 'tiny.webp')
    const { stdout } = await exec(
      'pnpm',
      ['exec', 'flatland-bake', 'encode', fixture, out, '--format', 'webp', '--quality', '80'],
      { cwd: pkgRoot },
    )
    expect(stdout).toMatch(/encode\] ok/)
    expect(existsSync(out)).toBe(true)
  }, 60_000)

  it('--list shows the encode baker', async () => {
    const { stdout } = await exec(
      'pnpm',
      ['exec', 'flatland-bake', '--list'],
      { cwd: pkgRoot },
    )
    expect(stdout).toMatch(/encode/)
    expect(stdout).toMatch(/@three-flatland\/image/)
  })
})
