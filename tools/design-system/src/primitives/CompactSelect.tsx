import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'
import { z } from '../tokens/z.stylex'
// Use the underlying Lit binding directly so we don't create a
// circular import with this package's barrel.
import { VscodeIcon as Icon } from '@vscode-elements/react-elements'

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
  popover: {
    position: 'absolute',
    top: 'calc(100% + 2px)',
    left: 0,
    minWidth: '100%',
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
export function CompactSelect<V extends string = string>(props: CompactSelectProps<V>) {
  const { value, options, onChange, width, disabled = false } = props
  const ariaLabel = props['aria-label']
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!anchorRef.current) return
      if (anchorRef.current.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
      {open && !disabled ? (
        <div role="listbox" {...stylex.props(s.popover)}>
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
        </div>
      ) : null}
    </div>
  )
}
