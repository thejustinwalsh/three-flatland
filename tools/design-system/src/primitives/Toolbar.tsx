import type { CSSProperties, HTMLAttributes } from 'react'
import { vscodeTokens as t } from '../tokens'

export type ToolbarProps = HTMLAttributes<HTMLDivElement>

const style: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  background: t.toolbarBg,
  borderBottom: `1px solid ${t.panelBorder}`,
  color: t.fg,
  fontFamily: t.fontFamily,
  fontSize: t.fontSize,
  flex: '0 0 auto',
}

export function Toolbar({ children, style: override, ...rest }: ToolbarProps) {
  return (
    <div {...rest} style={{ ...style, ...override }}>
      {children}
    </div>
  )
}
