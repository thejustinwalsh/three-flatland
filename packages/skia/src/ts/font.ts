import { SkiaContext } from './context'

// ── Ref-counted typeface handle ──

/** @internal Shared, ref-counted Skia typeface handle */
class TypefaceRef {
  readonly handle: number
  private readonly _ctx: SkiaContext
  private _refs = 1

  constructor(ctx: SkiaContext, handle: number) {
    this._ctx = ctx
    this.handle = handle
    typefaceGCRegistry.register(this, { handle, drop: (h: number) => ctx._exports.skia_typeface_delete(h) }, this)
  }

  retain(): void { this._refs++ }

  release(): void {
    if (--this._refs <= 0 && this.handle !== 0) {
      typefaceGCRegistry.unregister(this)
      this._ctx._exports.skia_typeface_delete(this.handle)
      ;(this as { handle: number }).handle = 0

      // Remove from dedup cache
      const cache = typefaceCache.get(this._ctx)
      if (cache) {
        for (const [key, ref] of cache) {
          if (ref === this) { cache.delete(key); break }
        }
      }
    }
  }
}

const typefaceGCRegistry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => { if (handle) drop(handle) },
)

const fontGCRegistry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => { if (handle) drop(handle) },
)

// ── Typeface dedup cache: WeakMap<SkiaContext, Map<hash, TypefaceRef>> ──

const typefaceCache = new WeakMap<SkiaContext, Map<string, TypefaceRef>>()

function hashBytes(data: Uint8Array): string {
  // Fast non-crypto hash for dedup — sample bytes + length
  let h = data.length
  const step = Math.max(1, (data.length >>> 8))
  for (let i = 0; i < data.length; i += step) {
    h = (h * 31 + data[i]!) | 0
  }
  return `${data.length}:${h >>> 0}`
}

function getOrCreateTypeface(ctx: SkiaContext, data: Uint8Array): TypefaceRef {
  let cache = typefaceCache.get(ctx)
  if (!cache) {
    cache = new Map()
    typefaceCache.set(ctx, cache)
  }

  const key = hashBytes(data)
  const existing = cache.get(key)
  if (existing && existing.handle !== 0) {
    existing.retain()
    return existing
  }

  const [dataPtr, dataLen] = ctx._writeBytes(data)
  const handle = ctx._exports.skia_typeface_load(dataPtr, dataLen)
  if (!handle) throw new Error('Failed to load typeface — invalid font data')

  const ref = new TypefaceRef(ctx, handle)
  cache.set(key, ref)
  return ref
}

// ── SkiaTypeface ──

/**
 * Skia typeface — loaded font data (TTF/OTF) independent of size.
 *
 * Use `atSize()` to create `SkiaFont` instances at specific point sizes.
 * Multiple fonts share the same underlying typeface via ref counting.
 *
 * ```ts
 * // Via useLoader (R3F) — cached by URL
 * const typeface = useLoader(SkiaFontLoader, '/fonts/Inter.ttf')
 * const title = typeface.atSize(32)
 * const body = typeface.atSize(14)
 *
 * // Standalone
 * const typeface = await SkiaTypeface.fromURL(skia, '/fonts/Inter.ttf')
 * ```
 */
export class SkiaTypeface {
  private _ref: TypefaceRef | null
  private _ctx: SkiaContext | null
  private readonly _data: Uint8Array
  private readonly _fonts = new Map<number, SkiaFont>()

  constructor(context: SkiaContext | null, data: Uint8Array) {
    this._ctx = context
    this._data = data
    this._ref = context ? getOrCreateTypeface(context, data) : null
  }

  /** The underlying typeface handle (0 if deferred or disposed) */
  get handle(): number { return this._ref?.handle ?? 0 }

  /** The raw font file bytes */
  get data(): Uint8Array { return this._data }

  /**
   * Create a SkiaFont at the given size.
   * Results are cached — same size returns the same instance.
   *
   * Context resolution: explicit param > typeface's context > SkiaContext.instance
   */
  atSize(size: number, context?: SkiaContext): SkiaFont {
    const cached = this._fonts.get(size)
    if (cached && cached._handle !== 0) return cached

    const ctx = context ?? this._ctx ?? SkiaContext.instance
    if (!ctx) {
      throw new Error('SkiaTypeface.atSize: no SkiaContext available. Call Skia.init() first.')
    }

    // Ensure typeface ref is materialized (deferred from constructor)
    if (!this._ref) {
      this._ctx = ctx
      this._ref = getOrCreateTypeface(ctx, this._data)
    }

    const font = new SkiaFont(ctx, this._ref, size)
    this._fonts.set(size, font)
    return font
  }

