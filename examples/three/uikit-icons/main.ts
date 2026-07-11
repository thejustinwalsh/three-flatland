import { WebGPURenderer } from 'three/webgpu'
import { Flatland } from 'three-flatland'
import { createPane } from '@three-flatland/devtools'
import { Container, Fullscreen, installIconAtlas, Svg } from '@three-flatland/uikit'
import type { RenderContext } from '@three-flatland/uikit'
import { Activity, Zap } from '@three-flatland/uikit-lucide'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

// ============================================
// uikit icons — a baked lucide icon atlas, rendered as a grid of Svg/lucide
// components. `installIconAtlas('/icons.shapes.glb')` swaps in a baked
// `SlugShapeSet` (see `bake-icons.mts`), so every `icon`-driven Svg below
// resolves with ZERO SVG parsing at runtime and batches into ONE shared
// `SlugShapeSet` — `ShapeGroupManager` collapses all 26 icons into a single
// `InstancedShapeMesh` draw call (see index.html's HUD copy for the honest
// framing: this is a draw-count / CPU win, not a GPU-ms win).
// ============================================

// 24 icons resolved generically by name; `activity` and `zap` (below) are
// shown as literal `@three-flatland/uikit-lucide` component instances —
// both paths resolve against the SAME installed atlas, so all 26 land in
// the one shared `SlugShapeSet` regardless of which API constructed them.
const ICON_NAMES = [
  'airplay',
  'alarm-clock',
  'archive',
  'award',
  'bell',
  'book-open',
  'calendar',
  'camera',
  'check',
  'chevron-down',
  'clock',
  'cloud',
  'compass',
  'database',
  'download',
  'flame',
  'gauge',
  'heart',
  'house',
  'image',
  'layers',
  'menu',
  'search',
  'star',
] as const

// Gem palette (see examples/_shared/gems.config.ts) — cycled per tile so the
// grid reads as "color is taxonomy", matching the brand's gem-named system.
const PALETTE = [
  '#00c4e9',
  '#00c38b',
  '#d29a00',
  '#995bff',
  '#eb3c67',
  '#e875c6',
  '#f3562e',
  '#2bd2c2',
]

/** A rounded chip behind one icon — the gem-gradient backdrop shows through
 * the gaps between chips (root Fullscreen stays transparent). */
function chip(icon: Svg): Container {
  const container = new Container({
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: '#171a20cc',
    justifyContent: 'center',
    alignItems: 'center',
  })
  container.add(icon)
  return container
}

/* HMR-tracked teardown state. Without this, every dev save accumulates
 * a fresh renderer + animate() loop while the previous one keeps
 * RAFing forever. Dev-only — `import.meta.hot` is undefined in prod. */
let rafId = 0
let activeRenderer: WebGPURenderer | null = null

async function main() {
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const flatland = new Flatland({
    viewSize: 900,
    aspect: window.innerWidth / window.innerHeight,
  })
  ;(flatland.scene as unknown as { backgroundNode: unknown }).backgroundNode = gemGradientNode({
    gem: GEM,
  })
  flatland.resize(window.innerWidth, window.innerHeight)
  // `Fullscreen` walks its Object3D ancestors looking for a Camera —
  // add the camera to Flatland's own scene so it's part of the graph
  // the UI root is rendered in.
  flatland.add(flatland.camera)

  // Install the baked atlas BEFORE constructing any `icon`-driven `Svg` —
  // `loadSvg` resolves `icon` against whatever set is installed at
  // CONSTRUCTION time (see svg/shape-set.ts's TSDoc); this is not a live
  // hot-swap for already-mounted components.
  await installIconAtlas('./icons.shapes.glb')

  const renderContext: RenderContext = { requestFrame: () => {} }
  const ui = new Fullscreen(
    renderer,
    {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 20,
      padding: 48,
    },
    undefined,
    { renderContext }
  )

  const tiles: Container[] = [
    chip(new Activity({ width: 40, height: 40, color: PALETTE[0] })),
    ...ICON_NAMES.map((name, i) =>
      chip(new Svg({ icon: name, width: 40, height: 40, color: PALETTE[(i + 1) % PALETTE.length] }))
    ),
    chip(new Zap({ width: 40, height: 40, color: PALETTE[7] })),
  ]
  ui.add(...tiles)
  flatland.camera.add(ui)

  // Debug hook — lets a devtools console (or vitexec) inspect the actual
  // rendered scene/renderer, e.g. to count `InstancedShapeMesh` instances
  // and read `info.render.drawCalls`.
  ;(window as unknown as { __scene?: unknown; __renderer?: unknown }).__scene = flatland.scene
  ;(window as unknown as { __scene?: unknown; __renderer?: unknown }).__renderer = renderer

  // No manual `createDevtoolsProvider` here: `Flatland` owns its own
  // provider and brackets every internal pass with beginFrame/endFrame —
  // see examples/three/uikit/main.ts for the same rule.
  const { update: updateDevtools } = createPane({ driver: 'manual' })

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  const drawsEl = document.getElementById('draws')
  let lastTime = performance.now()

  function animate() {
    rafId = requestAnimationFrame(animate)
    const now = performance.now()
    const delta = Math.min(0.1, (now - lastTime) / 1000)
    lastTime = now

    // uikit wants milliseconds.
    ui.update(delta * 1000)
    // Flatland instruments its own frame internally — no beginFrame/endFrame here.
    flatland.render(renderer)
    updateDevtools()

    if (drawsEl) drawsEl.textContent = `${renderer.info.render.drawCalls} draw calls this frame`
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
