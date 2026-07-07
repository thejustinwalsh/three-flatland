import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'

// No pill/chip toggle primitive exists in @three-flatland/design-system
// yet (Badge is static, ToolbarButton is icon-only) — composed locally
// per tools/vscode/CLAUDE.md's "compose locally, note as a promotion
// candidate" allowance. Candidate name if promoted: `Pill`/`Chip` with
// `active`/`onToggle` props, same shape as here.
const s = stylex.create({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    paddingInline: space.md,
    paddingBlock: space.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: vscode.inputBorder, ':focus-visible': vscode.focusRing },
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
    color: vscode.fg,
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    lineHeight: 1.4,
    cursor: 'pointer',
    userSelect: 'none',
    outlineStyle: 'none',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '90ms',
  },
  pillActive: {
    backgroundColor: { default: vscode.focusRing, ':hover': vscode.focusRing },
    borderColor: vscode.focusRing,
    color: vscode.btnFg,
  },
  pillDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
})

export type PillProps = {
  label: string
  active: boolean
  disabled?: boolean
  onToggle: () => void
}

export function Pill({ label, active, disabled = false, onToggle }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      {...stylex.props(s.pill, active && s.pillActive, disabled && s.pillDisabled)}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}
