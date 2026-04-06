import type { WebGLRenderer, WebGLRenderTarget } from 'three'
import type { SkiaContext } from '../context'

/**
 * Extract the WebGL framebuffer ID from a Three.js WebGLRenderTarget.
 *
 * Accesses Three.js internal properties (`__webglFramebuffer`).
 * The pattern is standard — used by EffectComposer, postprocessing, etc.
 *
 * @param renderer - Three.js WebGL renderer (WebGLRenderer or WebGLBackend-based)
 * @param renderTarget - The render target to extract the FBO from
 * @returns The WebGL framebuffer object ID, or 0 if extraction fails
 */
export function getFBOId(renderer: WebGLRenderer, renderTarget: WebGLRenderTarget): number {
  const properties = renderer.properties.get(renderTarget) as Record<string, unknown> | undefined
  if (!properties) return 0

  const fbo = properties.__webglFramebuffer
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
  renderer: unknown,
  renderTarget: unknown,
): number {
  // Access the renderer's backend to get the GPU texture for this render target.
  // Three.js WebGPURenderer exposes: renderer.backend.get(renderTarget) → { texture: GPUTexture }
  const r = renderer as {
    backend?: {
      get?: (target: unknown) => { texture?: GPUTexture } | undefined
      device?: GPUDevice
    }
  }

  // Validate this is actually a WebGPU backend with a real device
  if (!r.backend?.device || !r.backend.get) return 0

  // Ensure render target resources are initialized
  const setRT = (renderer as { setRenderTarget?(t: unknown): void }).setRenderTarget
  const getRT = (renderer as { getRenderTarget?(): unknown }).getRenderTarget
  if (setRT && getRT) {
    const current = getRT.call(renderer)
    setRT.call(renderer, renderTarget)
    setRT.call(renderer, current)
  }

  const props = r.backend.get(renderTarget)
  if (!props?.texture) return 0

  return skiaContext.registerTexture(props.texture)
}
