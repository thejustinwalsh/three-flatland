import { Canvas, extend, useLoader } from '@react-three/fiber/webgpu'
import { useState } from 'react'
import { Sprite2D, TextureLoader } from '@three-flatland/react'

import '@shoelace-style/shoelace/dist/themes/dark.css'
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js'
import SlRadioGroup from '@shoelace-style/shoelace/dist/react/radio-group/index.js'
import SlRadioButton from '@shoelace-style/shoelace/dist/react/radio-button/index.js'

setBasePath('https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/')

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
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 100,
          pointerEvents: 'auto',
          padding: 10,
          background: 'rgba(0, 2, 28, 0.85)',
          borderRadius: 8,
          '--sl-input-height-small': '1.5rem',
          '--sl-font-size-small': '0.688rem',
          '--sl-font-size-medium': '0.75rem',
          '--sl-input-label-font-size-medium': '0.75rem',
        } as React.CSSProperties}
      >
        <SlRadioGroup
          label="Tint"
          size="small"
          value={tint}
          onSlChange={(e: Event) =>
            setTint((e.target as HTMLInputElement).value)
          }
        >
          {TINT_OPTIONS.map((opt) => (
            <SlRadioButton key={opt.value} value={opt.value} size="small">
              {opt.label}
            </SlRadioButton>
          ))}
        </SlRadioGroup>
      </div>
    </>
  )
}
