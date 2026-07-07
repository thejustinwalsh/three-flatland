/**
 * Multi-buffer grid ladder for the freeze viewer (#29 Phase C item 12).
 *
 * Picks the smallest layout off the fixed ladder issue #29 specifies —
 * `1 = full, 2 = split, 4 = 2x2, 6 = 3x2, 9 = 3x3 (Brady Bunch)` — that
 * fits the marked-buffer count, so a viewer with 3 buffers gets the
 * same 2x2 layout as one with 4 (one cell just sits empty) rather than
 * a bespoke 3-cell shape. `cols`/`rows` follow the ladder's own
 * "width x height" notation.
 *
 * Overflow policy for more than 9 marked buffers: the grid caps at
 * 3x3. `visibleCount` is always `min(count, 9)`; the caller renders
 * cells for the first `visibleCount` buffers (by mark order — the
 * order `getMarkedBufferNames()` returns) and shows `overflowCount`
 * as a "+N more" indicator rather than growing the grid further or
 * shrinking cells past readability. Streaming/decoding is only ever
 * driven for the visible cells, which also keeps concurrent decoder
 * count bounded independent of the mark-count guardrail.
 */
export interface GridLayout {
  /** Grid columns. */
  cols: number
  /** Grid rows. */
  rows: number
  /** How many marked buffers get a cell this pass (`<= cols * rows`, capped at 9). */
  visibleCount: number
  /** Marked buffers beyond `visibleCount` that don't get a cell — see overflow policy above. */
  overflowCount: number
}

const MAX_VISIBLE = 9

export function gridLayoutFor(count: number): GridLayout {
  const n = Math.max(0, count)
  if (n <= 1) return { cols: 1, rows: 1, visibleCount: n, overflowCount: 0 }
  if (n === 2) return { cols: 2, rows: 1, visibleCount: 2, overflowCount: 0 }
  if (n <= 4) return { cols: 2, rows: 2, visibleCount: n, overflowCount: 0 }
  if (n <= 6) return { cols: 3, rows: 2, visibleCount: n, overflowCount: 0 }
  if (n <= MAX_VISIBLE) return { cols: 3, rows: 3, visibleCount: n, overflowCount: 0 }
  return { cols: 3, rows: 3, visibleCount: MAX_VISIBLE, overflowCount: n - MAX_VISIBLE }
}
