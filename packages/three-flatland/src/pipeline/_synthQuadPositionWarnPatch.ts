import { AttributeNode } from 'three/webgpu'
import type { NodeBuilder } from 'three/webgpu'

/**
 * Side-effect patch: silence three's "Vertex attribute 'position' not
 * found on geometry" warning for OUR synth-quad geometries only.
 *
 * Three's `positionLocal` is a varying over the position attribute, so
 * even with `material.positionNode` fully overriding the value, the
 * attribute is still declared during shader build. On a position-less
 * geometry three falls back to a constant (correct — no binding is
 * spent) but warns once per pipeline compile. For the synth-quad path
 * that fallback is the DESIGN, not an accident — geometries marked
 * `userData.flSynthQuad` skip straight to the constant without the
 * warning. Everything else (user geometry genuinely missing position)
 * still warns exactly as upstream.
 */
interface AttributeNodeLike {
  getAttributeName(builder: NodeBuilder): string
  getNodeType(builder: NodeBuilder): string
}

interface GenerateFn {
  (this: AttributeNode, builder: NodeBuilder): string | null | undefined
}

const proto = AttributeNode.prototype as unknown as { generate: GenerateFn }
const originalGenerate: GenerateFn = proto.generate

proto.generate = function generate(
  this: AttributeNode & AttributeNodeLike,
  builder: NodeBuilder
): string | null | undefined {
  const geometry = (builder as unknown as { geometry?: { userData?: Record<string, unknown> } })
    .geometry
  if (
    geometry?.userData?.flSynthQuad === true &&
    this.getAttributeName(builder) === 'position' &&
    builder.hasGeometryAttribute('position') === false
  ) {
    return (
      builder as unknown as { generateConst(type: string): string }
    ).generateConst(this.getNodeType(builder))
  }
  return originalGenerate.call(this, builder)
}
