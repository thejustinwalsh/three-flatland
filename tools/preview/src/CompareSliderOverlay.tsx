import { useRef } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useCompareController } from './CompareContext'

const styles = stylex.create({
  // Container fills the canvas area but is pointer-transparent — pan,
  // zoom, and other CanvasStage interactions need to reach the layers
  // below. Only the line + handle (children) opt back in to pointer
  // events, so dragging the slider requires explicitly grabbing one of
  // them. (Click-anywhere-to-seek would conflict with pan/zoom + cause
  // slider jumps on every click; if we want it back, gate it on a
  // modifier key.)
  hitArea: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  // Wider invisible drag affordance on top of the visible 2px line so
  // the user doesn't have to pixel-aim. ~12px feels right; cursor ew-resize
  // signals "draggable" when hovering near the line.
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 12,
    background: 'transparent',
    cursor: 'ew-resize',
    pointerEvents: 'auto',
    transform: 'translateX(-50%)',
    // Inner visible 2px line, drawn via box-shadow so it stays centered
    // within the wider hit affordance without changing layout.
    boxShadow: 'inset 5px 0 0 rgba(255, 255, 255, 0.85), inset 6px 0 0 rgba(0, 0, 0, 0.5), inset 7px 0 0 rgba(255, 255, 255, 0.85)',
  },
  handle: {
    position: 'absolute',
    top: '50%',
    width: 32,
    height: 32,
    marginTop: -16,
    marginLeft: -16,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.95)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
    cursor: 'ew-resize',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(0, 0, 0, 0.65)',
    fontSize: 16,
    fontWeight: 'bold',
    userSelect: 'none',
    // Subtle ring on hover/active — keep it minimal
    ':hover': {
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
    },
  },
})

export type CompareSliderOverlayProps = {
  /**
   * Optional className for the outer container — e.g., to constrain
   * the slider to a sub-region of the canvas. Defaults to filling the
   * parent (matches CanvasStage's overlay convention).
   */
  className?: string
  /**
   * Optional handle glyph. Defaults to a double-arrow chevron via the
   * ‖ (DOUBLE VERTICAL LINE) Unicode char which reads as "drag
   * to compare." Override with an icon component if desired.
   */
  handleContent?: React.ReactNode
}

/**
 * HTML overlay slider for CanvasStage's compare mode.
 *
 * Mounts as a child of <CanvasStage compareImageSource={...}>. Reads
 * splitU from CompareContext, draws a vertical line + draggable handle
 * at the corresponding screen-space X (pan/zoom does NOT move the
 * slider — it's a screen-space control), writes splitU back on drag.
 *
 * No-ops when used outside compare mode (useCompareController returns
 * null) — safe to mount unconditionally.
 */
export function CompareSliderOverlay({ className, handleContent = '‖' }: CompareSliderOverlayProps) {
  const controller = useCompareController()
  const containerRef = useRef<HTMLDivElement>(null)

  // No-op outside compare mode
  if (!controller) return null

  const { splitU, setSplitU } = controller

  // Drag handler: tracks pointermove on window after the initial
  // pointerdown, seeking splitU to the cursor's X within the container.
  // Captures using window-level listeners so the drag continues outside
  // the container bounds (and stops cleanly on pointerup).
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current
    if (!container) return
    e.preventDefault()
    const rect = container.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      if (rect.width <= 0) return
      const u = (ev.clientX - rect.left) / rect.width
      setSplitU(Math.min(1, Math.max(0, u)))
    }
    move(e.nativeEvent) // immediate update on the click point
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Merge the StyleX-emitted className with the consumer-provided one. Spreading
  // {...stylex.props(...)} AND passing className={className} produces duplicate
  // className attrs at JSX, which esbuild rejects. Pull the StyleX result first
  // and concatenate manually.
  const hitAreaProps = stylex.props(styles.hitArea)
  const mergedClass = [hitAreaProps.className, className].filter(Boolean).join(' ')

  return (
    <div
      ref={containerRef}
      {...hitAreaProps}
      className={mergedClass || undefined}
      onPointerDown={startDrag}
    >
      <div {...stylex.props(styles.line)} style={{ left: `${splitU * 100}%` }} />
      <div
        {...stylex.props(styles.handle)}
        style={{ left: `${splitU * 100}%` }}
        onPointerDown={(e) => { e.stopPropagation(); startDrag(e) }}
      >
        {handleContent}
      </div>
    </div>
  )
}
