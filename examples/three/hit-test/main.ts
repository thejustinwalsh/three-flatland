import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color, Raycaster, Vector2, Plane, Vector3 } from 'three'
import { AnimatedSprite2D, SpriteSheetLoader, createDevtoolsProvider } from 'three-flatland'
import { createPane } from '@three-flatland/devtools'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

// HMR cleanup — stop the old animate loop + dispose the old renderer
// when Vite reloads this module. Without this, every dev save stacks a
// fresh renderer on top of the previous one's still-running rAF.
let rafId = 0
let activeRenderer: WebGPURenderer | null = null
// Named resize handler so HMR can remove it on dispose. An anonymous
// callback can't be removed, so each dev save would stack another
// closure over the old (disposed) camera/renderer.
let onResize: (() => void) | null = null

// ── Rarity tiers ──────────────────────────────────────────────────────────

const RARITIES = [
  { name: 'Common', color: 0xaaaaaa, css: '#aaaaaa', count: 4 },
  { name: 'Uncommon', color: 0x44dd66, css: '#44dd66', count: 3 },
  { name: 'Rare', color: 0x4488ff, css: '#4488ff', count: 2 },
  { name: 'Legendary', color: 0xffaa22, css: '#ffaa22', count: 1 },
] as const

type RarityName = (typeof RARITIES)[number]['name']

// Simple seeded PRNG — same seed as the React example so layouts match.
function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Loot item state ───────────────────────────────────────────────────────

interface CoinItem {
  sprite: AnimatedSprite2D
  rarity: RarityName
  name: string
  baseColor: Color
  alive: boolean
  shrinkProgress: number | null
}

// ── HUD ───────────────────────────────────────────────────────────────────

const collectedCount: Record<string, number> = {}
for (const r of RARITIES) collectedCount[r.name] = 0

