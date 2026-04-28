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
// side-by-side, the chip lifts above InfoPanel and both stretch full-width.
// Offset = InfoPanel height (~24px) + a comfortable gap (~6px).
const STACK_OFFSET_PX = 30
// Threshold at which the two floating panels would otherwise overlap.
// Picked to comfortably fit the InfoPanel (~280px in float-rgba mode) plus
// a typical chip width.
const STACK_BREAKPOINT = '480px'
const NARROW = `@container (max-width: ${STACK_BREAKPOINT})`

const s = stylex.create({
  chip: {
    position: 'absolute',
    left: 0,
    // When stacked, span full width (right: 0); when wide, sit at natural
    // width on the left (right: auto).
    right: { default: 'auto', [NARROW]: 0 },
    bottom: { default: 0, [NARROW]: STACK_OFFSET_PX },
    display: { default: 'inline-flex', [NARROW]: 'flex' },
    alignItems: 'center',
    gap: space.lg,
    paddingInline: space.md,
    paddingBlock: space.xs,
    backgroundColor: vscode.panelBg,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: vscode.panelBorder,
    // Right border + top-right radius only when chip is on the left side
    // (wide layout). Drops when stretched to full width.
    borderRightWidth: { default: 1, [NARROW]: 0 },
    borderRightStyle: 'solid',
    borderRightColor: vscode.panelBorder,
    borderTopRightRadius: { default: radius.md, [NARROW]: 0 },
    color: vscode.fg,
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    pointerEvents: 'none',
  },
})

/**
 * Floating chip pinned to the bottom-left of the canvas stage that shows
 * the hovered rect's full name and index. Mirror of InfoPanel's position
 * and visual style, but anchored to the left side.
 *
 * Returns null when no rect is hovered so it takes up no space.
 */
export function HoverFrameChip({ rect, index }: HoverFrameChipProps): ReactElement | null {
  if (rect == null) return null

  const label = rect.name != null ? `${rect.name} (index ${index ?? '?'})` : `#${index ?? '?'}`

  return (
    <div {...stylex.props(s.chip)}>
      {label}
    </div>
  )
}
