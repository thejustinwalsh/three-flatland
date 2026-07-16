import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { Drag, GameState, Gem, Pointer } from '../traits'
import { DRAG_COST_INTERVAL_TICKS, GEM_FADE_TICKS, TILE_PX } from '../constants'
import {
  REGIONS as ICON_REGIONS,
  SHEET_H as ICON_SHEET_H,
  SHEET_W as ICON_SHEET_W,
} from '../generated/icons'
import { RENDER_LAYERS } from '../lib/render-layers'
import { rectToFrame } from '../lib/atlas-uv'

/**
 * Action info-popup — a small icon + status bar rendered next to the
 * currently-active interaction. Visibility (and the bar metric) per
 * the spec in `planning/issues/53/in-canvas-feedback-spec.md` §1:
 *
 *   drag    — held; bar = progress within the current cost interval
 *   pet     — while pausedUntilTick has not yet elapsed; mood icon
 *             picked from the Mood trait; bar = pause remaining
 *   paint   — held; bar = gem budget runway (gems / 20)
 *   gem-fade— hovering an armed gem; bar = time until expire
 *
 * Only one info-popup at a time (the highest-priority active source).
 * Three sprites: icon + bar track + bar fill. Positioned one cell
 * above the anchor cell so it doesn't cover the action target.
 */

// Scaled up — original sizing was below the legibility floor at the
// game's 16px tile size.
const ICON_PX = 14
const BAR_W = 24
const BAR_H = 4
const SLOT_GAP = 2

interface Props {
  iconsMaterial: Sprite2DMaterial
  /** Reused white-pixel material (`useDrillerMaterial`) for the bar. */
  barMaterial: Sprite2DMaterial
}

const ICON_FRAMES = {
  drag: rectToFrame(ICON_REGIONS.drag, ICON_SHEET_W, ICON_SHEET_H),
  paint: rectToFrame(ICON_REGIONS.paint, ICON_SHEET_W, ICON_SHEET_H),
  timer: rectToFrame(ICON_REGIONS.timer, ICON_SHEET_W, ICON_SHEET_H),
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]
}

interface PopupInfo {
  col: number
  row: number
  iconName: keyof typeof ICON_FRAMES
  fill: number // 0..1
  fillHex: string
}

