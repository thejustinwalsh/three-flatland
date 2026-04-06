import type { WebGLRenderTarget } from 'three'
import type { SkiaContext } from '../context'

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
 * Extract a WebGPU texture handle from a Three.js render target for use with Skia.
 *
 * For the native WebGPU backend, we need to register the GPUTexture from Three.js's
 * render target into Skia's handle table so it can be passed to beginDrawing().
 *
 * Only called when Skia is using the wgpu backend AND Three.js has a real WebGPUBackend.
 *
 * @param skiaContext - The Skia context (must be wgpu backend)
 * @param renderer - Three.js WebGPURenderer with native WebGPU backend
 * @param renderTarget - The render target to extract the texture from
 * @returns A handle for use with beginDrawing(), or 0 on failure
 */
export function getWGPUTextureHandle(
  skiaContext: SkiaContext,
  renderer: AnyRenderer,
  renderTarget: unknown,
): number {
  // Access the renderer's backend to get the GPU texture for this render target.
  // Three.js WebGPURenderer exposes: renderer.backend.get(renderTarget) → { texture: GPUTexture }
  const backend = renderer.backend as {
    get?: (target: unknown) => { texture?: GPUTexture } | undefined
    device?: GPUDevice
  } | undefined

  // Validate this is actually a WebGPU backend with a real device
  if (!backend?.device || !backend.get) return 0

  // Ensure render target resources are initialized
  const current = renderer.getRenderTarget()
  renderer.setRenderTarget(renderTarget)
  renderer.setRenderTarget(current)

  const props = backend.get(renderTarget)
  if (!props?.texture) return 0

  return skiaContext.registerTexture(props.texture)
}
