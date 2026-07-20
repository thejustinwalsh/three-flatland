import { WebGPURenderer } from 'three/webgpu'
import { Color, Raycaster, Vector2 } from 'three'
import { Flatland, Sprite2D, TextureLoader } from 'three-flatland'
// Pure scene maths, extracted so it can be unit-tested without a GPU.
// See src/interaction.test.ts — `npm run test`.
import { approach, SPRITE_SCALE, targetScale, toPointerNdc } from './interaction'

/* HMR teardown state — without this, every dev save stacks another
 * renderer + animation loop. Dev-only: `import.meta.hot` is undefined in prod. */
let rafId = 0
let activeRenderer: WebGPURenderer | null = null
let activeFlatland: Flatland | null = null
/* Every listener registered this run, so HMR can remove them all. Anonymous
 * callbacks can't be removed, so each dev save would otherwise stack another
 * closure over an already-disposed renderer and call setSize on it. */
const listeners: Array<() => void> = []

function on<T extends EventTarget>(target: T, type: string, handler: EventListener): void {
  target.addEventListener(type, handler)
  listeners.push(() => target.removeEventListener(type, handler))
}

async function main() {
  const container = document.querySelector<HTMLDivElement>('#app')!

  // Flatland is the front door: it owns the orthographic camera,
  // sprite batching, resize, and disposal.
  const flatland = new Flatland({ viewSize: 400, clearColor: 0x16191e })

  // Always WebGPURenderer — it selects the backend itself (WebGPU where
  // supported, WebGL2 fallback where not). Never construct WebGLRenderer.
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  activeFlatland = flatland
  container.appendChild(renderer.domElement)

  await renderer.init()
  const texture = await TextureLoader.load(`${import.meta.env.BASE_URL}sprite.svg`)

  // Renderer + texture ready — drop the loading overlay.
  document.querySelector('#loader')?.remove()

  const sprite = new Sprite2D({ texture, anchor: [0.5, 0.5] })
  sprite.scale.set(SPRITE_SCALE.idle, SPRITE_SCALE.idle, 1)
  flatland.add(sprite)

  // Pointer interactivity — a standard three.js Raycaster. Sprite2D
  // implements raycast() (see hitTestMode for radius/bounds/alpha/none).
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let hovered = false
  let pressed = false

  on(renderer.domElement, 'pointermove', ((event: PointerEvent) => {
    const ndc = toPointerNdc(event.clientX, event.clientY, renderer.domElement.getBoundingClientRect())
    pointer.set(ndc.x, ndc.y)
    raycaster.setFromCamera(pointer, flatland.camera)
    hovered = raycaster.intersectObject(sprite).length > 0
  }) as EventListener)
  on(renderer.domElement, 'pointerdown', () => {
    pressed = hovered
  })
  on(window, 'pointerup', () => {
    pressed = false
  })

  // Fullscreen. `data-fullscreen` drives the icon swap from CSS, and it is set
  // from `fullscreenchange` rather than on click so it stays correct when the
  // browser exits on its own. Safari does not wire Esc to exitFullscreen.
  const fullscreenBtn = document.querySelector('#fullscreen')
  if (fullscreenBtn) {
    const syncFullscreen = () => {
      const active = document.fullscreenElement !== null
      fullscreenBtn.setAttribute('data-fullscreen', String(active))
      fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen')
    }
    on(fullscreenBtn, 'click', () => {
      if (document.fullscreenElement) void document.exitFullscreen()
      else void container.requestFullscreen()
    })
    on(document, 'fullscreenchange', syncFullscreen)
    on(document, 'keydown', ((event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.fullscreenElement) void document.exitFullscreen()
    }) as EventListener)
    syncFullscreen()
  }

  const resize = () => {
    flatland.resize(container.clientWidth, container.clientHeight)
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  on(window, 'resize', resize)
  resize()

  const idleTint = new Color(0xffffff)
  const hoverTint = new Color(0x47cca9)

  function animate() {
    rafId = requestAnimationFrame(animate)
    sprite.rotation.z += 0.005
    const next = approach(sprite.scale.x, targetScale({ hovered, pressed }))
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
    for (const off of listeners.splice(0)) off()
    activeFlatland?.dispose()
    activeFlatland = null
    if (activeRenderer) {
      activeRenderer.dispose?.()
      activeRenderer.domElement.remove()
      activeRenderer = null
    }
  })
}
