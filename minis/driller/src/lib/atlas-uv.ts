import type { Rect } from '../atlas-regions'
import type { SpriteFrame } from 'three-flatland/react'

/** Convert a top-left-origin pixel rect into a `Sprite2D` frame. */
export function rectToFrame(
  rect: Rect,
  sheetWidth: number,
  sheetHeight: number,
  name = ''
): SpriteFrame {
  return {
    name,
    x: rect.x / sheetWidth,
    y: (sheetHeight - rect.y - rect.h) / sheetHeight,
    width: rect.w / sheetWidth,
    height: rect.h / sheetHeight,
    sourceWidth: rect.w,
    sourceHeight: rect.h,
  }
}
