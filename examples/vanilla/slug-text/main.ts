import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { SlugFontLoader, SlugText } from '@three-flatland/slug'

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

  // 1 unit = 1 pixel so fontSize matches CSS px
  const w = window.innerWidth
  const h = window.innerHeight
  const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 1000)
  camera.position.z = 100

  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  log('Initializing WebGPU renderer...')
  await renderer.init()

  const fontUrl = import.meta.env.BASE_URL + 'Inter-Regular.ttf'
  let fontSize = 48
  let forceRuntime = false

  // SlugText lives in the scene permanently; we swap its font when reloading
  const slugText = new SlugText({
    text: 'Hello, Slug!',
    fontSize,
    color: 0xffffff,
    align: 'center',
  })
  slugText.setViewportSize(window.innerWidth, window.innerHeight)
  scene.add(slugText)

  // HTML overlay positioning
  const htmlCompare = document.getElementById('html-compare')!
  function syncHtmlPosition(fs: number) {
    const font = slugText.font
    if (!font) return
    const baselineOffset = (font.ascender + font.descender) * 0.5 * fs
    htmlCompare.style.fontSize = `${fs}px`
    htmlCompare.style.top = `calc(50% - ${baselineOffset}px)`
  }
  // Load (or reload) the font
  async function loadFont() {
    log('Loading font...')
    SlugFontLoader.clearCache()
    const t0 = performance.now()
    const font = await SlugFontLoader.load(fontUrl, { forceRuntime })
    const ms = (performance.now() - t0).toFixed(0)
    slugText.font = font
    slugText.update()
    syncHtmlPosition(fontSize)
    const mode = forceRuntime ? 'Runtime gen' : 'Baked'
    log(`${mode}: ${font.glyphs.size} glyphs in ${ms}ms`)
  }

  await loadFont()

  // Toggle HTML overlay with checkbox or 'h' key
  const overlayCheck = document.getElementById('overlay-check') as HTMLInputElement
  function toggleOverlay() {
    htmlCompare.style.display = overlayCheck.checked ? '' : 'none'
  }
  overlayCheck.addEventListener('change', toggleOverlay)

  // Toggle force runtime with checkbox or 'r' key
  const runtimeCheck = document.getElementById('runtime-check') as HTMLInputElement
  function toggleRuntime() {
    forceRuntime = runtimeCheck.checked
    loadFont()
  }
  runtimeCheck.addEventListener('change', toggleRuntime)

  document.addEventListener('keydown', (e) => {
    if (e.key === 'h') {
      overlayCheck.checked = !overlayCheck.checked
      toggleOverlay()
    } else if (e.key === 'r') {
      runtimeCheck.checked = !runtimeCheck.checked
      toggleRuntime()
    }
  })

  // Wire up font size radio
  const radioGroup = document.querySelector('wa-radio-group')!
  setupWrappingGroup(radioGroup, 'wa-radio')
  radioGroup.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value
    fontSize = parseInt(value, 10)
    slugText.fontSize = fontSize
    slugText.update()
    syncHtmlPosition(fontSize)
    log(`Font size: ${fontSize}px, ${slugText.count} glyphs`)
  })

  // Resize
  window.addEventListener('resize', () => {
    const rw = window.innerWidth
    const rh = window.innerHeight
    camera.left = -rw / 2
    camera.right = rw / 2
    camera.top = rh / 2
    camera.bottom = -rh / 2
    camera.updateProjectionMatrix()
    renderer.setSize(rw, rh)
    slugText.setViewportSize(rw, rh)
  })

  // Render loop
  function animate() {
    requestAnimationFrame(animate)
    slugText.update(camera)
    renderer.render(scene, camera)
  }

  animate()
}

main()
