import type { WebGLRenderer, WebGLRenderTarget } from 'three'

/**
 * Extract the WebGL framebuffer ID from a Three.js WebGLRenderTarget.
 *
 * This accesses Three.js internal properties (`__webglFramebuffer`).
 * The pattern is standard — used by EffectComposer, postprocessing, etc.
 *
 * @param renderer - Three.js WebGL renderer
 * @param renderTarget - The render target to extract the FBO from
 * @returns The WebGL framebuffer object ID, or 0 if extraction fails
 */
export function getFBOId(renderer: WebGLRenderer, renderTarget: WebGLRenderTarget): number {
  const properties = renderer.properties.get(renderTarget) as Record<string, unknown> | undefined
  if (!properties) return 0

  const fbo = properties.__webglFramebuffer
  if (typeof fbo === 'number') return fbo
  if (fbo instanceof WebGLFramebuffer) {
    // Three.js stores the raw WebGLFramebuffer object in some versions
    // We need the GL name (integer), which we can get by binding and querying
    // For now, return 0 and let Skia use the default FBO
    return 0
  }

  return 0
}
