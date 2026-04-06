import {
  attribute,
  uniform,
  vec2,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

import { Vector2 } from 'three'

/**
 * Build typed references to the Slug instance attributes.
 *
 * Instance attributes (5x vec4 per glyph):
 *   glyphPos  — object-space position (xy) + half-size for dilation (zw)
 *   glyphTex  — em-space center (xy) + glyph band location X (z) + Y (w)
 *   glyphJac  — inverse Jacobian 2x2 (maps object→em space)
 *   glyphBand — band transform: scale(xy) + offset(zw)
 *   glyphColor — RGBA per-glyph color
 */
export function buildSlugVertexNodes(viewportWidth: number, viewportHeight: number) {
  const viewportUniform = uniform(new Vector2(viewportWidth, viewportHeight))

  // Read instance attributes with explicit generic type params for swizzle access
  const glyphPos = attribute<'vec4'>('glyphPos', 'vec4')
  const glyphTex = attribute<'vec4'>('glyphTex', 'vec4')
  const glyphJac = attribute<'vec4'>('glyphJac', 'vec4')
  const glyphBand = attribute<'vec4'>('glyphBand', 'vec4')
  const glyphColor = attribute<'vec4'>('glyphColor', 'vec4')

  return {
    position: vec2(glyphPos.x, glyphPos.y),
    halfSize: vec2(glyphPos.z, glyphPos.w),
    emCoord: vec2(glyphTex.x, glyphTex.y),
    glyphLocX: glyphTex.z,
    glyphLocY: glyphTex.w,
    glyphJac,
    glyphBand,
    glyphColor,
    viewportUniform,
  }
}
