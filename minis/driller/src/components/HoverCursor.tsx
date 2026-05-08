import { useEffect, useRef } from 'react'
import { useWorld } from 'koota/react'
import { Pointer } from '../traits'

/**
 * Custom DOM cursor that color-codes the action available at the current
 * hover cell. Desktop only (matches `@media (pointer: fine)`); mobile users
 * get the native touch cursor.
 *
 * - lavender = collect
 * - green    = brace
 * - red      = trigger
 * - gold     = pet
 * - white    = none
 */
export function HoverCursor() {
  const world = useWorld()
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const ptr = world.get(Pointer)
      const ring = ringRef.current
      if (ptr && ring) {
        ring.style.transform = `translate(${ptr.px}px, ${ptr.py}px)`
        ring.style.borderColor = colorFor(ptr.hoverAction)
        ring.style.opacity = ptr.hoverAction === 'none' ? '0.4' : '1'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world])

  return (
    <div
      ref={ringRef}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 18,
        height: 18,
        marginLeft: -9,
        marginTop: -9,
        borderRadius: '50%',
        border: '2px solid white',
        pointerEvents: 'none',
        zIndex: 1000,
        transition: 'border-color 80ms linear, opacity 80ms linear',
        mixBlendMode: 'difference',
      }}
    />
  )
}

function colorFor(action: string): string {
  switch (action) {
    case 'collect':
      return '#a78bfa'
    case 'brace':
      return '#34d399'
    case 'trigger':
      return '#f43f5e'
    case 'pet':
      return '#fcd34d'
    default:
      return '#ffffff'
  }
}
