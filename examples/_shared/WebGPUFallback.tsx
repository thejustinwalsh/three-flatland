export function WebGPUFallback() {
  return (
    <div
      role="note"
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        textAlign: 'center',
        color: 'inherit',
      }}
    >
      This example requires WebGPU.
    </div>
  )
}
