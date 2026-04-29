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
    flexShrink: 0,
  },
  // Static 1px panel-border line — always rendered, even when the
  // drawer is collapsed, so the canvas and header always have a clean
  // visual separator. 5px tall hit area gives a draggable target when
  // the drawer is expanded. Inset box-shadow draws the visible line so
  // the thickness change on hover/drag doesn't shift surrounding
  // layout.
  resizeHandle: {
    height: 5,
    backgroundColor: 'transparent',
    flexShrink: 0,
    boxShadow: `inset 0 -1px 0 0 ${vscode.panelBorder}`,
  },
  // Layered on top of `resizeHandle` when the drawer is expanded:
  // turns the handle into a real ns-resize affordance with a hover /
  // active-drag thickened bar in the focus-ring tint.
  resizeHandleActive: {
    cursor: 'ns-resize',
    boxShadow: {
      default: `inset 0 -1px 0 0 ${vscode.panelBorder}`,
      ':hover': `inset 0 -2px 0 0 ${vscode.focusRing}`,
    },
  },
  resizeHandleDragging: {
    boxShadow: `inset 0 -2px 0 0 ${vscode.focusRing}`,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: vscode.bg,
    paddingInline: space.lg,
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
 * Collapsible drawer panel — peer of the canvas inside the Atlas pane.
 * Header looks like a VSCode panel-area title bar (caller provides a
 * full-width row, e.g. AnimationDrawerHeader). Top-edge splitter resizes
 * the body. Body density derives from current height — caller decides
 * what to render at each density.
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
      {/* Always-rendered: provides the static 1px header-border line
          between the canvas and the drawer header. When expanded we
          layer the active-drag styles + pointer handlers on top so the
          line becomes a real resize gesture; collapsed it's purely
          visual. */}
      <div
        {...stylex.props(
          s.resizeHandle,
          expanded && s.resizeHandleActive,
          expanded && isDragging && s.resizeHandleDragging,
        )}
        onPointerDown={expanded ? onPointerDown : undefined}
        onPointerMove={expanded ? onPointerMove : undefined}
        onPointerUp={expanded ? onPointerUp : undefined}
        onPointerCancel={expanded ? onPointerUp : undefined}
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
