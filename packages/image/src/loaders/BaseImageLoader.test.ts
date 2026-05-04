import { describe, expect, it } from 'vitest'
import { Texture } from 'three'
import {
  BaseImageLoader,
  type LoaderInput,
  type LoaderRequest,
  type LoaderResult,
} from './BaseImageLoader.js'

class TestLoader extends BaseImageLoader {
  readonly format = 'test'
  supports(input: LoaderInput): boolean {
    if (input.url) return this.extOf(input.url) === 'test'
    if (input.bytes) return input.bytes[0] === 0x42
    return false
  }
  async parse(req: LoaderRequest): Promise<LoaderResult> {
    const bytes = await this.resolveBytes(req)
    const texture = new Texture()
    return {
      texture,
      meta: { byteLength: bytes.byteLength },
      recovery: req.url
        ? { kind: 'url', url: req.url, format: 'test' }
        : { kind: 'retained', bytes, format: 'test' },
    }
  }
  // expose helpers for testing
  publicExtOf(url: string) {
    return this.extOf(url)
  }
  publicToBytes(src: Uint8Array | ArrayBuffer) {
    return this.toBytes(src)
  }
}

describe('BaseImageLoader', () => {
  const loader = new TestLoader()

  describe('extOf', () => {
    it('returns lowercase extension after last dot', () => {
      expect(loader.publicExtOf('foo.PNG')).toBe('png')
      expect(loader.publicExtOf('/path/to/file.ktx2')).toBe('ktx2')
      expect(loader.publicExtOf('a.b.c.webp')).toBe('webp')
    })
    it('strips query and hash', () => {
      expect(loader.publicExtOf('img.png?v=1')).toBe('png')
      expect(loader.publicExtOf('img.png#frag')).toBe('png')
      expect(loader.publicExtOf('img.png?v=1#frag')).toBe('png')
    })
    it('returns empty string for no extension', () => {
      expect(loader.publicExtOf('noext')).toBe('')
      expect(loader.publicExtOf('/a/b/noext')).toBe('')
    })
  })

  describe('toBytes', () => {
    it('returns Uint8Array unchanged', () => {
      const u = new Uint8Array([1, 2, 3])
      expect(loader.publicToBytes(u)).toBe(u)
    })
    it('wraps ArrayBuffer', () => {
      const ab = new ArrayBuffer(3)
      const out = loader.publicToBytes(ab)
      expect(out).toBeInstanceOf(Uint8Array)
      expect(out.byteLength).toBe(3)
    })
  })

  describe('supports', () => {
    it('matches by url extension', () => {
      expect(loader.supports({ url: 'foo.test' })).toBe(true)
      expect(loader.supports({ url: 'foo.png' })).toBe(false)
    })
    it('matches by magic byte', () => {
      expect(loader.supports({ bytes: new Uint8Array([0x42, 0x00]) })).toBe(true)
      expect(loader.supports({ bytes: new Uint8Array([0x00]) })).toBe(false)
    })
  })

  describe('parse', () => {
    it('returns texture + recovery descriptor for retained bytes', async () => {
      const bytes = new Uint8Array([0x42, 0x01, 0x02])
      const res = await loader.parse({ bytes })
      expect(res.texture).toBeInstanceOf(Texture)
      expect(res.meta?.byteLength).toBe(3)
      expect(res.recovery).toEqual({ kind: 'retained', bytes, format: 'test' })
    })
    it('throws when neither bytes nor url provided', async () => {
      await expect(loader.parse({})).rejects.toThrow(/bytes or url/)
    })
  })
})
