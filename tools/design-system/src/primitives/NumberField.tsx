import * as stylex from '@stylexjs/stylex'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'

/** Pixels of vertical drag distance per `step` unit. */
const STEP_PX = 4
/** Max drag distance (px) before the value freezes (visual-only cap). */
const MAX_DRAG_PX = 200

const s = stylex.create({
  // Outer container — the visible "input box". Must fill its layout cell.
  container: {
    display: 'flex',
    alignItems: 'stretch',
    position: 'relative',
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: vscode.inputBorder, ':focus-within': vscode.focusRing },
    borderRadius: radius.sm,
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
    overflow: 'hidden',
  },
  containerDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  // Native <input> — borderless, transparent, fills container.
  input: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    paddingInline: space.sm,
    paddingBlock: space.xs,
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    outlineStyle: 'none',
    appearance: 'none',
    // Hide the browser-native number spinbox completely (also covers the
    // Firefox/Safari variants).
    MozAppearance: 'textfield',
  },
  inputDisabled: {
    cursor: 'not-allowed',
  },
  // Right-side drag handle. Vertical drag inc/dec the value.
  decorator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    flexShrink: 0,
    cursor: 'ns-resize',
    color: { default: vscode.descriptionFg, ':hover': vscode.fg },
    backgroundColor: {
      default: 'transparent',
      ':hover': vscode.bg,
    },
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: vscode.inputBorder,
    userSelect: 'none',
    transitionProperty: 'color, background-color',
    transitionDuration: '90ms',
  },
  decoratorActive: {
    color: vscode.fg,
    backgroundColor: vscode.bg,
  },
  decoratorCapped: {
    color: vscode.errorFg,
  },
  decoratorDisabled: {
    cursor: 'not-allowed',
    pointerEvents: 'none',
    opacity: 0.4,
  },
  // Drag indicator — a thin bar pinned to the bottom of the container,
  // anchored to the horizontal center. Width spans up to half the
  // container; transform handles the directional growth (caller computes
  // the transform string from the signed drag delta).
  dragOverlay: {
    position: 'absolute',
    left: '50%',
    bottom: 0,
    width: '50%',
    height: 2,
    backgroundColor: vscode.focusRing,
    pointerEvents: 'none',
    transformOrigin: 'left center',
    transitionProperty: 'background-color',
    transitionDuration: '90ms',
  },
  dragOverlayCapped: {
    backgroundColor: vscode.errorFg,
  },
  // Dynamic transform — caller computes the string. Drag UP (positive
  // delta) grows to the right via `scaleX`; drag DOWN flips via a
  // negative `translateX` plus the scale.
  dragOverlayTransform: (transform: string) => ({ transform }),
})

