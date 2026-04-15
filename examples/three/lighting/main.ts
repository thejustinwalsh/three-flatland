import { WebGPURenderer } from 'three/webgpu'
import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
} from 'three'
import {
  Flatland,
  Light2D,
  Sprite2D,
  AnimatedSprite2D,
  TileMap2D,
  SpriteSheetLoader,
  TextureLoader,
  Layers,
  type SpriteSheet,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
  type AnimationSetDefinition,
} from 'three-flatland'
import {
  DefaultLightEffect,
  AutoNormalProvider,
} from '@three-flatland/presets'
import { createPane } from '@three-flatland/devtools'

// ─── Constants ───────────────────────────────────────────────────────────────

const VIEW_SIZE = 400
const INDICATOR_SIZE = 20
const TILE_PX = 16
const TILE_SCALE = 2
const KNIGHT_SCALE = 28
const SLIME_SCALE = 18
const WALL_TILE = 24
const KNIGHT_COUNT = 4
const ROOM_HALF_W = 170
const ROOM_HALF_H = 120

// ─── Synthetic textures ──────────────────────────────────────────────────────

function solidCircle(r: number, g: number, b: number, size = 32, softEdge = false): DataTexture {
  const data = new Uint8Array(size * size * 4)
  const center = size / 2
  const radius = size / 2 - 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5
      const dy = y - center + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const i = (y * size + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      const a = dist < radius - 1 ? 255 : dist < radius ? Math.round((radius - dist) * 255) : 0
      data[i + 3] = softEdge ? Math.round(a * Math.max(0, 1 - dist / radius)) : a
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

function flatRect(r: number, g: number, b: number, size = WALL_TILE): DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = (Math.sin(x * 0.7) + Math.sin(y * 0.9)) * 8
      const i = (y * size + x) * 4
      data[i] = Math.max(0, Math.min(255, r + noise))
      data[i + 1] = Math.max(0, Math.min(255, g + noise))
      data[i + 2] = Math.max(0, Math.min(255, b + noise))
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

const torch1Tex = solidCircle(255, 102, 0)
const torch2Tex = solidCircle(255, 170, 0)
const slimeTex = solidCircle(0x3f, 0xff, 0x73, 24, true)
const wallTex = flatRect(84, 84, 100)
const pillarTex = flatRect(54, 54, 70)

// ─── Animation set ───────────────────────────────────────────────────────────

const knightAnimations: AnimationSetDefinition = {
  fps: 8,
  animations: {
    idle: { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'], fps: 6, loop: true },
    run: {
      frames: Array.from({ length: 16 }, (_, i) => `run_${i}`),
      fps: 16,
      loop: true,
    },
  },
}

// ─── Dungeon floor map ───────────────────────────────────────────────────────

function buildDungeonFloor(tilesetTex: DataTexture): TileMapData {
  const TS_COLS = 10
  const TS_ROWS = 10
  const mapCols = Math.ceil((VIEW_SIZE * 2) / TILE_PX) + 4
  const mapRows = Math.ceil(VIEW_SIZE / TILE_PX) + 4
  const FLOOR_PATTERN = [7, 8, 9, 10, 17, 18, 19, 20, 27, 28, 29, 30]
  const floorData = new Uint32Array(mapCols * mapRows)
  for (let y = 0; y < mapRows; y++) {
    for (let x = 0; x < mapCols; x++) {
      floorData[y * mapCols + x] = FLOOR_PATTERN[(y % 3) * 4 + (x % 4)]!
    }
  }
  const tilesetData: TilesetData = {
    name: 'dungeon',
    firstGid: 1,
    tileWidth: TILE_PX,
    tileHeight: TILE_PX,
    imageWidth: TS_COLS * TILE_PX,
    imageHeight: TS_ROWS * TILE_PX,
    columns: TS_COLS,
    tileCount: TS_COLS * TS_ROWS,
    tiles: new Map(),
    texture: tilesetTex,
  }
  const floorLayer: TileLayerData = {
    name: 'Floor',
    id: 0,
    width: mapCols,
    height: mapRows,
    data: floorData,
  }
  return {
    width: mapCols,
    height: mapRows,
    tileWidth: TILE_PX,
    tileHeight: TILE_PX,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    infinite: false,
    tilesets: [tilesetData],
    tileLayers: [floorLayer],
    objectLayers: [],
  }
}

// ─── Walls + pillars + torch positions ───────────────────────────────────────

interface WallSegment { x: number; y: number; w: number; h: number }

function buildRoomWalls(): WallSegment[] {
  const segs: WallSegment[] = []
  const T = WALL_TILE
  segs.push({ x: 0, y: ROOM_HALF_H, w: ROOM_HALF_W * 2 + T, h: T })
  segs.push({ x: 0, y: -ROOM_HALF_H, w: ROOM_HALF_W * 2 + T, h: T })
  segs.push({ x: -ROOM_HALF_W, y: 0, w: T, h: ROOM_HALF_H * 2 })
  segs.push({ x: ROOM_HALF_W, y: 0, w: T, h: ROOM_HALF_H * 2 })
  segs.push({ x: -40, y: 40, w: 80, h: T })
  segs.push({ x: 0, y: 10, w: T, h: 60 })
  segs.push({ x: 60, y: -50, w: T, h: 40 })
  return segs
}

const ROOM_WALLS = buildRoomWalls()

const PILLARS: [number, number][] = [
  [-100, 60],
  [100, 60],
  [-100, -60],
  [100, -60],
]

const TORCH_POSITIONS: [number, number][] = [
  [-100, 80],
  [100, 80],
]

// ─── Wanderers ───────────────────────────────────────────────────────────────

interface Wanderer {
  pos: Vector2
  vel: Vector2
  retargetTimer: number
}

function newWanderer(): Wanderer {
  return {
    pos: new Vector2(
      (Math.random() - 0.5) * ROOM_HALF_W * 0.6,
      (Math.random() - 0.5) * ROOM_HALF_H * 0.6,
    ),
    vel: new Vector2(),
    retargetTimer: Math.random() * 2,
  }
}

function updateWanderer(w: Wanderer, delta: number, speed: number): void {
  w.retargetTimer -= delta
  if (w.retargetTimer <= 0) {
    const a = Math.random() * Math.PI * 2
    w.vel.set(Math.cos(a) * speed, Math.sin(a) * speed)
    w.retargetTimer = 1 + Math.random() * 2
  }
  w.pos.x += w.vel.x * delta
  w.pos.y += w.vel.y * delta
  const mx = ROOM_HALF_W - WALL_TILE
  const my = ROOM_HALF_H - WALL_TILE
  if (w.pos.x > mx) { w.pos.x = mx; w.vel.x = -Math.abs(w.vel.x) }
  if (w.pos.x < -mx) { w.pos.x = -mx; w.vel.x = Math.abs(w.vel.x) }
  if (w.pos.y > my) { w.pos.y = my; w.vel.y = -Math.abs(w.vel.y) }
  if (w.pos.y < -my) { w.pos.y = -my; w.vel.y = Math.abs(w.vel.y) }
}

// ─── Scene helpers ───────────────────────────────────────────────────────────

function makeLitSprite(texture: DataTexture, w: number, h: number, x: number, y: number): Sprite2D {
  const s = new Sprite2D({ texture, anchor: [0.5, 0.5], layer: Layers.ENTITIES })
  s.scale.set(w, h, 1)
  s.position.set(x, y, 0)
  s.lit = true
  s.castsShadow = true
  s.addEffect(new AutoNormalProvider())
  return s
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const flatland = new Flatland({
    viewSize: VIEW_SIZE,
    clearColor: 0x06060c,
  })

  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)

  await renderer.init()
  flatland.resize(window.innerWidth, window.innerHeight)

  // ─ Lighting ────────────────────────────────────────────────────────────────

  const lighting = new DefaultLightEffect()
  flatland.setLighting(lighting)

  // ─ Assets ──────────────────────────────────────────────────────────────────

  const [knightSheet, tilesetTex] = await Promise.all([
    SpriteSheetLoader.load('./sprites/knight.json') as Promise<SpriteSheet>,
    TextureLoader.load('./sprites/Dungeon_Tileset.png'),
  ])

  // ─ Floor tilemap ──────────────────────────────────────────────────────────

  const floor = new TileMap2D({ data: buildDungeonFloor(tilesetTex as unknown as DataTexture) })
  floor.scale.set(TILE_SCALE, TILE_SCALE, 1)
  floor.position.set(0, 0, -100)
  flatland.add(floor)

  // ─ Lights ─────────────────────────────────────────────────────────────────

  const torch1 = new Light2D({
    type: 'point',
    color: 0xff6600,
    intensity: 1.2,
    distance: 180,
    decay: 2,
    position: TORCH_POSITIONS[0],
  })
  const torch2 = new Light2D({
    type: 'point',
    color: 0xffaa00,
    intensity: 1.0,
    distance: 180,
    decay: 2,
    position: TORCH_POSITIONS[1],
  })
  const ambient = new Light2D({ type: 'ambient', color: 0x222233, intensity: 0.12 })
  flatland.add(torch1)
  flatland.add(torch2)
  flatland.add(ambient)

  // ─ Hero (keyboard-controlled) ─────────────────────────────────────────────

  const hero = new AnimatedSprite2D({
    spriteSheet: knightSheet,
    animationSet: knightAnimations,
    animation: 'idle',
    layer: Layers.ENTITIES,
  })
  hero.scale.set(KNIGHT_SCALE * 1.2, KNIGHT_SCALE * 1.2, 1)
  hero.lit = true
  hero.castsShadow = true
  hero.addEffect(new AutoNormalProvider())
  flatland.add(hero)

  const heroPos = new Vector2(0, 0)
  const heroKeys = { up: false, down: false, left: false, right: false }
  let heroAnim: 'idle' | 'run' = 'idle'

  const keymap = (e: KeyboardEvent): keyof typeof heroKeys | null => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        return 'up'
      case 'KeyS':
      case 'ArrowDown':
        return 'down'
      case 'KeyA':
      case 'ArrowLeft':
        return 'left'
      case 'KeyD':
      case 'ArrowRight':
        return 'right'
      default:
        return null
    }
  }
  window.addEventListener('keydown', (e) => {
    const k = keymap(e)
    if (k) { heroKeys[k] = true; e.preventDefault() }
  })
  window.addEventListener('keyup', (e) => {
    const k = keymap(e)
    if (k) { heroKeys[k] = false; e.preventDefault() }
  })

  // ─ Walls + pillars ────────────────────────────────────────────────────────

  const wallSprites: Sprite2D[] = []
  for (const w of ROOM_WALLS) wallSprites.push(makeLitSprite(wallTex, w.w, w.h, w.x, w.y))
  for (const s of wallSprites) flatland.add(s)

  const pillarSprites: Sprite2D[] = []
  for (const p of PILLARS) pillarSprites.push(makeLitSprite(pillarTex, WALL_TILE, WALL_TILE * 1.5, p[0], p[1]))
  for (const s of pillarSprites) flatland.add(s)

  // ─ Wandering knights ──────────────────────────────────────────────────────

  interface KnightEntity { anim: Wanderer; sprite: AnimatedSprite2D }
  const knights: KnightEntity[] = []
  for (let i = 0; i < KNIGHT_COUNT; i++) {
    const sprite = new AnimatedSprite2D({
      spriteSheet: knightSheet,
      animationSet: knightAnimations,
      animation: 'run',
      layer: Layers.ENTITIES,
    })
    sprite.scale.set(KNIGHT_SCALE, KNIGHT_SCALE, 1)
    sprite.lit = true
    sprite.castsShadow = true
    sprite.addEffect(new AutoNormalProvider())
    flatland.add(sprite)
    knights.push({ anim: newWanderer(), sprite })
  }

  // ─ Slimes + per-slime lights ──────────────────────────────────────────────

  interface SlimeEntity { anim: Wanderer; sprite: Sprite2D; light: Light2D }
  const slimes: SlimeEntity[] = []
  function setSlimeCount(count: number) {
    while (slimes.length < count) {
      const sprite = new Sprite2D({ texture: slimeTex, anchor: [0.5, 0.5], layer: Layers.ENTITIES })
      sprite.scale.set(SLIME_SCALE, SLIME_SCALE, 1)
      sprite.lit = true
      sprite.castsShadow = true
      sprite.addEffect(new AutoNormalProvider())
      const light = new Light2D({
        type: 'point',
        color: 0x33ff66,
        intensity: 0.5,
        distance: 80,
        decay: 2,
      })
      flatland.add(sprite)
      flatland.add(light)
      slimes.push({ anim: newWanderer(), sprite, light })
    }
    while (slimes.length > count) {
      const s = slimes.pop()!
      flatland.remove(s.sprite)
      flatland.remove(s.light)
    }
  }
  setSlimeCount(10)

  // ─ Fixed torch-flame indicators ───────────────────────────────────────────

  const torchIndicator1 = new Sprite2D({ texture: torch1Tex, anchor: [0.5, 0.5], layer: Layers.FOREGROUND })
  torchIndicator1.scale.set(INDICATOR_SIZE, INDICATOR_SIZE, 1)
  torchIndicator1.position.set(TORCH_POSITIONS[0]![0], TORCH_POSITIONS[0]![1], 0)
  torchIndicator1.lit = false
  flatland.add(torchIndicator1)

  const torchIndicator2 = new Sprite2D({ texture: torch2Tex, anchor: [0.5, 0.5], layer: Layers.FOREGROUND })
  torchIndicator2.scale.set(INDICATOR_SIZE, INDICATOR_SIZE, 1)
  torchIndicator2.position.set(TORCH_POSITIONS[1]![0], TORCH_POSITIONS[1]![1], 0)
  torchIndicator2.lit = false
  flatland.add(torchIndicator2)

  // ─ Tweakpane UI ───────────────────────────────────────────────────────────

  const params = {
    quantize: true,
    bands: 4,
    ambient: 0.12,
    shadowStrength: 0.85,
    shadowSoftness: 16,
    shadowBias: 1,
    torch1: true,
    torch2: true,
    torchIntensity: 1.2,
    torchDistance: 180,
    slimeCount: 10,
    showWalls: true,
    showPillars: true,
    showKnights: true,
  }

  const { pane, stats } = createPane({ scene: flatland.scene })

  const lightFolder = pane.addFolder({ title: 'Lighting', expanded: true })
  lightFolder.addBinding(params, 'quantize')
  lightFolder.addBinding(params, 'bands', { min: 0, max: 8, step: 1 })
  lightFolder.addBinding(params, 'ambient', { min: 0, max: 0.6, step: 0.01 })

  const shadowFolder = pane.addFolder({ title: 'Shadows' })
  shadowFolder.addBinding(params, 'shadowStrength', { min: 0, max: 1, step: 0.05, label: 'strength' })
  shadowFolder.addBinding(params, 'shadowSoftness', { min: 1, max: 48, step: 1, label: 'softness' })
  shadowFolder.addBinding(params, 'shadowBias', { min: 0, max: 4, step: 0.1, label: 'bias' })

  const torchFolder = pane.addFolder({ title: 'Torches' })
  torchFolder.addBinding(params, 'torch1')
  torchFolder.addBinding(params, 'torch2')
  torchFolder.addBinding(params, 'torchIntensity', { min: 0, max: 3, step: 0.05, label: 'intensity' })
  torchFolder.addBinding(params, 'torchDistance', { min: 40, max: 400, step: 10, label: 'distance' })

  const slimeFolder = pane.addFolder({ title: 'Slimes' })
  slimeFolder
    .addBinding(params, 'slimeCount', { min: 0, max: 20, step: 1, label: 'count' })
    .on('change', (ev) => setSlimeCount(ev.value))

  const sceneFolder = pane.addFolder({ title: 'Scene', expanded: false })
  sceneFolder.addBinding(params, 'showWalls', { label: 'walls' })
  sceneFolder.addBinding(params, 'showPillars', { label: 'pillars' })
  sceneFolder.addBinding(params, 'showKnights', { label: 'knights' })

  // ─ Resize ─────────────────────────────────────────────────────────────────

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // ─ Render loop ────────────────────────────────────────────────────────────

  const lightingAttrs = lighting as unknown as {
    bands: number
    shadowStrength: number
    shadowSoftness: number
    shadowBias: number
  }

  let lastTime = performance.now()
  let elapsed = 0

  function animate() {
    requestAnimationFrame(animate)
    stats.begin()

    const now = performance.now()
    const delta = (now - lastTime) / 1000
    lastTime = now
    elapsed += delta

    // Push lighting uniforms
    lightingAttrs.bands = params.quantize ? params.bands : 0
    lightingAttrs.shadowStrength = params.shadowStrength
    lightingAttrs.shadowSoftness = params.shadowSoftness
    lightingAttrs.shadowBias = params.shadowBias

    // Torches (flicker)
    torch1.enabled = params.torch1
    torch1.distance = params.torchDistance
    torch1.intensity =
      params.torchIntensity * (1 + Math.sin(elapsed * 15) * 0.1 + Math.sin(elapsed * 23) * 0.05)
    torchIndicator1.alpha = params.torch1 ? 0.9 : 0.25

    torch2.enabled = params.torch2
    torch2.distance = params.torchDistance
    torch2.intensity =
      params.torchIntensity *
      0.85 *
      (1 + Math.sin(elapsed * 17 + 1) * 0.1 + Math.sin(elapsed * 19 + 2) * 0.05)
    torchIndicator2.alpha = params.torch2 ? 0.9 : 0.25

    ambient.intensity = params.ambient

    // Hero keyboard
    const hvx = (heroKeys.right ? 1 : 0) - (heroKeys.left ? 1 : 0)
    const hvy = (heroKeys.up ? 1 : 0) - (heroKeys.down ? 1 : 0)
    if (hvx !== 0 || hvy !== 0) {
      const len = Math.hypot(hvx, hvy)
      heroPos.x += (hvx / len) * 70 * delta
      heroPos.y += (hvy / len) * 70 * delta
      const mx = ROOM_HALF_W - WALL_TILE
      const my = ROOM_HALF_H - WALL_TILE
      heroPos.x = Math.max(-mx, Math.min(mx, heroPos.x))
      heroPos.y = Math.max(-my, Math.min(my, heroPos.y))
    }
    hero.position.set(heroPos.x, heroPos.y, 0)
    hero.zIndex = -Math.floor(heroPos.y)
    const moving = hvx !== 0 || hvy !== 0
    if (moving && heroAnim !== 'run') { hero.play('run'); heroAnim = 'run' }
    else if (!moving && heroAnim !== 'idle') { hero.play('idle'); heroAnim = 'idle' }
    if (hvx !== 0) hero.flipX = hvx < 0
    hero.update(delta * 1000)

    // Visibility toggles
    for (const w of wallSprites) w.visible = params.showWalls
    for (const p of pillarSprites) p.visible = params.showPillars

    // Wandering knights
    for (const kn of knights) {
      kn.sprite.visible = params.showKnights
      if (!params.showKnights) continue
      updateWanderer(kn.anim, delta, 28)
      kn.sprite.position.set(kn.anim.pos.x, kn.anim.pos.y, 0)
      kn.sprite.zIndex = -Math.floor(kn.anim.pos.y)
      kn.sprite.flipX = kn.anim.vel.x < 0
      kn.sprite.update(delta * 1000)
    }

    // Slimes
    for (let i = 0; i < slimes.length; i++) {
      const s = slimes[i]!
      updateWanderer(s.anim, delta, 36)
      s.sprite.position.set(s.anim.pos.x, s.anim.pos.y, 0)
      s.sprite.zIndex = -Math.floor(s.anim.pos.y)
      s.light.position.set(s.anim.pos.x, s.anim.pos.y, 0)
      s.light.intensity = 0.5 * (1 + Math.sin(elapsed * 4 + i) * 0.25)
    }

    flatland.render(renderer)
    stats.end()
  }

  animate()
}

main()
