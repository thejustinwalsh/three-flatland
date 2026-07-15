import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'
import { z } from '../tokens/z.stylex'
// Use the underlying Lit binding directly so we don't create a
// circular import with this package's barrel.
import Icon from '@vscode-elements/react-elements/dist/components/VscodeIcon.js'

export type CompactSelectOption<V extends string = string> = {
  value: V
  label?: ReactNode
}

export type CompactSelectProps<V extends string = string> = {
  value: V
  options: readonly CompactSelectOption<V>[]
  onChange(next: V): void
  /** Optional fixed width. Defaults to auto so the trigger sizes to its label. */
  width?: number | string
  /** Disabled — trigger inert, popover never opens. */
  disabled?: boolean
  /** ARIA label for accessibility. */
  'aria-label'?: string
}

const s = stylex.create({
  anchor: {
    position: 'relative',
    display: 'inline-flex',
  },
  // Trigger sized to slot into a Panel-style header without growing it
  // — total height ~18px, well below the SingleSelect's 22px default.
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.xs,
    height: 18,
    paddingInline: space.sm,
    paddingBlock: 0,
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: vscode.inputBorder, ':focus-within': vscode.focusRing },
    borderRadius: radius.sm,
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    cursor: 'pointer',
    userSelect: 'none',
    outlineStyle: 'none',
  },
  triggerDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  triggerLabel: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'start',
  },
  triggerChev: {
    color: vscode.descriptionFg,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  // Portaled to document.body and positioned via fixed coordinates so
  // ancestor `overflow: hidden` (Panel.shell) and tight drawer bounds
  // can't clip it.
  popover: {
    position: 'fixed',
    maxHeight: 240,
    overflow: 'auto',
    backgroundColor: vscode.panelBg,
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.sm,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
    paddingBlock: space.xs,
    zIndex: z.dropdown,
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
  },
  option: {
    paddingInline: space.md,
    paddingBlock: space.xs,
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
    color: vscode.fg,
    whiteSpace: 'nowrap',
  },
  optionActive: {
    backgroundColor: vscode.listActiveSelectionBg,
    color: vscode.listActiveSelectionFg,
  },
})

/**
 * Tiny single-select. Built for sub-Panel-header chrome where the
 * default `VscodeSingleSelect` (~22px tall) would overflow the row
 * height. Trigger is an 18px button styled like the design-system
 * input; click opens a small popover with the options list. Closes on
 * outside click, Escape, or selection.
 */
/** Estimate the popover's max height before measure so the flip math
 *  can still pick a side on first render. Matches `s.popover.maxHeight`. */
const POPOVER_MAX_HEIGHT = 240
const POPOVER_GAP = 2

type PopoverPlacement = {
  top: number
  left: number
  width: number
  /** Above or below the trigger — used to mirror the visual gap. */
  side: 'above' | 'below'
}

export function CompactSelect<V extends string = string>(props: CompactSelectProps<V>) {
  const { value, options, onChange, width, disabled = false } = props
  const ariaLabel = props['aria-label']
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Recompute fixed-coord placement against the trigger's screen rect,
  // flipping above the trigger when there's no room below. Cheap; runs
  // on open + on viewport scroll/resize while open.
  const recompute = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const popH = popoverRef.current?.offsetHeight ?? POPOVER_MAX_HEIGHT
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const flip = spaceBelow < popH + POPOVER_GAP && spaceAbove > spaceBelow
    setPlacement({
      top: flip ? rect.top - popH - POPOVER_GAP : rect.bottom + POPOVER_GAP,
      left: rect.left,
      width: rect.width,
      side: flip ? 'above' : 'below',
    })
  }, [])

  useLayoutEffect(() => {
    if (open) {
      recompute()
    } else {
      // Drop the previous placement so the next open re-measures
      // against the popover's freshly mounted DOM. setState bails out
      // if already null, so this is safe to call unconditionally — and
      // crucially we don't list `placement` as a dep, otherwise
      // recompute → setPlacement → re-fire would loop.
      setPlacement(null)
    }
  }, [open, recompute])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (anchorRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onReflow = () => recompute()
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, recompute])

  const activeOption = options.find((o) => o.value === value)
  const activeLabel = activeOption?.label ?? activeOption?.value ?? ''

  return (
    <div ref={anchorRef} {...stylex.props(s.anchor)} style={{ width }}>
      <button
        type="button"
        {...stylex.props(s.trigger, disabled && s.triggerDisabled)}
        style={{ width: width ?? 'auto' }}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span {...stylex.props(s.triggerLabel)}>{activeLabel}</span>
        <span {...stylex.props(s.triggerChev)} aria-hidden="true">
          <Icon name="chevron-down" />
        </span>
      </button>
      {open && !disabled
        ? createPortal(
            // Render the popover unconditionally on open and hide it
            // until the layout effect has measured its real height —
            // otherwise the first-render flip math falls back to
            // POPOVER_MAX_HEIGHT (240) and forces an above-flip when
            // the actual list is much shorter, making the menu appear
            // in a "random" spot.
            <div
              ref={popoverRef}
              role="listbox"
              {...stylex.props(s.popover)}
              style={{
                top: placement?.top ?? -10000,
                left: placement?.left ?? -10000,
                minWidth: placement?.width,
                visibility: placement ? 'visible' : 'hidden',
              }}
            >
              {options.map((opt) => (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  tabIndex={0}
                  {...stylex.props(s.option, opt.value === value && s.optionActive)}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onChange(opt.value)
                      setOpen(false)
                    }
                  }}
                >
                  {opt.label ?? opt.value}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
