import type { SpriteFrame } from 'three-flatland/react'

export type ActionIconName = 'add-support' | 'boost-drill' | 'shield' | 'drop-rocks' | 'chaos-quake'

const NAMES: readonly ActionIconName[] = [
  'add-support',
  'boost-drill',
  'shield',
  'drop-rocks',
  'chaos-quake',
]
const TILE_SIZE = 16
const PADDING = 2
const SLOT_SIZE = TILE_SIZE + PADDING * 2
const ATLAS_WIDTH = NAMES.length * SLOT_SIZE
const ATLAS_HEIGHT = SLOT_SIZE

const FRAMES = Object.fromEntries(
  NAMES.map((name, column) => [
    name,
    {
      name: `action-${name}`,
      x: (column * SLOT_SIZE + PADDING) / ATLAS_WIDTH,
      y: PADDING / ATLAS_HEIGHT,
      width: TILE_SIZE / ATLAS_WIDTH,
      height: TILE_SIZE / ATLAS_HEIGHT,
      sourceWidth: TILE_SIZE,
      sourceHeight: TILE_SIZE,
    } satisfies SpriteFrame,
  ])
) as Record<ActionIconName, SpriteFrame>

export function actionIconFrame(name: ActionIconName): SpriteFrame {
  return FRAMES[name]
}
