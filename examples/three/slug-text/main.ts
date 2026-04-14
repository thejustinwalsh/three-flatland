import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { SlugFontLoader, SlugText } from '@three-flatland/slug'
import type { SlugFont } from '@three-flatland/slug'
import { createPane } from '@three-flatland/tweakpane'

// --- Lorem ipsum generator ---

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
const LOREM_WORDS = LOREM.split(' ')

function getLoremText(wordCount: number): string {
  const words: string[] = []
  for (let i = 0; i < wordCount; i++) {
    words.push(LOREM_WORDS[i % LOREM_WORDS.length]!)
  }
  return words.join(' ')
}

type CompareMode = 'onion' | 'diff' | 'split'

// --- Canvas2D text rendering ---

/**
 * Draw Canvas2D comparison text.
 * - 'onion': red semi-transparent text, no background (overlays Slug)
 * - 'split': white text on dark background (occludes Slug)
 * - 'diff': white text on dark background (used to compute diff)
 *
 * Line wrapping comes from `font.wrapText` so line breaks are identical to
 * Slug's shaped output — browser hinting at medium font sizes can shrink
 * `ctx.measureText` widths below the opentype-derived advances, so a naive
 * Canvas2D wrap produces a different line count and block height.
 */
function drawCompareText(
  ctx: CanvasRenderingContext2D,
  font: SlugFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
  mode: CompareMode,
) {
  const dpr = window.devicePixelRatio
  const w = ctx.canvas.width / dpr
  const h = ctx.canvas.height / dpr

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.save()
  ctx.scale(dpr, dpr)

  if (mode !== 'onion') {
    ctx.fillStyle = '#00021c'
    ctx.fillRect(0, 0, w, h)
  }

  ctx.font = `${fontSize}px Inter-Slug, sans-serif`
  ctx.fillStyle = mode === 'onion' ? 'rgba(255, 100, 100, 0.6)' : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const lines = font.wrapText(text, fontSize, maxWidth)
  const lineHeightPx = fontSize * lineHeight

  const totalBlockHeight = (lines.length - 1) * lineHeightPx
  const baselineY = h / 2 - totalBlockHeight / 2

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, w / 2, baselineY + i * lineHeightPx)
  }

  ctx.restore()
}

function drawDiff(
  compareCtx: CanvasRenderingContext2D,
  gpuCanvas: HTMLCanvasElement,
  font: SlugFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
) {
  const cw = compareCtx.canvas.width
  const ch = compareCtx.canvas.height

  drawCompareText(compareCtx, font, text, fontSize, maxWidth, lineHeight, 'diff')
  const canvasPixels = compareCtx.getImageData(0, 0, cw, ch)

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = cw
  tempCanvas.height = ch
  const tempCtx = tempCanvas.getContext('2d')!
  tempCtx.drawImage(gpuCanvas, 0, 0, gpuCanvas.width, gpuCanvas.height, 0, 0, cw, ch)
  const gpuPixels = tempCtx.getImageData(0, 0, cw, ch)

  const lum = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722

  const out = compareCtx.createImageData(cw, ch)
  const cd = canvasPixels.data
  const gd = gpuPixels.data
  const od = out.data

  const lo = 20
  const hi = 128

  for (let i = 0; i < cd.length; i += 4) {
    const lumCanvas = lum(cd[i]!, cd[i + 1]!, cd[i + 2]!)
    const lumGpu = lum(gd[i]!, gd[i + 1]!, gd[i + 2]!)
    const diff = Math.abs(lumCanvas - lumGpu)

    if (diff > lo) {
      const t = Math.min((diff - lo) / (hi - lo), 1)
      od[i] = Math.round(80 + 175 * t)
      od[i + 1] = Math.round(40 * (1 - t))
      od[i + 2] = 0
      od[i + 3] = 255
    } else {
      od[i] = 0
      od[i + 1] = 2
      od[i + 2] = 28
      od[i + 3] = 255
    }
  }

  compareCtx.putImageData(out, 0, 0)
}