  static async fromURL(context: SkiaContext | null, url: string): Promise<SkiaTypeface> {
    const response = await fetch(url)
    const data = new Uint8Array(await response.arrayBuffer())
    return new SkiaTypeface(context, data)
  }

  dispose(): void {
    for (const font of this._fonts.values()) font.dispose()
    this._fonts.clear()
    this._ref?.release()
    this._ref = null
  }
}

// ── SkiaFont ──

/**
 * Skia font — a typeface at a specific point size.
 *
 * Created via `SkiaTypeface.atSize()`, `SkiaFontLoader.load()`, or directly:
 *
 * ```ts
 * // From typeface (shared, ref-counted)
 * const font = typeface.atSize(16)
 *
 * // From raw data (standalone, owns its own typeface ref)
 * const font = SkiaFont.fromData(skia, fontBytes, 16)
 * ```
 */
export class SkiaFont {
  /** @internal */
  _handle: number
  private readonly _typefaceRef: TypefaceRef
  private readonly _ctx: SkiaContext

  /** @internal Primary constructor — from a TypefaceRef (retains it) */
  constructor(context: SkiaContext, typeface: TypefaceRef, size: number) {
    this._ctx = context
    this._typefaceRef = typeface
    typeface.retain()

    this._handle = context._exports.skia_font_new(typeface.handle, size)
    if (!this._handle) {
      typeface.release()
      throw new Error('Failed to create font')
    }

    fontGCRegistry.register(this, { handle: this._handle, drop: (h: number) => context._exports.skia_font_delete(h) }, this)
  }

  /** Create a font from raw TTF/OTF data. Convenience for standalone use. */
  static fromData(context: SkiaContext, data: Uint8Array, size: number): SkiaFont {
    const ref = getOrCreateTypeface(context, data)
    return new SkiaFont(context, ref, size)
  }

  setSize(size: number): this {
    this._ctx._exports.skia_font_set_size(this._handle, size)
    return this
  }

  /** Measure the advance width of a text string in pixels */
  measureText(text: string): number {
    const [ptr, len] = this._ctx._writeString(text)
    return this._ctx._exports.skia_measure_text(ptr, len, this._handle)
  }

  /** Get font metrics: ascent, descent, leading */
  getMetrics(): { ascent: number; descent: number; leading: number } {
    const ptr = this._ctx._writeF32([0, 0, 0])
    this._ctx._exports.skia_font_get_metrics(this._handle, ptr)
    const dv = new DataView(this._ctx._memory.buffer)
    return { ascent: dv.getFloat32(ptr, true), descent: dv.getFloat32(ptr + 4, true), leading: dv.getFloat32(ptr + 8, true) }
  }

  /** Get the current font size */
  getSize(): number {
    return this._ctx._exports.skia_font_get_size(this._handle)
  }

  /** Convert a text string to an array of glyph IDs */
  getGlyphIDs(text: string): Uint16Array {
    const [textPtr, textLen] = this._ctx._writeString(text)
    const maxGlyphs = text.length
    const outPtr = this._ctx._exports.cabi_realloc(0, 0, 2, maxGlyphs * 2)
    const count = this._ctx._exports.skia_font_get_glyph_ids(this._handle, textPtr, textLen, outPtr, maxGlyphs)
    return new Uint16Array(this._ctx._memory.buffer.slice(outPtr, outPtr + count * 2))
  }

  /** Get advance widths for an array of glyph IDs */
  getGlyphWidths(glyphIDs: Uint16Array): Float32Array {
    const glyphsPtr = this._ctx._exports.cabi_realloc(0, 0, 2, glyphIDs.byteLength)
    new Uint16Array(this._ctx._memory.buffer, glyphsPtr, glyphIDs.length).set(glyphIDs)
    const outPtr = this._ctx._writeF32(new Array(glyphIDs.length).fill(0))
    this._ctx._exports.skia_font_get_glyph_widths(this._handle, glyphsPtr, glyphIDs.length, outPtr)
    return new Float32Array(this._ctx._memory.buffer.slice(outPtr, outPtr + glyphIDs.length * 4))
  }

  dispose(): void {
    if (this._handle !== 0) {
      fontGCRegistry.unregister(this)
      this._ctx._exports.skia_font_delete(this._handle)
      this._typefaceRef.release()
      this._handle = 0
    }
  }
}
