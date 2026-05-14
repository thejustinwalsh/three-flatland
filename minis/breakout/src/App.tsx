import { useState, useEffect, useRef } from 'react'
import { zzfx as zzfxPlay } from 'zzfx'
import MiniBreakout from './Game'
import type { PlaySoundFn, ZzFXParams } from './types'

/**
 * Standalone shell — the docs site doesn't render this; it renders
 * `MiniBreakout` directly and passes its own `zzfx` proxy. This file
 * only runs when the mini is launched on its own (e.g.,
 * `pnpm --filter=@three-flatland/mini-breakout dev:app`).
 *
 * Audio: we import `zzfx` from npm and wait for the first user gesture
 * before passing it to the game. ZzFX creates its own AudioContext at
 * import time which stays suspended until the gesture; the wrapper here
 * just gates `setZzfx` so the prop swaps from no-op to real once a
 * click/tap unlocks audio.
 */
export default function App() {
  const [zzfx, setZzfx] = useState<PlaySoundFn>(() => () => {})
  const initRef = useRef(false)

  useEffect(() => {
    const init = () => {
      if (initRef.current) return
      initRef.current = true
      setZzfx(() => (...params: ZzFXParams) => zzfxPlay(...params))
    }

    window.addEventListener('click', init, { once: true })
    window.addEventListener('touchstart', init, { once: true })

    return () => {
      window.removeEventListener('click', init)
      window.removeEventListener('touchstart', init)
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <MiniBreakout zzfx={zzfx} isVisible={true} showStats />
    </div>
  )
}
