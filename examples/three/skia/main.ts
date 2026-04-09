import { WebGPURenderer } from 'three/webgpu'
import {
  Scene, PerspectiveCamera, OrthographicCamera, Fog,
  Mesh, PlaneGeometry, MeshBasicMaterial,
  AmbientLight, DirectionalLight, Color, DoubleSide,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { reflector, color as tslColor, positionWorld, cameraPosition, uv, vec2, hash, float as tslFloat, mx_worley_noise_float } from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { MeshStandardNodeMaterial } from 'three/webgpu'
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
import { createPane } from '@three-flatland/tweakpane'

function setStatus(msg: string, _ok: boolean) {
  console.log(`[skia] ${msg}`)
  const el = document.getElementById('status')
  if (el) el.style.display = 'none'
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
  const dpr = Math.min(devicePixelRatio, 2)

  // ── Three.js setup (3D perspective) ──
  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(dpr)
  renderer.setClearColor(new Color(0x191920))
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const scene = new Scene()
  scene.background = new Color(0x191920)
  scene.fog = new Fog(0x191920, 0, 15)
  const camera = new PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0.9, 4.5)
  camera.lookAt(0, 0.9, 0)

  // Orbit controls
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.target.set(0, 0.9, 0)
  controls.minDistance = 2
  controls.maxDistance = 10
  controls.maxPolarAngle = Math.PI * 0.85

  // Lighting
  scene.add(new AmbientLight(0x404060, 0.5))
  const dirLight = new DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(2, 4, 3)
  scene.add(dirLight)

  // ── Initialize Skia ──
  setStatus('Loading Skia WASM...', true)
  const skia = await Skia.init(renderer)
  setStatus(`Skia ready (${skia.backend})`, true)

  // ── Skia texture canvas (shapes → texture for 3D mesh) ──
  const TEX_W = 1024
  const TEX_H = 880
  const shapesCanvas = new SkiaCanvas({ renderer, width: TEX_W, height: TEX_H })
  // Don't add to scene — it's not a visible 3D object, just produces a texture

  // ── Skia overlay canvas (title/FPS → screen) ──
  const pw = window.innerWidth * dpr
  const ph = window.innerHeight * dpr
  const overlayCanvas = new SkiaCanvas({ renderer, width: pw, height: ph, overlay: true })

  // ── Build shapes scene (renders to texture) ──
  const REF = 512
  const scale = TEX_W / REF

  const bg = new SkiaRect()
  bg.x = 0; bg.y = 0; bg.width = TEX_W; bg.height = TEX_H
  bg.fill = [0.06, 0.06, 0.1, 0]
  shapesCanvas.add(bg)

  const shapeGroup = new SkiaGroup()
  shapeGroup.scale.set(scale, scale, 1)
  shapesCanvas.add(shapeGroup)

  // Colored rectangles
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
    shapeGroup.add(rect)
    squares.push(rect)
  }
  let sqSwapA = 0, sqSwapB = 1, sqSwapStart = 0
  let sqFromA = [...sqCols[0]!], sqFromB = [...sqCols[1]!]
  let sqToA = [...sqCols[1]!], sqToB = [...sqCols[0]!]

  // Circles
  const circles: SkiaCircle[] = []
  for (let i = 0; i < 8; i++) {
    const circle = new SkiaCircle()
    circle.cx = 64 + i * 56; circle.cy = 140; circle.r = 18
    circle.fill = [0.4, 0.4, 0.6, 0.7]
    shapeGroup.add(circle)
    circles.push(circle)
  }

  // Stroked frame
  const strokedFrame = new SkiaRect()
  strokedFrame.x = 20; strokedFrame.y = 170; strokedFrame.width = 472; strokedFrame.height = 100
  strokedFrame.stroke = [1, 1, 1, 0.3]; strokedFrame.strokeWidth = 2
  shapeGroup.add(strokedFrame)

  const innerFrame = new SkiaRect()
  innerFrame.x = 28; innerFrame.y = 176; innerFrame.width = 456; innerFrame.height = 88
  innerFrame.cornerRadius = 10; innerFrame.stroke = [1, 1, 1, 0.3]; innerFrame.strokeWidth = 2
  shapeGroup.add(innerFrame)

  // Scanner lines
  const lines: SkiaLine[] = []
  for (let i = 0; i < 9; i++) {
    const line = new SkiaLine()
    line.x1 = 36; line.y1 = 184 + i * 9; line.x2 = 472; line.y2 = 184 + i * 9
    line.strokeWidth = 1
    line.stroke = [0.5, 0.8, 0.3, 0.6]
    shapeGroup.add(line)
    lines.push(line)
  }

  // Gradient bars
  const gradColors: [number, number][] = [
    [0xFFFF4444, 0xFF4444FF], [0xFF44FF44, 0xFFFF44FF],
    [0xFFFFAA00, 0xFF00AAFF], [0xFF4488FF, 0xFFFF8844],
  ]
  const gradRects: SkiaRect[] = []
  const gradPaints: SkiaPaint[] = []
  for (let i = 0; i < gradColors.length; i++) {
    const y = 284 + i * 22
    const rect = new SkiaRect()
    rect.x = 30; rect.y = y; rect.width = 452; rect.height = 16; rect.cornerRadius = 4
    const paint = new SkiaPaint(skia).setFill()
    rect.paint = paint
    shapeGroup.add(rect)
    gradRects.push(rect)
    gradPaints.push(paint)
  }

  // PathOps
  const pathOpColors: [number, number, number][] = [
    [0.9, 0.3, 0.3], [0.3, 0.9, 0.4], [0.3, 0.5, 0.9], [0.9, 0.7, 0.2],
  ]
  const pathOpNames: Array<'difference' | 'intersect' | 'union' | 'xor'> = [
    'difference', 'intersect', 'union', 'xor',
  ]
  const pathOpData = pathOpNames.map((_, pi) => {
    const resultNode = new SkiaPathNode()
    resultNode.fill = [...pathOpColors[pi]!, 0.9]
    shapeGroup.add(resultNode)
    const ghostANode = new SkiaPathNode()
    ghostANode.stroke = [1, 1, 1, 0.15]; ghostANode.strokeWidth = 1
    shapeGroup.add(ghostANode)
    const ghostBNode = new SkiaPathNode()
    ghostBNode.stroke = [1, 1, 1, 0.15]; ghostBNode.strokeWidth = 1
    shapeGroup.add(ghostBNode)
    return {
      resultNode, ghostANode, ghostBNode,
      pathA: new SkiaPath(skia), pathB: new SkiaPath(skia), resultPath: new SkiaPath(skia),
    }
  })

  // ── Build overlay scene (title/FPS → screen) ──
  const titleText = new SkiaTextNode()
  titleText.text = '@three-flatland/skia'
  titleText.fill = [1, 1, 1, 1]
  titleText.y = ph - 90
  overlayCanvas.add(titleText)

  const subtitleText = new SkiaTextNode()
  subtitleText.text = 'GPU-accelerated vector graphics in the browser'
  subtitleText.y = ph - 40
  overlayCanvas.add(subtitleText)
  let subtitlePaint: SkiaPaint | null = null

  const backendText = new SkiaTextNode()
  backendText.x = 20; backendText.y = 30
  backendText.fill = [0.6, 0.6, 0.8, 0.6]
  overlayCanvas.add(backendText)

  // ── Load fonts ──
  const FONT_URL = 'https://cdn.jsdelivr.net/gh/rsms/inter@v4.1/docs/font-files/InterVariable.ttf'
  SkiaFontLoader.load(FONT_URL, skia).then((typeface) => {
    const titleF = typeface.atSize(32 * dpr)
    const subF = typeface.atSize(14 * dpr)
    const fpsF = typeface.atSize(11 * dpr)

    titleText.font = titleF
    titleText.x = (pw - titleF.measureText(titleText.text)) / 2

    subtitleText.font = subF
    subtitleText.x = (pw - subF.measureText(subtitleText.text)) / 2
    subtitlePaint = new SkiaPaint(skia).setFill()
    subtitleText.paint = subtitlePaint

    backendText.font = fpsF
    backendText.text = `Backend: ${skia.backend.toUpperCase()}`
  }).catch(e => console.warn('Font load failed:', e))

  // ── 3D scene: floating panel with Skia texture ──
  const panelW = 2.8
  const panelH = 2.8 * (880 / 1024) // match texture aspect ratio
  const panelGeo = new PlaneGeometry(panelW, panelH)

  // Panels — center + two flanking, rotated inward
  const panelMat = new MeshBasicMaterial({
    color: 0xffffff,
    side: DoubleSide,
    transparent: true,
    premultipliedAlpha: true,
  })
  const panelCenter = new Mesh(panelGeo, panelMat)
  panelCenter.position.set(0, 1.2, -0.4)
  scene.add(panelCenter)

  const panelMatL = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, transparent: true, premultipliedAlpha: true })
  const panelLeft = new Mesh(panelGeo, panelMatL)
  panelLeft.position.set(-2.6, 1.2, 0.3)
  panelLeft.rotation.y = 0.35
  scene.add(panelLeft)

  const panelMatR = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, transparent: true, premultipliedAlpha: true })
  const panelRight = new Mesh(panelGeo, panelMatR)
  panelRight.position.set(2.6, 1.2, 0.3)
  panelRight.rotation.y = -0.35
  scene.add(panelRight)


  // Reflective ground (TSL reflector + blur + distance fade)
  const groundMat = new MeshStandardNodeMaterial()
  const groundReflector = reflector({ resolutionScale: 1.0 })

  // Blur the reflection
  const blurredReflection = gaussianBlur(groundReflector, null, 6)

  // Fade based on distance from panel (xz plane), not from camera
  // Strongest directly under the panel, fades outward
  const dist = positionWorld.xz.length() // distance from origin on ground
  const fadeFactor = dist.div(3.0).clamp(0.0, 1.0).oneMinus()
  const fadeSharp = fadeFactor.mul(fadeFactor).mul(fadeFactor) // cubic

  groundMat.colorNode = tslColor(new Color(0x050505))
    .add((blurredReflection as any).rgb.mul(fadeSharp).mul(0.5))
  // Roughness: sharper under panel, rougher outward
  groundMat.roughnessNode = tslFloat(0.5)
    .add(dist.div(5.0).clamp(0.0, 0.5))
  groundMat.metalness = 0.5
  const ground = new Mesh(new PlaneGeometry(50, 50), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.01
  ground.add(groundReflector.target)
  scene.add(ground)

  // ── TweakPane debug controls ──
  const { pane, stats } = createPane()

  // ── Animation loop ──

  function animate(t: number) {
    stats.begin()

    // ── Animate squares ──
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

    // ── Animate circles ──
    for (let i = 0; i < circles.length; i++) {
      const ct = ((i / 8) + t * 0.0002) % 1.0
      circles[i]!.fill = [0.15 + 0.35 * ct, 0.2 + 0.25 * (1 - ct), 0.3 + 0.4 * Math.sin(ct * Math.PI * 2 + 4), 0.7]
    }

    // ── Animate scanner lines ──
    const linePhase = Math.floor(t / 83) % 9
    for (let i = 0; i < lines.length; i++) {
      const lt = ((i + linePhase) % 9) / 9
      lines[i]!.stroke = [0.5 + 0.5 * lt, 0.8 - 0.3 * lt, 0.3 + 0.5 * lt, 0.6]
    }

    // ── Animate gradient bars ──
    for (let i = 0; i < gradPaints.length; i++) {
      const y = 284 + i * 22
      const dir = (i % 2 === 0) ? 1 : -1
      const speed = 0.15 + i * 0.03
      const mid = 0.5 + 0.4 * Math.sin(t * speed * 0.001 * dir)
      const [cA, cB] = gradColors[i]!
      gradPaints[i]!.setLinearGradient(30, y, 482, y, [cA!, cB!, cA!], [0, mid, 1])
    }

    // ── Animate PathOps ──
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

    // ── Gentle panel hover ──
    const hover = Math.sin(t * 0.001) * 0.05
    panelCenter.position.y = 1.2 + hover
    panelLeft.position.y = 1.2 + hover
    panelRight.position.y = 1.2 + hover

    // ── Update controls ──
    controls.update()

    // ── Render pipeline ──
    // 1. Skia shapes → texture
    shapesCanvas.render(true)

    // 2. Apply Skia texture to 3D meshes (once available)
    const skiaTex = shapesCanvas.texture
    if (skiaTex && panelMat.map !== skiaTex) {
      panelMat.map = skiaTex; panelMat.needsUpdate = true
      panelMatL.map = skiaTex; panelMatL.needsUpdate = true
      panelMatR.map = skiaTex; panelMatR.needsUpdate = true
    }

    // 3. Three.js renders 3D scene (panel with Skia texture + reflection + ground)
    renderer.render(scene, camera)

    // 4. Skia overlay on top of 3D
    overlayCanvas.render(true)

    stats.update({ drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles })
    stats.end()
    requestAnimationFrame(animate)
  }
  requestAnimationFrame(animate)

  // ── Resize ──
  window.addEventListener('resize', () => {
    const nw = window.innerWidth
    const nh = window.innerHeight
    renderer.setSize(nw, nh)
    camera.aspect = nw / nh
    camera.updateProjectionMatrix()
    const npw = nw * dpr
    const nph = nh * dpr
    overlayCanvas.setSize(npw, nph)
    titleText.y = nph - 90
    subtitleText.y = nph - 40
  })
}

main().catch((err) => {
  console.error(err)
  setStatus(`Error: ${err.message}`, false)
})
