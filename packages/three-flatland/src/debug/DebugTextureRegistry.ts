import type { WebGPURenderer } from 'three/webgpu'
import type { DataTexture, Texture } from 'three'
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  UnsignedByteType,
  RGBAFormat,
} from 'three'
import { texture as sampleTexture } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'
import type { BufferDelta, BufferDisplayMode, BuffersPayload, TexturePixelType } from '../debug-protocol'
import type { BufferCursor } from './bus-pool'
import { copyTypedTo } from './bus-pool'

/**
 * Shape the provider holds for a registered texture. Supports:
 *   - `DataTexture` — CPU-backed, trivial readback (just re-wraps
 *     `image.data` each flush).
 *   - `RenderTarget` — GPU-backed, needs `renderer.readRenderTargetPixelsAsync`.
 *
 * Only one of `dataTexture` / `renderTarget` is populated per entry.
 */
interface DebugTextureEntry {
  name: string
  pixelType: TexturePixelType
  display: BufferDisplayMode
  /**
   * Cap on the readback's larger dimension. Sources bigger than this
   * are downsampled (aspect-preserving) on the GPU before readback so
   * we don't ship megabytes per frame for thumbnail-only previews.
   * `0` = no cap (read at native size).
   */
  maxDim: number
  version: number
  label?: string
  /** Last-emitted version; provider drains iff it doesn't match. */
  lastEmittedVersion: number
  /** Last emitted shape — `full` with pixels vs `meta` without. */
  lastEmittedShape: 'full' | 'meta' | 'none'
  /** `DataTexture` direct-readback path. */
  dataTexture?: DataTexture
  /** `WebGLRenderTarget`-shaped render target (both WebGL + WebGPU). */
  renderTarget?: ReadableRenderTarget
  /**
   * In-flight readback promise. Prevents multiple simultaneous
   * readbacks for the same entry; resolves to a typed-array copy.
   */
  pendingReadback: Promise<Uint8Array | Float32Array> | null
  /** Latest successfully-read sample (re-used across drains). */
  sample: Uint8Array | Float32Array | null
  /** Width/height of the most recent sample. */
  width: number
  height: number
  /**
   * Scratch render target used when `maxDim` requires downsampling.
   * Lazy-allocated on first downsample for this entry; reused
   * thereafter (`setSize` if aspect/dims change).
   */
  scratchRT?: RenderTarget
  /** True once we've logged the "doesn't fit in pool buffer" warning. */
  warnedOversized?: boolean
}

/** Minimal shape used for GPU readback. Matches three's `RenderTarget`. */
interface ReadableRenderTarget {
  width: number
  height: number
  texture: Texture
}

/**
 * Provider-side debug texture store. Hands off async readbacks to a
 * renderer-specific adapter at flush time; caches samples between
 * flushes so consumers always see the most recent successful read.
 */
export class DebugTextureRegistry {
  private _entries = new Map<string, DebugTextureEntry>()
  private _removed = new Set<string>()
  /** Lazy GPU downsampler used by render-target readbacks with a cap. */
  private _downsampler: Downsampler | null = null

  /**
   * Register (or replace) a debug texture.
   *
   * For `DataTexture`, the CPU buffer is already on hand and readback
   * is free. For `RenderTarget` inputs, readback is async and fires on
   * each `drain()` call matching the filter.
   */
  register(
    name: string,
    source: DataTexture | ReadableRenderTarget,
    pixelType: TexturePixelType,
    opts: { label?: string; display?: BufferDisplayMode; maxDim?: number } = {},
  ): void {
    const existing = this._entries.get(name)
    const version = (existing?.version ?? 0) + 1
    const isDataTexture = 'image' in source
    // Format-driven default — bytes are typically already display-ready,
    // floats nearly always need normalising.
    const isFloat = pixelType === 'rgba16f' || pixelType === 'rgba32f'
    const display = opts.display ?? (isFloat ? 'normalize' : 'colors')
    // Default cap for GPU render targets: 256 px on the longer edge.
    // DataTextures are typically tiny and unaffected; explicit `maxDim:0`
    // disables the cap when full-resolution is needed.
    const maxDim = opts.maxDim ?? (isDataTexture ? 0 : 256)
    this._entries.set(name, {
      name,
      pixelType,
      display,
      maxDim,
      version,
      label: opts.label,
      lastEmittedVersion: existing?.lastEmittedVersion ?? 0,
      lastEmittedShape: existing?.lastEmittedShape ?? 'none',
      dataTexture: isDataTexture ? (source as DataTexture) : undefined,
      renderTarget: isDataTexture ? undefined : (source as ReadableRenderTarget),
      pendingReadback: null,
      sample: existing?.sample ?? null,
      width: existing?.width ?? 0,
      height: existing?.height ?? 0,
    })
    this._removed.delete(name)
  }

