import type { ReactElement } from 'react'

/** Native R3F Canvas fallback after every renderer backend fails. */
export function ExampleFallback(): ReactElement {
  return (
    <div
      role="status"
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        color: '#f4f7fb',
      }}
    >
      This example could not initialize rendering.
    </div>
  )
}
