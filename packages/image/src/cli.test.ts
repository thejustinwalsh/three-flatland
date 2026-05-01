import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import baker from './cli'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = join(__dirname, '__fixtures__/tiny.png')

describe('flatland-bake encode CLI', () => {
  it('returns exit code 0 on successful single encode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-cli-'))
    const out = join(dir, 'out.webp')
    const code = await baker.run([fixture, out, '--format', 'webp', '--quality', '80'])
    expect(code).toBe(0)
    expect(existsSync(out)).toBe(true)
  })

  it('exits 1 when --format is missing', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const code = await baker.run([fixture])
    expect(code).toBe(1)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('--force overwrites existing target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-cli-'))
    const out = join(dir, 'a.webp')
    await baker.run([fixture, out, '--format', 'webp'])
    const code = await baker.run([fixture, out, '--format', 'webp', '--force'])
    expect(code).toBe(0)
  })

  it('exits 1 if any batch item fails (b-ii: exit 1 on any failure)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-cli-'))
    const code = await baker.run([
      '/does/not/exist.png',
      '--batch',
      '--format',
      'webp',
      '--out-dir',
      dir,
    ])
    expect(code).toBe(1)
  })
})
