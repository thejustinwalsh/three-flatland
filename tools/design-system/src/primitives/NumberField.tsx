import * as stylex from '@stylexjs/stylex'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'

/** Pixels of drag distance that equal one step unit. */
const STEP_PX = 4
/** Max drag distance (px) before the value freezes (visual-only cap). */
const MAX_DRAG_PX = 200

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = stylex.create({
  container: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: space.xs,
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
    // Focus ring is applied via data-focused attribute below
  },
  containerFocused: {
    borderColor: vscode.focusRing,
    // Suppress the default outline — the border colour change IS the focus ring.
    outline: 'none',
  },
  containerDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  input: {
    // Fills the remaining width, inherits container font/color.
    flex: 1,
    minWidth: 0,
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    padding: 0,
    margin: 0,
    // Kill browser spinbox and focus ring — the container provides both.
    appearance: 'none',
    outline: 'none',
  },
  inputDisabled: {
    cursor: 'not-allowed',
  },
  decorator: {
    // Narrow right-side handle. Fixed width so it doesn't squeeze the input.
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '14px',
    flexShrink: 0,
    alignSelf: 'stretch',
    cursor: 'ns-resize',
    borderRadius: radius.sm,
    color: 'inherit',
    userSelect: 'none',
    // Subtle hover affordance — matches Tweakpane drag handle
    ':hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.07)',
    },
  },
  decoratorDisabled: {
    cursor: 'not-allowed',
    pointerEvents: 'none',
    opacity: 0.4,
  },
  // Applied to the decorator when drag hits the MAX_DRAG_PX cap —
  // matches vscode.errorFg so the user sees "you've maxed this drag".
  decoratorCapped: {
    color: vscode.errorFg,
  },
})

// ---------------------------------------------------------------------------
// Chevron SVG — inline so we have no asset-loading dependency.
// Two small triangles stacked vertically (up ▲, down ▼).
// ---------------------------------------------------------------------------

function ChevronUpDown({ capped }: { capped: boolean }) {
  // Color is inherited from the decorator container (or errorFg via decoratorCapped).
  // We just need a shape. `fill="currentColor"` picks up whatever CSS says.
  void capped // capped is expressed via CSS on parent; keep prop for future direct use
  return (
    <svg
      width="8"
      height="10"
      viewBox="0 0 8 10"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      {/* Up chevron */}
      <polygon points="4,1 7,4 1,4" />
      {/* Down chevron */}
      <polygon points="4,9 7,6 1,6" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function parseNum(text: string): number | null {
  if (text === '' || text === '-') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NumberFieldProps = {
  value: number
  onChange: (next: number) => void
  /** Minimum allowed value. Default: -Infinity. */
  min?: number
  /** Maximum allowed value. Default: Infinity. */
  max?: number
  /** Increment per ↑/↓ key or per drag-step. Default 1. */
  step?: number
  /** ARIA label for accessibility. */
  'aria-label'?: string
  /** Optional placeholder for the empty/cleared state. */
  placeholder?: string
  /** Optional id for label association. */
  id?: string
  /** Disabled state — text input read-only, decorator inert. */
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
}: NumberFieldProps) {
  // ---- controlled text state ------------------------------------------------
  // We keep a local `text` string so mid-edit states (empty, '-') are allowed
  // without immediately clamping. Synced back from `value` when it changes
  // externally (e.g. drag or keyboard increments from another source).
  const [text, setText] = useState(() => String(value))
  const [focused, setFocused] = useState(false)

  // Track drag-at-cap visual state separately so the decorator can go red.
  const [dragging, setDragging] = useState(false)
  const [atCap, setAtCap] = useState(false)

  // Refs for drag state — kept outside React state to avoid re-renders during
  // the tight pointer-move loop.
  const dragStartY = useRef(0)
  const dragStartValue = useRef(0)
  const decoratorRef = useRef<HTMLDivElement>(null)

  // Sync text from external value changes. Skip if the user is mid-edit
  // (focused) to avoid clobbering partial input. During drag we also skip
  // because we update text via onChange and the loop is self-consistent.
  useEffect(() => {
    if (!focused) {
      setText(String(value))
    }
  }, [value, focused])

  // ---- text input handlers --------------------------------------------------

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setText(v)
    if (v === '' || v === '-') return // mid-edit; hold off
    const n = parseNum(v)
    if (n !== null && n >= min && n <= max) {
      onChange(n)
    }
  }

  function handleBlur() {
    setFocused(false)
    const n = parseNum(text)
    if (n === null || n < min || n > max) {
      // Snap to min (or existing value if min is -Infinity and there's no
      // valid candidate).
      const snap = Number.isFinite(min) ? min : value
      onChange(snap)
      setText(String(snap))
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Prevent the outer window keydown listeners (e.g. App's Cmd+A, Cmd+S)
    // from seeing arrow keys that we handle here.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      const multiplier = e.shiftKey ? 10 : 1
      const delta = e.key === 'ArrowUp' ? step * multiplier : -step * multiplier
      const next = clamp(value + delta, min, max)
      onChange(next)
      setText(String(next))
    }
  }

  // ---- drag decorator handlers ----------------------------------------------

  function handleDecoratorPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return
    e.preventDefault() // prevent text input losing focus / selection issues
    decoratorRef.current?.setPointerCapture(e.pointerId)
    dragStartY.current = e.clientY
    dragStartValue.current = value
    setDragging(true)
    setAtCap(false)
  }

  function handleDecoratorPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    // Drag UP = positive delta = increase value (matches Tweakpane convention).
    const rawDelta = dragStartY.current - e.clientY
    // Clamp delta to ±MAX_DRAG_PX — beyond this the value freezes.
    const cappedDelta = clamp(rawDelta, -MAX_DRAG_PX, MAX_DRAG_PX)
    const isCapped = Math.abs(rawDelta) >= MAX_DRAG_PX
    setAtCap(isCapped)

    const steps = Math.round(cappedDelta / STEP_PX)
    const next = clamp(dragStartValue.current + steps * step, min, max)
    onChange(next)
    // Don't call setText here — the useEffect syncs value → text, but that
    // skips when focused=false during drag. Force sync directly.
    setText(String(next))
  }

  function handleDecoratorPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    decoratorRef.current?.releasePointerCapture(e.pointerId)
    setDragging(false)
    setAtCap(false)
  }

  // ---- render ---------------------------------------------------------------

  return (
    <div
      {...stylex.props(
        s.container,
        focused && s.containerFocused,
        disabled && s.containerDisabled,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
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
        aria-hidden={disabled}
        tabIndex={-1}
        onPointerDown={handleDecoratorPointerDown}
        onPointerMove={handleDecoratorPointerMove}
        onPointerUp={handleDecoratorPointerUp}
        onPointerCancel={handleDecoratorPointerUp}
        {...stylex.props(
          s.decorator,
          disabled && s.decoratorDisabled,
          atCap && s.decoratorCapped,
        )}
      >
        <ChevronUpDown capped={atCap} />
      </div>
    </div>
  )
}
