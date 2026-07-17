import { useEffect, useState } from 'react'
import { zzfx as zzfxPlay } from 'zzfx'
import Driller from './Game'
import type { PlaySoundFn, ZzFXParams } from './types'

/**
 * Read `?mode=hero|full` from the URL. Default = hero (infinite,
 * no title attract, no leaderboard) so the dev page boots straight
 * into the loop. Pass `?mode=full` to test the title attract +
 * 3-life leaderboard flow.
 */
function readModeFromUrl(): 'hero' | 'full' {
  if (typeof window === 'undefined') return 'hero'
  const m = new URLSearchParams(window.location.search).get('mode')
  return m === 'full' ? 'full' : 'hero'
}

export default function App() {
  const [zzfx, setZzfx] = useState<PlaySoundFn>(() => () => {})
  const mode = readModeFromUrl()

  useEffect(() => {
    let initialized = false
    const init = () => {
      if (initialized) return
      initialized = true
      setZzfx(
        () =>
          (...params: ZzFXParams) =>
            zzfxPlay(...params)
      )
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
      <Driller mode={mode} zzfx={zzfx} isVisible />
    </div>
  )
}
