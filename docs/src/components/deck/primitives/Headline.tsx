import type { ReactNode } from 'react'

// `hero` is the oversized title treatment — used only on the opening slide.
export function Headline({ children, hero = false }: { children: ReactNode; hero?: boolean }) {
  return (
    <h1
      style={{
        margin: 0,
        font: hero
          ? "800 clamp(3rem, 11vw, 8.5rem)/0.96 'Public Sans', system-ui, sans-serif"
          : "700 clamp(2.5rem, 8vw, 6rem)/1.02 'Public Sans', system-ui, sans-serif",
        letterSpacing: hero ? '-0.04em' : '-0.02em',
      }}
    >
      {children}
    </h1>
  )
}
