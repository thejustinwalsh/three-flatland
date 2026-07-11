import { describe, expect, it } from 'vitest'
import { EPSILON, LAYOUT_GRID, ceilQuantize, nearEqual, quantize } from '../quantize.js'

//the drift fix rests entirely on this grid math. these tests pin the three properties it
//depends on, and encode the two failure modes Codex found (a nearEqual relayout gate, and a
//1/128-snapped center) so a future edit that reintroduces either fails here first.
describe('quantize grid math', () => {
  it('LAYOUT_GRID is a power of two, so 1/grid round-trips exactly (the property 1/100 lacked)', () => {
    expect(Number.isInteger(Math.log2(LAYOUT_GRID))).toBe(true)
    for (let k = -4096; k <= 4096; k++) {
      const onGrid = k / LAYOUT_GRID
      //exact and idempotent: a grid-aligned value survives the snap byte-for-byte
      expect(quantize(onGrid)).toBe(onGrid)
      expect(quantize(quantize(onGrid))).toBe(quantize(onGrid))
    }
  })

  it('ceilQuantize is never-clip: it rounds a size UP onto the grid, never down', () => {
    for (let i = 0; i < 5000; i++) {
      const x = i * 0.00037 //irregular off-grid sweep
      expect(ceilQuantize(x)).toBeGreaterThanOrEqual(x)
      expect(ceilQuantize(x) - x).toBeLessThan(EPSILON) //but by less than one cell
    }
    //grid-aligned sizes are left exactly alone (no spurious +1 cell)
    for (let k = 0; k <= 1000; k++) {
      expect(ceilQuantize(k / LAYOUT_GRID)).toBe(k / LAYOUT_GRID)
    }
  })

  //FINDING 1: the relayout gate must ask "will Yoga commit a different size?", a step function
  //of the SNAPPED size - not "did the raw float move?". Two raw sizes < one cell apart can
  //straddle a cell boundary and change the committed layout. nearEqual (distance) would skip
  //that relayout; ceilQuantize (cell) catches it. This is the exact bug in a nearEqual gate.
  it('the ceilQuantize gate catches a sub-cell change that crosses a cell boundary; nearEqual misses it', () => {
    const a = 1 - 0.01 / LAYOUT_GRID //just below the cell boundary at 1.0
    const b = 1 + 0.01 / LAYOUT_GRID //just above it
    expect(Math.abs(a - b)).toBeLessThan(EPSILON) //raw delta is under one cell...
    expect(nearEqual(a, b)).toBe(true) //...so a nearEqual gate would WRONGLY skip the relayout
    expect(ceilQuantize(a)).not.toBe(ceilQuantize(b)) //the cell-compare gate correctly relayouts
  })

  //FINDING 3: a centered box's center is x0.5 of grid-snapped edges, so it lands on the 1/256
  //grid. Snapping it to 1/128 nudges it up to half a cell off Yoga's true center; snapping to
  //2x resolution keeps it exact and byte-stable.
  it('the center snaps onto the 1/256 half-grid exactly, where a 1/128 snap would offset it', () => {
    for (let k = -2000; k <= 2000; k++) {
      const halfCell = k / (LAYOUT_GRID * 2) //an exact 1/256 value (a valid center)
      expect(quantize(halfCell, LAYOUT_GRID * 2)).toBe(halfCell) //exact on the half-grid
    }
    //a value sitting on an odd 1/256 tick is genuinely moved by the coarse snap - proving the
    //finer grid is load-bearing, not cosmetic
    const oddHalfCell = 3 / (LAYOUT_GRID * 2)
    expect(quantize(oddHalfCell, LAYOUT_GRID * 2)).toBe(oddHalfCell)
    expect(quantize(oddHalfCell)).not.toBe(oddHalfCell)
    expect(Math.abs(quantize(oddHalfCell) - oddHalfCell)).toBe(1 / (LAYOUT_GRID * 2))
  })

  it('nearEqual is distance-based and translation-invariant (no cell-boundary discontinuity)', () => {
    expect(nearEqual(5, 5 + EPSILON / 2)).toBe(true)
    expect(nearEqual(5, 5 + EPSILON * 2)).toBe(false)
    //same delta, shifted by an arbitrary offset -> same verdict (a quantize-compare would not)
    expect(nearEqual(1000.4999, 1000.4999 + EPSILON / 2)).toBe(true)
  })
})
