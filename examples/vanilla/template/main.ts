import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland'
import { createPane } from '@three-flatland/tweakpane'

async function main() {
  const scene = new Scene()
  scene.background = new Color(0x00021c)

  const frustumSize = 400
  const aspect = window.innerWidth / window.innerHeight
  const camera = new OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    1000
  )
  camera.position.z = 100

  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  const texture = await TextureLoader.load(import.meta.env.BASE_URL + 'icon.svg')

  const sprite = new Sprite2D({
    texture,
    anchor: [0.5, 0.5],
  })
  sprite.scale.set(150, 150, 1)
  scene.add(sprite)

  // Tweakpane UI
  const { pane, fpsGraph } = createPane()
  const params = { tint: '#ffffff' }
  pane.addBinding(params, 'tint', {
    label: 'tint',
    options: { White: '#ffffff', Cyan: '#47cca9', Pink: '#ff6b9d' },
  }).on('change', (ev) => {
    sprite.tint.set(ev.value)
  })

  // Resize
  window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight
    camera.left = (-frustumSize * aspect) / 2
    camera.right = (frustumSize * aspect) / 2
    camera.top = frustumSize / 2
    camera.bottom = -frustumSize / 2
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // Render loop
  function animate() {
    requestAnimationFrame(animate)
    fpsGraph?.begin()
    renderer.render(scene, camera)
    fpsGraph?.end()
  }

  animate()
}

main()
