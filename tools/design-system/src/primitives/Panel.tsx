import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { vscodeTokens as t } from '../tokens'

export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode
}

const shellStyle: CSSProperties = {
  background: t.panelBg,
  color: t.fg,
  border: `1px solid ${t.panelBorder}`,
  borderRadius: 2,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
}

const headerStyle: CSSProperties = {
  padding: '4px 8px',
  borderBottom: `1px solid ${t.panelBorder}`,
  fontSize: t.fontSize,
  fontFamily: t.fontFamily,
  color: t.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const bodyStyle: CSSProperties = {
  padding: 8,
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}

export function Panel({ title, children, style, ...rest }: PanelProps) {
  return (
    <div {...rest} style={{ ...shellStyle, ...style }}>
      {title != null ? <div style={headerStyle}>{title}</div> : null}
      <div style={bodyStyle}>{children}</div>
    </div>
  )
}
