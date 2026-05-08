import { useEffect, useRef } from 'react'
import { useWorld } from 'koota/react'
import { Camera } from '../traits'

/**
 * Decorative parallax background. Lives outside the play canvas and fills
 * the entire host element. Two CSS layers scroll at different speeds with
 * the camera Y for a sense of depth.
 *
 * No simulation runs here; this layer is purely cosmetic.
 */
export function Background() {
  const world = useWorld()
  const farRef = useRef<HTMLDivElement>(null)
  const nearRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const cam = world.get(Camera)
      if (cam && farRef.current && nearRef.current) {
        farRef.current.style.transform = `translateY(${-cam.y * 0.2}px)`
        nearRef.current.style.transform = `translateY(${-cam.y * 0.5}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world])

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <div
        ref={farRef}
        style={{
          position: 'absolute',
          inset: '-10% 0',
          background: 'linear-gradient(180deg, #0a0a14 0%, #1a1411 30%, #2a1f15 60%, #3a2a1a 100%)',
          willChange: 'transform',
        }}
      />
      <div
        ref={nearRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '-10%',
          height: '60%',
          background: 'linear-gradient(180deg, transparent, rgba(60, 40, 40, 0.3))',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
