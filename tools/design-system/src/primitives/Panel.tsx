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
    minWidth: 0,
    backgroundColor: vscode.bg,
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.sm,
    // Clip overflowing children to the panel rect so a scrolling body
    // doesn't draw past the rounded corners or bleed into adjacent grid
    // rows when this panel sits in a CSS grid (e.g. the Atlas sidebar
    // splitter layout).
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
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
  headerTitle: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerActions: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: space.lg,
    // Body owns the scroll for any overflowing content. Without this,
    // tall content (stacked collapsibles, long frame lists) overflows the
    // panel rect into adjacent grid rows / overlays. Use both axes — long
    // names without word-breaks would otherwise force horizontal overflow.
    overflow: 'auto',
  },
})

export type PanelProps = Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'className'> & {
  title?: ReactNode
  /**
   * Optional content rendered at the right edge of the title bar
   * (e.g. a hamburger menu, a small toolbar). The header is always
   * rendered when this is provided, even if `title` is empty.
   */
  headerActions?: ReactNode
  style?: StyleXStyles
}

/**
 * Simple titled container using VSCode panel-area tokens. VSCode Elements
 * doesn't ship a generic "Panel" primitive, so this is hand-built against
 * the same tokens VSCode uses for the editor/panel chrome.
 */
export function Panel({ title, headerActions, children, style, ...rest }: PanelProps) {
  const showHeader = title != null || headerActions != null
  return (
    <div {...rest} {...stylex.props(s.shell, style)}>
      {showHeader ? (
        <div {...stylex.props(s.header)}>
          <span {...stylex.props(s.headerTitle)}>{title}</span>
          {headerActions != null ? (
            <span {...stylex.props(s.headerActions)}>{headerActions}</span>
          ) : null}
        </div>
      ) : null}
      <div {...stylex.props(s.body)}>{children}</div>
    </div>
  )
}
