import { NoToneMapping, SRGBColorSpace } from 'three'
import type { WebGPURenderer } from 'three/webgpu'

/**
 * Canonical color pipeline for paired examples.
 *
 * R3F initializes renderers with ACESFilmicToneMapping while a plain
 * WebGPURenderer defaults to NoToneMapping. Leaving those framework defaults
 * in place makes otherwise identical React and Three examples display
 * different colors. Keep the presentation transform explicit on both sides.
 */
export const exampleRendererColorConfig = {
  outputColorSpace: SRGBColorSpace,
  toneMapping: NoToneMapping,
} as const

export function configureExampleRendererColor(renderer: WebGPURenderer): void {
  renderer.outputColorSpace = exampleRendererColorConfig.outputColorSpace
  renderer.toneMapping = exampleRendererColorConfig.toneMapping
}
