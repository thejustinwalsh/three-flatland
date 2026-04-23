import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import { vscodeTokens as t } from '../tokens'

type Variant = 'primary' | 'secondary'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

const baseStyle: CSSProperties = {
  background: t.btnBg,
  color: t.btnFg,
  border: `1px solid ${t.btnBorder}`,
  padding: '4px 11px',
  fontFamily: t.fontFamily,
  fontSize: t.fontSize,
  cursor: 'pointer',
  borderRadius: 2,
  lineHeight: '18px',
}

const secondaryStyle: CSSProperties = {
  ...baseStyle,
  background: 'transparent',
  color: t.fg,
  border: `1px solid ${t.border}`,
}

export function Button({ variant = 'primary', style, ...rest }: ButtonProps) {
  const composed = { ...(variant === 'secondary' ? secondaryStyle : baseStyle), ...style }
  return <button {...rest} style={composed} />
}
