import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode
}

/**
 * Simple titled container using VSCode panel-area tokens. VSCode Elements
 * doesn't ship a generic "Panel" primitive, so this is hand-built against
 * the same tokens VSCode uses for the editor/panel chrome.
 */
const shellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: 'var(--vscode-editor-background)',
  color: 'var(--vscode-foreground)',
  border: '1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border, transparent))',
  borderRadius: 2,
}

const headerStyle: CSSProperties = {
  padding: '4px 10px',
  borderBottom: '1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border, transparent))',
  fontFamily: 'var(--vscode-font-family)',
  fontSize: '11px',
  color: 'var(--vscode-panelTitle-activeForeground, var(--vscode-foreground))',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  background: 'var(--vscode-panel-background, var(--vscode-editor-background))',
}

const bodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: 8,
}

export function Panel({ title, children, style, ...rest }: PanelProps) {
  return (
    <div {...rest} style={{ ...shellStyle, ...style }}>
      {title != null ? <div style={headerStyle}>{title}</div> : null}
      <div style={bodyStyle}>{children}</div>
    </div>
  )
}
