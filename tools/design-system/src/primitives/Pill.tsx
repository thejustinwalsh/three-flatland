import * as stylex from '@stylexjs/stylex'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'

const s = stylex.create({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    paddingInline: space.md,
    paddingBlock: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: vscode.inputBorder, ':focus-visible': vscode.focusRing },
    // Idle state carries a faint fill so an unselected pill still reads
    // as a distinct, clickable chip against the panel background —
    // transparent-on-transparent (the prior treatment) left it nearly
    // invisible until hovered. Same idea as `NumberField`'s resting
    // input box: visible chrome at rest, accent color reserved for
    // state, not for "here I am."
    backgroundColor: { default: vscode.inputBg, ':hover': vscode.bg },
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
  // Active/selected uses the same list-selection tokens Atlas's frame
  // list uses for its selected row — this is VSCode's native vocabulary
  // for "the chosen one among peers." `focusRing` is reserved for the
  // actual keyboard focus outline above; conflating the two (the prior
  // treatment) made every selected pill look like a permanently-focused
  // button.
  pillActive: {
    backgroundColor: {
      default: vscode.listActiveSelectionBg,
      ':hover': vscode.listActiveSelectionBg,
    },
    borderColor: vscode.listActiveSelectionBg,
    color: vscode.listActiveSelectionFg,
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

/** Toggleable chip for small enum selections (single or multi via a group
 * wrapper) — e.g. category/style pickers. Not a `Badge` (that's static,
 * for status/count display); `Pill` is interactive. */
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
