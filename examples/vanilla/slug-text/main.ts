import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { SlugFont, SlugText } from '@three-flatland/slug'

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

const status = document.getElementById('status')!

function log(msg: string) {
  status.textContent = msg
  console.log('[slug-text]', msg)
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
    1000,
  )
  camera.position.z = 100

  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  log('Initializing WebGPU renderer...')
  await renderer.init()

  // Load font — bundled TTF in public/
  log('Loading font...')
  const fontUrl = import.meta.env.BASE_URL + 'Inter-Regular.ttf'
  let font: SlugFont

  try {
    font = await SlugFont.fromURL(fontUrl)
    log(`Font loaded: ${font.glyphs.size} glyphs, unitsPerEm=${font.unitsPerEm}`)
  } catch (err) {
    log(`Font load failed: ${err}`)
    console.error(err)
    return
  }

  // Create text object
  let fontSize = 48
  const slugText = new SlugText({
    font,
    text: 'Hello, Slug!',
    fontSize,
    color: 0xffffff,
    align: 'center',
  })
  slugText.setViewportSize(window.innerWidth, window.innerHeight)
  scene.add(slugText)
  slugText.update()

  log(`Rendering: ${slugText.count} glyph instances`)

  // Wire up font size radio
  const radioGroup = document.querySelector('wa-radio-group')!
  setupWrappingGroup(radioGroup, 'wa-radio')
  radioGroup.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value
    fontSize = parseInt(value, 10)
    slugText.fontSize = fontSize
    slugText.update()
    log(`Font size: ${fontSize}px, ${slugText.count} glyphs`)
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
    slugText.setViewportSize(window.innerWidth, window.innerHeight)
  })

  // Render loop
  function animate() {
    requestAnimationFrame(animate)
    slugText.update(camera) // updates MVP for dilation + rebuilds if dirty
    renderer.render(scene, camera)
  }

  animate()
}

main()
