import * as stylex from '@stylexjs/stylex'
import type { StyleXStyles } from '@stylexjs/stylex'
import type { HTMLAttributes, ReactNode } from 'react'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'

const s = stylex.create({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    backgroundColor: vscode.bg,
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.sm,
  },
  header: {
    paddingInline: space.xl,
    paddingBlock: space.sm,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
    fontFamily: vscode.fontFamily,
    fontSize: '11px',
    color: vscode.panelTitleFg,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: vscode.panelBg,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: space.lg,
  },
})

export type PanelProps = Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'className'> & {
  title?: ReactNode
  style?: StyleXStyles
}

/**
 * Simple titled container using VSCode panel-area tokens. VSCode Elements
 * doesn't ship a generic "Panel" primitive, so this is hand-built against
 * the same tokens VSCode uses for the editor/panel chrome.
 */
export function Panel({ title, children, style, ...rest }: PanelProps) {
  return (
    <div {...rest} {...stylex.props(s.shell, style)}>
      {title != null ? <div {...stylex.props(s.header)}>{title}</div> : null}
      <div {...stylex.props(s.body)}>{children}</div>
    </div>
  )
}
