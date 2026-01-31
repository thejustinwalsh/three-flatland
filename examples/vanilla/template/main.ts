import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { Sprite2D, TextureLoader } from '@three-flatland/core'

import '@shoelace-style/shoelace/dist/themes/dark.css'
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js'
import '@shoelace-style/shoelace/dist/components/radio-group/radio-group.js'
import '@shoelace-style/shoelace/dist/components/radio-button/radio-button.js'

setBasePath('https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/')

const TINT_COLORS: Record<string, number> = {
  white: 0xffffff,
  cyan: 0x47cca9,
  pink: 0xff6b9d,
}

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

  // Wire up Shoelace UI
  const radioGroup = document.querySelector('sl-radio-group')!
  radioGroup.addEventListener('sl-change', (e) => {
    const value = (e.target as HTMLInputElement).value
    sprite.tint = new Color(TINT_COLORS[value] ?? 0xffffff)
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
    renderer.render(scene, camera)
  }

  animate()
}

main()
