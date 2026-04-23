import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { readPngTextChunk } from '@three-flatland/bake'
import baker from './cli.js'

describe('flatland-bake normal CLI', () => {
  let tmp: string
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'flatland-normal-cli-'))
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function writeSolidPng(path: string, width = 4, height = 4, alpha = 255): void {
    const png = new PNG({ width, height })
    for (let i = 0; i < width * height; i++) {
      png.data[i * 4] = 255
      png.data[i * 4 + 1] = 255
      png.data[i * 4 + 2] = 255
      png.data[i * 4 + 3] = alpha
    }
    writeFileSync(path, PNG.sync.write(png))
  }

  it('exits 1 with no args and prints usage', async () => {
    const code = await baker.run([])
    expect(code).toBe(1)
    expect(stdoutSpy).toHaveBeenCalled()
    expect(String(stdoutSpy.mock.calls[0]![0])).toContain('Usage:')
  })

  it('exits 0 for --help and prints usage', async () => {
    const code = await baker.run(['--help'])
    expect(code).toBe(0)
    expect(String(stdoutSpy.mock.calls[0]![0])).toContain('Usage:')
  })

  it('exits 1 when the input PNG is missing', async () => {
    const code = await baker.run([join(tmp, 'nope.png')])
    expect(code).toBe(1)
    expect(String(stderrSpy.mock.calls[0]![0])).toContain('input not found')
  })

  it('bakes a PNG with default flags and writes .normal.png sibling', async () => {
    const input = join(tmp, 'knight.png')
    writeSolidPng(input, 4, 4)

    const code = await baker.run([input])
    expect(code).toBe(0)

    const output = join(tmp, 'knight.normal.png')
    const buf = readFileSync(output)
    // Output carries a `flatland` tEXt chunk stamping the descriptor hash.
    const meta = readPngTextChunk(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      'flatland'
    )
    expect(meta).not.toBeNull()
    expect(JSON.parse(meta!)).toMatchObject({ v: 1, hash: expect.any(String) })
  })

  it('--direction / --pitch / --strength / --bump build a flat-flag descriptor', async () => {
    const input = join(tmp, 'wall.png')
    writeSolidPng(input, 4, 4)

    const flat = await baker.run([input])
    expect(flat).toBe(0)

    const flagged = await baker.run([
      input,
      join(tmp, 'wall.tilted.normal.png'),
      '--direction',
      'south',
      '--pitch',
      '0.5',
      '--strength',
      '2',
      '--bump',
      'alpha',
    ])
    expect(flagged).toBe(0)

    // The two bakes produce different descriptor hashes (different defaults).
    const a = readMetaHash(join(tmp, 'wall.normal.png'))
    const b = readMetaHash(join(tmp, 'wall.tilted.normal.png'))
    expect(a).not.toBe(b)
  })

  it('--descriptor reads a JSON file and applies regions', async () => {
    const input = join(tmp, 'atlas.png')
    writeSolidPng(input, 8, 8)
    const descriptorPath = join(tmp, 'atlas.normal.json')
    writeFileSync(
      descriptorPath,
      JSON.stringify({
        regions: [
          { x: 0, y: 0, w: 4, h: 4, direction: 'south' },
          { x: 4, y: 0, w: 4, h: 4, direction: 'north' },
        ],
      })
    )

    const code = await baker.run([input, '--descriptor', descriptorPath])
    expect(code).toBe(0)
  })

  it('flat flags override descriptor-level defaults', async () => {
    const input = join(tmp, 'atlas.png')
    writeSolidPng(input, 4, 4)
    const descriptorPath = join(tmp, 'atlas.normal.json')
    writeFileSync(
      descriptorPath,
      JSON.stringify({ direction: 'south', pitch: 0.5 })
    )

    const onlyDescriptor = await baker.run([
      input,
      join(tmp, 'a.normal.png'),
      '--descriptor',
      descriptorPath,
    ])
    expect(onlyDescriptor).toBe(0)

    const withFlagOverride = await baker.run([
      input,
      join(tmp, 'b.normal.png'),
      '--descriptor',
      descriptorPath,
      '--direction',
      'north', // overrides descriptor.direction
    ])
    expect(withFlagOverride).toBe(0)

    // Different hashes → override took effect.
    expect(readMetaHash(join(tmp, 'a.normal.png'))).not.toBe(
      readMetaHash(join(tmp, 'b.normal.png'))
    )
  })

  it('exits 1 with an invalid --direction', async () => {
    const input = join(tmp, 'x.png')
    writeSolidPng(input)
    const code = await baker.run([input, '--direction', 'nowhere'])
    expect(code).toBe(1)
    expect(String(stderrSpy.mock.calls[0]![0])).toContain('--direction')
  })

  it('exits 1 with a missing --descriptor path', async () => {
    const input = join(tmp, 'x.png')
    writeSolidPng(input)
    const code = await baker.run([input, '--descriptor', join(tmp, 'nope.json')])
    expect(code).toBe(1)
    expect(String(stderrSpy.mock.calls[0]![0])).toContain('descriptor not found')
  })
})

function readMetaHash(pngPath: string): string {
  const buf = readFileSync(pngPath)
  const meta = readPngTextChunk(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    'flatland'
  )
  if (!meta) throw new Error(`no flatland tEXt in ${pngPath}`)
  return (JSON.parse(meta) as { hash: string }).hash
}
