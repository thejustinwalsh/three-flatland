import type { ReactNode } from 'react'

export function Slide({ children }: { children: ReactNode }) {
  return (
    <section>
      <div style={{ maxWidth: '60rem', padding: '0 6vw' }}>{children}</div>
    </section>
  )
}
