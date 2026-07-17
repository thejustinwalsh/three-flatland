import { describe, expect, it } from 'vitest'
import { gridLayoutFor } from './grid-layout'

describe('gridLayoutFor', () => {
  it('handles the empty/zero case', () => {
    expect(gridLayoutFor(0)).toEqual({ cols: 1, rows: 1, visibleCount: 0, overflowCount: 0 })
  })

  it('1 buffer → full single cell', () => {
    expect(gridLayoutFor(1)).toEqual({ cols: 1, rows: 1, visibleCount: 1, overflowCount: 0 })
  })

  it('2 buffers → split', () => {
    expect(gridLayoutFor(2)).toEqual({ cols: 2, rows: 1, visibleCount: 2, overflowCount: 0 })
  })

  it('3-4 buffers → 2x2', () => {
    expect(gridLayoutFor(3)).toEqual({ cols: 2, rows: 2, visibleCount: 3, overflowCount: 0 })
    expect(gridLayoutFor(4)).toEqual({ cols: 2, rows: 2, visibleCount: 4, overflowCount: 0 })
  })

  it('5-6 buffers → 3x2', () => {
    expect(gridLayoutFor(5)).toEqual({ cols: 3, rows: 2, visibleCount: 5, overflowCount: 0 })
    expect(gridLayoutFor(6)).toEqual({ cols: 3, rows: 2, visibleCount: 6, overflowCount: 0 })
  })

  it('7-9 buffers → 3x3', () => {
    expect(gridLayoutFor(7)).toEqual({ cols: 3, rows: 3, visibleCount: 7, overflowCount: 0 })
    expect(gridLayoutFor(9)).toEqual({ cols: 3, rows: 3, visibleCount: 9, overflowCount: 0 })
  })

  it('>9 buffers caps at 3x3 and reports the overflow count', () => {
    expect(gridLayoutFor(10)).toEqual({ cols: 3, rows: 3, visibleCount: 9, overflowCount: 1 })
    expect(gridLayoutFor(15)).toEqual({ cols: 3, rows: 3, visibleCount: 9, overflowCount: 6 })
  })

  it('never returns a negative count for negative input', () => {
    expect(gridLayoutFor(-3)).toEqual({ cols: 1, rows: 1, visibleCount: 0, overflowCount: 0 })
  })
})
