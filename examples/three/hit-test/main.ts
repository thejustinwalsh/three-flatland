import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color, Raycaster, Vector2, Plane, Vector3 } from 'three'
import { AnimatedSprite2D, SpriteSheetLoader, createDevtoolsProvider } from 'three-flatland'
import { createPane } from '@three-flatland/devtools'

// HMR cleanup — stop the old animate loop + dispose the old renderer
// when Vite reloads this module. Without this, every dev save stacks a
// fresh renderer on top of the previous one's still-running rAF.
let rafId = 0
let activeRenderer: WebGPURenderer | null = null

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
  el.innerHTML = RARITIES.map(
    (r) => `<span style="color:${r.css}">${r.name}: ${collectedCount[r.name]}</span>`
  ).join('')
}

function setStatus(msg: string) {
  const el = document.getElementById('status')
  if (el) el.textContent = msg
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const scene = new Scene()
  scene.background = new Color(0x0a0a1a)

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

  const base = import.meta.env.BASE_URL
  const [knightSheet, coinSheet] = await Promise.all([
    SpriteSheetLoader.load(base + 'sprites/knight.json'),
    SpriteSheetLoader.load(base + 'sprites/coin.json'),
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
      },
    },
    animation: 'idle',
    anchor: [0.5, 0.5],
  })
  knight.hitTestMode = 'none' // knight is not pickable
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
    const sx = Math.abs(knight.scale.x)
    knight.scale.x = x < knight.position.x ? -sx : sx
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

  function createCoin(rarity: (typeof RARITIES)[number], index: number): CoinItem {
    const sprite = new AnimatedSprite2D({
      spriteSheet: coinSheet,
      animationSet: {
        fps: 10,
        animations: {
          spin: {
            frames: Array.from({ length: 12 }, (_, i) => `coin_${i}`),
            fps: 8 + rng() * 4,
            loop: true,
          },
        },
      },
      animation: 'spin',
      anchor: [0.5, 0.5],
    })

    const angle = (index / 14) * Math.PI * 2 + (rng() - 0.5) * 0.5
    const radius = 60 + rng() * 110
    sprite.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, index * 0.01)
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
    setStatus(`Collected ${item.name}!`)

    // Remove from pickable array immediately so it can't be re-hit.
    const idx = pickableCoins.indexOf(item.sprite)
    if (idx !== -1) pickableCoins.splice(idx, 1)

    renderer.domElement.style.cursor = 'default'
  }

  // ── Hover state ───────────────────────────────────────────────────────

  let hoveredCoin: CoinItem | null = null
  const WHITE = new Color(1, 1, 1)

  function setHover(item: CoinItem | null) {
    if (hoveredCoin === item) return

    // Reset previous hover
    if (hoveredCoin) {
      hoveredCoin.sprite.tint = hoveredCoin.baseColor
      hoveredCoin.sprite.scale.set(COIN_SCALE, COIN_SCALE, 1)
    }

    hoveredCoin = item

    if (item) {
      item.sprite.tint = WHITE
      const s = COIN_SCALE * 1.2
      item.sprite.scale.set(s, s, 1)
      setStatus(`${item.name} — Click to collect!`)
      renderer.domElement.style.cursor = 'pointer'
    } else {
      setStatus('Hover over coins. Click to walk. Click coins to collect!')
      renderer.domElement.style.cursor = 'default'
    }
  }

  // ── Pointer events ────────────────────────────────────────────────────

  renderer.domElement.addEventListener('pointermove', (e) => {
    castFromEvent(e)
    const hits = raycaster.intersectObjects(pickableCoins, false)
    const hitCoin =
      hits.length > 0 ? (coins.find((c) => c.sprite === hits[0]!.object) ?? null) : null
    setHover(hitCoin)
  })

  renderer.domElement.addEventListener('click', (e) => {
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
          setStatus(`Walking to ${coin.name}…`)
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

  const { pane, update: updateDevtools } = createPane({ driver: 'manual' })
  const devtools = createDevtoolsProvider({ name: 'hit-test' })

  const infoFolder = pane.addFolder({ title: 'Info', expanded: true })
  infoFolder.addBinding(
    { note: 'Hover = highlight  |  Click coin = collect  |  Click ground = walk' },
    'note',
    {
      readonly: true,
      label: '',
    }
  )

  // ── Resize ────────────────────────────────────────────────────────────

  window.addEventListener('resize', () => {
    const a = window.innerWidth / window.innerHeight
    camera.left = (-frustumSize * a) / 2
    camera.right = (frustumSize * a) / 2
    camera.top = frustumSize / 2
    camera.bottom = -frustumSize / 2
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // ── Render loop ───────────────────────────────────────────────────────

  updateHUD()

  let lastTime = performance.now()

  function animate() {
    rafId = requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    const deltaSec = deltaMs / 1000
    lastTime = now

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
