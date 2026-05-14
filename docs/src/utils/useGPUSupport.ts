import { useEffect, useState } from 'react'

/**
 * Detects whether the current browser supports WebGPU or WebGL2.
 * SSR-safe — returns `null` during the initial render and resolves on mount.
 *
 * Components gating on GPU support should:
 *   const gpu = useGPUSupport()
 *   if (gpu === null) return null              // pre-mount; render nothing
 *   if (gpu === false) return <FallbackUI />   // unsupported; show explanation
 *   return <GPUComponent />                    // supported
 */
export function useGPUSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const c = document.createElement('canvas')
      setSupported(Boolean(c.getContext('webgpu') || c.getContext('webgl2')))
    } catch {
      setSupported(false)
    }
  }, [])

  return supported
}
