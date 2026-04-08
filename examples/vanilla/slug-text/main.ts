import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { SlugFontLoader, SlugText } from '@three-flatland/slug'
import type { SlugFont } from '@three-flatland/slug'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js'
import '@awesome.me/webawesome/dist/components/radio/radio.js'
import '@awesome.me/webawesome/dist/components/slider/slider.js'

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

// --- Utilities ---

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

// --- Canvas2D text rendering ---

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Draw Canvas2D comparison text.
 * - 'onion': red semi-transparent text, no background (overlays Slug)
 * - 'split': white text on dark background (occludes Slug)
 * - 'diff': white text on dark background (used to compute diff)
 */
function drawCompareText(
  ctx: CanvasRenderingContext2D,
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

  const lines = wrapText(ctx, text, maxWidth)
  const lineHeightPx = fontSize * lineHeight

  // Vertically center the text block around viewport center, matching Slug's
  // yOffset = (lines-1)*lineHeight/2 centering in the text shaper.
  const totalBlockHeight = (lines.length - 1) * lineHeightPx
  const baselineY = h / 2 - totalBlockHeight / 2

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, w / 2, baselineY + i * lineHeightPx)
  }

  ctx.restore()
}

/**
 * Compute perceptual diff between the WebGPU canvas and Canvas2D text.
 *
 * Compares luminance (not individual RGB channels) to ignore subpixel AA
 * differences between Slug's grayscale coverage and Canvas2D's LCD rendering.
 * Shows a heat map: dark = match, yellow = small diff, red = large diff.
 */
function drawDiff(
  compareCtx: CanvasRenderingContext2D,
  gpuCanvas: HTMLCanvasElement,
  text: string,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
) {
  const cw = compareCtx.canvas.width
  const ch = compareCtx.canvas.height

  // Draw Canvas2D reference (white on dark bg) into compare canvas
  drawCompareText(compareCtx, text, fontSize, maxWidth, lineHeight, 'diff')
  const canvasPixels = compareCtx.getImageData(0, 0, cw, ch)

  // Read WebGPU canvas pixels — draw at native size to match compare canvas
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = cw
  tempCanvas.height = ch
  const tempCtx = tempCanvas.getContext('2d')!
  // GPU canvas may have a different backing size due to pixelRatio,
  // so draw it scaled to match the compare canvas dimensions exactly.
  tempCtx.drawImage(gpuCanvas, 0, 0, gpuCanvas.width, gpuCanvas.height, 0, 0, cw, ch)
  const gpuPixels = tempCtx.getImageData(0, 0, cw, ch)

  // Compare luminance — perceptual weights (Rec. 709)
  const lum = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722

  const out = compareCtx.createImageData(cw, ch)
  const cd = canvasPixels.data
  const gd = gpuPixels.data
  const od = out.data

  // Two thresholds:
  // - Low: ignore tiny AA differences (< 8% luminance)
  // - High: full red for major structural differences (> 50% luminance)
  const lo = 20
  const hi = 128

  for (let i = 0; i < cd.length; i += 4) {
    const lumCanvas = lum(cd[i]!, cd[i + 1]!, cd[i + 2]!)
    const lumGpu = lum(gd[i]!, gd[i + 1]!, gd[i + 2]!)
    const diff = Math.abs(lumCanvas - lumGpu)

    if (diff > lo) {
      // Heat map: dark red (AA edge) → bright red (structural)
      const t = Math.min((diff - lo) / (hi - lo), 1)
      od[i] = Math.round(80 + 175 * t)      // R: dim → bright
      od[i + 1] = Math.round(40 * (1 - t))   // G: faint → off
      od[i + 2] = 0
      od[i + 3] = 255
    } else {
      // Match: dark background
      od[i] = 0
      od[i + 1] = 2
      od[i + 2] = 28
      od[i + 3] = 255
    }
  }

  compareCtx.putImageData(out, 0, 0)
}

// --- Draggable split handle ---

