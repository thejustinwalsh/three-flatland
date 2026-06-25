import type { ReactNode } from 'react'

export function Headline({ children }: { children: ReactNode }) {
  return (
    <h1
      style={{
        margin: 0,
        font: "700 clamp(2.5rem, 8vw, 6rem)/1.02 'Public Sans', system-ui, sans-serif",
        letterSpacing: '-0.02em',
      }}
    >
      {children}
    </h1>
  )
}
