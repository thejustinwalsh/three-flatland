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

const s = stylex.create({
  chip: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.lg,
    paddingInline: space.md,
    paddingBlock: space.xs,
    backgroundColor: vscode.panelBg,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: vscode.panelBorder,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: vscode.panelBorder,
    borderTopRightRadius: radius.md,
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
