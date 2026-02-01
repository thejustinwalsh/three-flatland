import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { Sprite2D, TextureLoader } from '@three-flatland/core'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js'
import '@awesome.me/webawesome/dist/components/radio/radio.js'

/** Re-apply per-line first/last pill rounding when a flex container wraps */
function setupWrappingGroup(container: Element, childSelector: string) {
  const update = () => {
    const children = [...container.querySelectorAll(childSelector)]
    if (!children.length) return
    const lines: Element[][] = []
    let lastTop = -Infinity
    let line: Element[] = []
    for (const child of children) {
      const top = child.getBoundingClientRect().top
      if (Math.abs(top - lastTop) > 2) {
        if (line.length) lines.push(line)
        line = []
        lastTop = top
      }
      line.push(child)
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
  ro.observe(container)
  update()
  return () => ro.disconnect()
}

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

  // Wire up Web Awesome UI
  const radioGroup = document.querySelector('wa-radio-group')!
  setupWrappingGroup(radioGroup, 'wa-radio')
  radioGroup.addEventListener('change', (e) => {
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