  touch(name: string): void {
    const e = this._entries.get(name)
    if (e) e.version++
  }

  unregister(name: string): void {
    if (this._entries.delete(name)) this._removed.add(name)
  }

  /**
   * Fill `out.entries` with a delta. `filter`:
   *   - `null`      → every entry ships with pixels (after readback).
   *   - `Set<name>` → only these names get their pixels read; others
   *                   ship metadata only.
   *   - empty set   → every entry ships metadata only.
   *
   * Readbacks are fired asynchronously; the first drain after a
   * filter change may ship metadata-only and then pick up the sample
   * on the next drain. This is fine — the consumer just re-renders
   * whatever it has.
   *
   * Returns `true` when the payload was written (the caller should
   * include `atlas:tick` in the data packet).
   */
  drain(
    out: BuffersPayload,
    filter: Set<string> | null,
    renderer: WebGPURenderer | undefined,
    into?: BufferCursor,
  ): boolean {
    let wrote = false
    const entries: Record<string, BufferDelta | null> = {}

    for (const [name, e] of this._entries) {
      const inFilter = filter === null || filter.has(name)
      const target = inFilter ? 'full' : 'meta'
      if (e.version === e.lastEmittedVersion && e.lastEmittedShape === target) continue

      // Kick off a readback only when the filter wants samples AND we
      // don't already have one in flight. We'll ship the cached
      // `sample` (possibly from a previous drain) if it exists; the
      // in-flight readback will land on a future drain.
      if (inFilter) this._readback(e, renderer)

      // Read live dimensions from the source — render targets start at
      // 1×1 and resize later, so the cached width/height from
      // registration time may be stale or zero. A dimension change
      // bumps the version so the skip-check above fails and we re-emit
      // metadata + kick a fresh readback at the correct size.
      if (e.renderTarget) {
        const lw = e.renderTarget.width, lh = e.renderTarget.height
        if (lw !== e.width || lh !== e.height) {
          e.width = lw; e.height = lh
          e.version++
          e.sample = null
          e.pendingReadback = null
        }
      } else if (e.dataTexture) {
        const lw = e.dataTexture.image.width, lh = e.dataTexture.image.height
        if (lw !== e.width || lh !== e.height) {
          e.width = lw; e.height = lh
          e.version++
        }
      }

      const delta: BufferDelta = {
        width: e.width,
        height: e.height,
        pixelType: e.pixelType,
        display: e.display,
        version: e.version,
        ...(e.label !== undefined ? { label: e.label } : {}),
      }
      if (inFilter && e.sample !== null) {
        if (into !== undefined) {
          const need = e.sample.byteLength
          const have = into.buffer.byteLength - into.byteOffset
          if (need > have) {
            if (e.warnedOversized !== true) {
              console.warn(
                `[devtools] buffer entry '${name}' (${need}B) exceeds remaining ` +
                `pool buffer space (${have}B). Shipping metadata only. ` +
                `Bump POOL.large.size in bus-pool.ts if you want this entry visible.`,
              )
              e.warnedOversized = true
            }
          } else {
            delta.pixels = copyTypedTo(into, e.sample)
          }
        } else {
          delta.pixels = e.sample
        }
      }
      entries[name] = delta
      e.lastEmittedVersion = e.version
      e.lastEmittedShape = target
      wrote = true
    }

    for (const name of this._removed) {
      entries[name] = null
      wrote = true
    }
    this._removed.clear()

    if (wrote) out.entries = entries
    else delete out.entries
    return wrote
  }

  /** Force the next drain to re-emit everything. */
  resetDelta(): void {
    for (const e of this._entries.values()) {
      e.lastEmittedVersion = 0
      e.lastEmittedShape = 'none'
    }
  }

  dispose(): void {
    for (const e of this._entries.values()) {
      e.scratchRT?.dispose()
    }
    this._downsampler?.dispose()
    this._downsampler = null
    this._entries.clear()
    this._removed.clear()
  }

