import { useEffect, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Icon } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { z } from '@three-flatland/design-system/tokens/z.stylex'
import { createClientBridge } from '@three-flatland/bridge/client'
import { encodeActions } from './encodeStore'

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
