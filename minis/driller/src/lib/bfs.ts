/**
 * Bounded BFS that returns the next-step cell toward the nearest goal.
 *
 * Used by the seeker planner (find nearest gem) and cautious planner
 * (find nearest STONE/FIXTURE adjacency). The work is bounded by
 * `maxRadius² × 4` cells; for `maxRadius=6` that's at most 144 cell
 * visits, comfortably under per-tick budgets.
 *
 * `isPassable(col, row, fromCol, fromRow)` — receives the ORIGIN cell
 * so the caller can implement direction-aware constraints (e.g.,
 * "upward moves only allowed if destination is already AIR" for the
 * gravity-based driller). Origin args are -1, -1 only for the seed.
 */
export function bfsNextStep(
  startCol: number,
  startRow: number,
  cols: number,
  rows: number,
  isGoal: (col: number, row: number) => boolean,
  isPassable: (col: number, row: number, fromCol: number, fromRow: number) => boolean,
  maxRadius: number,
): [number, number] | null {
  const startKey = startRow * cols + startCol
  const visited = new Set<number>([startKey])
  const parents = new Map<number, number>()
  const queue: [number, number][] = [[startCol, startRow]]
  let foundKey: number | null = null
  let visits = 0
  const cap = (maxRadius * 2 + 1) * (maxRadius * 2 + 1)

  while (queue.length && visits < cap) {
    const [c, r] = queue.shift()!
    visits++
    if (!(c === startCol && r === startRow) && isGoal(c, r)) {
      foundKey = r * cols + c
      break
    }
    for (const [dc, dr] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      if (Math.abs(nc - startCol) + Math.abs(nr - startRow) > maxRadius * 2) continue
      const key = nr * cols + nc
      if (visited.has(key) || !isPassable(nc, nr, c, r)) continue
      visited.add(key)
      parents.set(key, r * cols + c)
      queue.push([nc, nr])
    }
  }

  if (foundKey === null) return null

  // Walk parent chain back until the parent IS the start; that's the next step.
  let cur = foundKey
  while (parents.get(cur) !== startKey) {
    const p = parents.get(cur)
    if (p === undefined) return null
    cur = p
  }
  return [cur % cols, Math.floor(cur / cols)]
}
