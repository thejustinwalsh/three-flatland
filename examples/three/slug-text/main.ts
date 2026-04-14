import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { SlugFontLoader, SlugFontStack, SlugStackText, SlugText } from '@three-flatland/slug'
import type { SlugFont, StyleSpan } from '@three-flatland/slug'
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

// Font Awesome PUA codepoints — keep in sync with the bake command that
// produced `fa-solid.slug.{json,bin}`.
const ICON = {
  heart: '\uf004', star: '\uf005', home: '\uf015', user: '\uf007',
  gear: '\uf013', bolt: '\uf0e7', thumbsUp: '\uf164', paperPlane: '\uf1d8',
  code: '\uf121', coffee: '\uf0f4', rocket: '\uf135', book: '\uf02d',
}
const ICON_DEMO =
  `Built with ${ICON.code} and ${ICON.heart}\n` +
  `${ICON.coffee} brewed  ${ICON.rocket} launched  ${ICON.bolt} fast`

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
  fontFamily: string = 'Inter-Slug, sans-serif',
  preWrappedLines: string[] | null = null,
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

  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.fillStyle = mode === 'onion' ? 'rgba(255, 100, 100, 0.6)' : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const lines = preWrappedLines ?? font.wrapText(text, fontSize, maxWidth)
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
  fontFamily: string = 'Inter-Slug, sans-serif',
  preWrappedLines: string[] | null = null,
) {
  const cw = compareCtx.canvas.width
  const ch = compareCtx.canvas.height

  drawCompareText(compareCtx, font, text, fontSize, maxWidth, lineHeight, 'diff', fontFamily, preWrappedLines)
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

  // Slug's shader is analytically antialiased per-fragment; MSAA would add
  // 4× sample cost + a canvas-area resolve for zero visual gain.
  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true })
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
    styleScope: 'word' as 'word' | 'sentence' | 'line',
    underline: false,
    strike: false,
    icons: false,
  }

  // Hover state drives the measure overlay only. No click-to-style —
  // arbitrary character-range selection is rich-text editor territory
  // and lives in a future example.
  let hoveredLine: number | null = null

  /** Compute the demo style range from the current scope. */
  function computeStyleRange(): { start: number; end: number } {
    if (params.styleScope === 'word') {
      const m = text.match(/^\S+/)
      return { start: 0, end: m ? m[0].length : 0 }
    }
    if (params.styleScope === 'sentence') {
      const m = text.match(/^[^.!?]*[.!?]?/)
      return { start: 0, end: m ? m[0].length : text.length }
    }
    const font = slugText.font
    if (font) {
      const lines = font.wrapText(text, params.size, window.innerWidth * maxWidthFraction)
      return { start: 0, end: lines[0]?.length ?? 0 }
    }
    return { start: 0, end: 0 }
  }

  function recomputeStyles(): StyleSpan[] {
    if (!params.underline && !params.strike) return []
    const r = computeStyleRange()
    if (r.start === r.end) return []
    return [{ start: r.start, end: r.end, underline: params.underline, strike: params.strike }]
  }

  function applyStyles() {
    slugText.styles = recomputeStyles()
    slugText.update()
    if (params.compare === 'diff') redrawCompare()
  }

  const monitors = {
    glyphs: 0,
    loadMs: 0,
    source: 'baked',
    // Paragraph-level (live, for the currently-rendered block)
    paraWidth: 0,
    paraHeight: 0,
    paraLines: 0,
    // Line-level (populated when a line is clicked)
    width: 0,
    actualAscent: 0,
    actualDescent: 0,
    fontAscent: 0,
    fontDescent: 0,
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

  /** Icon-fallback demo renderer. Hidden until `icons` toggled on. Lazily
   *  constructed — the FA font and stack load once on first activation.
   *  `maxWidth` works: Canvas2D compare pre-wraps via `stack.wrapText`
   *  so both paths agree on line count regardless of viewport width. */
  const stackText = new SlugStackText({
    text: ICON_DEMO,
    fontSize: params.size,
    color: 0xffffff,
    align: 'center',
    maxWidth: w * maxWidthFraction,
  })
  stackText.setViewportSize(w, h)
  stackText.visible = false
  scene.add(stackText)

  let iconFont: SlugFont | null = null
  let stack: SlugFontStack | null = null

  function applyIconsMode() {
    slugText.visible = !params.icons
    stackText.visible = params.icons
    // Measure overlays are primary-font only — in icons mode they would
    // misreport FA glyph widths (treated as notdef), so hide them. Compare
    // stays visible: Canvas2D mirrors the Slug stack via CSS @font-face
    // fallback (Inter-Slug, FA-Solid).
    hitRectsContainer.style.display = params.icons ? 'none' : ''
    if (params.icons) {
      boundsActual.style.display = 'none'
      boundsFont.style.display = 'none'
    }
    redrawCompare()
  }

  /** Canvas2D compare reads from whichever scene is visible. Slug side is
   *  driven directly by `slugText` / `stackText`; this just picks the
   *  matching text for the 2D overlay. */
  function getCompareText(): string {
    return params.icons ? ICON_DEMO : text
  }

  async function ensureStack() {
    if (stack) return stack
    iconFont = await SlugFontLoader.load('./fa-solid.ttf')
    const primary = slugText.font
    if (!primary) return null
    stack = new SlugFontStack([primary, iconFont])
    stackText.font = stack
    return stack
  }

  // --- Overlay elements ---
  const compareCanvas = document.getElementById('compare-canvas') as HTMLCanvasElement
  const compareCtx = compareCanvas.getContext('2d')!
  const splitHandle = document.getElementById('split-handle')!
  const splitLabelLeft = document.getElementById('split-label-left')!
  const splitLabelRight = document.getElementById('split-label-right')!
  const computingEl = document.getElementById('computing')!
  const boundsActual = document.getElementById('bounds-actual')!
  const boundsFont = document.getElementById('bounds-font')!
  const hitRectsContainer = document.getElementById('measure-hits')!

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

    const compareText = getCompareText()
    const fontFamily = params.icons
      ? 'Inter-Slug, FA-Solid, sans-serif'
      : 'Inter-Slug, sans-serif'
    const maxWidth = window.innerWidth * maxWidthFraction
    // In icons mode, pre-wrap through the stack so Canvas2D breaks
    // exactly where `SlugStackText` does — `font.wrapText` uses the
    // primary only and can't account for FA advance widths.
    const preWrappedLines = params.icons && stack
      ? stack.wrapText(compareText, params.size, maxWidth)
      : null

    if (params.compare === 'diff') {
      computingEl.setAttribute('data-visible', '')
      if (computingTimer) clearTimeout(computingTimer)

      requestAnimationFrame(() => {
        slugText.update(camera)
        stackText.update(camera)
        renderer.render(scene, camera)
        drawDiff(compareCtx, renderer.domElement, font, compareText, params.size, maxWidth, 1.2, fontFamily, preWrappedLines)

        computingTimer = setTimeout(() => {
          computingEl.removeAttribute('data-visible')
          computingTimer = null
        }, 1000)
      })
    } else {
      computingEl.removeAttribute('data-visible')
      if (computingTimer) { clearTimeout(computingTimer); computingTimer = null }
      drawCompareText(compareCtx, font, compareText, params.size, maxWidth, 1.2, params.compare, fontFamily, preWrappedLines)
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
    updateBoundsOverlay()
  }

  /**
   * Click-to-measure: each rendered line gets a transparent hit-rect
   * (div child of #measure-hits) sized to its font-ascent/descent box.
   * Clicking toggles selection; the selected line's actual/font bounds
   * overlay on top and its metrics populate the readonly monitors.
   */
  function updateBoundsOverlay() {
    const font = slugText.font
    hitRectsContainer.innerHTML = ''
    boundsActual.style.display = 'none'
    boundsFont.style.display = 'none'

    if (!font) {
      setSelectedMetrics(null)
      monitors.paraWidth = 0
      monitors.paraHeight = 0
      monitors.paraLines = 0
      pane.refresh()
      return
    }

    const maxWidth = window.innerWidth * maxWidthFraction

    // Paragraph-level monitors live-update for the currently-rendered text.
    const para = font.measureParagraph(text, params.size, { maxWidth, lineHeight: 1.2 })
    monitors.paraWidth = para.width
    monitors.paraHeight = para.height
    monitors.paraLines = para.lines.length

    const lines = font.wrapText(text, params.size, maxWidth)
    const lineMetrics = lines.map((line) => font.measureText(line, params.size))

    const lineHeightPx = params.size * 1.2
    const firstBaselineY = window.innerHeight / 2 - (lines.length - 1) * lineHeightPx / 2
    const centerX = window.innerWidth / 2

    // Emit per-line hit-rects (transparent, pointer-events: auto).
    lineMetrics.forEach((m, i) => {
      const by = firstBaselineY + i * lineHeightPx
      const div = document.createElement('div')
      div.className = 'measure-hit'
      div.style.left = `${centerX - m.width / 2}px`
      div.style.top = `${by - m.fontBoundingBoxAscent}px`
      div.style.width = `${m.width}px`
      div.style.height = `${m.fontBoundingBoxAscent + m.fontBoundingBoxDescent}px`
      div.addEventListener('pointerenter', () => {
        hoveredLine = i
        updateMeasureOverlay()
      })
      div.addEventListener('pointerleave', () => {
        if (hoveredLine === i) {
          hoveredLine = null
          updateMeasureOverlay()
        }
      })
      hitRectsContainer.appendChild(div)
    })

    if (hoveredLine != null && hoveredLine >= lines.length) hoveredLine = null

    updateMeasureOverlay()
  }

  /** Render the measure overlay for whichever line is hovered. */
  function updateMeasureOverlay() {
    const font = slugText.font
    boundsActual.style.display = 'none'
    boundsFont.style.display = 'none'

    if (!font || hoveredLine == null) {
      setSelectedMetrics(null)
      return
    }

    const maxWidth = window.innerWidth * maxWidthFraction
    const lines = font.wrapText(text, params.size, maxWidth)
    if (hoveredLine >= lines.length) return
    const line = lines[hoveredLine]!
    const metrics = font.measureText(line, params.size)
    setSelectedMetrics(metrics)

    const lineHeightPx = params.size * 1.2
    const firstBaselineY = window.innerHeight / 2 - (lines.length - 1) * lineHeightPx / 2
    const by = firstBaselineY + hoveredLine * lineHeightPx
    const centerX = window.innerWidth / 2
    const penOriginX = centerX - metrics.width / 2

    boundsFont.style.display = 'block'
    boundsFont.style.left = `${penOriginX}px`
    boundsFont.style.top = `${by - metrics.fontBoundingBoxAscent}px`
    boundsFont.style.width = `${metrics.width}px`
    boundsFont.style.height = `${metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent}px`

    boundsActual.style.display = 'block'
    boundsActual.style.left = `${penOriginX - metrics.actualBoundingBoxLeft}px`
    boundsActual.style.top = `${by - metrics.actualBoundingBoxAscent}px`
    boundsActual.style.width = `${metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight}px`
    boundsActual.style.height = `${metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent}px`
  }

  function setSelectedMetrics(m: { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number; fontBoundingBoxAscent: number; fontBoundingBoxDescent: number } | null) {
    monitors.width = m?.width ?? 0
    monitors.actualAscent = m?.actualBoundingBoxAscent ?? 0
    monitors.actualDescent = m?.actualBoundingBoxDescent ?? 0
    monitors.fontAscent = m?.fontBoundingBoxAscent ?? 0
    monitors.fontDescent = m?.fontBoundingBoxDescent ?? 0
    pane.refresh()
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

  // Top-of-pane scene toggle — inline radiogrid (essentials). Mirrors
  // React's `usePaneRadioGrid`. 'lorem' → SlugText + wrap-aware compare;
  // 'icons' → SlugStackText + stack-wrap compare.
  ;(pane as unknown as { addBlade: (opts: Record<string, unknown>) => {
    on: (ev: string, fn: (e: { value: 'lorem' | 'icons' }) => void) => unknown
  } }).addBlade({
    view: 'radiogrid',
    groupName: 'scene',
    size: [2, 1],
    cells: (x: number, _y: number) => ({
      title: ['Lorem', 'Icons'][x],
      value: (['lorem', 'icons'] as const)[x],
    }),
    value: 'lorem',
  }).on('change', async (ev) => {
    params.icons = ev.value === 'icons'
    if (params.icons) await ensureStack()
    applyIconsMode()
  })

  const settings = pane.addFolder({ title: 'Settings', expanded: false })
  settings.addBinding(params, 'size', {
    options: {
      '6': 6, '8': 8, '10': 10, '12': 12, '16': 16, '24': 24,
      '32': 32, '48': 48, '72': 72, '96': 96, '200': 200,
    },
  }).on('change', () => {
    slugText.fontSize = params.size
    stackText.fontSize = params.size
    applyStyles()
    updateSplitUI()
  })
  settings.addBinding(params, 'words', { min: 5, max: 200, step: 1 }).on('change', () => {
    text = getLoremText(params.words)
    slugText.text = text
    applyStyles()
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

  // Styles folder — applies underline / strike to a preset character
  // range (first word / first sentence / first line). Demonstrates the
  // public StyleSpan API; arbitrary span editing is rich-text territory.
  const stylesFolder = pane.addFolder({ title: 'Styles', expanded: false })
  stylesFolder.addBinding(params, 'styleScope', {
    label: 'scope',
    options: { 'First word': 'word', 'First sentence': 'sentence', 'First line': 'line' },
  }).on('change', applyStyles)
  stylesFolder.addBinding(params, 'underline').on('change', applyStyles)
  stylesFolder.addBinding(params, 'strike').on('change', applyStyles)

  // Measure folder: paragraph monitors live-update; line-level monitors
  // populate when a line is clicked and reset when deselected.
  const measureFolder = pane.addFolder({ title: 'Measure', expanded: false })
  const fmt = (v: number) => v.toFixed(1)
  const intFmt = (v: number) => v.toFixed(0)
  measureFolder.addBinding(monitors, 'paraWidth', { label: 'block w', readonly: true, format: fmt })
  measureFolder.addBinding(monitors, 'paraHeight', { label: 'block h', readonly: true, format: fmt })
  measureFolder.addBinding(monitors, 'paraLines', { label: 'lines', readonly: true, format: intFmt })
  measureFolder.addBinding(monitors, 'width', { label: 'line w', readonly: true, format: fmt })
  measureFolder.addBinding(monitors, 'actualAscent', { label: 'actual ↑', readonly: true, format: fmt })
  measureFolder.addBinding(monitors, 'actualDescent', { label: 'actual ↓', readonly: true, format: fmt })
  measureFolder.addBinding(monitors, 'fontAscent', { label: 'font ↑', readonly: true, format: fmt })
  measureFolder.addBinding(monitors, 'fontDescent', { label: 'font ↓', readonly: true, format: fmt })

  await Promise.allSettled([
    document.fonts.load('48px Inter-Slug'),
    document.fonts.load('48px FA-Solid'),
  ])
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
    stackText.maxWidth = rw * maxWidthFraction
    stackText.setViewportSize(rw, rh)
    resizeCompareCanvas()
    splitX = Math.round(rw / 2)
    updateSplitUI()
  })

  // --- Render loop ---
  function animate() {
    requestAnimationFrame(animate)
    stats.begin()
    slugText.update(camera)
    stackText.update(camera)
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
