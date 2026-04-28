import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { ToolbarButton } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { z } from '@three-flatland/design-system/tokens/z.stylex'
import { prefsStore, type AtlasPrefs } from './prefs'

const s = stylex.create({
  // Anchor: the wrapper around the trigger button + popover. Position:
  // relative so the popover can pin to its bottom edge.
  anchor: {
    position: 'relative',
    display: 'inline-flex',
  },
  popover: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    minWidth: 220,
    backgroundColor: vscode.panelBg,
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.md,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
    paddingBlock: space.sm,
    paddingInline: 0,
    zIndex: z.dropdown,
    fontFamily: vscode.fontFamily,
    fontSize: '12px',
    // Header in this menu uses small-caps style; the rest is sentence
    // case to match VSCode's command palette / settings UI.
    textTransform: 'none',
    letterSpacing: 'normal',
  },
  sectionLabel: {
    paddingInline: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    fontSize: '10px',
    color: vscode.descriptionFg,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  divider: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: vscode.panelBorder,
    marginBlock: space.xs,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: space.lg,
    paddingBlock: space.sm,
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
  },
  toggleLabel: { display: 'inline-flex', alignItems: 'center', gap: space.sm },
  // Row layout for segmented controls (label on left, segments on right)
  segRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingInline: space.lg,
    paddingBlock: space.sm,
  },
  segGroup: {
    display: 'inline-flex',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  segBtn: {
    paddingInline: space.md,
    paddingBlock: space.xs,
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
    color: vscode.fg,
    borderWidth: 0,
    cursor: 'pointer',
    userSelect: 'none',
  },
  segBtnActive: {
    backgroundColor: vscode.btnBg,
    color: vscode.btnFg,
  },
  // Visual-only checkbox indicator. We don't use a real <input> because
  // the row itself is the click target; rendering a glyph keeps the
  // hit area large without two competing focus rings.
  check: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    backgroundColor: vscode.inputBg,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    lineHeight: 1,
    color: vscode.btnFg,
  },
  checkOn: { backgroundColor: vscode.btnBg, borderColor: vscode.btnBg },
})

type ToggleProps = {
  label: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={0}
      {...stylex.props(s.toggleRow)}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange(!checked)
        }
      }}
    >
      <span {...stylex.props(s.toggleLabel)}>{label}</span>
      <span {...stylex.props(s.check, checked && s.checkOn)}>{checked ? '✓' : ''}</span>
    </div>
  )
}

type SegmentedProps<V extends string> = {
  label: ReactNode
  value: V
  options: readonly V[]
  onChange: (next: V) => void
}

function Segmented<V extends string>({ label, value, options, onChange }: SegmentedProps<V>) {
  return (
    <div {...stylex.props(s.segRow)}>
      <span>{label}</span>
      <span role="radiogroup" {...stylex.props(s.segGroup)}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={value === opt}
            {...stylex.props(s.segBtn, value === opt && s.segBtnActive)}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </span>
    </div>
  )
}

export type AtlasMenuProps = {
  prefs: AtlasPrefs
}

/**
 * Hamburger menu surfacing the user's display preferences for the Atlas
 * tool: background style, dim-out-of-bounds, color/coord readout format,
 * and visibility toggles for the floating overlays. All writes go through
 * `prefsStore` so the values are persisted to localStorage.
 *
 * The popover closes on outside-click, Escape, or selecting an option in
 * a way that fully resolves the choice (segmented buttons stay open so
 * the user can compare side-by-side; toggles stay open so the user can
 * flip multiple in one trip).
 */
export function AtlasMenu({ prefs }: AtlasMenuProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape.
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

  return (
    <div ref={anchorRef} {...stylex.props(s.anchor)}>
      <ToolbarButton
        icon="settings-gear"
        title="Display options"
        onClick={() => setOpen((o) => !o)}
      />
      {open ? (
        <div role="menu" {...stylex.props(s.popover)}>
          <div {...stylex.props(s.sectionLabel)}>Background</div>
          <Segmented
            label="Style"
            value={prefs.background}
            options={['checker', 'theme'] as const}
            onChange={(v) => prefsStore.set({ background: v })}
          />
          <Toggle
            label="Dim outside image"
            checked={prefs.dimOutOfBounds}
            onChange={(v) => prefsStore.set({ dimOutOfBounds: v })}
          />

          <div {...stylex.props(s.divider)} />
          <div {...stylex.props(s.sectionLabel)}>Cursor info</div>
          <Segmented
            label="Color"
            value={prefs.colorMode}
            options={['hex', 'rgba', 'float'] as const}
            onChange={(v) => prefsStore.set({ colorMode: v })}
          />
          <Segmented
            label="Coords"
            value={prefs.coordMode}
            options={['px', 'uv+', 'uv-'] as const}
            onChange={(v) => prefsStore.set({ coordMode: v })}
          />

          <div {...stylex.props(s.divider)} />
          <div {...stylex.props(s.sectionLabel)}>Overlays</div>
          <Toggle
            label="Frame numbers"
            checked={prefs.showFrameNumbers}
            onChange={(v) => prefsStore.set({ showFrameNumbers: v })}
          />
          <Toggle
            label="Hover chip"
            checked={prefs.showHoverChip}
            onChange={(v) => prefsStore.set({ showHoverChip: v })}
          />
          <Toggle
            label="Cursor info bar"
            checked={prefs.showInfoPanel}
            onChange={(v) => prefsStore.set({ showInfoPanel: v })}
          />
        </div>
      ) : null}
    </div>
  )
}
