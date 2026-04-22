import type { WebGPURenderer } from 'three/webgpu'
import type { DataTexture, Texture } from 'three'
import {
  Mesh,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
} from 'three'
import { texture as sampleTexture } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'
import type {
  BufferDelta,
  BufferDisplayMode,
  BuffersPayload,
  TexturePixelType,
} from '../debug-protocol'
import type { BuffersSubscription } from './SubscriberRegistry'
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
  pendingReadback: Promise<void> | null
  /** Latest successfully-read sample (re-used across drains). */
  sample: Uint8Array | Float32Array | null
  /** Width/height of the most recent sample (shipped data dimensions). */
  width: number
  height: number
  /**
   * Source RT dimensions at sample time. Equal to `width`/`height` for
   * streams (native-size readback); larger when the consumer requested
   * a thumbnail and we downsampled. Included in drain deltas as
   * `srcWidth`/`srcHeight` so the consumer UI can show "native N×M"
   * regardless of how we shipped the bytes.
   */
  srcWidth: number
  srcHeight: number
  /**
   * Scratch render target used when a consumer requests a `thumbnail`
   * mode subscription. Lazy-allocated on first downsample for this
   * entry; reused thereafter (`setSize` if aspect/dims change).
   */
  scratchRT?: RenderTarget
  /** True once we've logged the "doesn't fit in pool buffer" warning. */
  warnedOversized?: boolean
  /** True once we've logged a readback rejection — prevents per-frame spam. */
  readbackErrorLogged?: boolean
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
    opts: { label?: string; display?: BufferDisplayMode } = {},
  ): void {
    const existing = this._entries.get(name)
    const version = (existing?.version ?? 0) + 1
    const isDataTexture = 'image' in source
    // Format-driven default — bytes are typically already display-ready,
    // floats nearly always need normalising.
    const isFloat = pixelType === 'rgba16f' || pixelType === 'rgba32f'
    const display = opts.display ?? (isFloat ? 'normalize' : 'colors')
    this._entries.set(name, {
      name,
      pixelType,
      display,
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
      srcWidth: existing?.srcWidth ?? 0,
      srcHeight: existing?.srcHeight ?? 0,
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
   * Fill `out.entries` with a delta. `subscription`:
   *   - Map entries name → { mode, thumbSize? } determines which entries
   *     get pixels shipped. Names not in the map get metadata-only so the
   *     consumer UI can still list/cycle available buffers.
   *   - An empty map means every entry ships metadata-only.
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
    subscription: BuffersSubscription,
    _renderer: WebGPURenderer | undefined,
    into?: BufferCursor,
  ): boolean {
    let wrote = false
    const entries: Record<string, BufferDelta | null> = {}

    for (const [name, e] of this._entries) {
      const inFilter = subscription.has(name)
      const target = inFilter ? 'full' : 'meta'
      if (e.version === e.lastEmittedVersion && e.lastEmittedShape === target) continue

      // Readbacks are triggered by `readbackAll()` at end-of-frame,
      // not here. drain() just ships whatever cached sample exists.

      // Read live SOURCE dimensions from the RT/DataTexture — sources
      // start at 1×1 and resize later, so cached dims from registration
      // may be stale. A source-dim change bumps version → skip-check
      // fails → we re-emit metadata + kick a fresh readback at the
      // correct size. `e.width`/`e.height` track the SHIPPED dims
      // (possibly downsampled), which the readback path sets below.
      if (e.renderTarget) {
        const lw = e.renderTarget.width, lh = e.renderTarget.height
        if (lw !== e.srcWidth || lh !== e.srcHeight) {
          e.srcWidth = lw; e.srcHeight = lh
          e.version++
          e.sample = null
          e.pendingReadback = null
        }
      } else if (e.dataTexture) {
        const lw = e.dataTexture.image.width, lh = e.dataTexture.image.height
        if (lw !== e.srcWidth || lh !== e.srcHeight) {
          e.srcWidth = lw; e.srcHeight = lh
          e.version++
        }
      }

      const delta: BufferDelta = {
        width: e.width,
        height: e.height,
        pixelType: e.pixelType,
        display: e.display,
        version: e.version,
        ...(e.srcWidth !== e.width || e.srcHeight !== e.height
          ? { srcWidth: e.srcWidth, srcHeight: e.srcHeight }
          : {}),
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

  /**
   * Kick readbacks for entries the subscription wants pixels for.
   * Called at end-of-frame when the render targets are fully rendered —
   * the GPU copy captures consistent content. No-op for entries that
   * already have a readback in flight. Entries not in the subscription
   * produce no GPU work at all.
   */
  readbackAll(subscription: BuffersSubscription, renderer: WebGPURenderer): void {
    for (const [name, entry] of subscription) {
      const e = this._entries.get(name)
      if (e === undefined) continue
      this._readback(e, renderer, entry.mode, entry.thumbSize ?? 256)
    }
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
  private _readback(
    e: DebugTextureEntry,
    renderer: WebGPURenderer | undefined,
    mode: 'thumbnail' | 'stream' = 'stream',
    thumbSize: number = 256,
  ): void {
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
        const w = e.dataTexture.image.width
        const h = e.dataTexture.image.height
        e.width = w
        e.height = h
        e.srcWidth = w
        e.srcHeight = h
      }
      return
    }

    if (e.renderTarget !== undefined && renderer !== undefined) {
      const rt = e.renderTarget
      if (rt.width <= 1 || rt.height <= 1) return // not yet sized

      // Source RT dims are always the real RT dims. Shipped dims equal
      // source for `stream` mode; for `thumbnail` we downsample via a
      // scratch RT to `thumbSize` on the longer edge.
      const srcW = rt.width
      const srcH = rt.height
      let shippedW = srcW
      let shippedH = srcH
      let target: ReadableRenderTarget = rt
      if (mode === 'thumbnail' && Math.max(srcW, srcH) > thumbSize) {
        const aspect = srcW / srcH
        const dw = aspect >= 1 ? thumbSize : Math.max(1, Math.round(thumbSize * aspect))
        const dh = aspect >= 1 ? Math.max(1, Math.round(thumbSize / aspect)) : thumbSize

        if (e.scratchRT === undefined) {
          // Scratch RT inherits the source's format/type so the bytes
          // shipped over the wire match the `pixelType` metadata the
          // worker reads. Explicit `depthBuffer: false, stencilBuffer:
          // false` + nearest filters match what SDFGenerator's own
          // HalfFloat RTs use (those read back fine at native size), so
          // the scratch should inherit the same WebGPU usage flags.
          // Without these explicit flags, three.js's RT defaults
          // (depth enabled, linear filters) can produce a scratch that
          // `readRenderTargetPixelsAsync` rejects silently on HalfFloat.
          e.scratchRT = new RenderTarget(dw, dh, {
            // three.js types `Texture.format` as the compressed-inclusive
            // `AnyPixelFormat` union; `RenderTarget` wants plain
            // `PixelFormat`. In practice debug-registered textures are
            // always rgba / r / rg — all valid.
            format: rt.texture.format as import('three').PixelFormat,
            type: rt.texture.type,
            depthBuffer: false,
            stencilBuffer: false,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
          })
        } else if (e.scratchRT.width !== dw || e.scratchRT.height !== dh) {
          e.scratchRT.setSize(dw, dh)
        }

        if (this._downsampler === null) this._downsampler = new Downsampler()
        try {
          this._downsampler.render(renderer, rt.texture, e.scratchRT)
          target = e.scratchRT as unknown as ReadableRenderTarget
          shippedW = dw
          shippedH = dh
        } catch (err) {
          // Downsample failed (e.g. unsupported renderer or format
          // combo); fall back to native-size readback. Log once so
          // silent failures don't leave panels blank without feedback.
          if (e.readbackErrorLogged !== true) {
            e.readbackErrorLogged = true
            console.error(
              `[devtools] downsample failed for '${e.name}', falling back to native-size:`,
              err,
            )
          }
        }
      }

      const readAsync = (renderer as unknown as {
        readRenderTargetPixelsAsync?: (
          renderTarget: unknown,
          x: number, y: number, w: number, h: number,
        ) => Promise<ArrayBufferView>
      }).readRenderTargetPixelsAsync
      if (typeof readAsync !== 'function') return
      const p = readAsync.call(renderer, target, 0, 0, shippedW, shippedH).then(
        (result: ArrayBufferView) => {
          e.sample = result as Uint8Array | Float32Array
          e.width = shippedW
          e.height = shippedH
          e.srcWidth = srcW
          e.srcHeight = srcH
          e.pendingReadback = null
          e.version++
        },
        (err: unknown) => {
          e.pendingReadback = null
          // Log once per entry so a repeating failure doesn't spam the
          // console every frame. Without this log the previous code
          // swallowed any readback rejection silently (HalfFloat scratch
          // RTs lacking COPY_SRC, WebGPU format incompatibility, etc.)
          // and debug panels stayed blank with no feedback.
          if (e.readbackErrorLogged !== true) {
            e.readbackErrorLogged = true
            console.error(
              `[devtools] readRenderTargetPixelsAsync rejected for '${e.name}' ` +
              `(${shippedW}×${shippedH}, ${e.pixelType}):`,
              err,
            )
          }
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
    // Force the fragment's RGBA to land in the scratch RT untouched.
    // NodeMaterial with default (transparent=false, NormalBlending)
    // drops the alpha channel on WebGPU — which turns any debug buffer
    // with display='alpha' (occlusion mask) pure white in the thumbnail
    // because the downsampled alpha is always 1.
    m.transparent = true
    m.blending = NoBlending
    m.depthTest = false
    m.depthWrite = false
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
