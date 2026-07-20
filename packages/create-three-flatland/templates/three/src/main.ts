import { WebGPURenderer } from 'three/webgpu'
import { Color, Raycaster, Vector2 } from 'three'
import { Flatland, Sprite2D, TextureLoader } from 'three-flatland'

/* HMR teardown state — without this, every dev save stacks another
 * renderer + animation loop. Dev-only: `import.meta.hot` is undefined in prod. */
let rafId = 0
let activeRenderer: WebGPURenderer | null = null

async function main() {
  const container = document.querySelector<HTMLDivElement>('#app')!

  // Flatland is the front door: it owns the orthographic camera,
  // sprite batching, resize, and disposal.
  const flatland = new Flatland({ viewSize: 400, clearColor: 0x16191e })

  // Always WebGPURenderer — it selects the backend itself (WebGPU where
  // supported, WebGL2 fallback where not). Never construct WebGLRenderer.
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  container.appendChild(renderer.domElement)

  await renderer.init()
  const texture = await TextureLoader.load('/sprite.svg')

  // Renderer + texture ready — drop the loading overlay.
  document.querySelector('#loader')?.remove()

  const sprite = new Sprite2D({ texture, anchor: [0.5, 0.5] })
  sprite.scale.set(150, 150, 1)
  flatland.add(sprite)

  // Pointer interactivity — a standard three.js Raycaster. Sprite2D
  // implements raycast() (see hitTestMode for radius/bounds/alpha/none).
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let hovered = false
  let pressed = false

  renderer.domElement.addEventListener('pointermove', (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, flatland.camera)
    hovered = raycaster.intersectObject(sprite).length > 0
  })
  renderer.domElement.addEventListener('pointerdown', () => {
    pressed = hovered
  })
  window.addEventListener('pointerup', () => {
    pressed = false
  })

  document.querySelector('#fullscreen')?.addEventListener('click', () => {
    void container.requestFullscreen()
  })

  const resize = () => {
    flatland.resize(container.clientWidth, container.clientHeight)
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', resize)
  resize()

  const idleTint = new Color(0xffffff)
  const hoverTint = new Color(0x47cca9)

  function animate() {
    rafId = requestAnimationFrame(animate)
    sprite.rotation.z += 0.005
    const target = pressed ? 130 : hovered ? 170 : 150
    const next = sprite.scale.x + (target - sprite.scale.x) * 0.15
    sprite.scale.set(next, next, 1)
    sprite.tint.lerp(hovered ? hoverTint : idleTint, 0.15)
    flatland.render(renderer)
  }
  animate()
}

void main()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (activeRenderer) {
      activeRenderer.dispose?.()
      activeRenderer.domElement.remove()
      activeRenderer = null
    }
  })
}
