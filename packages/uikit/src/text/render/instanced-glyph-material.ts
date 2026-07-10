import { MeshBasicMaterial } from 'three'
import type { Font } from '../font.js'

// STUB: ported in U1/U2. Upstream injects MSDF-sampling GLSL via onBeforeCompile; the
// fork replaces this with a Slug-backed TSL material (spec §8). Kept as a class (not a
// throwing constructor) so eager construction during glyph-group setup doesn't throw —
// only the render-time onBeforeCompile body throws.
export class InstancedGlyphMaterial extends MeshBasicMaterial {
  constructor(font: Font) {
    super({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })

    this.onBeforeCompile = () => {
      void font
      throw new Error('ported in U1/U2')
    }
  }
}