  /**
   * Fire off a readback if none is pending. Data textures resolve
   * synchronously (cheap, no renderer needed); render targets need
   * the renderer for async read.
   */
  private _readback(e: DebugTextureEntry, renderer: WebGPURenderer | undefined): void {
    if (e.pendingReadback !== null) return

    if (e.dataTexture !== undefined) {
      // `DataTexture.image.data` is the live CPU buffer. Copy once so
      // the consumer isn't reading while the host mutates.
      const src = e.dataTexture.image.data as Uint8Array | Float32Array | undefined
      if (src !== undefined) {
        const copy = src instanceof Float32Array
          ? new Float32Array(src)
          : new Uint8Array(src as Uint8Array)
        e.sample = copy
        e.width = e.dataTexture.image.width
        e.height = e.dataTexture.image.height
      }
      return
    }

    if (e.renderTarget !== undefined && renderer !== undefined) {
      const rt = e.renderTarget

      // Decide what we're actually reading back: the source RT, or a
      // smaller scratch RT that the downsampler renders the source
      // into. The cap is `maxDim` on the longer edge — anything within
      // the cap reads back at native size.
      let srcW = rt.width
      let srcH = rt.height
      let target: ReadableRenderTarget = rt
      if (e.maxDim > 0 && Math.max(rt.width, rt.height) > e.maxDim) {
        const aspect = rt.width / rt.height
        const dw = aspect >= 1 ? e.maxDim : Math.max(1, Math.round(e.maxDim * aspect))
        const dh = aspect >= 1 ? Math.max(1, Math.round(e.maxDim / aspect)) : e.maxDim

        if (e.scratchRT === undefined) {
          e.scratchRT = new RenderTarget(dw, dh, { format: RGBAFormat, type: UnsignedByteType })
        } else if (e.scratchRT.width !== dw || e.scratchRT.height !== dh) {
          e.scratchRT.setSize(dw, dh)
        }

        if (this._downsampler === null) this._downsampler = new Downsampler()
        try {
          this._downsampler.render(renderer, rt.texture, e.scratchRT)
        } catch {
          // Downsample failed (e.g. unsupported renderer); fall back to
          // native-size readback so the consumer still sees something.
          target = rt
        }
        if (target === rt) {
          srcW = rt.width
          srcH = rt.height
        } else {
          target = e.scratchRT as unknown as ReadableRenderTarget
          srcW = dw
          srcH = dh
        }
        // Always prefer the scratch on success.
        target = e.scratchRT as unknown as ReadableRenderTarget
        srcW = dw
        srcH = dh
      }

      const byteCount = srcW * srcH * 4
      const buf = new Uint8Array(byteCount)
      const readAsync = (renderer as unknown as {
        readRenderTargetPixelsAsync?: (
          renderTarget: unknown,
          x: number, y: number, w: number, h: number,
          buffer: Uint8Array,
        ) => Promise<Uint8Array>
      }).readRenderTargetPixelsAsync
      if (typeof readAsync !== 'function') return
      const p = readAsync.call(renderer, target, 0, 0, srcW, srcH, buf).then(
        () => {
          e.sample = buf
          e.width = srcW
          e.height = srcH
          e.pendingReadback = null
          // Bump version so the next drain ships the fresh pixels.
          e.version++
          return buf
        },
        () => {
          e.pendingReadback = null
          return buf
        },
      )
      e.pendingReadback = p
    }
  }
}

/**
 * Reusable fullscreen-quad pass that copies any source texture into a
 * caller-provided render target, hardware-bilinear-downsampling on the
 * way. Uses TSL / `NodeMaterial` so it works on `WebGPURenderer`. One
 * instance per registry is plenty — the source texture is rebound per
 * `render()` call.
 */
class Downsampler {
  private _scene: Scene | null = null
  private _camera: OrthographicCamera | null = null
  private _quad: Mesh | null = null
  private _material: NodeMaterial | null = null

  private _ensure(): void {
    if (this._scene !== null) return
    this._scene = new Scene()
    this._camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this._material = new NodeMaterial()
    this._quad = new Mesh(new PlaneGeometry(2, 2), this._material)
    this._scene.add(this._quad)
  }

  render(renderer: WebGPURenderer, src: Texture, dst: RenderTarget): void {
    this._ensure()
    const m = this._material!
    m.colorNode = sampleTexture(src) as unknown as typeof m.colorNode
    m.needsUpdate = true
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(dst)
    renderer.render(this._scene!, this._camera!)
    renderer.setRenderTarget(prev)
  }

  dispose(): void {
    this._quad?.geometry.dispose()
    this._material?.dispose()
    this._scene = null
    this._camera = null
    this._quad = null
    this._material = null
  }
}
