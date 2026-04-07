import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera } from 'three'
import { Skia, SkiaPaint, SkiaPath } from '@three-flatland/skia'
import {
  SkiaCanvas,
  SkiaRect,
  SkiaCircle,
  SkiaLine,
  SkiaPathNode,
  SkiaTextNode,
  SkiaGroup,
  SkiaFontLoader,
} from '@three-flatland/skia/three'

const status = document.getElementById('status')!

function setStatus(msg: string, ok: boolean) {
  status.textContent = msg
  status.className = ok ? 'ok' : 'error'
}

function hslToArgb(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r: number, g: number, b: number
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const ri = Math.round((r + m) * 255), gi = Math.round((g + m) * 255), bi = Math.round((b + m) * 255)
  return (0xFF000000 | (ri << 16) | (gi << 8) | bi) >>> 0
}

function smoothstep(t: number): number { return t * t * (3 - 2 * t) }

async function main() {
  const w = window.innerWidth
  const h = window.innerHeight
  const dpr = Math.min(devicePixelRatio, 2)
  const pw = w * dpr
  const ph = h * dpr

  // ── Three.js setup ──
  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(dpr)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const scene = new Scene()
  const camera = new OrthographicCamera(0, w, 0, h, -1, 1)

  // ── Initialize Skia ──
  setStatus('Loading Skia WASM...', true)
  const skia = await Skia.init(renderer)
  setStatus(`Skia ready (${skia.backend})`, true)

  // ── Build canvas ──
  const skiaCanvas = new SkiaCanvas({ renderer, width: pw, height: ph, overlay: true })
  scene.add(skiaCanvas)

  // Scale 512px reference layout to fit viewport
  const REF = 512
  const scale = Math.min(pw / REF, ph / REF)

  const bg = new SkiaRect()
  bg.x = 0; bg.y = 0; bg.width = pw; bg.height = ph
  bg.fill = [0.06, 0.06, 0.1, 1]
  skiaCanvas.add(bg)

  const sceneGroup = new SkiaGroup()
  sceneGroup.scaleSkiaX = scale; sceneGroup.scaleSkiaY = scale
  sceneGroup.tx = (pw - REF * scale) / 2; sceneGroup.ty = (ph - REF * scale) / 2
  skiaCanvas.add(sceneGroup)

  // ── Colored rectangles (animated color swap) ──
  const sqCols = [
    [0.9, 0.3, 0.3], [0.3, 0.9, 0.4], [0.3, 0.5, 0.9],
    [0.9, 0.7, 0.2], [0.7, 0.3, 0.9], [0.2, 0.8, 0.8],
  ]
  const squares: SkiaRect[] = []
  for (let i = 0; i < sqCols.length; i++) {
    const rect = new SkiaRect()
    rect.x = 30 + i * 78; rect.y = 30; rect.width = 68; rect.height = 68
    rect.cornerRadius = 10
    rect.fill = [...sqCols[i]!, 1] as [number, number, number, number]
    sceneGroup.add(rect)
    squares.push(rect)
  }
  let sqSwapA = 0, sqSwapB = 1, sqSwapStart = 0
  let sqFromA = [...sqCols[0]!], sqFromB = [...sqCols[1]!]
  let sqToA = [...sqCols[1]!], sqToB = [...sqCols[0]!]

  // ── Circles (animated color cycling) ──
  const circles: SkiaCircle[] = []
  for (let i = 0; i < 8; i++) {
    const circle = new SkiaCircle()
    circle.cx = 64 + i * 56; circle.cy = 140; circle.r = 18
    circle.fill = [0.4, 0.4, 0.6, 0.7]
    sceneGroup.add(circle)
    circles.push(circle)
  }

  // ── Stroked frame ──
  const strokedFrame = new SkiaRect()
  strokedFrame.x = 20; strokedFrame.y = 170; strokedFrame.width = 472; strokedFrame.height = 100
  strokedFrame.stroke = [1, 1, 1, 0.3]; strokedFrame.strokeWidth = 2
  sceneGroup.add(strokedFrame)

  const innerFrame = new SkiaRect()
  innerFrame.x = 28; innerFrame.y = 176; innerFrame.width = 456; innerFrame.height = 88
  innerFrame.cornerRadius = 10; innerFrame.stroke = [1, 1, 1, 0.3]; innerFrame.strokeWidth = 2
  sceneGroup.add(innerFrame)

  // ── Scanner lines (animated phase shift) ──
  const lines: SkiaLine[] = []
  for (let i = 0; i < 9; i++) {
    const line = new SkiaLine()
    line.x1 = 36; line.y1 = 184 + i * 9; line.x2 = 472; line.y2 = 184 + i * 9
    line.strokeWidth = 1
    line.stroke = [0.5, 0.8, 0.3, 0.6]
    sceneGroup.add(line)
    lines.push(line)
  }

  // ── Gradient bars (animated midpoint oscillation) ──
  const gradColors: [number, number][] = [
    [0xFFFF4444, 0xFF4444FF],
    [0xFF44FF44, 0xFFFF44FF],
    [0xFFFFAA00, 0xFF00AAFF],
    [0xFF4488FF, 0xFFFF8844],
  ]
  const gradRects: SkiaRect[] = []
  const gradPaints: SkiaPaint[] = []
  for (let i = 0; i < gradColors.length; i++) {
    const y = 284 + i * 22
    const rect = new SkiaRect()
    rect.x = 30; rect.y = y; rect.width = 452; rect.height = 16; rect.cornerRadius = 4
    const paint = new SkiaPaint(skia).setFill()
    rect.paint = paint
    sceneGroup.add(rect)
    gradRects.push(rect)
    gradPaints.push(paint)
  }

  // ── PathOps (animated breathing circles) ──
  const pathOpColors: [number, number, number][] = [
    [0.9, 0.3, 0.3], [0.3, 0.9, 0.4], [0.3, 0.5, 0.9], [0.9, 0.7, 0.2],
  ]
  const pathOpNames: Array<'difference' | 'intersect' | 'union' | 'xor'> = [
    'difference', 'intersect', 'union', 'xor',
  ]
  const pathOpData = pathOpNames.map((_, pi) => {
    const resultNode = new SkiaPathNode()
    resultNode.fill = [...pathOpColors[pi]!, 0.9]
    sceneGroup.add(resultNode)
    const ghostANode = new SkiaPathNode()
    ghostANode.stroke = [1, 1, 1, 0.15]; ghostANode.strokeWidth = 1
    sceneGroup.add(ghostANode)
    const ghostBNode = new SkiaPathNode()
    ghostBNode.stroke = [1, 1, 1, 0.15]; ghostBNode.strokeWidth = 1
    sceneGroup.add(ghostBNode)
    return {
      resultNode, ghostANode, ghostBNode,
      pathA: new SkiaPath(skia),
      pathB: new SkiaPath(skia),
      resultPath: new SkiaPath(skia),
    }
  })

  // ── Title & subtitle ──
  const titleText = new SkiaTextNode()
  titleText.text = '@three-flatland/skia'
  titleText.fill = [1, 1, 1, 1]
  titleText.y = ph - 90
  skiaCanvas.add(titleText)

  const subtitleText = new SkiaTextNode()
  subtitleText.text = 'GPU-accelerated vector graphics in the browser'
  subtitleText.y = ph - 40
  skiaCanvas.add(subtitleText)
  let subtitlePaint: SkiaPaint | null = null

  // ── FPS ──
  const fpsText = new SkiaTextNode()
  fpsText.x = pw - 160; fpsText.y = 30
  fpsText.fill = [0.2, 0.9, 0.4, 1]
  skiaCanvas.add(fpsText)

  // ── Load fonts ──
  const FONT_URL = 'https://cdn.jsdelivr.net/gh/rsms/inter@v4.1/docs/font-files/InterVariable.ttf'
  Promise.all([
    SkiaFontLoader.load(FONT_URL, { context: skia, size: 32 * dpr }),
    SkiaFontLoader.load(FONT_URL, { context: skia, size: 14 * dpr }),
    SkiaFontLoader.load(FONT_URL, { context: skia, size: 11 * dpr }),
  ]).then(([titleF, subF, fpsF]) => {
    titleText.font = titleF
    titleText.x = (pw - titleF.measureText(titleText.text)) / 2

    subtitleText.font = subF
    subtitleText.x = (pw - subF.measureText(subtitleText.text)) / 2
    subtitlePaint = new SkiaPaint(skia).setFill()
    subtitleText.paint = subtitlePaint

    fpsText.font = fpsF
  }).catch(e => console.warn('Font load failed:', e))

  // ── Animation loop ──
  let frameCount = 0
  let lastFpsTime = performance.now()
  let fps = 0

  function animate(t: number) {
    frameCount++
    const now = performance.now()
    if (now - lastFpsTime >= 1000) {
      fps = Math.round(frameCount * 1000 / (now - lastFpsTime))
      frameCount = 0
      lastFpsTime = now
    }

    // ── Animate squares: color swap every 3s with smoothstep ──
    const sqDur = 3000
    let sqT = Math.min((t - sqSwapStart) / sqDur, 1.0)
    sqT = smoothstep(sqT)
    if (sqT >= 1.0 && t > 0) {
      sqCols[sqSwapA] = [...sqToA]
      sqCols[sqSwapB] = [...sqToB]
      const a = Math.floor(Math.random() * 6)
      const b2 = (a + 1 + Math.floor(Math.random() * 5)) % 6
      sqSwapA = a; sqSwapB = b2; sqSwapStart = t
      sqFromA = [...sqCols[a]!]; sqFromB = [...sqCols[b2]!]
      sqToA = [...sqCols[b2]!]; sqToB = [...sqCols[a]!]
      sqT = 0
    }
    for (let i = 0; i < squares.length; i++) {
      let c = sqCols[i]!
      if (i === sqSwapA) c = sqFromA.map((v, j) => v + (sqToA[j]! - v) * sqT)
      else if (i === sqSwapB) c = sqFromB.map((v, j) => v + (sqToB[j]! - v) * sqT)
      squares[i]!.fill = [c[0]!, c[1]!, c[2]!, 1]
    }

    // ── Animate circles: slow color cycling ──
    for (let i = 0; i < circles.length; i++) {
      const ct = ((i / 8) + t * 0.0002) % 1.0
      circles[i]!.fill = [
        0.15 + 0.35 * ct,
        0.2 + 0.25 * (1 - ct),
        0.3 + 0.4 * Math.sin(ct * Math.PI * 2 + 4),
        0.7,
      ]
    }

    // ── Animate scanner lines: color phase shift at ~12Hz ──
    const linePhase = Math.floor(t / 83) % 9
    for (let i = 0; i < lines.length; i++) {
      const lt = ((i + linePhase) % 9) / 9
      lines[i]!.stroke = [0.5 + 0.5 * lt, 0.8 - 0.3 * lt, 0.3 + 0.5 * lt, 0.6]
    }

    // ── Animate gradient bars: oscillating midpoint ──
    for (let i = 0; i < gradPaints.length; i++) {
      const y = 284 + i * 22
      const dir = (i % 2 === 0) ? 1 : -1
      const speed = 0.15 + i * 0.03
      const mid = 0.5 + 0.4 * Math.sin(t * speed * 0.001 * dir)
      const [cA, cB] = gradColors[i]!
      gradPaints[i]!.setLinearGradient(30, y, 482, y, [cA!, cB!, cA!], [0, mid, 1])
    }

    // ── Animate PathOps: breathing circles ──
    for (let pi = 0; pi < pathOpNames.length; pi++) {
      const cx = 75 + pi * 120
      const spread = 12 + 6 * Math.sin(t * 0.002 + pi)
      const d = pathOpData[pi]!
      d.pathA.reset().addCircle(cx - spread, 404, 26)
      d.pathB.reset().addCircle(cx + spread, 404, 26)
      const ok = d.pathA.opInto(d.pathB, pathOpNames[pi]!, d.resultPath)
      d.resultNode.path = ok ? d.resultPath : undefined
      d.resultNode.visible = ok
      d.ghostANode.path = d.pathA
      d.ghostBNode.path = d.pathB
    }

    // ── Animate subtitle gradient ──
    if (subtitlePaint && subtitleText.font) {
      const hue1 = (t * 0.05) % 360
      const hue2 = (hue1 + 120) % 360
      const subW = subtitleText.font.measureText(subtitleText.text)
      subtitlePaint.setLinearGradient(
        subtitleText.x, 0, subtitleText.x + subW, 0,
        [hslToArgb(hue1, 0.8, 0.6), hslToArgb(hue2, 0.8, 0.6)], [0, 1],
      )
    }

    // ── FPS ──
    fpsText.text = `FPS: ${fps}`

    // ── Render ──
    renderer.render(scene, camera)
    skiaCanvas.invalidate()
    skiaCanvas.render(renderer)
    requestAnimationFrame(animate)
  }
  requestAnimationFrame(animate)

  // ── Resize ──
  window.addEventListener('resize', () => {
    const nw = window.innerWidth
    const nh = window.innerHeight
    renderer.setSize(nw, nh)
    camera.right = nw; camera.bottom = nh
    camera.updateProjectionMatrix()
    skiaCanvas.setSize(nw * dpr, nh * dpr)
    bg.width = nw * dpr; bg.height = nh * dpr
  })
}

main().catch((err) => {
  console.error(err)
  setStatus(`Error: ${err.message}`, false)
})
