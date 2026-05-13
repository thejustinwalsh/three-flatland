/**
 * Pure JS reference implementations of the Slug shader math.
 *
 * These mirror the TSL shader code exactly but run on the CPU,
 * enabling unit testing without a GPU. If these pass, and the
 * TSL code mirrors them line-for-line, the shaders are correct.
 */

/**
 * Reference implementation of calcRootCode.
 * Determines which quadratic roots contribute to the winding number.
 */
export function refCalcRootCode(y1: number, y2: number, y3: number): number {
  const s1 = y1 < 0 ? 1 : 0
  const s2 = y2 < 0 ? 1 : 0
  const s3 = y3 < 0 ? 1 : 0

  const shift = s1 | (s2 << 1) | (s3 << 2)
  return (0x2e74 >>> shift) & 0x0101
}

/**
 * Reference implementation of solveHorizPoly.
 * Returns [x1, x2] intersection coordinates for a horizontal ray at y=0.
 */
export function refSolveHorizPoly(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): [number, number] {
  const a = p0y - 2 * p1y + p2y
  const b = p0y - p1y
  const c = p0y

  const ax = p0x - 2 * p1x + p2x
  const bx = p0x - p1x

  const disc = Math.max(b * b - a * c, 0)
  const d = Math.sqrt(disc)

  const nearLinear = Math.abs(a) < 1.0 / 65536.0

  let t1: number, t2: number
  if (nearLinear) {
    t1 = t2 = c / (2 * b)
  } else {
    t1 = (b - d) / a
    t2 = (b + d) / a
  }

  const x1 = (ax * t1 - bx * 2) * t1 + p0x
  const x2 = (ax * t2 - bx * 2) * t2 + p0x

  return [x1, x2]
}

/**
 * Reference implementation of solveVertPoly.
 * Returns [y1, y2] intersection coordinates for a vertical ray at x=0.
 */
export function refSolveVertPoly(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): [number, number] {
  const a = p0x - 2 * p1x + p2x
  const b = p0x - p1x
  const c = p0x

  const ay = p0y - 2 * p1y + p2y
  const by = p0y - p1y

  const disc = Math.max(b * b - a * c, 0)
  const d = Math.sqrt(disc)

  const nearLinear = Math.abs(a) < 1.0 / 65536.0

  let t1: number, t2: number
  if (nearLinear) {
    t1 = t2 = c / (2 * b)
  } else {
    t1 = (b - d) / a
    t2 = (b + d) / a
  }

  const y1 = (ay * t1 - by * 2) * t1 + p0y
  const y2 = (ay * t2 - by * 2) * t2 + p0y

  return [y1, y2]
}

/**
 * Reference implementation of calcCoverage.
 * Combines horizontal and vertical coverage into final antialiased value.
 */
export function refCalcCoverage(
  xcov: number,
  xwgt: number,
  ycov: number,
  ywgt: number,
  evenOdd: boolean = false,
  weightBoost: boolean = false,
  stemDarken: number = 0,
  ppem: number = Infinity
): number {
  const epsilon = 1.0 / 65536.0

  const weighted = Math.abs(xcov * xwgt + ycov * ywgt) / Math.max(xwgt + ywgt, epsilon)
  const fallback = Math.min(Math.abs(xcov), Math.abs(ycov))
  const rawCoverage = Math.max(weighted, fallback)

  let coverage: number
  if (evenOdd) {
    const frac = rawCoverage * 0.5 - Math.floor(rawCoverage * 0.5)
    coverage = 1.0 - Math.abs(1.0 - frac * 2.0)
  } else {
    coverage = Math.min(Math.max(rawCoverage, 0), 1) // saturate
  }

  if (weightBoost) {
    coverage = Math.sqrt(coverage)
  }

  // Stem darkening: ramps from full strength at ppem=0 to zero at ppem>=24
  if (stemDarken > 0 && ppem < Infinity) {
    const darkenPpem = 24
    const darken = stemDarken * Math.max(0, 1 - ppem / darkenPpem)
    coverage = Math.min(coverage + darken * coverage * (1 - coverage), 1)
  }

  return coverage
}

/**
 * Reference implementation of SlugDilate.
 * Computes vertex dilation for half-pixel coverage at glyph edges.
 *
 * @param posXY - object-space vertex position
 * @param posZW - object-space outward normal (unnormalized)
 * @param texXY - em-space sample coordinates
 * @param jac - inverse Jacobian [j00, j01, j10, j11]
 * @param m0 - MVP matrix row 0 [m00, m01, m02, m03]
 * @param m1 - MVP matrix row 1
 * @param m3 - MVP matrix row 3
 * @param dim - viewport dimensions [width, height]
 * @returns { vpos: [x, y], texcoord: [u, v] }
 */
export function refSlugDilate(
  posXY: [number, number],
  posZW: [number, number],
  texXY: [number, number],
  jac: [number, number, number, number],
  m0: [number, number, number, number],
  m1: [number, number, number, number],
  m3: [number, number, number, number],
  dim: [number, number]
): { vpos: [number, number]; texcoord: [number, number] } {
  // Normalize the outward normal
  const nLen = Math.sqrt(posZW[0] * posZW[0] + posZW[1] * posZW[1])
  const nx = nLen > 0 ? posZW[0] / nLen : 0
  const ny = nLen > 0 ? posZW[1] / nLen : 0

  // Homogeneous W at vertex
  const s = m3[0] * posXY[0] + m3[1] * posXY[1] + m3[3]
  // W gradient along normal
  const t = m3[0] * nx + m3[1] * ny

  // Pixel-space projected normal components
  const u =
    (s * (m0[0] * nx + m0[1] * ny) - t * (m0[0] * posXY[0] + m0[1] * posXY[1] + m0[3])) * dim[0]
  const v =
    (s * (m1[0] * nx + m1[1] * ny) - t * (m1[0] * posXY[0] + m1[1] * posXY[1] + m1[3])) * dim[1]

  const s2 = s * s
  const st = s * t
  const uv = u * u + v * v

  // Dilation factor along the unnormalized normal direction
  const denom = uv - st * st
  const factor = denom !== 0 ? (s2 * (st + Math.sqrt(uv))) / denom : 0

  const dx = posZW[0] * factor
  const dy = posZW[1] * factor

  // Dilated vertex position
  const vpos: [number, number] = [posXY[0] + dx, posXY[1] + dy]

  // Adjusted em-space texcoord via inverse Jacobian
  const texcoord: [number, number] = [
    texXY[0] + dx * jac[0] + dy * jac[1],
    texXY[1] + dx * jac[2] + dy * jac[3],
  ]

  return { vpos, texcoord }
}
