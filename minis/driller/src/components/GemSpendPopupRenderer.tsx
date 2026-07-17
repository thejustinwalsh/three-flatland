import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { GameState, GemSpendPopup } from '../traits'
import { GEM_SPEND_POPUP_TTL_TICKS, TILE_PX } from '../constants'
import {
  REGIONS as DIGIT_REGIONS,
  SHEET_H as DIGIT_SHEET_H,
  SHEET_W as DIGIT_SHEET_W,
} from '../generated/digits'
import {
  REGIONS as ICON_REGIONS,
  SHEET_H as ICON_SHEET_H,
  SHEET_W as ICON_SHEET_W,
} from '../generated/icons'
import { RENDER_LAYERS } from '../lib/render-layers'
import { rectToFrame } from '../lib/atlas-uv'

/**
 * Floating "-N + gem-icon" popup that pops up each time spendGems()
 * runs. Renders inside the Flatland scene so it pixel-snaps with the
 * tile/sprite layer.
 *
 * Animation across GEM_SPEND_POPUP_TTL_TICKS (~36 ticks ≈ 0.6 s):
 *
 *   t  | scale | y-offset (px) | alpha
 *   ----+-------+---------------+-------
 *   0.0 | 0.6   | 0             | 1.0
 *   0.22| 1.2   | -3            | 1.0  (overshoot pop)
 *   0.55| 1.0   | -8            | 1.0  (settle, still visible)
 *   1.0 | 0.9   | -14           | 0.0  (fade)
 *
 * Each popup draws minus(if 1+ digits), digits, then gem-icon — at
 * most ~4 visible sprites. Pool sized 64 covers 16 simultaneous
 * popups × 4 slots each.
 */

const POOL = 64
// 2x the source-pixel size so the popup is legible at the game's
// scale (tiles are 16px; a 6px digit was unreadably small).
const DIGIT_PX = 12
const ICON_PX = 16
const GAP_PX = 2

interface Props {
  iconsMaterial: Sprite2DMaterial
  digitsMaterial: Sprite2DMaterial
}

const DIGIT_FRAMES: Record<string, ReturnType<typeof rectToFrame>> = {}
for (const [k, v] of Object.entries(DIGIT_REGIONS)) {
  DIGIT_FRAMES[k] = rectToFrame(v, DIGIT_SHEET_W, DIGIT_SHEET_H)
}
const DEFAULT_DIGIT_FRAME = rectToFrame(DIGIT_REGIONS['0'], DIGIT_SHEET_W, DIGIT_SHEET_H)
const GEM_FRAME = rectToFrame(ICON_REGIONS.gem, ICON_SHEET_W, ICON_SHEET_H)

export function GemSpendPopupRenderer({ iconsMaterial, digitsMaterial }: Props) {
  const world = useWorld()
  const iconRefs = useRef<(Sprite2DType | null)[]>([])
  const digitRefs = useRef<(Sprite2DType | null)[]>([])

  useFrame(() => {
    const gs = world.get(GameState)
    let digitSlot = 0
    let iconSlot = 0
    if (gs) {
      world.query(GemSpendPopup).forEach((entity) => {
        const p = entity.get(GemSpendPopup)!
        const age = gs.tick - p.startTick
        if (age < 0 || age >= GEM_SPEND_POPUP_TTL_TICKS) return
        const t = age / GEM_SPEND_POPUP_TTL_TICKS

        // Animation curve.
        let scale: number
        let yOff: number
        let alpha: number
        if (t < 0.22) {
          const u = t / 0.22
          scale = 0.6 + 0.6 * u
          yOff = -3 * u
          alpha = 1
        } else if (t < 0.55) {
          const u = (t - 0.22) / (0.55 - 0.22)
          scale = 1.2 - 0.2 * u
          yOff = -3 - 5 * u
          alpha = 1
        } else {
          const u = (t - 0.55) / (1 - 0.55)
          scale = 1.0 - 0.1 * u
          yOff = -8 - 6 * u
          alpha = 1 - u
        }

        // Compose the string. e.g. amount=3 → "-3" (always show minus
        // because spendGems takes a positive amount that represents a
        // negative gem delta).
        const digits = `-${p.amount}`
        // Layout: digits left-to-right, then a gap, then gem icon. Center
        // the whole row horizontally on the cell.
        const charW = DIGIT_PX + GAP_PX
        const iconW = ICON_PX
        const totalW = digits.length * charW + GAP_PX + iconW
        const cellCenterX = p.col * TILE_PX + TILE_PX / 2
        const cellCenterY = -(p.row * TILE_PX + TILE_PX / 2) + yOff
        const leftX = cellCenterX - totalW / 2 + DIGIT_PX / 2

        for (let i = 0; i < digits.length; i++) {
          if (digitSlot >= POOL) break
          const ch = digits[i]!
          const key = ch === '-' ? 'minus' : ch
          const frame = DIGIT_FRAMES[key]
          if (!frame) continue
          const sprite = digitRefs.current[digitSlot++]
          if (!sprite) continue
          sprite.setFrame(frame)
          sprite.position.set(leftX + i * charW, cellCenterY, 0)
          sprite.scale.set(DIGIT_PX * scale, DIGIT_PX * scale, 1)
          sprite.alpha = alpha
        }
        // Gem icon after the digits.
        if (iconSlot < POOL) {
          const sprite = iconRefs.current[iconSlot++]
          if (sprite) {
            sprite.setFrame(GEM_FRAME)
            const iconX = leftX + digits.length * charW + GAP_PX + (ICON_PX - DIGIT_PX) / 2
            sprite.position.set(iconX, cellCenterY, 0)
            sprite.scale.set(ICON_PX * scale, ICON_PX * scale, 1)
            sprite.alpha = alpha
          }
        }
      })
    }
    // Hide unused slots.
    for (let i = digitSlot; i < POOL; i++) {
      const s = digitRefs.current[i]
      if (s) s.scale.set(0, 0, 1)
    }
    for (let i = iconSlot; i < POOL; i++) {
      const s = iconRefs.current[i]
      if (s) s.scale.set(0, 0, 1)
    }
  })

  return (
    <>
      {Array.from({ length: POOL }).map((_, i) => (
        <sprite2D
          key={`d${i}`}
          ref={(el) => {
            digitRefs.current[i] = el
          }}
          material={digitsMaterial}
          tint="#ffffff"
          position={[0, 0, 0]}
          scale={[0, 0, 1]}
          frame={DEFAULT_DIGIT_FRAME}
          sortLayer={RENDER_LAYERS.ui}
          lit={false}
        />
      ))}
      {Array.from({ length: POOL }).map((_, i) => (
        <sprite2D
          key={`i${i}`}
          ref={(el) => {
            iconRefs.current[i] = el
          }}
          material={iconsMaterial}
          tint="#ffffff"
          position={[0, 0, 0]}
          scale={[0, 0, 1]}
          frame={GEM_FRAME}
          sortLayer={RENDER_LAYERS.ui}
          lit={false}
        />
      ))}
    </>
  )
}
