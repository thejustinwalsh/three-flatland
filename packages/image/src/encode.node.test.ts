import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeImageFile } from './encode.node'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(__dirname, '__fixtures__/tiny.png')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fl-image-'))
})

describe('encodeImageFile', () => {
  it('writes <basename>.<format> next to input when output is null', async () => {
    const out = await encodeImageFile(fixturePath, null, { format: 'webp', quality: 80 })
    expect(out.endsWith('tiny.webp')).toBe(true)
    expect(existsSync(out)).toBe(true)
    rmSync(out)
  })

  it('errors when output exists without force', async () => {
    const dest = join(dir, 'tiny.webp')
    writeFileSync(dest, 'old')
    await expect(encodeImageFile(fixturePath, dest, { format: 'webp' })).rejects.toThrow(/refusing to overwrite/i)
  })

  it('overwrites with force=true', async () => {
    const dest = join(dir, 'tiny.webp')
    writeFileSync(dest, 'old')
    await encodeImageFile(fixturePath, dest, { format: 'webp' }, { force: true })
    const bytes = readFileSync(dest)
    expect(bytes.length).toBeGreaterThan(10)
    expect(bytes.toString('utf8')).not.toBe('old')
  })

  it('atomic write — leaves no .tmp on success', async () => {
    const dest = join(dir, 'a.webp')
    await encodeImageFile(fixturePath, dest, { format: 'webp' })
    expect(existsSync(dest + '.tmp')).toBe(false)
  })
})

import { encodeImageBatch } from './encode.node'

describe('encodeImageBatch', () => {
  it('completes all items even if one fails, reports per-item status', async () => {
    const items = [
      { input: fixturePath, output: join(dir, 'a.webp'), opts: { format: 'webp' as const } },
      { input: '/does/not/exist.png', output: join(dir, 'b.webp'), opts: { format: 'webp' as const } },
      { input: fixturePath, output: join(dir, 'c.webp'), opts: { format: 'webp' as const } },
    ]
    const results: Array<{ status: string; input: string }> = []
    for await (const r of encodeImageBatch(items, 2)) {
      results.push({ status: r.status, input: r.input })
    }
    expect(results).toHaveLength(3)
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(2)
    expect(results.filter((r) => r.status === 'err')).toHaveLength(1)
  })
})
