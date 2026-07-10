/**
 * Pure JS reference implementations of the panel shader coverage math
 * (`shader.ts` — `dilatedPanelPosition` / `computePanelFragment`).
 *
 * These mirror the TSL line-for-line but run on the CPU, enabling unit tests
 * without a GPU (same pattern as slug's `shaders/reference.ts`). If these
 * pass, and the TSL mirrors them, the coverage math is correct.
 */

export interface PanelFragmentInput {
  /** uv as interpolated over the DILATED quad (what the fragment stage sees) */
  uv: readonly [number, number]
  /** panel size in panel pixels */
  dimensions: readonly [number, number]
  /** border widths in panel pixels: top, right, bottom, left */
  borderSizes: readonly [number, number, number, number]
  /** corner radii as fractions of height (the unpacked base-50 encoding) */
  borderRadius: readonly [number, number, number, number]
  /** fwidth(dist) — defaults to one panel pixel in height-normalized units */
  gradient?: readonly [number, number]
}

export interface PanelFragmentOutput {
  /** vec2(outer sdf, inner/border sdf), height-normalized */
  dist: [number, number]
  /** outer coverage after the ±fwidth smoothstep */
  outer: number
  /** inner (border-inset box) coverage after the ±fwidth smoothstep */
  inner: number
  /** 1 = content/background, 0 = border */
  transition: number
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function step(edge: number, x: number): number {
  return x < edge ? 0 : 1
}

/** Mirror of `safeDims`. */
function refSafeDims(w: number, h: number): [number, number] {
  return [Math.max(w, 1e-4), Math.max(h, 1e-4)]
}

/** Mirror of `dilatedPanelPosition`'s per-axis scale: (size + 2px) / size. */
export function refDilatedScale(width: number, height: number): [number, number] {
  const [w, h] = refSafeDims(width, height)
  return [(w + 2) / w, (h + 2) / h]
}

/** Mirror of the fragment-stage uv remap: dilated-quad uv → panel-rect uv. */
export function refRemapUv(u: number, v: number, width: number, height: number): [number, number] {
  const [w, h] = refSafeDims(width, height)
  return [(u * (w + 2) - 1) / w, (v * (h + 2) - 1) / h]
}

/** Inverse of `refRemapUv`, for addressing test points in panel space. */
export function refPanelUvToDilatedUv(
  u: number,
  v: number,
  width: number,
  height: number
): [number, number] {
  const [w, h] = refSafeDims(width, height)
  return [(u * w + 1) / (w + 2), (v * h + 1) / (h + 2)]
}

/** Mirror of `radiusDistance`. */
export function refRadiusDistance(
  radius: number,
  outside: readonly [number, number],
  border: readonly [number, number],
  borderSize: readonly [number, number]
): [number, number] {
  const innerRadius = [radius - borderSize[0], radius - borderSize[1]] as const
  const weightUnnorm = [
    Math.abs(innerRadius[0] - border[0]),
    Math.abs(innerRadius[1] - border[1]),
  ] as const
  const sum = weightUnnorm[0] + weightUnnorm[1]
  const weight = sum > 0 ? [weightUnnorm[0] / sum, weightUnnorm[1] / sum] : [0.5, 0.5]
  const outerDistance = Math.hypot(outside[0] - radius, outside[1] - radius)
  const innerDistance = Math.hypot(border[0] - innerRadius[0], border[1] - innerRadius[1])
  return [
    radius - outerDistance,
    weight[0]! * innerRadius[0] + weight[1]! * innerRadius[1] - innerDistance,
  ]
}

/** Mirror of `computePanelFragment` (coverage outputs only). */
export function refComputePanelFragment(input: PanelFragmentInput): PanelFragmentOutput {
  const [w, h] = refSafeDims(input.dimensions[0], input.dimensions[1])
  const aspectRatio = w / h
  const borderSize = input.borderSizes.map((s) => s / h) as unknown as [
    number,
    number,
    number,
    number,
  ]

  const [u, v] = refRemapUv(input.uv[0], input.uv[1], w, h)
  const uvFlipped = [u, 1 - v] as const
  const outsideDistance = [
    uvFlipped[1],
    (1 - uvFlipped[0]) * aspectRatio,
    1 - uvFlipped[1],
    uvFlipped[0] * aspectRatio,
  ] as const
  const borderDistance = [
    outsideDistance[0] - borderSize[0],
    outsideDistance[1] - borderSize[1],
    outsideDistance[2] - borderSize[2],
    outsideDistance[3] - borderSize[3],
  ] as const

  let dist: [number, number] = [Math.min(...outsideDistance), Math.min(...borderDistance)]

  // Corner selection — same order and swizzles as the shader's candidates.
  const corners = [
    { outside: [3, 0], radius: input.borderRadius[0] },
    { outside: [1, 0], radius: input.borderRadius[1] },
    { outside: [1, 2], radius: input.borderRadius[2] },
    { outside: [2, 3], radius: input.borderRadius[3] },
  ] as const
  for (const corner of corners) {
    const o = [outsideDistance[corner.outside[0]], outsideDistance[corner.outside[1]]] as const
    if (o[0] < corner.radius && o[1] < corner.radius) {
      const b = [borderDistance[corner.outside[0]], borderDistance[corner.outside[1]]] as const
      const s = [borderSize[corner.outside[0]], borderSize[corner.outside[1]]] as const
      dist = refRadiusDistance(corner.radius, o, b, s)
      break
    }
  }

  // ±fwidth AA window, matching `fwidth(dist)` (upstream's AA width).
  const gradient = input.gradient ?? [1 / h, 1 / h]
  const outer = smoothstep(-gradient[0], gradient[0], dist[0])
  const inner = smoothstep(-gradient[1], gradient[1], dist[1])
  // Border presence from the SDF gap — clips content to the inner box and
  // keeps the outer fringe border-colored (see shader.ts).
  const transition = 1 - step(1e-5, dist[0] - dist[1]) * (1 - inner)

  return { dist, outer, inner, transition }
}