function setupSplitHandle(
  handle: HTMLElement,
  onDrag: (x: number) => void,
) {
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

  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  log('Initializing WebGPU renderer...')
  await renderer.init()

  const fontUrl = import.meta.env.BASE_URL + 'Inter-Regular.ttf'
  let fontSize = 48
  let wordCount = 20
  let text = getLoremText(wordCount)
  let forceRuntime = false
  let compareMode: CompareMode = 'onion'
  let splitX = Math.round(w / 2)

  const maxWidthFraction = 0.8

  const slugText = new SlugText({
    text,
    fontSize,
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

  const computingEl = document.getElementById('computing')!
  let computingTimer: ReturnType<typeof setTimeout> | null = null

  /** Expensive: re-renders the full compare canvas. Call on content/mode changes. */
  function redrawCompare() {
    if (compareMode === 'diff') {
      // Show computing indicator
      computingEl.setAttribute('data-visible', '')
      if (computingTimer) clearTimeout(computingTimer)

      // Defer the heavy work so the indicator paints first
      requestAnimationFrame(() => {
        slugText.update(camera)
        renderer.render(scene, camera)
        drawDiff(compareCtx, renderer.domElement, text, fontSize, window.innerWidth * maxWidthFraction, 1.2)

        // Keep indicator visible for at least 1 second
        computingTimer = setTimeout(() => {
          computingEl.removeAttribute('data-visible')
          computingTimer = null
        }, 1000)
      })
    } else {
      computingEl.removeAttribute('data-visible')
      if (computingTimer) { clearTimeout(computingTimer); computingTimer = null }
      drawCompareText(compareCtx, text, fontSize, window.innerWidth * maxWidthFraction, 1.2, compareMode)
    }
  }

  /** Cheap: just moves the clip-path and handle. Call on drag. */
  function updateSplitPosition() {
    compareCanvas.style.clipPath = `inset(0 0 0 ${splitX}px)`
    splitHandle.style.left = `${splitX - 16}px`
    splitLabelLeft.style.left = `${splitX - 60}px`
    splitLabelRight.style.left = `${splitX + 20}px`
  }

  /** Full UI update: show elements + redraw + position. */
  function updateSplitUI() {
    compareCanvas.style.display = 'block'
    compareCanvas.style.opacity = '1'
    splitHandle.style.display = 'block'
    splitLabelLeft.style.display = 'block'
    splitLabelLeft.textContent = 'SLUG'
    splitLabelRight.style.display = 'block'
    splitLabelRight.textContent = MODE_LABELS[compareMode]
    redrawCompare()
    updateSplitPosition()
  }

  setupSplitHandle(splitHandle, (x) => {
    splitX = x
    updateSplitPosition() // Cheap — just moves the clip, no redraw
  })

  // --- Load font ---
  async function loadFont() {
    log('Loading font...')
    SlugFontLoader.clearCache()
    const t0 = performance.now()
    const font = await SlugFontLoader.load(fontUrl, { forceRuntime })
    const ms = (performance.now() - t0).toFixed(0)
    slugText.font = font
    slugText.setViewportSize(window.innerWidth, window.innerHeight)
    slugText.update()
    updateSplitUI()
    const mode = forceRuntime ? 'Runtime gen' : 'Baked'
    log(`${mode}: ${font.glyphs.size} glyphs in ${ms}ms`)
  }

  await document.fonts.load('48px Inter-Slug')
  await loadFont()

  // --- UI wiring ---

  // Compare mode toggle (radio button group)
  const compareModeGroup = document.getElementById('compare-mode')!
  setupWrappingGroup(compareModeGroup, 'wa-radio')
  compareModeGroup.addEventListener('change', (e) => {
    compareMode = (e.target as HTMLInputElement).value as CompareMode
    updateSplitUI()
  })

  // Runtime toggle
  const runtimeCheck = document.getElementById('runtime-check') as HTMLInputElement
  runtimeCheck.addEventListener('change', () => {
    forceRuntime = runtimeCheck.checked
    loadFont()
  })

  // Hotkeys
  document.addEventListener('keydown', (e) => {
    if (e.key === 'r') {
      runtimeCheck.checked = !runtimeCheck.checked
      forceRuntime = runtimeCheck.checked
      loadFont()
    }
  })

  // Word count slider
  const wordsSlider = document.getElementById('words-slider') as any
  const wordsValue = document.getElementById('words-value')!
  wordsSlider.addEventListener('input', () => {
    wordCount = Number(wordsSlider.value)
    text = getLoremText(wordCount)
    slugText.text = text
    slugText.update()
    updateSplitUI()
    wordsValue.textContent = String(wordCount)
  })

  // Stem darkening slider: 0–100 → 0–2.0 (visible at ≤24px)
  const darkenSlider = document.getElementById('darken-slider') as any
  const darkenValue = document.getElementById('darken-value')!
  darkenSlider.addEventListener('input', () => {
    const raw = Number(darkenSlider.value)
    slugText.stemDarken = (raw / 100) * 2
    darkenValue.textContent = String(raw)
    if (compareMode === 'diff') redrawCompare()
  })

  // Thickening slider: 0–100 → 0–2.0 (visible at ≤24px)
  const thickenSlider = document.getElementById('thicken-slider') as any
  const thickenValue = document.getElementById('thicken-value')!
  thickenSlider.addEventListener('input', () => {
    const raw = Number(thickenSlider.value)
    slugText.thicken = (raw / 100) * 2
    thickenValue.textContent = String(raw)
    if (compareMode === 'diff') redrawCompare()
  })

  // Font size radio
  const radioGroup = document.querySelector('wa-radio-group')!
  setupWrappingGroup(radioGroup, 'wa-radio')
  radioGroup.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value
    fontSize = parseInt(value, 10)
    slugText.fontSize = fontSize
    slugText.update()
    updateSplitUI()
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
    slugText.maxWidth = rw * maxWidthFraction
    slugText.setViewportSize(rw, rh)
    resizeCompareCanvas()
    splitX = Math.round(rw / 2)
    updateSplitUI()
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
