import type { ReactNode } from 'react'

export function Credit({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        position: 'absolute',
        left: '6vw',
        bottom: '3vh',
        margin: 0,
        font: '400 0.7rem/1.3 Inter, system-ui, sans-serif',
        color: 'rgba(255,255,255,0.45)',
        maxWidth: '40rem',
      }}
    >
      {children}
    </p>
  )
}
