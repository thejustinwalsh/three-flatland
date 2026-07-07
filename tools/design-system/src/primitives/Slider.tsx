import * as stylex from '@stylexjs/stylex'
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { vscode } from '../tokens/vscode-theme.stylex'
import { radius } from '../tokens/radius.stylex'
import {
  computeDragValue,
  ratioForValue,
  snapToStep,
  type SliderDragStart,
  type SliderRange,
} from './sliderMath'

export type { SliderRange } from './sliderMath'

const s = stylex.create({
  track: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    height: 12,
    display: 'flex',
    alignItems: 'center',
    cursor: 'ew-resize',
    touchAction: 'none',
    outlineStyle: 'none',
    borderRadius: radius.sm,
  },
  trackFocusVisible: {
    boxShadow: `0 0 0 1px ${vscode.focusRing}`,
  },
  trackDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  },
  rail: {
    position: 'relative',
    left: 0,
    right: 0,
    width: '100%',
    height: 4,
    borderRadius: radius.sm,
    backgroundColor: vscode.inputBg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    overflow: 'hidden',
  },
  // Idle fill reads as a value indicator, not an affordance — same
  // restraint as NumberField's resting state (plain box, no accent
  // color until the user actually interacts). Only the active drag
  // recolors it to the focus-ring accent (`fillActive`).
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: vscode.descriptionFg,
  },
  fillActive: {
    backgroundColor: vscode.focusRing,
  },
  fillWidth: (pct: number) => ({ width: `${pct * 100}%` }),
  thumb: {
    position: 'absolute',
    width: 8,
    height: 8,
    top: '50%',
    borderRadius: '50%',
    backgroundColor: vscode.fg,
    boxShadow: `0 0 0 1px ${vscode.panelBorder}`,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  thumbActive: {
    backgroundColor: vscode.focusRing,
  },
  thumbLeft: (pct: number) => ({ left: `${pct * 100}%` }),
})

export type SliderProps = {
  value: number
  range: SliderRange
  onChange: (next: number) => void
  disabled?: boolean
  'aria-label'?: string
}

/**
 * Horizontal "scrub" control — same convention as `NumberField`'s vertical
 * drag handle (offset-from-drag-start, not jump-to-pointer-position), just
 * on the X axis. The accent (focus-ring) color is reserved for active
 * interaction (dragging or keyboard focus); the resting fill uses the
 * muted description-foreground tone so a row of sliders doesn't read as a
 * bank of always-lit volume bars. Drag math lives in `sliderMath.ts` so
 * it's unit-testable without a DOM.
 */
export function Slider({ value, range, onChange, disabled = false, ...rest }: SliderProps) {
  const ariaLabel = rest['aria-label']
  const trackRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<SliderDragStart | null>(null)
  const [dragging, setDragging] = useState(false)
  const [focusVisible, setFocusVisible] = useState(false)

  const ratio = ratioForValue(value, range)
  const active = dragging || focusVisible

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // Fixed for the whole drag session — every subsequent pointermove
    // recomputes from THIS snapshot, never from the last move's result.
    dragStart.current = { value, clientX: e.clientX }
    setDragging(true)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current
    if (!start) return
    const width = trackRef.current?.clientWidth ?? 0
    onChange(computeDragValue(start, range, e.clientX, width))
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragStart.current = null
    setDragging(false)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const multiplier = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(snapToStep(value + range.step * multiplier, range))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(snapToStep(value - range.step * multiplier, range))
    }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={value}
      aria-disabled={disabled}
      {...stylex.props(s.track, focusVisible && s.trackFocusVisible, disabled && s.trackDisabled)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocusVisible(true)}
      onBlur={() => setFocusVisible(false)}
    >
      <span {...stylex.props(s.rail)}>
        <span {...stylex.props(s.fill, active && s.fillActive, s.fillWidth(ratio))} />
      </span>
      <span
        aria-hidden="true"
        {...stylex.props(s.thumb, active && s.thumbActive, s.thumbLeft(ratio))}
      />
    </div>
  )
}
