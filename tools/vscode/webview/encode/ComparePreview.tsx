import { useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  fill: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 24, opacity: 0.6 },
})

interface ComparePreviewProps {
  originalImage: ImageData | null
  encodeError: string | null
}

function imageDataToTexture(image: ImageData): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = image.width
  c.height = image.height
  c.getContext('2d')!.putImageData(image, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

function FittedQuad({ texture }: { texture: THREE.Texture }) {
  // Unit-square plane filling the full canvas — CSS aspect-ratio handles fit.
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

export function ComparePreview({ originalImage, encodeError }: ComparePreviewProps) {
  const original = useMemo(
    () => (originalImage ? imageDataToTexture(originalImage) : null),
    [originalImage],
  )
  useEffect(
    () => () => {
      original?.dispose()
    },
    [original],
  )

  if (!original || !originalImage) {
    return (
      <div {...stylex.props(styles.empty)}>
        {encodeError ? `error: ${encodeError}` : 'loading…'}
      </div>
    )
  }

  const w = originalImage.width
  const h = originalImage.height

  return (
    <div
      {...stylex.props(styles.fill)}
    >
      <div
        style={{
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          aspectRatio: `${w} / ${h}`,
          flex: '0 1 auto',
          alignSelf: 'center',
        }}
      >
        <Canvas
          orthographic
          camera={{ position: [0, 0, 1], near: 0.01, far: 10 }}
          dpr={[1, 2]}
          gl={{ antialias: false, alpha: false, preserveDrawingBuffer: false }}
          flat
          style={{ display: 'block', width: '100%', height: '100%' }}
        >
          <FittedQuad texture={original} />
        </Canvas>
      </div>
    </div>
  )
}