function updateHUD() {
  const el = document.getElementById('collected')
  if (!el) return
  el.innerHTML = RARITIES.map((r) => `<span style="color:${r.css}">${r.name}: ${collectedCount[r.name]}</span>`).join(
    ''
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const scene = new Scene()
  // Gem-tinted radial gradient backdrop (the canonical example background).
  ;(scene as unknown as { backgroundNode: unknown }).backgroundNode = gemGradientNode({ gem: GEM })

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

  // WebGPU Renderer (required for TSL materials)
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1) // Pixel-perfect for pixel art
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  // ── Raycaster setup ───────────────────────────────────────────────────

  const raycaster = new Raycaster()
  const pointer = new Vector2()

  // Z=0 world plane — where we unproject pointer clicks for knight movement.
  const groundPlane = new Plane(new Vector3(0, 0, 1), 0)
  const _planeHit = new Vector3()

  /** Convert a DOM pointer event to NDC and load the raycaster. */
  function castFromEvent(e: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
  }

  /** Unproject the current raycaster ray onto Z=0, returning world XY. */
  function rayToGroundXY(): { x: number; y: number } | null {
    const hit = raycaster.ray.intersectPlane(groundPlane, _planeHit)
    if (!hit) return null
    return { x: _planeHit.x, y: _planeHit.y }
  }

  // ── Load spritesheets ─────────────────────────────────────────────────

  // Relative paths (like the other three examples) so assets resolve against
  // the document URL in BOTH the per-example server and the MPA. Using
  // import.meta.env.BASE_URL here breaks under the MPA, where BASE_URL is '/'
  // → '/sprites/knight.json' 404s → the loader throws → the canvas stays black.
  const [knightSheet, coinSheet] = await Promise.all([
    SpriteSheetLoader.load('./sprites/knight.json'),
    SpriteSheetLoader.load('./sprites/coin.json'),
  ])

  // ── Knight ────────────────────────────────────────────────────────────

  const KNIGHT_SCALE = 96

  const knight = new AnimatedSprite2D({
    spriteSheet: knightSheet,
    animationSet: {
      fps: 10,
      animations: {
        idle: { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'], fps: 8, loop: true },
        run: {
          frames: Array.from({ length: 16 }, (_, i) => `run_${i}`),
          fps: 12,
          loop: true,
        },
        // Tumble — played while the knight is being dragged.
        roll: {
          frames: Array.from({ length: 8 }, (_, i) => `roll_${i}`),
          fps: 15,
          loop: true,
        },
      },
    },
    animation: 'idle',
    anchor: [0.5, 0.5],
  })
  knight.hitTestMode = 'bounds' // full quad is grabbable for drag-and-drop
  knight.scale.set(KNIGHT_SCALE, KNIGHT_SCALE, 1)
  knight.position.set(0, 0, 0)
  scene.add(knight)

  // ── Knight movement ───────────────────────────────────────────────────

  let knightTarget: { x: number; y: number } | null = null
  let pendingPickup: CoinItem | null = null
  const KNIGHT_SPEED = 140
  const PICKUP_RANGE = 50

  function moveKnightTo(x: number, y: number) {
    knightTarget = { x, y }
    knight.play('run')
    // Face the target via flipX (a UV flip). Negating scale.x would reverse
    // the quad winding and the FrontSide material culls it — the knight
    // vanishes when facing left. Only flip on real horizontal travel.
    if (Math.abs(x - knight.position.x) > 0.5) knight.flipX = x < knight.position.x
  }

  function updateKnightMovement(dt: number) {
    if (!knightTarget) return

    const dx = knightTarget.x - knight.position.x
    const dy = knightTarget.y - knight.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (pendingPickup && dist < PICKUP_RANGE) {
      startCollect(pendingPickup)
      pendingPickup = null
      knightTarget = null
      knight.play('idle')
      return
    }

    if (dist < 2) {
      knightTarget = null
      knight.play('idle')
      return
    }

    const step = Math.min(KNIGHT_SPEED * dt, dist)
    knight.position.x += (dx / dist) * step
    knight.position.y += (dy / dist) * step
  }

  // ── Coin items ────────────────────────────────────────────────────────

  const coins: CoinItem[] = []
  // The pickable array fed to raycaster.intersectObjects().
  // Coins are removed from this array when collected so they stop being hit.
  const pickableCoins: AnimatedSprite2D[] = []

  const COIN_SCALE = 48
  const rng = mulberry32(42)

  // Core: build a coin sprite at a given spot and register it as pickable.
  function addCoin(rarity: (typeof RARITIES)[number], x: number, y: number, z: number, fps: number): CoinItem {
    const sprite = new AnimatedSprite2D({
      spriteSheet: coinSheet,
      animationSet: {
        fps: 10,
        animations: {
          spin: {
            frames: Array.from({ length: 12 }, (_, i) => `coin_${i}`),
            fps,
            loop: true,
          },
        },
      },
      animation: 'spin',
      anchor: [0.5, 0.5],
    })

    sprite.position.set(x, y, z)
    sprite.scale.set(COIN_SCALE, COIN_SCALE, 1)
    const baseColor = new Color(rarity.color)
    sprite.tint = baseColor

    scene.add(sprite)
    pickableCoins.push(sprite)

    return {
      sprite,
      rarity: rarity.name,
      name: `${rarity.name} Coin`,
      baseColor,
      alive: true,
      shrinkProgress: null,
    }
  }

  // Seeded layout coin (deterministic starting set — matches the React example).
  function createCoin(rarity: (typeof RARITIES)[number], index: number): CoinItem {
    const angle = (index / 14) * Math.PI * 2 + (rng() - 0.5) * 0.5
    const radius = 60 + rng() * 110
    return addCoin(rarity, Math.cos(angle) * radius, Math.sin(angle) * radius, index * 0.01, 8 + rng() * 4)
  }

  // Genuinely random coin — used by the periodic spawner. Capped on live
  // (pickable) coins so an idle session doesn't grow the scene without bound.
  const MAX_LIVE_COINS = 24
  function spawnRandomCoin() {
    if (pickableCoins.length >= MAX_LIVE_COINS) return
    const rarity = RARITIES[Math.floor(Math.random() * RARITIES.length)]!
    const angle = Math.random() * Math.PI * 2
    const radius = 60 + Math.random() * 110
    coins.push(addCoin(rarity, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.5, 8 + Math.random() * 4))
  }

  for (const rarity of RARITIES) {
    for (let i = 0; i < rarity.count; i++) {
      coins.push(createCoin(rarity, coins.length))
    }
  }

  // ── Collection ────────────────────────────────────────────────────────

  function startCollect(item: CoinItem) {
    if (!item.alive) return
    item.alive = false
    item.shrinkProgress = 0
    collectedCount[item.rarity]!++
    updateHUD()

    // Remove from pickable array immediately so it can't be re-hit.
    const idx = pickableCoins.indexOf(item.sprite)
    if (idx !== -1) pickableCoins.splice(idx, 1)

    renderer.domElement.style.cursor = 'default'
  }

  // ── Hover state ───────────────────────────────────────────────────────

  let hoveredCoin: CoinItem | null = null

  function setHover(item: CoinItem | null) {
    if (hoveredCoin === item) return

    // Reset previous hover
    if (hoveredCoin) {
      hoveredCoin.sprite.tint = hoveredCoin.baseColor
      hoveredCoin.sprite.scale.set(COIN_SCALE, COIN_SCALE, 1)
    }

    hoveredCoin = item

    if (item) {
      // The coin atlas is neutral grayscale, so `tint` reproduces the rarity
      // color exactly (highlights hit the pure hue, matching the HUD legend).
      // On hover, brighten the same hue a touch rather than washing to white —
      // a hard pull to white would desaturate and drop the rarity identity.
      item.sprite.tint = item.baseColor.clone().multiplyScalar(1.4)
      const s = COIN_SCALE * 1.2
      item.sprite.scale.set(s, s, 1)
      renderer.domElement.style.cursor = 'pointer'
    } else {
      renderer.domElement.style.cursor = 'default'
    }
  }

  // ── Drag-and-drop the knight ──────────────────────────────────────────
  // Grab the knight and fling him around — he tumbles (roll) while held and
  // drops to idle on release. `engaged` marks any press that started on the
  // knight so the trailing click doesn't also fire a walk.
  const knightDrag = { active: false, engaged: false }

  // ── Pointer events ────────────────────────────────────────────────────

  renderer.domElement.addEventListener('pointerdown', (e) => {
    castFromEvent(e)
    // A coin under the cursor wins — let the click handler collect it.
    if (raycaster.intersectObjects(pickableCoins, false).length > 0) return
    if (raycaster.intersectObject(knight, false).length === 0) return
    knightDrag.active = true
    knightDrag.engaged = true
    knightTarget = null
    pendingPickup = null
    knight.play('roll')
    // Capture can throw on synthetic/non-active pointers — don't let it abort.
    try {
      renderer.domElement.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    renderer.domElement.style.cursor = 'grabbing'
  })

  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!knightDrag.active) return
    knightDrag.active = false
    knight.play('idle')
    try {
      renderer.domElement.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    renderer.domElement.style.cursor = 'default'
  })

  renderer.domElement.addEventListener('pointermove', (e) => {
    // While dragging, the pointer drives the knight's position.
    if (knightDrag.active) {
      castFromEvent(e)
      const g = rayToGroundXY()
      if (g) {
        const dx = g.x - knight.position.x
        if (Math.abs(dx) > 0.5) knight.flipX = dx < 0
        knight.position.set(g.x, g.y, knight.position.z)
      }
      return
    }

    castFromEvent(e)
    const hits = raycaster.intersectObjects(pickableCoins, false)
    const hitCoin = hits.length > 0 ? (coins.find((c) => c.sprite === hits[0]!.object) ?? null) : null
    setHover(hitCoin)
    // Grab cursor when hovering the knight (and not already over a coin).
    if (!hitCoin && raycaster.intersectObject(knight, false).length > 0) {
      renderer.domElement.style.cursor = 'grab'
    }
  })

  renderer.domElement.addEventListener('click', (e) => {
    // A press that started on the knight (tap or drag) never walks him.
    if (knightDrag.engaged) {
      knightDrag.engaged = false
      return
    }
    castFromEvent(e as PointerEvent)

    // 1. Try coins first.
    const hits = raycaster.intersectObjects(pickableCoins, false)
    if (hits.length > 0) {
      const coin = coins.find((c) => c.sprite === hits[0]!.object)
      if (coin && coin.alive) {
        // Diablo-style: walk to coin, then pick it up.
        const dx = coin.sprite.position.x - knight.position.x
        const dy = coin.sprite.position.y - knight.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < PICKUP_RANGE) {
          startCollect(coin)
        } else {
          pendingPickup = coin
          moveKnightTo(coin.sprite.position.x, coin.sprite.position.y)
        }
      }
      return
    }

    // 2. Click on empty ground — move the knight there.
    const ground = rayToGroundXY()
    if (ground) {
      pendingPickup = null
      moveKnightTo(ground.x, ground.y)
    }
  })

  // ── Tweakpane UI ──────────────────────────────────────────────────────

  // Default stats only; this example exposes no custom controls.
  const paneBundle = createPane({ driver: 'manual' })
  const updateDevtools = () => paneBundle.update()
  const devtools = createDevtoolsProvider({ name: 'hit-test' })

  // ── Resize ────────────────────────────────────────────────────────────

  onResize = () => {
    const a = window.innerWidth / window.innerHeight
    camera.left = (-frustumSize * a) / 2
    camera.right = (frustumSize * a) / 2
    camera.top = frustumSize / 2
    camera.bottom = -frustumSize / 2
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  // ── Render loop ───────────────────────────────────────────────────────

  updateHUD()

  let lastTime = performance.now()
  let spawnAccum = 0
  const SPAWN_INTERVAL_SEC = 3

  function animate() {
    rafId = requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    const deltaSec = deltaMs / 1000
    lastTime = now

    // Periodically drop a fresh random coin onto the map.
    spawnAccum += deltaSec
    if (spawnAccum >= SPAWN_INTERVAL_SEC) {
      spawnAccum = 0
      spawnRandomCoin()
    }

    // Animate sprites.
    knight.update(deltaMs)
    for (const coin of coins) {
      // Skip sprites that have been fully collected and removed from the scene.
      if (coin.shrinkProgress !== -1) {
        coin.sprite.update(deltaMs)
      }
    }

    // Knight movement.
    updateKnightMovement(deltaSec)

    // Shrink-to-collect animations.
    for (const coin of coins) {
      if (coin.shrinkProgress === null || coin.shrinkProgress < 0) continue
      coin.shrinkProgress += deltaSec * 4
      if (coin.shrinkProgress >= 1) {
        scene.remove(coin.sprite)
        coin.shrinkProgress = -1 // mark done
      } else {
        const s = (1 - coin.shrinkProgress) * COIN_SCALE
        coin.sprite.scale.set(s, s, 1)
        coin.sprite.position.y += deltaSec * 40 // float up
      }
    }

    devtools.beginFrame(performance.now(), renderer)
    renderer.render(scene, camera)
    devtools.endFrame(renderer)
    updateDevtools()
  }

  animate()
}

void main()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (onResize) {
      window.removeEventListener('resize', onResize)
      onResize = null
    }
    if (activeRenderer) {
      activeRenderer.dispose?.()
      activeRenderer.domElement.remove()
      activeRenderer = null
    }
  })
}
