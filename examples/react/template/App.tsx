import { Canvas, extend, useLoader } from '@react-three/fiber/webgpu'
import { useState, useRef, useEffect } from 'react'
import { Sprite2D, TextureLoader } from '@three-flatland/react'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'

extend({ Sprite2D })

const TINT_OPTIONS = [
  { value: 'white', label: 'White' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'pink', label: 'Pink' },
] as const

function SpriteScene({ tint }: { tint: string }) {
  const texture = useLoader(TextureLoader, import.meta.env.BASE_URL + 'icon.svg')
  const tintColor =
    tint === 'cyan' ? '#47cca9' : tint === 'pink' ? '#ff6b9d' : '#ffffff'

  return (
    <sprite2D
      texture={texture}
      tint={tintColor}
      anchor={[0.5, 0.5]}
      scale={[30, 30, 1]}
    />
  )
}

export default function App() {
  const [tint, setTint] = useState('white')
  const uiRef = useRef<HTMLDivElement>(null)

  // Per-line pill rounding for wrapped radio groups
  useEffect(() => {
    const group = uiRef.current?.querySelector('wa-radio-group')
    if (!group) return
    const update = () => {
      const radios = [...group.querySelectorAll('wa-radio')]
      if (!radios.length) return
      const lines: Element[][] = []
      let lastTop = -Infinity
      let line: Element[] = []
      for (const radio of radios) {
        const top = radio.getBoundingClientRect().top
        if (Math.abs(top - lastTop) > 2) {
          if (line.length) lines.push(line)
          line = []
          lastTop = top
        }
        line.push(radio)
      }
      if (line.length) lines.push(line)
      for (const ln of lines) {
        for (let i = 0; i < ln.length; i++) {
          const pos =
            ln.length === 1 ? 'solo' :
            i === 0 ? 'first' :
            i === ln.length - 1 ? 'last' : 'inner'
          ln[i]!.setAttribute('data-line-pos', pos)
        }
      }
    }
    const ro = new ResizeObserver(update)
    ro.observe(group)
    update()
    return () => ro.disconnect()
  }, [])

  return (
    <>
      <Canvas
        orthographic
        camera={{ zoom: 5, position: [0, 0, 100] }}
        renderer={{ antialias: true }}
      >
        <color attach="background" args={['#00021c']} />
        <SpriteScene tint={tint} />
      </Canvas>

      {/* UI Overlay */}
      <div
        ref={uiRef}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 100,
          pointerEvents: 'auto',
          padding: 10,
          background: 'rgba(0, 2, 28, 0.85)',
          borderRadius: 8,
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <WaRadioGroup
          label="Tint"
          size="small"
          orientation="horizontal"
          value={tint}
          onChange={(e: any) =>
            setTint((e.target as HTMLInputElement).value)
          }
        >
          {TINT_OPTIONS.map((opt) => (
            <WaRadio key={opt.value} value={opt.value} size="small" appearance="button">
              {opt.label}
            </WaRadio>
          ))}
        </WaRadioGroup>
      </div>
    </>
  )
}
