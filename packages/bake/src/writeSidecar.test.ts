import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSidecarPng, writeSidecarJson } from './writeSidecar.js'
import { readPngTextChunk } from './sidecar.js'

describe('writeSidecarPng', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'flatland-sidecar-test-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('writes a PNG with a flatland tEXt chunk that round-trips through readPngTextChunk', () => {
    const width = 2
    const height = 2
    const pixels = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255,
    ])
    const out = join(tmp, 'out.png')
    writeSidecarPng(out, pixels, width, height, { hash: 'deadbeefcafebabe', v: 1 })

    const buf = readFileSync(out)
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const metaJson = readPngTextChunk(arrayBuf, 'flatland')
    expect(metaJson).not.toBeNull()
    const meta = JSON.parse(metaJson!) as { hash: string; v: number }
    expect(meta.hash).toBe('deadbeefcafebabe')
    expect(meta.v).toBe(1)
  })
})

describe('writeSidecarJson', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'flatland-sidecar-test-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('writes a formatted descriptor JSON with trailing newline', () => {
    const out = join(tmp, 'desc.json')
    const descriptor = { direction: 'south', pitch: 0.785, regions: [] }
    writeSidecarJson(out, descriptor)

    const text = readFileSync(out, 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual(descriptor)
    // Preserves indent for human-editability.
    expect(text).toContain('  "direction"')
  })
})