// --- Draggable split handle ---

function setupSplitHandle(handle: HTMLElement, onDrag: (x: number) => void) {
  let dragging = false

  handle.addEventListener('pointerdown', (e) => {
    dragging = true
    handle.setPointerCapture(e.pointerId)
    e.preventDefault()
  })

  window.addEventListener('pointermove', (e) => {
    if (!dragging) return
    onDrag(Math.max(0, Math.min(e.clientX, window.innerWidth)))
  })

  window.addEventListener('pointerup', () => { dragging = false })
}

// --- Main ---

async function main() {
  const scene = new Scene()
  scene.background = new Color(0x00021c)

  const w = window.innerWidth
  const h = window.innerHeight
  const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 1000)
  camera.position.z = 100

  const renderer = new WebGPURenderer({ antialias: true, trackTimestamp: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  const fontUrl = './Inter-Regular.ttf'
  const maxWidthFraction = 0.8

  const params = {
    size: 48,
    words: 20,
    darken: 0,
    thicken: 0,
    compare: 'onion' as CompareMode,
    forceRuntime: false,
  }

  const monitors = {
    glyphs: 0,
    loadMs: 0,
    source: 'baked',
  }

  let splitX = Math.round(w / 2)
  let text = getLoremText(params.words)

  const slugText = new SlugText({
    text,
    fontSize: params.size,
    color: 0xffffff,
    align: 'center',
    maxWidth: w * maxWidthFraction,
  })
  slugText.setViewportSize(w, h)
  scene.add(slugText)

  // --- Overlay elements ---
  const compareCanvas = document.getElementById('compare-canvas') as HTMLCanvasElement
  const compareCtx = compareCanvas.getContext('2d')!
  const splitHandle = document.getElementById('split-handle')!
  const splitLabelLeft = document.getElementById('split-label-left')!
  const splitLabelRight = document.getElementById('split-label-right')!
  const computingEl = document.getElementById('computing')!

  function resizeCompareCanvas() {
    const dpr = window.devicePixelRatio
    compareCanvas.width = window.innerWidth * dpr
    compareCanvas.height = window.innerHeight * dpr
    compareCanvas.style.width = `${window.innerWidth}px`
    compareCanvas.style.height = `${window.innerHeight}px`
  }
  resizeCompareCanvas()

  const MODE_LABELS: Record<CompareMode, string> = {
    onion: 'Canvas (Onion Skin)',
    diff: 'Canvas (Diff)',
    split: 'Canvas (Split)',
  }

  let computingTimer: ReturnType<typeof setTimeout> | null = null

  /** Expensive: re-renders the full compare canvas. Call on content/mode changes. */
  function redrawCompare() {
    const font = slugText.font
    if (!font) return

    if (params.compare === 'diff') {
      computingEl.setAttribute('data-visible', '')
      if (computingTimer) clearTimeout(computingTimer)

      requestAnimationFrame(() => {
        slugText.update(camera)
        renderer.render(scene, camera)
        drawDiff(compareCtx, renderer.domElement, font, text, params.size, window.innerWidth * maxWidthFraction, 1.2)

        computingTimer = setTimeout(() => {
          computingEl.removeAttribute('data-visible')
          computingTimer = null
        }, 1000)
      })
    } else {
      computingEl.removeAttribute('data-visible')
      if (computingTimer) { clearTimeout(computingTimer); computingTimer = null }
      drawCompareText(compareCtx, font, text, params.size, window.innerWidth * maxWidthFraction, 1.2, params.compare)
    }
  }

  function updateSplitPosition() {
    compareCanvas.style.clipPath = `inset(0 0 0 ${splitX}px)`
    splitHandle.style.left = `${splitX - 16}px`
    splitLabelLeft.style.left = `${splitX - 60}px`
    splitLabelRight.style.left = `${splitX + 20}px`
  }

  function updateSplitUI() {
    splitLabelRight.textContent = MODE_LABELS[params.compare]
    redrawCompare()
    updateSplitPosition()
  }

  setupSplitHandle(splitHandle, (x) => {
    splitX = x
    updateSplitPosition()
  })

  // --- Load font ---
  async function loadFont() {
    SlugFontLoader.clearCache()
    const t0 = performance.now()
    const font = await SlugFontLoader.load(fontUrl, { forceRuntime: params.forceRuntime })
    const ms = performance.now() - t0
    slugText.font = font
    slugText.setViewportSize(window.innerWidth, window.innerHeight)
    slugText.update()

    monitors.glyphs = font.glyphs.size
    monitors.loadMs = Math.round(ms)
    monitors.source = params.forceRuntime ? 'runtime' : 'baked'

    updateSplitUI()
    pane.refresh()
  }

  // --- Tweakpane UI ---
  const { pane, stats } = createPane({ scene })

  const settings = pane.addFolder({ title: 'Settings', expanded: false })
  settings.addBinding(params, 'size', {
    options: {
      '6': 6, '8': 8, '10': 10, '12': 12, '16': 16, '24': 24,
      '32': 32, '48': 48, '72': 72, '96': 96, '200': 200,
    },
  }).on('change', () => {
    slugText.fontSize = params.size
    slugText.update()
    updateSplitUI()
  })
  settings.addBinding(params, 'words', { min: 5, max: 200, step: 1 }).on('change', () => {
    text = getLoremText(params.words)
    slugText.text = text
    slugText.update()
    updateSplitUI()
  })
  settings.addBinding(params, 'darken', { min: 0, max: 2, step: 0.01 }).on('change', () => {
    slugText.stemDarken = params.darken
    if (params.compare === 'diff') redrawCompare()
  })
  settings.addBinding(params, 'thicken', { min: 0, max: 2, step: 0.01 }).on('change', () => {
    slugText.thicken = params.thicken
    if (params.compare === 'diff') redrawCompare()
  })

  const mode = pane.addFolder({ title: 'Mode', expanded: false })
  mode.addBinding(params, 'compare', {
    options: { Onion: 'onion', Diff: 'diff', Split: 'split' },
  }).on('change', () => {
    updateSplitUI()
  })
  mode.addBinding(params, 'forceRuntime', { label: 'runtime' }).on('change', () => {
    loadFont()
  })
  mode.addBinding(monitors, 'source', { readonly: true })
  mode.addBinding(monitors, 'glyphs', { readonly: true, format: (v: number) => v.toFixed(0) })
  mode.addBinding(monitors, 'loadMs', { readonly: true, label: 'load (ms)', format: (v: number) => v.toFixed(0) })

  await document.fonts.load('48px Inter-Slug')
  await loadFont()

  // --- Resize ---
  window.addEventListener('resize', () => {
    const rw = window.innerWidth
    const rh = window.innerHeight
    camera.left = -rw / 2
    camera.right = rw / 2
    camera.top = rh / 2
    camera.bottom = -rh / 2
    camera.updateProjectionMatrix()
    renderer.setSize(rw, rh)
    slugText.maxWidth = rw * maxWidthFraction
    slugText.setViewportSize(rw, rh)
    resizeCompareCanvas()
    splitX = Math.round(rw / 2)
    updateSplitUI()
  })

  // --- Render loop ---
  function animate() {
    requestAnimationFrame(animate)
    stats.begin()
    slugText.update(camera)
    renderer.render(scene, camera)
    const render = renderer.info.render as unknown as {
      drawCalls: number; triangles: number; lines: number; points: number
    }
    const memory = renderer.info.memory as unknown as { geometries: number; textures: number }
    stats.update({
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      lines: render.lines,
      points: render.points,
      geometries: memory.geometries,
      textures: memory.textures,
    })
    stats.end()
  }
  animate()
}

main()
