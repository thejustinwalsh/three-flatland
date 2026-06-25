import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu'
import { RenderTarget } from 'three'
import 'animejs/adapters/three'
import { animate } from 'animejs'
import { Flatland } from 'three-flatland/react'

// Flatland renders its children (routed into its internal scene) to a RenderTarget;
// we present that texture on a quad in the perspective scene. This is the bridge
// that lets 2D flatland sizzles composite into the 3D deck with camera transitions.
extend({ Flatland, MeshBasicNodeMaterial })

// Sizzle content reads this to pause its own animation while off-screen.
const FlatlandActiveContext = createContext(true)
export function useFlatlandActive(): boolean {
  return useContext(FlatlandActiveContext)
}

type Props = {
  children: ReactNode
  /** Only render/animate this layer when active (its slide is in view). */
  active?: boolean
  /** Render-target resolution [w, h] (fixed aspect, square pixels). */
  resolution?: [number, number]
  /** Flatland ortho world height in world units (sprites are sized in texture px). */
  viewSize?: number
  clearColor?: number
  clearAlpha?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Quad height in world units; width follows the target aspect. */
  size?: number
}

export function FlatlandLayer({
  children,
  active = true,
  resolution = [1280, 720],
  viewSize = 400,
  clearColor = 0x111418,
  clearAlpha = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  size = 4,
}: Props) {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer
  const flatlandRef = useRef<Flatland>(null)
  const matRef = useRef<MeshBasicNodeMaterial>(null)
  const target = useMemo(() => {
    const t = new RenderTarget(resolution[0], resolution[1])
    // Render-target textures sample bottom-up; flip V so the panel reads upright.
    t.texture.repeat.y = -1
    t.texture.offset.y = 1
    return t
  }, [resolution[0], resolution[1]])

  // Render the flatland to its target each active frame; resize() locks the ortho
  // aspect to the target so pixels stay square. Inactive layers freeze (no cost).
  useFrame(() => {
    const fl = flatlandRef.current
    if (!fl || !active) return
    fl.resize(resolution[0], resolution[1])
    fl.render(gl)
  })

  // Fade the panel in/out on activation (no pop-in) via anime.js.
  useEffect(() => {
    const m = matRef.current
    if (!m) return
    const anim = animate(m, { opacity: active ? 1 : 0, duration: active ? 600 : 250, ease: 'outQuad' })
    return () => {
      anim.pause()
    }
  }, [active])

  const aspect = resolution[0] / resolution[1]
  return (
    <FlatlandActiveContext.Provider value={active}>
      <flatland ref={flatlandRef} renderTarget={target} viewSize={viewSize} clearColor={clearColor} clearAlpha={clearAlpha}>
        {children}
      </flatland>
      <mesh position={position} rotation={rotation}>
        <planeGeometry args={[size * aspect, size]} />
        <meshBasicNodeMaterial ref={matRef} map={target.texture} transparent opacity={0} toneMapped={false} />
      </mesh>
    </FlatlandActiveContext.Provider>
  )
}
