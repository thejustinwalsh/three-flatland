import type { ReactNode } from 'react'

// reveal.js vertically centers the section (config `center: true`); keep this
// wrapper simple so that centering stays viewport-height independent.
export function Slide({ children }: { children: ReactNode }) {
  return (
    <section>
      <div style={{ maxWidth: '60rem', padding: '0 6vw' }}>{children}</div>
    </section>
  )
}
