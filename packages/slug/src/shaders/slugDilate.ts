import { float, vec2, dot, sqrt, normalize } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Compute vertex dilation for half-pixel edge coverage.
 *
 * Expands each glyph quad vertex outward along its normal by exactly
 * enough to cover an additional half-pixel in screen space. This prevents
 * edge clipping artifacts where the fragment shader would otherwise
 * not run for partially-covered boundary pixels.
 *
 * Must be called inside a Fn() TSL context.
 *
 * @param posXY - object-space vertex position
 * @param normal - object-space outward normal (unnormalized, points away from quad center)
 * @param texXY - em-space sample coordinates at this vertex
 * @param invScale - scalar inverse Jacobian (1 / fontSize-to-em scale)
 * @param mvpRow0 - row 0 of the model-view-projection matrix
 * @param mvpRow1 - row 1 of the model-view-projection matrix
 * @param mvpRow3 - row 3 of the model-view-projection matrix
 * @param viewport - viewport dimensions [width, height]
 * @returns { vpos: dilated position, texcoord: adjusted em-space coords }
 */
export function slugDilate(
  posXY: Node<'vec2'>,
  normal: Node<'vec2'>,
  texXY: Node<'vec2'>,
  invScale: Node<'float'>,
  mvpRow0: Node<'vec4'>,
  mvpRow1: Node<'vec4'>,
  mvpRow3: Node<'vec4'>,
  viewport: Node<'vec2'>,
  /**
   * Optional stroke half-width in em-space. When provided, the quad is
   * additionally expanded by `strokeHalfWidth / invScale` in object space
   * along the unit outward normal, so fragments outside the glyph's
   * fill bounding box still get shaded by the stroke fragment shader.
   * Texcoords are adjusted by the em-space equivalent so em-space
   * addressing stays correct.
   *
   * Passing `undefined` preserves legacy fill-only behavior exactly.
   */
  strokeHalfWidth?: Node<'float'>,
) {
  // Normalize the outward normal to unit length
  const n = normalize(normal)

  // Homogeneous W at vertex: s = dot(m3.xy, pos.xy) + m3.w
  const s = dot(mvpRow3.xy, posXY).add(mvpRow3.w)

  // W gradient along normal: t = dot(m3.xy, n)
  const t = dot(mvpRow3.xy, n)

  // Pixel-space projected normal components
  const u = s.mul(dot(mvpRow0.xy, n)).sub(
    t.mul(dot(mvpRow0.xy, posXY).add(mvpRow0.w)),
  ).mul(viewport.x)

  const v = s.mul(dot(mvpRow1.xy, n)).sub(
    t.mul(dot(mvpRow1.xy, posXY).add(mvpRow1.w)),
  ).mul(viewport.y)

  // Dilation distance along the unit normal for half-pixel AA coverage.
  const s2 = s.mul(s)
  const st = s.mul(t)
  const uv = u.mul(u).add(v.mul(v))
  const denom = uv.sub(s2.mul(t).mul(t))
  const dist = s2.mul(st.add(sqrt(uv))).div(denom)

  // Object-space object-width of strokeHalfWidth_em = strokeHalfWidth / invScale
  // (invScale = em_per_obj, so 1/invScale = obj_per_em).
  const strokeObj = strokeHalfWidth
    ? strokeHalfWidth.div(invScale)
    : float(0.0)

  const totalDist = dist.add(strokeObj)

  // Displace along the UNIT normal. Fill-only path yields `dist`; stroke
  // path adds `strokeObj` so the quad grows past the glyph bbox.
  const dx = n.x.mul(totalDist)
  const dy = n.y.mul(totalDist)

  // Dilated vertex position
  const vpos = vec2(posXY.x.add(dx), posXY.y.add(dy))

  // Adjusted em-space texcoord: displacement * invScale (uniform scaling)
  const texcoord = vec2(
    texXY.x.add(dx.mul(invScale)),
    texXY.y.add(dy.mul(invScale)),
  )

  return { vpos, texcoord }
}
