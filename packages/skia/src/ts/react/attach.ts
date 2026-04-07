import type { SkiaCanvas } from '../three/SkiaCanvas'

/**
 * R3F attach helper — attaches a SkiaCanvas's output texture to a material's `map` property.
 *
 * Since SkiaCanvas is an Object3D (not a Texture), the standard `attach="map"` won't work.
 * This function grabs `.texture` from the canvas and assigns it to the parent material,
 * waiting for the Skia context to be ready if needed.
 *
 * ```tsx
 * <meshBasicMaterial transparent premultipliedAlpha>
 *   <skiaCanvas attach={attachSkiaTexture} renderer={gl} width={1024} height={880}>
 *     <skiaRect fill={[1, 0, 0, 1]} width={100} height={100} />
 *   </skiaCanvas>
 * </meshBasicMaterial>
 * ```
 */
export function attachSkiaTexture(parent: Record<string, unknown>, self: SkiaCanvas): () => void {
  const apply = () => {
    if (self.texture) {
      parent.map = self.texture
      parent.needsUpdate = true
    }
  }

  // Apply immediately if texture is already available, otherwise wait for init
  if (self.texture) {
    apply()
  } else {
    void self.ready.then(apply)
  }

  return () => {
    parent.map = null
    parent.needsUpdate = true
  }
}
