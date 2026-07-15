import * as stylex from '@stylexjs/stylex'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useRef } from 'react'
import { vscode } from '../tokens/vscode-theme.stylex'

const s = stylex.create({
  horizontal: {
    height: 4,
    cursor: 'row-resize',
    flexShrink: 0,
    backgroundColor: { default: 'transparent', ':hover': vscode.focusRing },
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  },
  vertical: {
    width: 4,
    cursor: 'col-resize',
    flexShrink: 0,
    backgroundColor: { default: 'transparent', ':hover': vscode.focusRing },
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  },
})

export type SplitterProps = {
  /**
   * `'horizontal'` — a horizontal line dragged vertically (splits rows
   * of a column).
   * `'vertical'` — a vertical line dragged horizontally (splits columns
   * of a row).
   */
  axis: 'horizontal' | 'vertical'
  /**
   * Fired on drag with the live pointer position in client coordinates.
   * For `axis: 'vertical'` this is `clientX`; for `axis: 'horizontal'`
   * it's `clientY`. The parent computes the new pane size and clamps
   * to its own min/max.
   */
  onDrag: (clientPx: number) => void
}

/**
 * 4px-thick draggable separator with VSCode focus-ring hover. Stateless
 * — the parent owns the resulting pane size in its own state. Use the
 * splitter's own thickness as the inter-pane visual gap; adjacent panels
 * with rounded borders look correct without extra spacing.
 */
export function Splitter({ axis, onDrag }: SplitterProps) {
  const draggingRef = useRef(false)
  return (
    <div
      role="separator"
      aria-orientation={axis}
      {...stylex.props(axis === 'horizontal' ? s.horizontal : s.vertical)}
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        draggingRef.current = true
      }}
      onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) return
        onDrag(axis === 'horizontal' ? e.clientY : e.clientX)
      }}
      onPointerUp={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
        draggingRef.current = false
      }}
      onPointerCancel={() => {
        draggingRef.current = false
      }}
    />
  )
}
