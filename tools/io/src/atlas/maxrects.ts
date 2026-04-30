// MaxRects best-short-side-fit (BSSF), no rotation. Single-bin pack into
// a square output ≤ maxSize on each side. Output dimensions are rounded
// up to a multiple of 4 (BC/ETC2 block size); when powerOfTwo is true,
// rounded to the next power of two instead. Padding is applied as a
// gutter on every side of every rect AND as an outer margin.

export type PackInput = {
  rects: ReadonlyArray<{ id: string; w: number; h: number }>
  maxSize: number
  padding: number
  powerOfTwo: boolean
}

export type Placement = { x: number; y: number; w: number; h: number }

export type PackResult =
  | { kind: 'ok'; placements: Map<string, Placement>; size: { w: number; h: number }; utilization: number }
  | { kind: 'nofit' }

type FreeRect = { x: number; y: number; w: number; h: number }

export function packRects(input: PackInput): PackResult {
  const { maxSize, padding, powerOfTwo } = input
  // Inflate every rect by padding on right + bottom (left + top are
  // handled by leaving padding as outer margin / between-cells gutter).
  const inflated = input.rects.map((r) => ({
    id: r.id,
    w: r.w + padding,
    h: r.h + padding,
    rawW: r.w,
    rawH: r.h,
  }))
  // BSSF works best when the largest dimensions are placed first.
  inflated.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h))

  const placements = new Map<string, Placement>()
  // Inner area is maxSize minus the outer padding margin on right + bottom.
  const inner = maxSize - padding
  const free: FreeRect[] = [{ x: padding, y: padding, w: inner, h: inner }]
  let usedW = 0
  let usedH = 0

  for (const r of inflated) {
    const fit = findBestNode(free, r.w, r.h)
    if (!fit) return { kind: 'nofit' }
    placements.set(r.id, { x: fit.x, y: fit.y, w: r.rawW, h: r.rawH })
    usedW = Math.max(usedW, fit.x + r.rawW + padding)
    usedH = Math.max(usedH, fit.y + r.rawH + padding)
    splitFree(free, fit, r.w, r.h)
    pruneFree(free)
  }

  const w = roundOutput(usedW, powerOfTwo)
  const h = roundOutput(usedH, powerOfTwo)
  if (w > maxSize || h > maxSize) return { kind: 'nofit' }
  const usedArea = inflated.reduce((s, r) => s + r.rawW * r.rawH, 0)
  return {
    kind: 'ok',
    placements,
    size: { w, h },
    utilization: usedArea / (w * h),
  }
}

function findBestNode(
  free: FreeRect[],
  w: number,
  h: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number; score: number } | null = null
  for (const f of free) {
    if (f.w < w || f.h < h) continue
    const leftoverShort = Math.min(f.w - w, f.h - h)
    if (best === null || leftoverShort < best.score) {
      best = { x: f.x, y: f.y, score: leftoverShort }
    }
  }
  return best ? { x: best.x, y: best.y } : null
}

function splitFree(free: FreeRect[], used: { x: number; y: number }, w: number, h: number): void {
  const ux = used.x
  const uy = used.y
  const ux2 = ux + w
  const uy2 = uy + h
  const next: FreeRect[] = []
  for (const f of free) {
    const fx2 = f.x + f.w
    const fy2 = f.y + f.h
    if (ux >= fx2 || ux2 <= f.x || uy >= fy2 || uy2 <= f.y) {
      next.push(f)
      continue
    }
    if (ux > f.x) next.push({ x: f.x, y: f.y, w: ux - f.x, h: f.h })
    if (ux2 < fx2) next.push({ x: ux2, y: f.y, w: fx2 - ux2, h: f.h })
    if (uy > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: uy - f.y })
    if (uy2 < fy2) next.push({ x: f.x, y: uy2, w: f.w, h: fy2 - uy2 })
  }
  free.length = 0
  free.push(...next)
}

function pruneFree(free: FreeRect[]): void {
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (contains(free[j]!, free[i]!)) {
        free.splice(i, 1)
        i--
        break
      }
      if (contains(free[i]!, free[j]!)) {
        free.splice(j, 1)
        j--
      }
    }
  }
}

function contains(a: FreeRect, b: FreeRect): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h
}

function roundOutput(n: number, powerOfTwo: boolean): number {
  if (powerOfTwo) {
    let p = 1
    while (p < n) p *= 2
    return p
  }
  return Math.ceil(n / 4) * 4
}
