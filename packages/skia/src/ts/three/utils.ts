import type { WebGLRenderTarget } from 'three'

// Re-use the AnyRenderer type from SkiaCanvas
import type { AnyRenderer } from './SkiaCanvas'

/**
 * Extract the WebGL framebuffer ID from a Three.js WebGLRenderTarget.
 *
 * Accesses Three.js internal properties (`__webglFramebuffer`).
 * The pattern is standard — used by EffectComposer, postprocessing, etc.
 *
 * @param renderer - Three.js renderer with `properties` (WebGLRenderer)
 * @param renderTarget - The render target to extract the FBO from
 * @returns The WebGL framebuffer object ID, or 0 if extraction fails
 */
export function getFBOId(renderer: AnyRenderer, renderTarget: WebGLRenderTarget): number {
  const properties = (renderer as { properties?: { get(t: unknown): Record<string, unknown> | undefined } }).properties
  if (!properties) return 0

  const data = properties.get(renderTarget)
  if (!data) return 0

  const fbo = data.__webglFramebuffer
  if (typeof fbo === 'number') return fbo
  if (fbo instanceof WebGLFramebuffer) {
    // Three.js stores the raw WebGLFramebuffer object in some versions.
    // We can't extract the GL integer name from it directly.
    // Return 0 (default canvas FBO) as a safe fallback.
    return 0
  }

  return 0
}

/**
 * Get the current canvas GPUTexture from a WebGPU renderer.
 *
 * @param renderer - Three.js WebGPURenderer
 * @returns The current canvas texture, or null if unavailable
 */
export function getCanvasTexture(renderer: AnyRenderer): GPUTexture | null {
  const backend = renderer.backend as { context?: GPUCanvasContext; getContext?: () => GPUCanvasContext } | undefined
  const ctx = backend?.context ?? backend?.getContext?.()
  return ctx?.getCurrentTexture() ?? null
}

/**
 * Get the GPUDevice from a WebGPU renderer.
 *
 * @param renderer - Three.js WebGPURenderer
 * @returns The GPUDevice, or null if unavailable
 */
export function getWGPUDevice(renderer: AnyRenderer): GPUDevice | null {
  return (renderer.backend as { device?: GPUDevice } | undefined)?.device ?? null
}
