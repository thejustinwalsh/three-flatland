/**
 * Visible DOM fallback for R3F v10 when neither WebGPU nor its WebGL 2
 * fallback can initialize. Keeping this non-null is significant: R3F alpha.3
 * rethrows renderer setup failures when no Canvas fallback is provided.
 */
export function RendererFallback() {
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      WebGPU preview unavailable.
    </div>
  )
}
