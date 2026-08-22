import { Vector2, type Vector4 } from 'three'

type RuntimeViewport = Vector4 & { minDepth?: number; maxDepth?: number }
type RendererViewportController = {
  setViewport(x: number, y: number, width: number, height: number, minDepth?: number, maxDepth?: number): void
}
type RendererWithCanvasTarget = RendererViewportController & {
  _canvasTarget?: { _viewport?: RuntimeViewport }
}

/**
 * Read the WebGPU viewport depth range that Three r185 omits from
 * `getViewport(Vector4)`. Keep this private-runtime compatibility shim isolated
 * until Three copies minDepth/maxDepth into the public getter target.
 */
export function getRendererViewportDepthRange(renderer: RendererViewportController, target = new Vector2()): Vector2 {
  const viewport = (renderer as RendererWithCanvasTarget)._canvasTarget?._viewport
  const minDepth = Number.isFinite(viewport?.minDepth) ? viewport!.minDepth! : 0
  const maxDepth = Number.isFinite(viewport?.maxDepth) ? viewport!.maxDepth! : 1
  return target.set(minDepth, maxDepth)
}

/** Apply a viewport without resetting the caller's authored WebGPU depth range. */
export function setRendererViewport(
  renderer: RendererViewportController,
  viewport: Vector4,
  depthRange: Vector2
): void {
  renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, depthRange.x, depthRange.y)
}
