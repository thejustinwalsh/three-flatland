import type { ReactNode } from 'react'

export function Subline({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '1.5rem 0 0',
        font: "400 clamp(1.1rem, 2.6vw, 1.8rem)/1.3 'Public Sans', system-ui, sans-serif",
        color: 'rgba(255,255,255,0.78)',
      }}
    >
      {children}
    </p>
  )
}
