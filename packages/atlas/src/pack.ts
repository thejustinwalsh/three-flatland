/**
 * Shelf packing — sort by height, fill rows left-to-right, grow the
 * atlas by power-of-two until everything fits. Deliberately simple: at
 * sprite-sheet scales the difference vs maxrects is a few percent of
 * wasted area, and zero dependencies wins.
 */

export interface PackInput {
  name: string
  width: number
  height: number
}

export interface PackedRect extends PackInput {
  x: number
  y: number
}

export interface PackResult {
  width: number
  height: number
  rects: PackedRect[]
}

export function packRects(inputs: PackInput[], spacing = 2): PackResult {
  if (inputs.length === 0) return { width: 1, height: 1, rects: [] }

  const sorted = [...inputs].sort((a, b) => b.height - a.height || b.width - a.width)

  // Start from a square-ish estimate, grow by powers of two.
  let totalArea = 0
  let maxW = 0
  for (const r of sorted) {
    totalArea += (r.width + spacing) * (r.height + spacing)
    maxW = Math.max(maxW, r.width + spacing * 2)
  }
  let size = nextPow2(Math.max(maxW, Math.ceil(Math.sqrt(totalArea))))

  for (let attempts = 0; attempts < 12; attempts++) {
    const rects = tryPack(sorted, size, size, spacing)
    if (rects) {
      // Shrink height to the used extent (keep width pow2).
      let usedHeight = 0
      for (const r of rects) usedHeight = Math.max(usedHeight, r.y + r.height + spacing)
      return { width: size, height: nextPow2(usedHeight), rects }
    }
    size *= 2
  }
  throw new Error('flatland-atlas: packing failed — inputs exceed maximum atlas size')
}

function tryPack(
  sorted: PackInput[],
  width: number,
  height: number,
  spacing: number
): PackedRect[] | null {
  const rects: PackedRect[] = []
  let x = spacing
  let y = spacing
  let shelf = 0
  for (const input of sorted) {
    if (x + input.width + spacing > width) {
      x = spacing
      y += shelf + spacing
      shelf = 0
    }
    if (y + input.height + spacing > height) return null
    rects.push({ ...input, x, y })
    x += input.width + spacing
    shelf = Math.max(shelf, input.height)
  }
  return rects
}

function nextPow2(value: number): number {
  let result = 1
  while (result < value) result *= 2
  return result
}
