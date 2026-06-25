import type { ReactNode } from 'react'

export type Gem = 'gold' | 'ruby' | 'emerald' | 'diamond' | 'amethyst'

export function Eyebrow({ children, gem = 'emerald' }: { children: ReactNode; gem?: Gem }) {
  return (
    <p
      style={{
        margin: '0 0 1rem',
        font: '600 0.9rem/1 Inter, system-ui, sans-serif',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: `var(--${gem})`,
      }}
    >
      {children}
    </p>
  )
}
