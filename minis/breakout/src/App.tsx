import { useState, useEffect, useRef } from 'react'
import MiniBreakout from './Game'
import type { PlaySoundFn, ZzFXParams } from './types'

// Simple inline ZzFX implementation for standalone dev mode
// Based on https://github.com/KilledByAPixel/ZzFX
function createZzfx(): PlaySoundFn {
  let audioContext: AudioContext | null = null

  return (...params: ZzFXParams) => {
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    const [
      volume = 1,
      randomness = 0.05,
      frequency = 220,
      attack = 0,
      sustain = 0,
      release = 0.1,
      shape = 0,
      shapeCurve = 1,
      slide = 0,
      deltaSlide = 0,
      pitchJump = 0,
      pitchJumpTime = 0,
      repeatTime = 0,
      noise = 0,
    ] = params

    const sampleRate = audioContext.sampleRate
    const PI2 = Math.PI * 2

    const startFrequency = frequency * (1 + randomness * 2 * (Math.random() - 0.5))
    const startSlide = slide * (1 + randomness * 2 * (Math.random() - 0.5))

    const duration = attack + sustain + release
    const length = (duration * sampleRate) | 0

    if (length <= 0) return

    const buffer = audioContext.createBuffer(1, length, sampleRate)
    const data = buffer.getChannelData(0)

    let f = startFrequency
    let t = 0
    let j = 1
    let r = 0
    let d = 1
    const attackTime = attack * sampleRate
    const sustainTime = (attack + sustain) * sampleRate
    const releaseTime = (attack + sustain + release) * sampleRate

    for (let i = 0; i < length; i++) {
      if (i < attackTime) {
        d = i / attackTime
      } else if (i < sustainTime) {
        d = 1
      } else if (i < releaseTime) {
        d = 1 - (i - sustainTime) / (release * sampleRate)
      } else {
        d = 0
      }

      f += startSlide + deltaSlide

      if (pitchJump && ++j > pitchJumpTime * sampleRate) {
        f += pitchJump
        j = 0
      }

      if (repeatTime && ++r > repeatTime * sampleRate) {
        f = startFrequency
        r = 0
      }

      t += f * PI2 / sampleRate

      let sample = 0
      if (shape === 0) {
        sample = Math.sin(t)
      } else if (shape === 1) {
        sample = Math.sin(t) > 0 ? 1 : -1
      } else if (shape === 2) {
        sample = (t / PI2) % 1 * 2 - 1
      } else if (shape === 3) {
        sample = 1 - Math.abs((t / PI2) % 1 * 2 - 1) * 2
      } else if (shape === 4) {
        sample = Math.random() * 2 - 1
      }

      if (shapeCurve !== 1) {
        sample = Math.sign(sample) * Math.pow(Math.abs(sample), shapeCurve)
      }

      if (noise) {
        sample += noise * (Math.random() * 2 - 1)
      }

      data[i] = sample * d * volume * 0.3 // Master volume
    }

    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    source.start()
  }
}

export default function App() {
  const [zzfx, setZzfx] = useState<PlaySoundFn>(() => () => {})
  const initRef = useRef(false)

  useEffect(() => {
    const init = () => {
      if (initRef.current) return
      initRef.current = true
      setZzfx(() => createZzfx())
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
