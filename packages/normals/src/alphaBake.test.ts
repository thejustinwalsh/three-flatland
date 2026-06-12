import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'
import { bakeAlphaMapFile, ALPHA_DESCRIPTOR } from './alphaBake.node'
import { hashDescriptor } from '@three-flatland/bake'

function writeTestPng(path: string): void {
  const png = new PNG({ width: 2, height: 2 })
  png.data = Buffer.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 0])
  writeFileSync(path, PNG.sync.write(png))
}

describe('bakeAlphaMapFile', () => {
  it('writes <input>.alpha.png with alpha in R and the descriptor stamp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alpha-bake-'))
    const input = join(dir, 'sprites.png')
    writeTestPng(input)

    const output = bakeAlphaMapFile(input)
    expect(output).toBe(join(dir, 'sprites.alpha.png'))

    const baked = PNG.sync.read(readFileSync(output))
    expect(baked.width).toBe(2)
    expect(baked.height).toBe(2)
    expect(baked.data[0]).toBe(255)
    expect(baked.data[4]).toBe(128)
    expect(baked.data[8]).toBe(0)
    expect(baked.data[1]).toBe(255)
    expect(baked.data[3]).toBe(255)

    const raw = readFileSync(output)
    const text = raw.toString('latin1')
    expect(text).toContain('flatland')
    expect(text).toContain(hashDescriptor(ALPHA_DESCRIPTOR))
  })
})
