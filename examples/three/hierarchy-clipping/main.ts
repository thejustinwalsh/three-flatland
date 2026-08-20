import { WebGPURenderer } from 'three/webgpu'
import { DataTexture, Group, NearestFilter, OrthographicCamera, RGBAFormat, Scene } from 'three'
import { Sprite2D, SpriteGroup } from 'three-flatland'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

const palette = [0x55, 0xd6, 0xbe, 0xff, 0xb4, 0x8e, 0xff, 0xff, 0xff, 0xc8, 0x57, 0xff, 0xff, 0x73, 0xa8, 0xff]
const texture = new DataTexture(new Uint8Array(palette), 4, 1, RGBAFormat)
texture.magFilter = NearestFilter
texture.needsUpdate = true

const scene = new Scene()
const sceneWithBackground = scene as unknown as { backgroundNode: unknown }
sceneWithBackground.backgroundNode = gemGradientNode({ gem: GEM })
const camera = new OrthographicCamera(-240, 240, 160, -160, 0.1, 1000)
camera.position.z = 100

const viewport = new SpriteGroup({ clipRect: [-120, -80, 240, 160] })
viewport.rotation.z = -0.08
scene.add(viewport)

/** Create one retained hierarchy of batched palette sprites. */
function makeView(): Group {
  const host = new Group()
  for (let i = 0; i < 36; i++) {
    const frameIndex = i % 4
    const sprite = new Sprite2D({ texture, anchor: [0.5, 0.5] })
    sprite.position.set((i % 6) * 42 - 105, Math.floor(i / 6) * 42 - 105, 0)
    sprite.scale.set(34, 34, 1)
    sprite.setFrame({
      name: String(i),
      x: frameIndex / 4,
      y: 0,
      width: 1 / 4,
      height: 1,
      sourceWidth: 1,
      sourceHeight: 1,
    })
    host.add(sprite)
  }
  return host
}

const firstView = makeView()
const secondView = makeView()
secondView.rotation.z = Math.PI / 4
secondView.visible = false
viewport.add(firstView, secondView)

const renderer = new WebGPURenderer({ antialias: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)
await renderer.init()

let active = 0
let lastSwap = performance.now()
let raf = 0
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)')

/** Animate hierarchy visibility and transforms before rendering each frame. */
function frame(now: number) {
  raf = requestAnimationFrame(frame)
  if (!motionPreference.matches) {
    if (now - lastSwap > 2200) {
      active = 1 - active
      firstView.visible = active === 0
      secondView.visible = active === 1
      lastSwap = now
    }
    const view = active === 0 ? firstView : secondView
    view.position.y = Math.sin(now * 0.001) * 55
  }
  renderer.render(scene, camera)
}
resize()
frame(performance.now())

/** Keep the orthographic camera and renderer fitted to the viewport. */
function resize() {
  const aspect = innerWidth / innerHeight
  camera.left = -160 * aspect
  camera.right = 160 * aspect
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
}
addEventListener('resize', resize)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(raf)
    removeEventListener('resize', resize)
    viewport.dispose()
    texture.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  })
}
