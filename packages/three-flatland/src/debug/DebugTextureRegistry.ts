import type { WebGPURenderer } from 'three/webgpu'
import type { DataTexture, Texture } from 'three'
import type { BufferDelta, BufferDisplayMode, BuffersPayload, TexturePixelType } from '../debug-protocol'

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
  pendingReadback: Promise<Uint8Array | Float32Array> | null
  /** Latest successfully-read sample (re-used across drains). */
  sample: Uint8Array | Float32Array | null
  /** Width/height of the most recent sample. */
  width: number
  height: number
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

      const delta: BufferDelta = {
        width: e.width,
        height: e.height,
        pixelType: e.pixelType,
        display: e.display,
        version: e.version,
        ...(e.label !== undefined ? { label: e.label } : {}),
      }
      if (inFilter && e.sample !== null) delta.pixels = e.sample
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
      const byteCount = rt.width * rt.height * 4
      const buf = new Uint8Array(byteCount)
      const readAsync = (renderer as unknown as {
        readRenderTargetPixelsAsync?: (
          renderTarget: unknown,
          x: number, y: number, w: number, h: number,
          buffer: Uint8Array,
        ) => Promise<Uint8Array>
      }).readRenderTargetPixelsAsync
      if (typeof readAsync !== 'function') return
      const p = readAsync.call(renderer, rt, 0, 0, rt.width, rt.height, buf).then(
        () => {
          e.sample = buf
          e.width = rt.width
          e.height = rt.height
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
