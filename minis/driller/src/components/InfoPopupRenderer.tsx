import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import {
  Drag,
  Driller,
  GameState,
  Gem,
  PetEvents,
  Pointer,
} from '../traits'
import {
  DRAG_COST_INTERVAL_TICKS,
  GEM_FADE_TICKS,
  OVER_PET_THRESHOLD,
  OVER_PET_WINDOW_TICKS,
  PET_PAUSE_TICKS,
  TILE_PX,
} from '../constants'
import {
  REGIONS as ICON_REGIONS,
  SHEET_H as ICON_SHEET_H,
  SHEET_W as ICON_SHEET_W,
  type IconName,
} from '../generated/icons'

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

const ICON_PX = 8
const BAR_W = 16
const BAR_H = 3
const SLOT_GAP = 1

interface Props {
  iconsMaterial: Sprite2DMaterial
  /** Reused white-pixel material (`useDrillerMaterial`) for the bar. */
  barMaterial: Sprite2DMaterial
}

function frameOf(region: { x: number; y: number; w: number; h: number }) {
  return {
    name: '',
    x: region.x / ICON_SHEET_W,
    y: region.y / ICON_SHEET_H,
    width: region.w / ICON_SHEET_W,
    height: region.h / ICON_SHEET_H,
    sourceWidth: region.w,
    sourceHeight: region.h,
  }
}
const ICON_FRAMES: Record<IconName, ReturnType<typeof frameOf>> = {} as Record<
  IconName,
  ReturnType<typeof frameOf>
>
for (const k of Object.keys(ICON_REGIONS) as IconName[]) ICON_FRAMES[k] = frameOf(ICON_REGIONS[k])

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
  iconName: IconName
  fill: number // 0..1
  fillHex: string
}

export function InfoPopupRenderer({ iconsMaterial, barMaterial }: Props) {
  const world = useWorld()
  const iconRef = useRef<Sprite2DType>(null)
  const barBgRef = useRef<Sprite2DType>(null)
  const barFillRef = useRef<Sprite2DType>(null)

  useEffect(() => {
    for (const s of [iconRef.current, barBgRef.current, barFillRef.current]) {
      if (s) s.scale.set(0, 0, 1)
    }
  }, [])

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
        position={[-9999, -9999, 0]}
        scale={[0, 0, 1]}
        renderOrder={250}
      />
      <sprite2D
        ref={barBgRef}
        material={barMaterial}
        tint="#1f2937"
        position={[-9999, -9999, 0]}
        scale={[0, 0, 1]}
        renderOrder={250}
      />
      <sprite2D
        ref={barFillRef}
        material={barMaterial}
        tint="#86efac"
        position={[-9999, -9999, 0]}
        scale={[0, 0, 1]}
        renderOrder={251}
      />
    </>
  )
}

function pickInfo(
  world: ReturnType<typeof useWorld>,
  ptr: ReturnType<typeof world.get<typeof Pointer>>,
  gs: { tick: number; gems: number },
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
  // 2. Pet pause — bar = pause remaining; icon escalates with pet
  //    count in the current window so the player gets explicit
  //    feedback about how close they are to over-petting:
  //      1 pet  → love     (positive reinforcement — first touch)
  //      2 pets → happy    (still good, second touch)
  //      3 pets → warning  (one more pet would over-pet — back off)
  //      4+ pets → handled by OverPetRenderer (angry shake)
  const drillerEntity = world.queryFirst(Driller)
  const d = drillerEntity?.get(Driller)
  if (d && gs.tick < d.pausedUntilTick) {
    const remaining = d.pausedUntilTick - gs.tick
    const pe = drillerEntity?.get(PetEvents)
    const inWindow = pe
      ? pe.recentTicks.filter((t) => gs.tick - t <= OVER_PET_WINDOW_TICKS).length
      : 0
    let iconName: IconName = 'pet.happy'
    let fillHex = '#f472b6'
    if (inWindow >= OVER_PET_THRESHOLD) {
      // 3rd pet — one more would over-pet.
      iconName = 'pet.warning'
      fillHex = '#fbbf24' // amber
    } else if (inWindow === 1) {
      iconName = 'pet.love'
    } else {
      iconName = 'pet.happy'
    }
    return {
      col: d.col,
      row: d.row,
      iconName,
      fill: remaining / PET_PAUSE_TICKS,
      fillHex,
    }
  }
  // 3. Held paint — bar = gem runway at current burn rate.
  if (ptr && ptr.active && ptr.lockedAction === 'paint') {
    return {
      col: ptr.hoverTargetCol,
      row: ptr.hoverTargetRow,
      iconName: 'paint',
      fill: Math.min(1, gs.gems / 20),
      fillHex: gs.gems > 5 ? '#86efac' : '#fca5a5',
    }
  }
  // 4. Hovering an armed gem — bar = time until expire (drains).
  if (ptr && ptr.hoverAction === 'collect') {
    let armed: { col: number; row: number; ticksLeft: number } | null = null
    world.query(Gem).forEach((entity) => {
      if (armed) return
      const g = entity.get(Gem)
      if (!g || g.collected) return
      if (g.expireAtTick === 0) return
      const left = g.expireAtTick - gs.tick
      if (left <= 0) return
      // Match either exact-cell or halo within Chebyshev 1.
      const dc = Math.abs(g.col - ptr.hoverTargetCol)
      const dr = Math.abs(g.row - ptr.hoverTargetRow)
      if (Math.max(dc, dr) > 1) return
      armed = { col: g.col, row: g.row, ticksLeft: left }
    })
    if (armed) {
      const a = armed as { col: number; row: number; ticksLeft: number }
      return {
        col: a.col,
        row: a.row,
        iconName: 'timer',
        fill: a.ticksLeft / GEM_FADE_TICKS,
        fillHex: a.ticksLeft / GEM_FADE_TICKS > 0.3 ? '#fcd34d' : '#fca5a5',
      }
    }
  }
  return null
}
