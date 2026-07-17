import type { ReactNode } from 'react'

// `hero` is the oversized opening-title treatment; `small` is a slightly reduced
// size for longer headlines that would otherwise crowd the slide.
export function Headline({
  children,
  hero = false,
  small = false,
}: {
  children: ReactNode
  hero?: boolean
  small?: boolean
}) {
  const font = hero
    ? "800 clamp(3rem, 11vw, 8.5rem)/0.96 'Public Sans', system-ui, sans-serif"
    : small
      ? "700 clamp(2rem, 6.2vw, 4.6rem)/1.04 'Public Sans', system-ui, sans-serif"
      : "700 clamp(2.5rem, 8vw, 6rem)/1.02 'Public Sans', system-ui, sans-serif"
  return <h1 style={{ margin: 0, font, letterSpacing: hero ? '-0.04em' : '-0.02em' }}>{children}</h1>
}