export function InfoPopupRenderer({ iconsMaterial, barMaterial }: Props) {
  const world = useWorld()
  const iconRef = useRef<Sprite2DType>(null)
  const barBgRef = useRef<Sprite2DType>(null)
  const barFillRef = useRef<Sprite2DType>(null)

  useFrame(() => {
    const ptr = world.get(Pointer)
    const gs = world.get(GameState)
    const info = ptr && gs ? pickInfo(world, ptr, gs) : null
    const icon = iconRef.current
    const barBg = barBgRef.current
    const barFill = barFillRef.current
    if (!info || !icon || !barBg || !barFill) {
      if (icon) icon.scale.set(0, 0, 1)
      if (barBg) barBg.scale.set(0, 0, 1)
      if (barFill) barFill.scale.set(0, 0, 1)
      return
    }
    // Anchor cell center.
    const ax = info.col * TILE_PX + TILE_PX / 2
    // One cell ABOVE the anchor cell, in world Y (-row).
    const ay = -((info.row - 1) * TILE_PX + TILE_PX / 2)

    // Icon to the left, bar to the right.
    const totalW = ICON_PX + SLOT_GAP + BAR_W
    const leftX = ax - totalW / 2
    icon.setFrame(ICON_FRAMES[info.iconName])
    icon.position.set(leftX + ICON_PX / 2, ay, 0)
    icon.scale.set(ICON_PX, ICON_PX, 1)
    icon.alpha = 1

    const barLeft = leftX + ICON_PX + SLOT_GAP
    // Track (dark) — full-width semi-transparent background.
    barBg.position.set(barLeft + BAR_W / 2, ay, 0)
    barBg.scale.set(BAR_W, BAR_H, 1)
    barBg.alpha = 0.5
    const [tr, tg, tb] = hexToRgb('#1f2937')
    barBg.tint.r = tr
    barBg.tint.g = tg
    barBg.tint.b = tb

    // Fill — anchored to LEFT edge, width = fill * BAR_W. We scale a
    // sprite (whose center is at the position) and offset half-width
    // to keep the left edge fixed.
    const fillW = Math.max(0, Math.min(1, info.fill)) * BAR_W
    barFill.position.set(barLeft + fillW / 2, ay, 0)
    barFill.scale.set(fillW, BAR_H, 1)
    barFill.alpha = 1
    const [r, g, b] = hexToRgb(info.fillHex)
    barFill.tint.r = r
    barFill.tint.g = g
    barFill.tint.b = b
  })

  return (
    <>
      <sprite2D
        ref={iconRef}
        material={iconsMaterial}
        tint="#ffffff"
        position={[0, 0, 0]}
        scale={[0, 0, 1]}
        frame={ICON_FRAMES.drag}
        sortLayer={RENDER_LAYERS.ui}
        lit={false}
      />
      <sprite2D
        ref={barBgRef}
        material={barMaterial}
        tint="#1f2937"
        position={[0, 0, 0]}
        scale={[0, 0, 1]}
        sortLayer={RENDER_LAYERS.uiBackground}
        lit={false}
      />
      <sprite2D
        ref={barFillRef}
        material={barMaterial}
        tint="#86efac"
        position={[0, 0, 0]}
        scale={[0, 0, 1]}
        sortLayer={RENDER_LAYERS.ui}
        zIndex={1}
        lit={false}
      />
    </>
  )
}

function pickInfo(
  world: ReturnType<typeof useWorld>,
  ptr: ReturnType<typeof world.get<typeof Pointer>>,
  gs: { tick: number; gems: number }
): PopupInfo | null {
  // 1. Active drag — bar = how soon the next interval bills.
  const drag = world.get(Drag)
  if (drag && drag.clusterId !== 0) {
    const elapsed = gs.tick - drag.startTick
    const intoInterval = elapsed % DRAG_COST_INTERVAL_TICKS
    return {
      col: drag.anchorCol,
      row: drag.anchorRow,
      iconName: 'drag',
      fill: intoInterval / DRAG_COST_INTERVAL_TICKS,
      fillHex: '#ef4444',
    }
  }
  // 2. Held paint — bar = gem runway at current burn rate.
  //    (Pet feedback is handled by MoodBubbleRenderer, not here.)
  if (ptr && ptr.active && ptr.lockedAction === 'paint') {
    return {
      col: ptr.hoverTargetCol,
      row: ptr.hoverTargetRow,
      iconName: 'paint',
      fill: Math.min(1, gs.gems / 20),
      fillHex: gs.gems > 5 ? '#86efac' : '#fca5a5',
    }
  }
  // 3. Hovering an armed gem — bar = time until expire (drains).
  if (ptr && ptr.hoverAction === 'collect') {
    const armed = world.query(Gem).find((entity) => {
      const g = entity.get(Gem)
      if (!g || g.collected || g.expireAtTick === 0) return false
      const left = g.expireAtTick - gs.tick
      if (left <= 0) return false
      const dc = Math.abs(g.col - ptr.hoverTargetCol)
      const dr = Math.abs(g.row - ptr.hoverTargetRow)
      return Math.max(dc, dr) <= 1
    })
    if (armed) {
      const gem = armed.get(Gem)
      if (!gem) return null
      const ticksLeft = gem.expireAtTick - gs.tick
      return {
        col: gem.col,
        row: gem.row,
        iconName: 'timer',
        fill: ticksLeft / GEM_FADE_TICKS,
        fillHex: ticksLeft / GEM_FADE_TICKS > 0.3 ? '#fcd34d' : '#fca5a5',
      }
    }
  }
  return null
}
