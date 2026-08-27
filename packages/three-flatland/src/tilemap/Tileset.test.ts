import { describe, expect, it } from 'vitest'
import { Tileset } from './Tileset'
import type { TileAnimationFrame, TilesetData } from './types'

function dataWithAnimation(animation: TileAnimationFrame[]): TilesetData {
  return {
    name: 'animated',
    firstGid: 1,
    tileWidth: 16,
    tileHeight: 16,
    imageWidth: 64,
    imageHeight: 64,
    columns: 4,
    tileCount: 16,
    tiles: new Map([
      [
        0,
        {
          id: 0,
          uv: { x: 0, y: 0, width: 0.25, height: 0.25 },
          animation,
        },
      ],
    ]),
  }
}

describe('Tileset animation validation', () => {
  it('requires at least one frame', () => {
    expect(() => new Tileset(dataWithAnimation([]))).toThrow(
      'Tileset animated tile 0 animation must contain at least one frame'
    )
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'requires finite positive frame durations (%s)',
    (duration) => {
      expect(() => new Tileset(dataWithAnimation([{ tileId: 0, duration }]))).toThrow(
        'Tileset animated tile 0 animation frame 0 duration must be a finite positive number'
      )
    }
  )

  it('accepts variable finite positive durations', () => {
    const tileset = new Tileset(
      dataWithAnimation([
        { tileId: 0, duration: 10 },
        { tileId: 1, duration: 20 },
      ])
    )
    expect(tileset.getAnimation(1)).toEqual([
      { tileId: 0, duration: 10 },
      { tileId: 1, duration: 20 },
    ])
  })

  it('rejects an overflowing total cycle duration', () => {
    expect(
      () =>
        new Tileset(
          dataWithAnimation([
            { tileId: 0, duration: Number.MAX_VALUE },
            { tileId: 1, duration: Number.MAX_VALUE },
          ])
        )
    ).toThrow('Tileset animated tile 0 animation total duration must be finite')
  })
})
