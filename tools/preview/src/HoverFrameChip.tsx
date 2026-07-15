import type { ReactElement } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'

export type HoverFrameChipProps = {
  /** Currently hovered rect, or null. Caller wires this from RectOverlay's onHoverChange. */
  rect: { id: string; name?: string; x: number; y: number; w: number; h: number } | null
  /** Frame index in the atlas (its position in the rects array). */
  index: number | null
}

// When the canvas is too narrow for the chip + InfoPanel to sit
// side-by-side, the chip lifts above InfoPanel. Offset = the chip's
// own bottom inset + InfoPanel height (~24px) + a comfortable gap
// (~6px). InfoPanel uses `bottom: space.lg` (8px), so the chip sits
// at 8 + 24 + 6 = ~38px from the bottom edge.
const STACK_OFFSET_PX = 38
// Threshold at which the two floating panels would otherwise overlap.
// Picked to comfortably fit the InfoPanel (~280px in float-rgba mode) plus
// a typical chip width.
const STACK_BREAKPOINT = '480px'
const NARROW = `@container (max-width: ${STACK_BREAKPOINT})`

const s = stylex.create({
  chip: {
    position: 'absolute',
    // Inset from the canvas edges so the chip floats as a card. When
    // narrow it stretches edge-to-edge between the matching insets and
    // lifts above the InfoPanel.
    left: space.lg,
    right: { default: 'auto', [NARROW]: space.lg },
    bottom: { default: space.lg, [NARROW]: STACK_OFFSET_PX },
    display: { default: 'inline-flex', [NARROW]: 'flex' },
    alignItems: 'center',
    gap: space.lg,
    paddingInline: space.md,
    paddingBlock: space.xs,
    backgroundColor: vscode.panelBg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.md,
    color: vscode.fg,
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    pointerEvents: 'none',
  },
  dim: {
    color: vscode.descriptionFg,
  },
})

/**
 * Floating chip pinned to the bottom-left of the canvas stage that shows
 * the hovered rect's full name, frame index, and image-pixel position.
 * Mirror of InfoPanel's position and visual style, but anchored left.
 *
 * Returns null when no rect is hovered so it takes up no space.
 */
export function HoverFrameChip({ rect, index }: HoverFrameChipProps): ReactElement | null {
  if (rect == null) return null

  const idxStr = index ?? '?'
  const namePart = rect.name != null ? rect.name : `#${idxStr}`
  const xy = `${rect.x},${rect.y}`
  const size = `${rect.w}×${rect.h}`

  return (
    <div {...stylex.props(s.chip)}>
      <span>{namePart}</span>
      <span {...stylex.props(s.dim)}>idx {idxStr}</span>
      <span {...stylex.props(s.dim)}>{xy}</span>
      <span {...stylex.props(s.dim)}>{size}</span>
    </div>
  )
}
