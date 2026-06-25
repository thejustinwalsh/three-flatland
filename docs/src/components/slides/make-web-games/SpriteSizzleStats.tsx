import { useEffect, useRef } from 'react'
import { animate } from 'animejs'
import { Headline, Subline } from '../../deck/primitives'
import { getSizzleStats } from './sizzleStats'

// The slide itself is the live readout: the title animates the sprite count up
// toward the real value (anime.js), and the subtitle shows live FPS. Polls the
// stats bridge via rAF — no React re-renders.
export function SpriteSizzleStats() {
  const countRef = useRef<HTMLSpanElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    let anim: { pause: () => void } | null = null
    let lastTarget = -1
    const disp = { v: 0 }
    const tick = () => {
      const { spriteCount, fps } = getSizzleStats()
      if (fpsRef.current) fpsRef.current.textContent = String(Math.max(0, Math.round(fps)))
      // Health tint: gem green at >=60fps, lerping toward gem orange by 30fps.
      const health = Math.max(0, Math.min(1, (fps - 30) / 30))
      const hue = 40 + health * 125 // 40 (orange) → 165 (emerald)
      if (countRef.current) countRef.current.style.color = `oklch(74% 0.17 ${hue.toFixed(1)})`
      if (spriteCount !== lastTarget) {
        lastTarget = spriteCount
        anim?.pause()
        anim = animate(disp, {
          v: spriteCount,
          duration: 700,
          ease: 'outQuad',
          onUpdate: () => {
            if (countRef.current) countRef.current.textContent = Math.round(disp.v).toLocaleString()
          },
        })
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      anim?.pause()
    }
  }, [])

  return (
    <>
      <Headline>
        <span style={{ whiteSpace: 'nowrap' }}>
          <span
            ref={countRef}
            style={{ display: 'inline-block', minWidth: '6.2ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          >
            0
          </span>{' '}
          sprites
        </span>
      </Headline>
      <Subline>
        Automatic, ECS-driven batching · one draw call · FPS:{' '}
        <span style={{ display: 'inline-block', minWidth: '2ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          <span ref={fpsRef}>0</span>
        </span>
      </Subline>
    </>
  )
}
