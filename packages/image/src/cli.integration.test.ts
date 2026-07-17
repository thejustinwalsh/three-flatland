import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(__dirname, '..')
// Invoke the built CLI directly rather than the `flatland-bake` bin symlink.
// In a fresh install the symlink isn't created — its target
// (packages/bake/dist/cli.js) doesn't exist at `pnpm install` time and pnpm
// doesn't relink after the build step. Resolving the built file is robust in
// CI; it requires `@three-flatland/bake` to be built first (CI builds before
// testing, and `pnpm test` depends on `build`).
const bakeCli = join(__dirname, '../../bake/dist/cli.js')
const fixture = join(__dirname, '__fixtures__/tiny.png')

describe('flatland-bake encode integration', () => {
  it('runs as a child process and writes the expected file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-int-'))
    const out = join(dir, 'tiny.webp')
    const { stdout } = await exec(
      process.execPath,
      [bakeCli, 'encode', fixture, out, '--format', 'webp', '--quality', '80'],
      { cwd: pkgRoot }
    )
    expect(stdout).toMatch(/encode\] ok/)
    expect(existsSync(out)).toBe(true)
  }, 60_000)

  it('--list shows the encode baker', async () => {
    const { stdout } = await exec(process.execPath, [bakeCli, '--list'], { cwd: pkgRoot })
    expect(stdout).toMatch(/encode/)
    expect(stdout).toMatch(/@three-flatland\/image/)
  })
})
