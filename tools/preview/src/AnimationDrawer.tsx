import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'

export type AnimationDrawerDensity = 'detail' | 'dots' | 'collapsed'

const DENSITY_DETAIL_MIN_PX = 80
const DENSITY_DOTS_MIN_PX = 24
const DRAWER_MIN_PX = 24
const DRAWER_MAX_PX = 400

/** Pure helper — chosen by the resize handler and reflected to body. */
export function densityForHeight(heightPx: number): AnimationDrawerDensity {
  if (heightPx < DENSITY_DOTS_MIN_PX) return 'collapsed'
  if (heightPx < DENSITY_DETAIL_MIN_PX) return 'dots'
  return 'detail'
}

const s = stylex.create({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    backgroundColor: vscode.panelBg,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: vscode.panelBorder,
  },
  resizeHandle: {
    height: 4,
    cursor: 'ns-resize',
    backgroundColor: { default: 'transparent', ':hover': vscode.focusRing },
    flexShrink: 0,
  },
  resizeHandleDragging: {
    backgroundColor: vscode.focusRing,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    paddingInline: space.md,
    paddingBlock: space.sm,
  },
})

export type AnimationDrawerProps = {
  /** Drawer expanded? Comes from prefs.animDrawerExpanded. */
  expanded: boolean
  /** Drawer body height in px when expanded. Comes from prefs.animDrawerHeight. */
  height: number
  /** Header content; always rendered (even when collapsed). */
  header: ReactNode
  /** Body content; rendered only when expanded. Receives current density. */
  body: (density: AnimationDrawerDensity) => ReactNode
  /** Caller persists the new height. */
  onHeightChange(nextHeight: number): void
}

/**
 * Collapsible drawer panel. Top-edge splitter resizes the body; chevron
 * inside the header (caller-provided) toggles `expanded`. Body density
 * derives from the current height — caller decides what to render.
 */
export function AnimationDrawer({ expanded, height, header, body, onHeightChange }: AnimationDrawerProps) {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startHeight: height }
    setIsDragging(true)
  }, [height])
  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    // Drawer grows as the splitter moves UP, so we subtract dy.
    const dy = e.clientY - dragRef.current.startY
    const next = Math.max(DRAWER_MIN_PX, Math.min(DRAWER_MAX_PX, dragRef.current.startHeight - dy))
    onHeightChange(next)
  }, [onHeightChange])
  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
    setIsDragging(false)
  }, [])

  const density = expanded ? densityForHeight(height) : 'collapsed'

  return (
    <div {...stylex.props(s.shell)}>
      <div
        {...stylex.props(s.resizeHandle, isDragging && s.resizeHandleDragging)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden="true"
      />
      {header}
      {expanded ? (
        <div {...stylex.props(s.body)} style={{ height }}>
          {body(density)}
        </div>
      ) : null}
    </div>
  )
}
