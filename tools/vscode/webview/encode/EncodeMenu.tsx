import { useEffect, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Icon } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { z } from '@three-flatland/design-system/tokens/z.stylex'
import { createClientBridge } from '@three-flatland/bridge/client'
import { useEncodeStore, encodeActions } from './encodeStore'

type SegmentedProps<V extends string> = {
  label: React.ReactNode
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

const s = stylex.create({
  // Anchor: the wrapper around the trigger button + popover. Position:
  // relative so the popover can pin to its bottom edge.
  anchor: {
    position: 'relative',
    display: 'inline-flex',
  },
  // Inline trigger sized to the panel-header text height so the gear
  // never makes the title bar taller than needed.
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
    color: vscode.panelTitleFg,
    cursor: 'pointer',
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
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    paddingInline: space.lg,
    paddingBlock: space.sm,
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
    borderWidth: 0,
    width: '100%',
    textAlign: 'left',
    color: vscode.fg,
    fontFamily: vscode.fontFamily,
    fontSize: '12px',
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
  // Segmented control — mirrors AtlasMenu's pattern (label on left,
  // pill-style segmented buttons on right). Same shape across both
  // tools so the user-visible affordance is consistent.
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
  divider: {
    height: 1,
    backgroundColor: vscode.inputBorder,
    marginBlock: space.xs,
  },
})

/**
 * Gear-icon settings menu for the Encode tool. Surfaces:
 * - Reset slider to center (calls setCompareSplitU(0.5))
 * - Open save folder (sends encode/reveal-folder to the host)
 * - Show pixel grid at 1:1 (placeholder — implementation deferred to a later task)
 *
 * Closes on outside-click, Escape, or action.
 */
export function EncodeMenu() {
  const [open, setOpen] = useState(false)
  // Show pixel grid toggle — placeholder; no implementation yet.
  // TODO(T16): wire to actual pixel-grid overlay once ComparePreview supports it.
  const [pixelGrid, setPixelGrid] = useState(false)
  const pixelArt = useEncodeStore((s) => s.pixelArt)
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

  const onResetSlider = () => {
    encodeActions.setCompareSplitU(0.5)
    setOpen(false)
  }

  const onOpenSaveFolder = async () => {
    const bridge = createClientBridge()
    try {
      await bridge.request('encode/reveal-folder')
    } catch (err) {
      console.error('encode/reveal-folder failed', err)
    }
    // bridge has no dispose() — see tools/vscode/CLAUDE.md
    setOpen(false)
  }

  return (
    <div ref={anchorRef} {...stylex.props(s.anchor)}>
      <button
        type="button"
        title="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        {...stylex.props(s.trigger)}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="settings-gear" />
      </button>
      {open ? (
        <div role="menu" {...stylex.props(s.popover)}>
          <div {...stylex.props(s.sectionLabel)}>Rendering</div>
          {/* Filter mode — mirrors atlas tool's pref. true ↔ 'pixel'
              (nearest), false ↔ 'bilinear'. Default is 'pixel' (nearest)
              because sprite work is the primary use case for this tool;
              users encoding photographic content can flip to bilinear. */}
          <Segmented
            label="Filter"
            value={pixelArt ? 'pixel' : 'bilinear'}
            options={['pixel', 'bilinear'] as const}
            onChange={(v) => encodeActions.setPixelArt(v === 'pixel')}
          />
          <div {...stylex.props(s.divider)} />

          <div {...stylex.props(s.sectionLabel)}>Compare</div>
          <button
            type="button"
            role="menuitem"
            {...stylex.props(s.actionRow)}
            onClick={onResetSlider}
          >
            Reset slider to center
          </button>

          <button
            type="button"
            role="menuitem"
            {...stylex.props(s.actionRow)}
            onClick={() => { void onOpenSaveFolder() }}
          >
            Open save folder
          </button>

          {/* Pixel grid toggle — visual placeholder only; no canvas implementation yet.
              TODO(T16): connect to ComparePreview pixel-grid overlay. */}
          <div
            role="menuitemcheckbox"
            aria-checked={pixelGrid}
            tabIndex={0}
            {...stylex.props(s.toggleRow)}
            onClick={() => {
              setPixelGrid((v) => !v)
              // placeholder: no-op until pixel grid overlay is implemented
              console.log('[EncodeMenu] pixel grid toggled (placeholder):', !pixelGrid)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setPixelGrid((v) => !v)
                console.log('[EncodeMenu] pixel grid toggled (placeholder):', !pixelGrid)
              }
            }}
          >
            <span {...stylex.props(s.toggleLabel)}>Show pixel grid at 1:1</span>
            <span {...stylex.props(s.check, pixelGrid && s.checkOn)}>{pixelGrid ? '✓' : ''}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
