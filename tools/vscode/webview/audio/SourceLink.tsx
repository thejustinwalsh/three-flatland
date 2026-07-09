import type { MouseEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { link } from './link.stylex'

const s = stylex.create({
  link: {
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    color: {
      default: link.fg,
      ':active': link.activeFg,
    },
    textDecorationLine: {
      default: 'none',
      ':hover': 'underline',
    },
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    outlineColor: vscode.focusRing,
  },
})

export type SourceLinkProps = {
  /** Visible text, e.g. `sounds.ts:53`. */
  label: string
  /** Hover tooltip — the full workspace-relative path. */
  title: string
  onReveal: () => void
}

/**
 * The header's source-location link — a text link in VS Code's textLink
 * colors that reveals the finding in its editor. Locally composed (the
 * design system has no link primitive); promotion candidate alongside
 * Pill/Slider per the README's "Local primitives" section.
 */
export function SourceLink({ label, title, onReveal }: SourceLinkProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    onReveal()
  }
  return (
    <a href="#" title={title} onClick={handleClick} {...stylex.props(s.link)}>
      {label}
    </a>
  )
}
