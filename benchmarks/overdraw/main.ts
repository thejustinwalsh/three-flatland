import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera } from 'three'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'
import {
  Sprite2D,
  Sprite2DMaterial,
  SpriteGroup,
  SortLayers,
  SpriteSheetLoader,
  type SpriteSheet,
  createDevtoolsProvider,
} from 'three-flatland'
import { createPane } from '@three-flatland/devtools'

/* HMR-tracked teardown state. Without this, every dev save accumulates
 * a fresh renderer + animate() loop while the previous one keeps
 * RAFing forever. Dev-only — `import.meta.hot` is undefined in prod. */
let rafId = 0
let activeRenderer: WebGPURenderer | null = null

const ASSET_BASE = './assets/'
const FRAME_NAMES = ['puff', 'wisp', 'spark', 'ring'] as const
const TINTS = ['#f4d35e', '#5ec8d8', '#e85f9c', '#9c6ade', '#5fd88f'] as const
const VIEW_SIZE = 900
// Extra world-space margin beyond the visible frustum before a drifting
// particle wraps to the opposite edge — keeps the wrap invisible.
const MARGIN = 220

type Mode = 'tight' | 'quad'

interface ParticleState {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  rotSpeed: number
  scale: number
  frameIndex: number
  tint: string
  alpha: number
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function createParticle(halfW: number, halfH: number): ParticleState {
  return {
    x: randomRange(-halfW, halfW),
    y: randomRange(-halfH, halfH),
    vx: randomRange(-14, 14),
    vy: randomRange(-14, 14),
    rot: randomRange(0, Math.PI * 2),
    rotSpeed: randomRange(-0.5, 0.5),
    scale: randomRange(140, 300),
    frameIndex: Math.floor(Math.random() * FRAME_NAMES.length),
    tint: TINTS[Math.floor(Math.random() * TINTS.length)]!,
    alpha: randomRange(0.45, 0.85),
  }
}

/** Half-extents of the current viewport in world units, plus wrap margin. */
function halfExtents(): { halfW: number; halfH: number } {
  const aspect = window.innerWidth / window.innerHeight
  return {
    halfW: (VIEW_SIZE * Math.max(aspect, 1)) / 2 + MARGIN,
    halfH: VIEW_SIZE / 2 + MARGIN,
  }
}

async function main() {
  const scene = new Scene()
  ;(scene as { backgroundNode?: unknown }).backgroundNode = gemGradientNode({ gem: GEM })

  const aspect = window.innerWidth / window.innerHeight
  const camera = new OrthographicCamera(
    (-VIEW_SIZE * aspect) / 2,
    (VIEW_SIZE * aspect) / 2,
    VIEW_SIZE / 2,
    -VIEW_SIZE / 2,
    0.1,
    1000
  )
  camera.position.z = 100

  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  // Load BOTH atlas variants up front. They pack pixel-identical pages,
  // but particles-quad.json carries no per-frame `mesh` field — loading
  // it never calls registerAtlasMesh for its texture, so
  // Sprite2DMaterial resolves THAT texture to the synth-quad path.
  // particles.json's texture does get mesh-registered and resolves to
  // tight-mesh. Toggling "mode" below is just picking which of these two
  // pre-loaded (sheet, material) pairs to draw with — no tight-mesh
  // internals touched from example code.
  const [meshSheet, quadSheet] = await Promise.all([
    SpriteSheetLoader.load(ASSET_BASE + 'particles.json', { texture: 'smooth' }),
    SpriteSheetLoader.load(ASSET_BASE + 'particles-quad.json', { texture: 'smooth' }),
  ])

  const materialTight = new Sprite2DMaterial({ map: meshSheet.texture, transparent: true })
  const materialQuad = new Sprite2DMaterial({ map: quadSheet.texture, transparent: true })
  console.log(
    `[overdraw-bench] materialTight._tightMesh=${materialTight._tightMesh} ` +
      `materialQuad._tightMesh=${materialQuad._tightMesh}`
  )

  const group = new SpriteGroup()
  scene.add(group)

  let mode: Mode = 'tight'
  let particles: ParticleState[] = []
  let sprites: Sprite2D[] = []
  let pendingLog = false

  function activeSheetAndMaterial(): { sheet: SpriteSheet; material: Sprite2DMaterial } {
    return mode === 'tight'
      ? { sheet: meshSheet, material: materialTight }
      : { sheet: quadSheet, material: materialQuad }
  }

  // Full teardown + recreate on mode/count change. `particles` (the
  // simulation state) is untouched by a mode switch — only the render
  // objects (and which material/sheet they point at) are rebuilt.
  function rebuildSprites(): void {
    group.clear()
    sprites = []
    const { sheet, material } = activeSheetAndMaterial()
    for (const p of particles) {
      const sprite = new Sprite2D({ material })
      sprite.scale.set(p.scale, p.scale, 1)
      sprite.setFrame(sheet.getFrame(FRAME_NAMES[p.frameIndex]!))
      sprite.position.set(p.x, p.y, 0)
      sprite.rotation.z = p.rot
      sprite.sortLayer = SortLayers.EFFECTS
      sprite.tint = p.tint
      sprite.alpha = p.alpha
      group.add(sprite)
      sprites.push(sprite)
    }
    pendingLog = true
  }

  function setParticleCount(count: number): void {
    const { halfW, halfH } = halfExtents()
    particles = Array.from({ length: count }, () => createParticle(halfW, halfH))
    rebuildSprites()
  }

  setParticleCount(1500)

  // Reads the just-rebuilt batch geometry so the measurement session can
  // confirm which strategy actually rendered and by how much its
  // (shared, per-batch, instanced) vertex/index counts differ.
  function logVertexCounts(label: string): void {
    for (const batches of group.batches.values()) {
      for (const batch of batches) {
        const geom = batch.geometry
        // synth-quad geometry ships no position attribute at all — its
        // 4 corners are synthesized from vertexIndex in the shader.
        const vertexCount = geom.attributes.position?.count ?? 4
        const indexCount = geom.index?.count ?? 0
        console.log(
          `[overdraw-bench] ${label}: geometry=${batch.geometryKind} ` +
            `verts=${vertexCount} indices=${indexCount} tris=${indexCount / 3} ` +
            `instances=${batch.activeCount}`
        )
      }
    }
  }

  // Tweakpane UI
  const { pane, update: updateDevtools } = createPane({ driver: 'manual' })
  const devtools = createDevtoolsProvider({ name: 'overdraw-bench' })

  const params = { mode: 'tight' as Mode, count: 1500, paused: false }
  const folder = pane.addFolder({ title: 'Overdraw Bench', expanded: true })
  folder
    .addBinding(params, 'mode', {
      label: 'mode',
      options: { 'Tight Mesh': 'tight', 'Synth Quad': 'quad' },
    })
    .on('change', (ev) => {
      mode = ev.value as Mode
      rebuildSprites()
    })
  folder
    .addBinding(params, 'count', {
      label: 'particles',
      options: {
        '500': 500,
        '1500': 1500,
        '3000': 3000,
        '6000': 6000,
        '20000': 20000,
        '40000': 40000,
        '60000': 60000,
      },
    })
    .on('change', (ev) => {
      setParticleCount(ev.value as number)
    })
  folder.addBinding(params, 'paused', { label: 'pause' })

  const readouts = { mode: 'tight', particles: 0, batches: 0 }
  const statsFolder = pane.addFolder({ title: 'Batching', expanded: false })
  statsFolder.addBinding(readouts, 'mode', { readonly: true })
  statsFolder.addBinding(readouts, 'particles', { readonly: true, format: (v: number) => v.toFixed(0) })
  statsFolder.addBinding(readouts, 'batches', { readonly: true, format: (v: number) => v.toFixed(0) })

  // Resize
  function handleResize(): void {
    const a = window.innerWidth / window.innerHeight
    camera.left = (-VIEW_SIZE * a) / 2
    camera.right = (VIEW_SIZE * a) / 2
    camera.top = VIEW_SIZE / 2
    camera.bottom = -VIEW_SIZE / 2
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', handleResize)

  // Animation loop
  let lastTime = performance.now()
  function animate() {
    rafId = requestAnimationFrame(animate)
    const now = performance.now()
    const dt = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now

    if (!params.paused) {
      const { halfW, halfH } = halfExtents()
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!
        const s = sprites[i]!
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.rotSpeed * dt
        if (p.x < -halfW) p.x = halfW
        else if (p.x > halfW) p.x = -halfW
        if (p.y < -halfH) p.y = halfH
        else if (p.y > halfH) p.y = -halfH
        s.position.set(p.x, p.y, 0)
        s.rotation.z = p.rot
      }
    }

    devtools.beginFrame(performance.now(), renderer)
    renderer.render(scene, camera)
    devtools.endFrame(renderer)
    updateDevtools()

    if (pendingLog) {
      pendingLog = false
      logVertexCounts(mode)
    }

    readouts.mode = mode
    readouts.particles = group.spriteCount
    readouts.batches = group.batchCount
    pane.refresh()
  }

  animate()
}

main()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (activeRenderer) {
      activeRenderer.dispose?.()
      activeRenderer.domElement.remove()
      activeRenderer = null
    }
  })
}