function ChevronUpDown() {
  return (
    <svg
      width="9"
      height="11"
      viewBox="0 0 9 11"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      <polygon points="4.5,0 8,3.5 1,3.5" />
      <polygon points="4.5,11 8,7.5 1,7.5" />
    </svg>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function parseNum(text: string): number | null {
  if (text === '' || text === '-') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export type NumberFieldProps = {
  value: number
  onChange: (next: number) => void
  /** Minimum allowed value. Default: -Infinity. */
  min?: number
  /** Maximum allowed value. Default: Infinity. */
  max?: number
  /** Increment per ↑/↓ key, per drag-step. Default 1. */
  step?: number
  /** ARIA label for accessibility. */
  'aria-label'?: string
  /** Optional placeholder for the empty/cleared state. */
  placeholder?: string
  /** Optional id for label association. */
  id?: string
  /** Disabled state — text input read-only, decorator inert. */
  disabled?: boolean
  /** Override default 100% width with a fixed pixel width. */
  width?: number
}

export function NumberField({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  'aria-label': ariaLabel,
  placeholder,
  id,
  disabled = false,
  width,
}: NumberFieldProps) {
  // Local text state lets the user type empty/`-` mid-edit without the
  // controlled value clamping every keystroke.
  const [text, setText] = useState(() => String(value))
  const [focused, setFocused] = useState(false)

  // Drag visual state. dragDelta is the signed ratio of cappedDelta to
  // MAX_DRAG_PX, used to drive the overlay bar's width.
  const [dragging, setDragging] = useState(false)
  const [dragDelta, setDragDelta] = useState(0)
  const [atCap, setAtCap] = useState(false)

  const dragStartY = useRef(0)
  const dragStartValue = useRef(0)
  const decoratorRef = useRef<HTMLDivElement>(null)

  // External value changes sync into the text field — but only when the
  // user isn't actively typing (focused). During drag we call setText
  // directly so the visible number tracks the dragged value.
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  // ── Text input handlers ────────────────────────────────────────────────────

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setText(v)
    if (v === '' || v === '-') return
    const n = parseNum(v)
    if (n !== null && n >= min && n <= max) {
      onChange(n)
    }
  }

  const handleBlur = () => {
    setFocused(false)
    const n = parseNum(text)
    if (n === null || n < min || n > max) {
      const snap = Number.isFinite(min) ? min : value
      onChange(snap)
      setText(String(snap))
    }
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      // Stop propagation so window-level shortcut handlers (Cmd+S etc) don't
      // also see the keystroke.
      e.stopPropagation()
      const multiplier = e.shiftKey ? 10 : 1
      const delta = e.key === 'ArrowUp' ? step * multiplier : -step * multiplier
      const next = clamp(value + delta, min, max)
      onChange(next)
      setText(String(next))
    }
  }

  // ── Drag decorator handlers ────────────────────────────────────────────────

  const handleDecoratorPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    decoratorRef.current?.setPointerCapture(e.pointerId)
    dragStartY.current = e.clientY
    dragStartValue.current = value
    setDragging(true)
    setDragDelta(0)
    setAtCap(false)
  }

  const handleDecoratorPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    // Drag UP = positive delta = increase (Tweakpane convention).
    const rawDelta = dragStartY.current - e.clientY
    const cappedDelta = clamp(rawDelta, -MAX_DRAG_PX, MAX_DRAG_PX)
    const isCapped = Math.abs(rawDelta) >= MAX_DRAG_PX
    setAtCap(isCapped)
    setDragDelta(cappedDelta / MAX_DRAG_PX)

    const steps = Math.round(cappedDelta / STEP_PX)
    const next = clamp(dragStartValue.current + steps * step, min, max)
    onChange(next)
    setText(String(next))
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    if (decoratorRef.current?.hasPointerCapture(e.pointerId)) {
      decoratorRef.current.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
    setDragDelta(0)
    setAtCap(false)
  }

  return (
    <div
      {...stylex.props(s.container, disabled && s.containerDisabled)}
      style={width !== undefined ? { width } : undefined}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        {...stylex.props(s.input, disabled && s.inputDisabled)}
      />
      <div
        ref={decoratorRef}
        role="button"
        aria-label="Drag to adjust value"
        tabIndex={-1}
        onPointerDown={handleDecoratorPointerDown}
        onPointerMove={handleDecoratorPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        {...stylex.props(
          s.decorator,
          dragging && s.decoratorActive,
          atCap && s.decoratorCapped,
          disabled && s.decoratorDisabled,
        )}
      >
        <ChevronUpDown />
      </div>
      {dragging ? (() => {
        const abs = Math.abs(dragDelta)
        // Half-width units: scaleX shrinks from the left edge of the bar
        // (which is anchored at the container's center). Negative
        // direction = translate the bar leftward by its scaled width.
        const tx = dragDelta >= 0 ? 0 : -100 * abs
        const transform = `translateX(${tx}%) scaleX(${abs})`
        return (
          <span
            aria-hidden="true"
            {...stylex.props(
              s.dragOverlay,
              atCap && s.dragOverlayCapped,
              s.dragOverlayTransform(transform),
            )}
          />
        )
      })() : null}
    </div>
  )
}
