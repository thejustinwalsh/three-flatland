import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { applyStep, sliderValueFromDrag, valueFromTrackX } from './sliderMath'

// Local primitive — `@three-flatland/design-system` has no Slider (its
// bounded-numeric input is `NumberField`'s vertical drag decorator, not a
// horizontal track). Composed here from design-system tokens rather than
// added upstream since this tool is the only current consumer; promote to
// `tools/design-system` if a second tool needs one.
//
// Drag/click/step math lives in `./sliderMath` (framework-free, unit
// tested there) — kept out of this file so importing it doesn't require
// the StyleX babel transform.

const TRACK_HEIGHT = 4
const THUMB_SIZE = 12

const s = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    width: '100%',
  },
  trackWrap: {
    flex: 1,
    minWidth: 0,
    // Generous hit area — the visible track is thin (TRACK_HEIGHT), but
    // the pointer target extends well past it vertically.
    paddingBlock: space.md,
    cursor: { default: 'pointer', ':focus-visible': 'pointer' },
    outlineStyle: 'none',
  },
  trackWrapDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  track: {
    position: 'relative',
    height: TRACK_HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: vscode.inputBorder,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: radius.sm,
    backgroundColor: vscode.focusRing,
    pointerEvents: 'none',
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: '50%',
    backgroundColor: vscode.btnFg,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: vscode.focusRing,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
  },
  readout: {
    flexShrink: 0,
    minWidth: 44,
    textAlign: 'end',
    color: vscode.descriptionFg,
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
  },
})

export type SliderProps = {
  value: number
  min: number
  max: number
  /** Increment for arrow-key nudges and drag-value quantization. Default: no quantization. */
  step?: number
  onChange: (next: number) => void
  disabled?: boolean
  'aria-label'?: string
  /** Format the readout text (e.g. radians → degrees). Defaults to a fixed-precision number. */
  format?: (value: number) => string
}

export function Slider({
  value,
  min,
  max,
  step = 0,
  onChange,
  disabled = false,
  format,
  'aria-label': ariaLabel,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragStartX = useRef(0)
  const dragStartValue = useRef(0)
  const pxPerUnit = useRef(1)
  const [dragging, setDragging] = useState(false)

  const commit = (v: number) => onChange(applyStep(Math.max(min, Math.min(max, v)), step))

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    pxPerUnit.current = rect.width / (max - min || 1)
    const clicked = applyStep(valueFromTrackX(e.clientX, rect, min, max), step)
    // Anchor the drag to the value we're about to commit (not the stale
    // `value` prop) — see `sliderValueFromDrag`'s doc comment.
    dragStartX.current = e.clientX
    dragStartValue.current = clicked
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    commit(clicked)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const next = sliderValueFromDrag(dragStartValue.current, dragStartX.current, e.clientX, {
      min,
      max,
      pxPerUnit: pxPerUnit.current,
    })
    commit(next)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const unit = step || (max - min) / 100 || 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      commit(value + unit * (e.shiftKey ? 10 : 1))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      commit(value - unit * (e.shiftKey ? 10 : 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      commit(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      commit(max)
    }
  }

  const pct = ((Math.max(min, Math.min(max, value)) - min) / (max - min || 1)) * 100
  const readoutText = format ? format(value) : value.toFixed(2)

  return (
    <div {...stylex.props(s.row)}>
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={ariaLabel}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        {...stylex.props(s.trackWrap, disabled && s.trackWrapDisabled)}
      >
        <div {...stylex.props(s.track)}>
          <span {...stylex.props(s.fill)} style={{ width: `${pct}%` }} />
          <span {...stylex.props(s.thumb)} style={{ left: `${pct}%` }} />
        </div>
      </div>
      <span {...stylex.props(s.readout)}>{readoutText}</span>
    </div>
  )
}
