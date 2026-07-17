import { PNG } from 'pngjs'
import { packRects } from './pack.js'
import { polygonizeAlpha, type PolygonOptions } from './polygon.js'

/** A source image handed to the baker (decoded RGBA). */
export interface AtlasSource {
  name: string
  width: number
  height: number
  rgba: Uint8Array
}

export interface BakeAtlasOptions extends PolygonOptions {
  /** Pixels of spacing between packed frames (default 2). */
  spacing?: number
  /** Emit per-frame polygon meshes (default true — the point of the baker). */
  polygons?: boolean
  /** Image filename written into `meta.image` (default 'atlas.png'). */
  imageName?: string
}

/** The baked result: TexturePacker-hash-compatible JSON + RGBA page. */
export interface BakedAtlas {
  json: BakedAtlasJSON
  page: { width: number; height: number; rgba: Uint8Array }
}

export interface BakedAtlasJSON {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number }
      rotated: boolean
      trimmed: boolean
      spriteSourceSize: { x: number; y: number; w: number; h: number }
      sourceSize: { w: number; h: number }
      mesh?: {
        verts: [number, number, number, number][]
        indices: number[]
      }
    }
  >
  meta: {
    app: string
    image: string
    size: { w: number; h: number }
    scale: string
  }
}

/**
 * Bake a set of decoded source images into one atlas page + JSON in the
 * format `SpriteSheetLoader` consumes — including the per-frame `mesh`
 * field (unit-quad locals + frame-local UVs) when `polygons` is on.
 */
export function bakeAtlas(sources: AtlasSource[], options: BakeAtlasOptions = {}): BakedAtlas {
  const spacing = options.spacing ?? 2
  const emitPolygons = options.polygons ?? true

  const packed = packRects(
    sources.map((s) => ({ name: s.name, width: s.width, height: s.height })),
    spacing
  )

  const bySource = new Map(sources.map((s) => [s.name, s]))
  const page = new Uint8Array(packed.width * packed.height * 4)
  const json: BakedAtlasJSON = {
    frames: {},
    meta: {
      app: 'three-flatland/atlas',
      image: options.imageName ?? 'atlas.png',
      size: { w: packed.width, h: packed.height },
      scale: '1',
    },
  }

  for (const rect of packed.rects) {
    const source = bySource.get(rect.name)!
    blit(source, page, packed.width, rect.x, rect.y)

    const entry: BakedAtlasJSON['frames'][string] = {
      frame: { x: rect.x, y: rect.y, w: source.width, h: source.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: source.width, h: source.height },
      sourceSize: { w: source.width, h: source.height },
    }

    if (emitPolygons) {
      const polygon = polygonizeAlpha(source.rgba, source.width, source.height, options)
      if (polygon && polygon.outline.length >= 3) {
        // Normalize: source pixels (y-down) → unit-quad locals (y-up) +
        // frame-local UVs — the runtime mesh format from the atlas
        // format extension.
        const verts: [number, number, number, number][] = polygon.outline.map(([px, py]) => [
          px / source.width - 0.5,
          0.5 - py / source.height,
          px / source.width,
          1 - py / source.height,
        ])
        // The y flip mirrors winding — swap to keep CCW front faces.
        const indices: number[] = []
        for (let i = 0; i < polygon.triangles.length; i += 3) {
          indices.push(polygon.triangles[i]!, polygon.triangles[i + 2]!, polygon.triangles[i + 1]!)
        }
        entry.mesh = { verts, indices }
      }
    }

    json.frames[rect.name] = entry
  }

  return { json, page: { width: packed.width, height: packed.height, rgba: page } }
}

function blit(source: AtlasSource, page: Uint8Array, pageWidth: number, dx: number, dy: number): void {
  for (let y = 0; y < source.height; y++) {
    const srcRow = y * source.width * 4
    const dstRow = ((dy + y) * pageWidth + dx) * 4
    page.set(source.rgba.subarray(srcRow, srcRow + source.width * 4), dstRow)
  }
}

/** Decode a PNG buffer into an AtlasSource. */
export function decodePng(name: string, buffer: Uint8Array): AtlasSource {
  const png = PNG.sync.read(Buffer.from(buffer))
  return {
    name,
    width: png.width,
    height: png.height,
    rgba: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  }
}

/** Encode an RGBA page as a PNG buffer. */
export function encodePng(page: BakedAtlas['page']): Uint8Array {
  const png = new PNG({ width: page.width, height: page.height })
  Buffer.from(page.rgba.buffer, page.rgba.byteOffset, page.rgba.byteLength).copy(png.data)
  return new Uint8Array(PNG.sync.write(png))
}
