import { Matrix4 } from 'three'
import {
  Fn,
  If,
  abs,
  attribute,
  bitangentView,
  distance,
  dot,
  float,
  floor,
  fwidth,
  mat4,
  materialColor,
  materialOpacity,
  max,
  min,
  mix,
  mod,
  normalView,
  normalize,
  positionGeometry,
  select,
  smoothstep,
  step,
  tangentView,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  vertexStage,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type { PanelMaterialInfo } from './create.js'

/**
 * TSL port of upstream's GLSL panel shader (spec §5.3). One graph serves both
 * backends — no backend branches (Q1/Q2).
 *
 * Every mat4-shaped per-instance attribute travels as four vec4 lanes (WGSL has
 * no matrix vertex attributes — Q1); `InstancedPanelMesh` publishes them under
 * these names as interleaved views over the untouched itemSize-16 buffers.
 */
export const panelMatrixLanes = [
  'aInstanceMatrix0',
  'aInstanceMatrix1',
  'aInstanceMatrix2',
  'aInstanceMatrix3',
] as const
export const panelDataLanes = ['aData0', 'aData1', 'aData2', 'aData3'] as const
export const panelClippingLanes = ['aClipping0', 'aClipping1', 'aClipping2', 'aClipping3'] as const

type FloatNode = Node<'float'>
type Vec2Node = Node<'vec2'>
type Vec3Node = Node<'vec3'>
type Vec4Node = Node<'vec4'>

/** The four mat4 columns of the panel data: border sizes / bg rgba / packed radius + border rgb / border a + bend + size. */
type PanelDataColumns = readonly [Vec4Node, Vec4Node, Vec4Node, Vec4Node]

export interface PanelMaterialNodes {
  colorNode: Vec4Node
  normalNode: Vec3Node
}

const min4 = (v: Vec4Node): FloatNode => min(min(v.x, v.y), min(v.z, v.w))
const max4 = (v: Vec4Node): FloatNode => max(max(v.x, v.y), max(v.z, v.w))
const step4 = (edge: FloatNode, v: Vec4Node): Vec4Node =>
  vec4(step(edge, v.x), step(edge, v.y), step(edge, v.z), step(edge, v.w))

/** vec2(outer sdf, inner/border sdf) inside a rounded corner (port of upstream `radiusDistance`). */
function radiusDistance(
  radius: FloatNode,
  outside: Vec2Node,
  border: Vec2Node,
  borderSize: Vec2Node
): Vec2Node {
  const outerRadius = vec2(radius, radius)
  const innerRadius = outerRadius.sub(borderSize)
  const radiusWeightUnnorm = abs(innerRadius.sub(border))
  const sum = radiusWeightUnnorm.x.add(radiusWeightUnnorm.y)
  const radiusWeight = select(sum.greaterThan(0), radiusWeightUnnorm.div(sum), vec2(0.5, 0.5))
  return vec2(
    radius.sub(distance(outside, outerRadius)),
    dot(radiusWeight, innerRadius).sub(distance(border, innerRadius))
  )
}

function calculateCornerIntersection(
  cornerRadius: FloatNode,
  borderSizes: Vec2Node,
  aspectRatio: FloatNode
): Vec2Node {
  const tmp1 = cornerRadius.sub(borderSizes.y)
  const xIntersection = vec2(tmp1, tmp1.div(aspectRatio))
  const tmp2 = cornerRadius.sub(borderSizes.x)
  const yIntersection = vec2(tmp2.mul(aspectRatio), tmp2)
  return min(xIntersection, yIntersection)
}

/** Unpack the base-50 packed border radius (data[2].x) into vec4 fractions, in the vertex stage. */
function unpackBorderRadius(packed: FloatNode): Vec4Node {
  return vertexStage(
    vec4(
      mod(floor(packed.div(125000)), 50),
      mod(floor(packed.div(2500)), 50),
      mod(floor(packed.div(50)), 50),
      mod(packed, 50)
    ).mul(0.01)
  )
}

/**
 * Rounded-rect coverage + border weights. Must run inside an `Fn` stack.
 *
 * Q2 discipline: every `fwidth` executes unconditionally at the top level; the
 * corner `If`/`ElseIf` branches only assign values computed before branching.
 */
function computePanelFragment(cols: PanelDataColumns, borderRadius: Vec4Node) {
  const dimensions = cols[3].zw
  const aspectRatio = dimensions.x.div(dimensions.y)
  const borderSize = cols[0].div(dimensions.y)

  const uvNode = uv()
  const uvFlipped = vec2(uvNode.x, float(1).sub(uvNode.y))
  const outsideDistance = vec4(
    uvFlipped.y,
    float(1).sub(uvFlipped.x).mul(aspectRatio),
    float(1).sub(uvFlipped.y),
    uvFlipped.x.mul(aspectRatio)
  )
  const borderDistance = outsideDistance.sub(borderSize)

  const dist = vec2(min4(outsideDistance), min4(borderDistance)).toVar()
  const negateBorderDistance = vec4(1, 1, 1, 1).sub(borderDistance)
  const borderWeight = step4(max4(negateBorderDistance), negateBorderDistance).toVar()
  const insideBorder = vec4(0, 0, 0, 0).toVar()

  // Corner selection — candidates evaluated before branching (spec §5.3).
  const corners: Array<{
    outside: Vec2Node
    border: Vec2Node
    size: Vec2Node
    radius: FloatNode
    place: (ci: Vec2Node) => Vec4Node
  }> = [
    {
      outside: outsideDistance.wx,
      border: borderDistance.wx,
      size: borderSize.wx,
      radius: borderRadius.x,
      place: (ci) => vec4(ci.y, 0, 0, ci.x),
    },
    {
      outside: outsideDistance.yx,
      border: borderDistance.yx,
      size: borderSize.yx,
      radius: borderRadius.y,
      place: (ci) => vec4(ci.y, ci.x, 0, 0),
    },
    {
      outside: outsideDistance.yz,
      border: borderDistance.yz,
      size: borderSize.yz,
      radius: borderRadius.z,
      place: (ci) => vec4(0, ci.x, ci.y, 0),
    },
    {
      outside: outsideDistance.zw,
      border: borderDistance.zw,
      size: borderSize.zw,
      radius: borderRadius.w,
      place: (ci) => vec4(0, 0, ci.x, ci.y),
    },
  ]
  const candidates = corners.map(({ outside, border, size, radius, place }) => ({
    condition: outside.x.lessThan(radius).and(outside.y.lessThan(radius)),
    distance: radiusDistance(radius, outside, border, size).toVar(),
    insideBorder: place(
      max(vec2(0, 0), calculateCornerIntersection(radius, size, aspectRatio).sub(border))
    ).toVar(),
  }))

  If(candidates[0]!.condition, () => {
    dist.assign(candidates[0]!.distance)
    insideBorder.assign(candidates[0]!.insideBorder)
  })
    .ElseIf(candidates[1]!.condition, () => {
      dist.assign(candidates[1]!.distance)
      insideBorder.assign(candidates[1]!.insideBorder)
    })
    .ElseIf(candidates[2]!.condition, () => {
      dist.assign(candidates[2]!.distance)
      insideBorder.assign(candidates[2]!.insideBorder)
    })
    .ElseIf(candidates[3]!.condition, () => {
      dist.assign(candidates[3]!.distance)
      insideBorder.assign(candidates[3]!.insideBorder)
    })

  const insideBorderSum = dot(insideBorder, vec4(1, 1, 1, 1))
  If(insideBorderSum.greaterThan(0), () => {
    borderWeight.assign(insideBorder.div(insideBorderSum))
  })

  // Unconditional derivatives — top-level control flow on both backends (Q2).
  const distanceGradient = fwidth(dist)
  const outer = smoothstep(distanceGradient.x.negate(), distanceGradient.x, dist.x)
  const inner = smoothstep(distanceGradient.y.negate(), distanceGradient.y, dist.y)
  const transition = float(1).sub(step(0.1, outer.sub(inner)).mul(float(1).sub(inner)))

  return { dist, borderWeight, outer, transition }
}

/**
 * Build the panel `colorNode`/`normalNode` pair for `createPanelNodeMaterial`.
 *
 * Full coverage — rounded corners × opacity × per-instance clip — lands in the
 * ALPHA of `colorNode` so `Renderer._getShadowNodes()` sees it (spec §2.1/§2.2);
 * clipping is a coverage multiply, never an in-graph discard (Q2). The one
 * discard is NodeMaterial's `alphaTest`, applied in main and shadow passes.
 */
export function createPanelMaterialNodes(info: PanelMaterialInfo): PanelMaterialNodes {
  let cols: PanelDataColumns
  let clipCoverage: FloatNode

  if (info.type === 'instanced') {
    cols = [
      attribute<'vec4'>(panelDataLanes[0], 'vec4'),
      attribute<'vec4'>(panelDataLanes[1], 'vec4'),
      attribute<'vec4'>(panelDataLanes[2], 'vec4'),
      attribute<'vec4'>(panelDataLanes[3], 'vec4'),
    ]
    const instanceMatrix = mat4(
      attribute<'vec4'>(panelMatrixLanes[0], 'vec4'),
      attribute<'vec4'>(panelMatrixLanes[1], 'vec4'),
      attribute<'vec4'>(panelMatrixLanes[2], 'vec4'),
      attribute<'vec4'>(panelMatrixLanes[3], 'vec4')
    )
    // Root-space position from the attribute lanes directly — deterministic
    // regardless of `positionLocal` mutation order after InstanceNode (spec §5.2).
    const localPosition = varying(instanceMatrix.mul(vec4(positionGeometry, 1)).xyz)
    clipCoverage = float(1)
    for (const name of panelClippingLanes) {
      const plane = attribute<'vec4'>(name, 'vec4')
      const distanceToPlane = dot(localPosition, plane.xyz).add(plane.w)
      const gradient = max(fwidth(distanceToPlane).mul(0.5), 0.00001)
      clipCoverage = clipCoverage.mul(smoothstep(gradient.negate(), gradient, distanceToPlane))
    }
  } else {
    const dataMatrix = new Matrix4()
    const dataUniform = uniform(dataMatrix)
    // Upstream re-uploads the `data` uniform from `info.data` every frame.
    dataUniform.onFrameUpdate(() => {
      dataMatrix.fromArray(info.data)
    })
    cols = [
      dataUniform.mul(vec4(1, 0, 0, 0)),
      dataUniform.mul(vec4(0, 1, 0, 0)),
      dataUniform.mul(vec4(0, 0, 1, 0)),
      dataUniform.mul(vec4(0, 0, 0, 1)),
    ]
    clipCoverage = float(1)
  }

  const borderRadius = unpackBorderRadius(cols[2].x)
  const backgroundColor = cols[1].xyz
  const backgroundOpacity = cols[1].w
  const borderColor = cols[2].yzw
  const borderOpacity = cols[3].x
  const borderBend = cols[3].y

  const colorNode = Fn(() => {
    const { outer, transition } = computePanelFragment(cols, borderRadius)

    // `materialColor` folds in `material.map` (rgb AND alpha); `materialOpacity`
    // folds in `material.opacity` — upstream's `diffuseColor` at color_fragment.
    const base = vec4(materialColor).toVar()
    const mainColor = base.rgb.mul(backgroundColor)
    const fullBackgroundOpacity = base.a.mul(float(materialOpacity)).mul(backgroundOpacity)
    const fullBorderOpacity = min(float(1), borderOpacity.add(fullBackgroundOpacity))
    const outOpacity = clipCoverage
      .mul(outer)
      .mul(mix(fullBorderOpacity, fullBackgroundOpacity, transition))

    const borderMix = borderOpacity.div(max(fullBorderOpacity, 0.001))
    const rgb = mix(mix(mainColor, borderColor, borderMix), mainColor, transition)
    return vec4(rgb, outOpacity)
  })()

  // Border-bend view-space normal (upstream's normal_fragment_maps injection).
  // Ignored by unlit materials; recomputes the corner math for lit ones.
  const normalNode = Fn(() => {
    const { dist, borderWeight } = computePanelFragment(cols, borderRadius)

    const bitangent = normalize(vec3(bitangentView))
    const tangent = normalize(vec3(tangentView))
    const currentBorderSize = dist.x.sub(dist.y)
    const outsideNormalWeight = select(
      currentBorderSize.lessThan(1e-5),
      float(0),
      max(float(0), dist.y.negate().div(currentBorderSize)).mul(borderBend.negate())
    )
    // upstream `(borderWeight * transpose(directions)).xyz` = directions × borderWeight
    const outsideNormal = bitangent
      .mul(borderWeight.x)
      .add(tangent.mul(borderWeight.y))
      .sub(bitangent.mul(borderWeight.z))
      .sub(tangent.mul(borderWeight.w))
    return normalize(mix(normalView, outsideNormal, outsideNormalWeight))
  })()

  return { colorNode, normalNode }
}
