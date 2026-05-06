import { WebGPURenderer } from 'three/webgpu'
import { Vector2 } from 'three'
import {
  Flatland,
  Light2D,
  AnimatedSprite2D,
  TileMap2D,
  SpriteSheetLoader,
  LDtkLoader,
  Layers,
  type TileMapData,
  type TileMapObject,
  type AnimationSetDefinition,
} from 'three-flatland'
import {
  DefaultLightEffect,
  NormalMapProvider,
} from '@three-flatland/presets'
import { createPane } from '@three-flatland/devtools'

// ============================================
// CONSTANTS
// ============================================

const VIEW_SIZE = 640
const TILE_PX = 16
const TILE_SCALE = 2
const KNIGHT_SCALE = TILE_PX * TILE_SCALE * 2
const SLIME_SCALE = TILE_PX * TILE_SCALE
const WALL_TILE = 24

// Hero movement speed (world u/s) + click-to-walk tuning.
const HERO_SPEED = 70
// Distance at which click-target navigation "arrives" — smaller than
// the hero sprite to avoid overshoot jitter.
const HERO_ARRIVE_RADIUS = 4
// Click radius used to decide if a click intended a torch vs. a
// bare-floor walk target. 1.25 tile-widths covers sloppy aim.
const TORCH_CLICK_RADIUS = TILE_PX * TILE_SCALE * 1.25

// ─── Slime behavior tuning ──────────────────────────────────────────
const SLIME_EXCITE_RADIUS = KNIGHT_SCALE * 1.5
const SLIME_SPEED_WANDER = 14
const SLIME_SPEED_EXCITED = 32
const SLIME_STAMINA_DRAIN_WANDER = 0.05
const SLIME_STAMINA_DRAIN_EXCITED = 0.25
const SLIME_STAMINA_RECOVER = 0.3
const SLIME_STAMINA_RESUME = 0.6
const SLIME_HOP_MIN_WANDER = 0.5
const SLIME_HOP_MAX_WANDER = 0.8
const SLIME_PAUSE_MIN_WANDER = 0.4
const SLIME_PAUSE_MAX_WANDER = 0.8
const SLIME_HOP_MIN_EXCITED = 0.3
const SLIME_HOP_MAX_EXCITED = 0.5
const SLIME_PAUSE_MIN_EXCITED = 0.1
const SLIME_PAUSE_MAX_EXCITED = 0.25

// ============================================
// ANIMATION SETS
// ============================================

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

const slimeAnimations: AnimationSetDefinition = {
  fps: 8,
  animations: {
    idle: {
      frames: Array.from({ length: 8 }, (_, i) => `idle_${i}`),
      fps: 6,
      loop: true,
    },
    walk: {
      frames: Array.from({ length: 8 }, (_, i) => `walk_${i}`),
      fps: 10,
      loop: true,
    },
  },
}

// ============================================
// MAP DATA EXTRACTION
// ============================================

function extractObjectsByType(mapData: TileMapData, type: string): TileMapObject[] {
  const results: TileMapObject[] = []
  for (const layer of mapData.objectLayers) {
    for (const obj of layer.objects) {
      if (obj.type === type) results.push(obj)
    }
  }
  return results
}

function mapToWorld(obj: TileMapObject, mapData: TileMapData, scale: number): [number, number] {
  const mapH = mapData.height * mapData.tileHeight
  const cx = (obj.x + obj.width / 2) * scale
  const cy = (mapH - obj.y - obj.height / 2) * scale
  const offsetX = (mapData.width * mapData.tileWidth * scale) / 2
  const offsetY = (mapH * scale) / 2
  return [cx - offsetX, cy - offsetY]
}

// ============================================
// SLIME STATE
// ============================================

interface SlimeState {
  pos: Vector2
  vel: Vector2
  sprite: AnimatedSprite2D | null
  light: Light2D | null
  stamina: number
  state: 'rest' | 'wander' | 'excited'
  hopPhase: 'hop' | 'pause'
  hopTimer: number
  animation: 'idle' | 'walk'
  drainBias: number
}

function newSlime(mapHalfW: number, mapHalfH: number): SlimeState {
  // Full-tile wall inset (TILE_PX * TILE_SCALE = 32) keeps the
  // slime's tight body clear of the wall art.
  const wallInset = TILE_PX * TILE_SCALE
  const entityHalf = SLIME_SCALE / 2
  const mx = mapHalfW - wallInset - entityHalf
  const my = mapHalfH - wallInset - entityHalf
  const stamina = Math.random()
  const state: SlimeState['state'] = stamina < 0.4 ? 'rest' : 'wander'
  const hopPhase: SlimeState['hopPhase'] = Math.random() < 0.5 ? 'hop' : 'pause'
  return {
    pos: new Vector2((Math.random() * 2 - 1) * mx, (Math.random() * 2 - 1) * my),
    vel: new Vector2(),
    sprite: null,
    light: null,
    stamina,
    state,
    hopPhase,
    hopTimer: Math.random() * 0.5,
    animation: state === 'rest' || hopPhase === 'pause' ? 'idle' : 'walk',
    drainBias: 0.85 + Math.random() * 0.3,
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  // ─── Renderer ───────────────────────────────────────────────────
  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  // ─── Flatland ───────────────────────────────────────────────────
  const flatland = new Flatland({
    viewSize: VIEW_SIZE,
    clearColor: 0x06060c,
    aspect: window.innerWidth / window.innerHeight,
  })
  flatland.resize(window.innerWidth, window.innerHeight)

  // ─── Lighting ───────────────────────────────────────────────────
  const lightEffect = new DefaultLightEffect()
  flatland.setLighting(lightEffect)
  // Per-category quota: cap how many slime lights any single tile may
  // accumulate before falling back to compensation. Keeps hero/torch
  // lights from being crowded out in dense slime clusters.
  lightEffect.forwardPlus.setFillQuota('slime', 4)

  // ─── Assets ─────────────────────────────────────────────────────
  const [knightSheet, slimeSheet, mapData] = await Promise.all([
    SpriteSheetLoader.load('./sprites/knight.json', { normals: true }),
    SpriteSheetLoader.load('./sprites/slime.json', { normals: true }),
    LDtkLoader.load('./maps/dungeon.ldtk', undefined, { normals: true }),
  ])

  const mapHalfW = (mapData.width * mapData.tileWidth * TILE_SCALE) / 2
  const mapHalfH = (mapData.height * mapData.tileHeight * TILE_SCALE) / 2

  // ─── Tilemap ────────────────────────────────────────────────────
  const tilemap = new TileMap2D({ data: mapData })
  tilemap.scale.set(TILE_SCALE, TILE_SCALE, 1)
  tilemap.position.set(-mapHalfW, -mapHalfH, -100)
  const tilemapNormals = new NormalMapProvider()
  tilemapNormals.normalMap = mapData.tilesets[0]?.normalMap ?? null
  tilemap.addEffect(tilemapNormals)
  flatland.add(tilemap)
  // torch_switch tiles hold a torch Light2D at their center — treating
  // them as shadow casters would self-shadow their own light. They remain
  // collision for the hero (handled separately), just not occluders.
  tilemap.markOccluders(['collision'])

  // ─── Light positions from object layers ─────────────────────────
  const fixedLightPositions: Array<[number, number]> =
    extractObjectsByType(mapData, 'light').map((obj) => mapToWorld(obj, mapData, TILE_SCALE))
  const switchPositions: Array<[number, number]> =
    extractObjectsByType(mapData, 'torch_switch').map((obj) => mapToWorld(obj, mapData, TILE_SCALE))

  // ─── Lights ─────────────────────────────────────────────────────
  const ambientLight = new Light2D({
    type: 'ambient',
    color: 0x5544aa,
    intensity: 0.6,
  })
  flatland.add(ambientLight)

  // Wall torches (fixed) — warm orange. Hero lights (importance: 10).
  const torchLights: Light2D[] = []
  const torchEnabled: boolean[] = []
  for (let i = 0; i < fixedLightPositions.length; i++) {
    const [x, y] = fixedLightPositions[i]!
    const light = new Light2D({
      type: 'point',
      color: 0xff6600,
      intensity: 1.6,
      distance: 140,
      decay: 2,
      importance: 10,
      position: [x, y],
    })
    flatland.add(light)
    torchLights.push(light)
    torchEnabled.push(true)
  }
  // Switchable torches — cool amber, 0.8 intensity multiplier.
  for (let i = 0; i < switchPositions.length; i++) {
    const [x, y] = switchPositions[i]!
    const light = new Light2D({
      type: 'point',
      color: 0xffcc44,
      intensity: 1.6 * 0.8,
      distance: 140 * 0.7,
      decay: 2,
      importance: 10,
      position: [x, y],
    })
    flatland.add(light)
    torchLights.push(light)
    torchEnabled.push(true)
  }

  // ─── Hero ───────────────────────────────────────────────────────
  const hero = new AnimatedSprite2D({
    spriteSheet: knightSheet,
    animationSet: knightAnimations,
    animation: 'idle',
    layer: Layers.ENTITIES + 1,
  })
  hero.scale.set(KNIGHT_SCALE, KNIGHT_SCALE, 1)
  hero.lit = true
  hero.castsShadow = true
  const heroNormals = new NormalMapProvider()
  heroNormals.normalMap = knightSheet.normalMap ?? null
  hero.addEffect(heroNormals)
  flatland.add(hero)

  // Spawn hero one tile +X off the first fixed torch so the map opens
  // already lit around the player.
  const heroPos = new Vector2(0, 0)
  if (fixedLightPositions.length > 0) {
    const [tx, ty] = fixedLightPositions[0]!
    heroPos.set(tx + TILE_PX * TILE_SCALE, ty)
  }
  hero.position.set(heroPos.x, heroPos.y, 0)

  const heroKeys = { up: false, down: false, left: false, right: false }
  let heroAnim: 'idle' | 'run' = 'idle'
  const heroFacing = new Vector2(1, 0)
  let heroMoveTarget: Vector2 | null = null
  let heroTargetTorchIdx: number | null = null

  // ─── Slimes ─────────────────────────────────────────────────────
  const slimes: SlimeState[] = []

  function addSlime(): void {
    const s = newSlime(mapHalfW, mapHalfH)
    const sprite = new AnimatedSprite2D({
      spriteSheet: slimeSheet,
      animationSet: slimeAnimations,
      animation: s.animation,
      anchor: [0.5, 0.5],
      layer: Layers.ENTITIES,
    })
    sprite.scale.set(SLIME_SCALE, SLIME_SCALE, 1)
    sprite.lit = true
    // No castsShadow — the slime IS a light source. Marking it as an
    // occluder would self-shadow its own light.
    const slimeNormals = new NormalMapProvider()
    slimeNormals.normalMap = slimeSheet.normalMap ?? null
    sprite.addEffect(slimeNormals)
    // Stagger animation cursor so slimes don't lock-step on first frame.
    const frames = slimeAnimations.animations[s.animation]!.frames.length
    sprite.play(s.animation, { startFrame: Math.floor(Math.random() * frames) })
    flatland.add(sprite)

    const light = new Light2D({
      type: 'point',
      color: 0x33ff66,
      intensity: 0.25,
      distance: 40,
      decay: 2,
      castsShadow: false,
      category: 'slime',
    })
    flatland.add(light)

    s.sprite = sprite
    s.light = light
    slimes.push(s)
  }

  function removeSlime(): void {
    const s = slimes.pop()
    if (!s) return
    if (s.sprite) flatland.remove(s.sprite)
    if (s.light) flatland.remove(s.light)
  }

  function setSlimeCount(count: number): void {
    while (slimes.length < count) addSlime()
    while (slimes.length > count) removeSlime()
  }

  // ─── Tweakpane params ───────────────────────────────────────────
  const params = {
    paused: false,
    // `stationary` keeps animations playing in place — slimes don't wander,
    // knight idles in place, but every sprite's frame cursor still advances
    // and torch flicker still updates. Used by the synchronized pair-capture
    // recorder so two takes share identical entity positions.
    stationary: false,
    lightingEnabled: true,
    bands: 4,
    pixelSize: 0,
    ambient: 0.6,
    lightHeight: 0.75,
    glowRadius: 0,
    glowIntensity: 0.6,
    rimIntensity: 0,
    shadowStrength: 0.8,
    shadowBias: 0.5,
    shadowStartOffsetScale: 1,
    shadowMaxDistance: 300,
    shadowPixelSize: 4,
    torchIntensity: 1.8,
    torchDistance: 140,
    slimeCount: 5,
    slimeLights: true,
    slimeQuota: 4,
  }

  setSlimeCount(params.slimeCount)

  // ─── Push initial uniforms to lighting ──────────────────────────
  const lightingUniforms = lightEffect as unknown as {
    bands: number
    pixelSize: number
    lightHeight: number
    glowRadius: number
    glowIntensity: number
    rimIntensity: number
    shadowStrength: number
    shadowBias: number
    shadowStartOffsetScale: number
    shadowMaxDistance: number
    shadowPixelSize: number
  }
  const lightingConstants = lightEffect as unknown as {
    bandsEnabled: boolean
    pixelSnapEnabled: boolean
    shadowPixelSnapEnabled: boolean
    glowEnabled: boolean
    rimEnabled: boolean
  }

  function pushUniforms(): void {
    lightingUniforms.bands = params.bands
    lightingUniforms.pixelSize = params.pixelSize
    lightingUniforms.lightHeight = params.lightHeight
    lightingUniforms.glowRadius = params.glowRadius
    lightingUniforms.glowIntensity = params.glowIntensity
    lightingUniforms.rimIntensity = params.rimIntensity
    lightingUniforms.shadowStrength = params.shadowStrength
    lightingUniforms.shadowBias = params.shadowBias
    lightingUniforms.shadowStartOffsetScale = params.shadowStartOffsetScale
    lightingUniforms.shadowMaxDistance = params.shadowMaxDistance
    lightingUniforms.shadowPixelSize = params.shadowPixelSize
  }

  // Track previous compile-time toggle state so we only push values
  // when the boolean actually flips — each setter triggers a shader
  // rebuild with a dev warning, so don't set the same value twice.
  let prevBandsEnabled = params.bands > 0
  let prevPixelSnapEnabled = params.pixelSize > 0
  let prevShadowPixelSnapEnabled = params.shadowPixelSize > 0
  let prevGlowEnabled = params.glowRadius > 0
  let prevRimEnabled = params.rimIntensity > 0

  function pushConstants(): void {
    const bandsEnabled = params.bands > 0
    const pixelSnapEnabled = params.pixelSize > 0
    const shadowPixelSnapEnabled = params.shadowPixelSize > 0
    const glowEnabled = params.glowRadius > 0
    const rimEnabled = params.rimIntensity > 0
    if (bandsEnabled !== prevBandsEnabled) {
      lightingConstants.bandsEnabled = bandsEnabled
      prevBandsEnabled = bandsEnabled
    }
    if (pixelSnapEnabled !== prevPixelSnapEnabled) {
      lightingConstants.pixelSnapEnabled = pixelSnapEnabled
      prevPixelSnapEnabled = pixelSnapEnabled
    }
    if (shadowPixelSnapEnabled !== prevShadowPixelSnapEnabled) {
      lightingConstants.shadowPixelSnapEnabled = shadowPixelSnapEnabled
      prevShadowPixelSnapEnabled = shadowPixelSnapEnabled
    }
    if (glowEnabled !== prevGlowEnabled) {
      lightingConstants.glowEnabled = glowEnabled
      prevGlowEnabled = glowEnabled
    }
    if (rimEnabled !== prevRimEnabled) {
      lightingConstants.rimEnabled = rimEnabled
      prevRimEnabled = rimEnabled
    }
  }

  // Initial constants push — set baseline once. Subsequent pane edits
  // route through `pushConstants` which only fires on transitions.
  lightingConstants.bandsEnabled = prevBandsEnabled
  lightingConstants.pixelSnapEnabled = prevPixelSnapEnabled
  lightingConstants.shadowPixelSnapEnabled = prevShadowPixelSnapEnabled
  lightingConstants.glowEnabled = prevGlowEnabled
  lightingConstants.rimEnabled = prevRimEnabled
  pushUniforms()

  // ─── Tweakpane UI ───────────────────────────────────────────────
  const { pane, update: updateDevtools } = createPane({ driver: 'manual' })

  // Top-level: pause everything. Useful for inspecting state, taking
  // screenshots, or comparing two parameter settings on identical entity
  // positions.
  pane.addBinding(params, 'paused', { label: 'pause' })
  // `stationary`: animations keep playing, entities don't move. Pair this
  // with `window.__lightingCapturePair(durationMs)` from the console to
  // record two synchronized .webm files (lighting on / off) for the docs
  // <Compare> seam slider.
  pane.addBinding(params, 'stationary', { label: 'stationary' })

  const lightFolder = pane.addFolder({ title: 'Lighting', expanded: true })
  lightFolder.addBinding(params, 'lightingEnabled', { label: 'enabled' })
    .on('change', () => {
      flatland.setLighting(params.lightingEnabled ? lightEffect : null)
    })
  lightFolder.addBinding(params, 'bands', { min: 0, max: 8, step: 1 })
    .on('change', () => { pushUniforms(); pushConstants() })
  lightFolder.addBinding(params, 'pixelSize', { min: 0, max: 8, step: 1 })
    .on('change', () => { pushUniforms(); pushConstants() })
  lightFolder.addBinding(params, 'ambient', { min: 0, max: 3, step: 0.05 })
    .on('change', () => { ambientLight.intensity = params.ambient })
  lightFolder.addBinding(params, 'lightHeight', { min: 0, max: 2, step: 0.05 })
    .on('change', () => pushUniforms())
  lightFolder.addBinding(params, 'glowRadius', { min: 0, max: 2, step: 0.05 })
    .on('change', () => { pushUniforms(); pushConstants() })
  lightFolder.addBinding(params, 'glowIntensity', { min: 0, max: 2, step: 0.05 })
    .on('change', () => pushUniforms())
  lightFolder.addBinding(params, 'rimIntensity', { min: 0, max: 2, step: 0.05 })
    .on('change', () => { pushUniforms(); pushConstants() })

  const shadowFolder = pane.addFolder({ title: 'Shadows' })
  shadowFolder.addBinding(params, 'shadowStrength', { min: 0, max: 1, step: 0.05, label: 'strength' })
    .on('change', () => pushUniforms())
  shadowFolder.addBinding(params, 'shadowBias', { min: 0, max: 2, step: 0.05, label: 'bias' })
    .on('change', () => pushUniforms())
  shadowFolder.addBinding(params, 'shadowStartOffsetScale', { min: 0, max: 3, step: 0.05, label: 'startOffsetScale' })
    .on('change', () => pushUniforms())
  shadowFolder.addBinding(params, 'shadowMaxDistance', { min: 0, max: 600, step: 10, label: 'maxDistance' })
    .on('change', () => pushUniforms())
  shadowFolder.addBinding(params, 'shadowPixelSize', { min: 0, max: 8, step: 1, label: 'pixelSize' })
    .on('change', () => { pushUniforms(); pushConstants() })

  const torchFolder = pane.addFolder({ title: 'Torches' })
  torchFolder.addBinding(params, 'torchIntensity', { min: 0, max: 3, step: 0.05, label: 'intensity' })
  torchFolder.addBinding(params, 'torchDistance', { min: 40, max: 400, step: 10, label: 'distance' })

  const slimeFolder = pane.addFolder({ title: 'Slimes' })
  slimeFolder.addBinding(params, 'slimeCount', { min: 0, max: 1000, step: 1, label: 'count' })
    .on('change', (ev) => setSlimeCount(ev.value))
  slimeFolder.addBinding(params, 'slimeLights', { label: 'lights' })
  slimeFolder.addBinding(params, 'slimeQuota', { min: 0, max: 16, step: 1, label: 'quota' })
    .on('change', (ev) => lightEffect.forwardPlus.setFillQuota('slime', ev.value))

  // ─── Input ──────────────────────────────────────────────────────
  function keymap(e: KeyboardEvent): keyof typeof heroKeys | null {
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

  function tryActivateTorch(): void {
    const activationRadius = TILE_PX * TILE_SCALE * 2.5
    const facingThreshold = 0.3 // ~72° cone
    const switchStart = fixedLightPositions.length
    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < switchPositions.length; i++) {
      const [sx, sy] = switchPositions[i]!
      const dx = sx - heroPos.x
      const dy = sy - heroPos.y
      const dist = Math.hypot(dx, dy)
      if (dist > activationRadius) continue
      if (dist > 1) {
        const dot = (dx / dist) * heroFacing.x + (dy / dist) * heroFacing.y
        if (dot < facingThreshold) continue
      }
      if (dist < bestDist) { bestDist = dist; bestIdx = i }
    }
    if (bestIdx < 0) return
    torchEnabled[switchStart + bestIdx] = !torchEnabled[switchStart + bestIdx]
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      tryActivateTorch()
      e.preventDefault()
      return
    }
    const k = keymap(e)
    if (k) {
      heroKeys[k] = true
      // Keyboard input cancels in-flight click-to-walk path.
      heroMoveTarget = null
      heroTargetTorchIdx = null
      e.preventDefault()
    }
  })
  window.addEventListener('keyup', (e) => {
    const k = keymap(e)
    if (k) { heroKeys[k] = false; e.preventDefault() }
  })

  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect()
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    const aspect = rect.width / rect.height
    const worldX = (ndcX * VIEW_SIZE * aspect) / 2
    const worldY = (ndcY * VIEW_SIZE) / 2

    let snapX = worldX
    let snapY = worldY
    let torchIdx: number | null = null
    let bestDistSq = TORCH_CLICK_RADIUS * TORCH_CLICK_RADIUS
    for (let i = 0; i < switchPositions.length; i++) {
      const [sx, sy] = switchPositions[i]!
      const dx = sx - worldX
      const dy = sy - worldY
      const d2 = dx * dx + dy * dy
      if (d2 < bestDistSq) {
        bestDistSq = d2
        torchIdx = i
        // Stand one sprite-width off the torch toward the current
        // hero position so we don't fully occlude the light glyph.
        const off = TILE_PX * TILE_SCALE
        const toHeroX = heroPos.x - sx
        const toHeroY = heroPos.y - sy
        const thLen = Math.hypot(toHeroX, toHeroY) || 1
        snapX = sx + (toHeroX / thLen) * off
        snapY = sy + (toHeroY / thLen) * off
      }
    }
    heroMoveTarget = new Vector2(snapX, snapY)
    heroTargetTorchIdx = torchIdx
  })

  // ─── Resize ─────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // ─── Render loop ────────────────────────────────────────────────
  let lastTime = performance.now()
  let flickerT = 0

  function animate(): void {
    const now = performance.now()
    const rawDelta = Math.min(0.1, (now - lastTime) / 1000)
    lastTime = now
    // Two deltas:
    //   `animDelta` — sprite animation cursors + torch flicker. Zero only
    //                 when paused.
    //   `delta`     — entity *position* updates (hero walk, slime hop,
    //                 stamina). Zero when paused OR stationary.
    // Most call sites care about position, so the motion variant keeps the
    // shorter name `delta` to minimize diff churn.
    const animDelta = params.paused ? 0 : rawDelta
    const delta = params.paused || params.stationary ? 0 : rawDelta
    flickerT += animDelta

    // ── Torch flicker ────────────────────────────────────────────
    const wallCount = fixedLightPositions.length
    for (let i = 0; i < torchLights.length; i++) {
      const torch = torchLights[i]!
      torch.enabled = torchEnabled[i] ?? true
      const isWall = i < wallCount
      const intensityMul = isWall ? 1.6 : 0.8
      const distanceMul = isWall ? 1.0 : 0.7
      torch.distance = params.torchDistance * distanceMul
      torch.intensity =
        params.torchIntensity *
        intensityMul *
        (1 + Math.sin(flickerT * (15 + i * 2)) * 0.1 + Math.sin(flickerT * (23 + i * 3)) * 0.05)
    }

    // ── Hero movement: keyboard wins, else click-to-walk ─────────
    const k = heroKeys
    const hvx = (k.right ? 1 : 0) - (k.left ? 1 : 0)
    const hvy = (k.up ? 1 : 0) - (k.down ? 1 : 0)
    let moveX = 0
    let moveY = 0
    let moving = false
    let facingX = heroFacing.x
    let facingY = heroFacing.y

    if (hvx !== 0 || hvy !== 0) {
      const len = Math.hypot(hvx, hvy)
      facingX = hvx / len
      facingY = hvy / len
      moveX = facingX * HERO_SPEED * delta
      moveY = facingY * HERO_SPEED * delta
      moving = true
    } else if (heroMoveTarget !== null) {
      const tgt = heroMoveTarget
      const dx = tgt.x - heroPos.x
      const dy = tgt.y - heroPos.y
      const dist = Math.hypot(dx, dy)
      if (dist <= HERO_ARRIVE_RADIUS) {
        // Arrived. If target carried a torch toggle, flip it now.
        if (heroTargetTorchIdx !== null) {
          const idx = heroTargetTorchIdx
          const switchStart = fixedLightPositions.length
          torchEnabled[switchStart + idx] = !torchEnabled[switchStart + idx]
        }
        heroMoveTarget = null
        heroTargetTorchIdx = null
      } else {
        facingX = dx / dist
        facingY = dy / dist
        const step = Math.min(HERO_SPEED * delta, dist)
        moveX = facingX * step
        moveY = facingY * step
        moving = true
      }
    }

    if (moving) {
      heroFacing.set(facingX, facingY)
      const prevX = heroPos.x
      const prevY = heroPos.y
      heroPos.x += moveX
      heroPos.y += moveY
      const mx = mapHalfW - WALL_TILE - KNIGHT_SCALE / 2
      const my = mapHalfH - WALL_TILE - KNIGHT_SCALE / 2
      heroPos.x = Math.max(-mx, Math.min(mx, heroPos.x))
      heroPos.y = Math.max(-my, Math.min(my, heroPos.y))

      // Wall-stop: if a click-target walk hit a wall, the clamp eats
      // most of the intended step. Cancel navigation so the hero
      // doesn't run in place against an edge.
      if (heroMoveTarget !== null) {
        const expected = Math.hypot(moveX, moveY)
        const actual = Math.hypot(heroPos.x - prevX, heroPos.y - prevY)
        if (expected > 0 && actual < expected * 0.5) {
          heroMoveTarget = null
          heroTargetTorchIdx = null
        }
      }
    }

    hero.position.set(heroPos.x, heroPos.y, 0)
    hero.zIndex = -Math.floor(heroPos.y)
    if (moving && heroAnim !== 'run') { hero.play('run'); heroAnim = 'run' }
    else if (!moving && heroAnim !== 'idle') { hero.play('idle'); heroAnim = 'idle' }
    if (Math.abs(facingX) > 0.01) hero.flipX = facingX < 0
    hero.update(animDelta * 1000)

    // ── Slimes ───────────────────────────────────────────────────
    const exciteRadiusSq = SLIME_EXCITE_RADIUS * SLIME_EXCITE_RADIUS
    const slimeWallInset = TILE_PX * TILE_SCALE
    const slimeBoundX = mapHalfW - slimeWallInset - SLIME_SCALE / 2
    const slimeBoundY = mapHalfH - slimeWallInset - SLIME_SCALE / 2

    for (let i = 0; i < slimes.length; i++) {
      const s = slimes[i]!

      // Proximity check (squared-distance, no sqrt).
      const dx = heroPos.x - s.pos.x
      const dy = heroPos.y - s.pos.y
      const knightNear = dx * dx + dy * dy < exciteRadiusSq

      // State transitions.
      if (s.stamina <= 0) {
        s.state = 'rest'
      } else if (s.state === 'rest') {
        if (s.stamina >= SLIME_STAMINA_RESUME) {
          s.state = knightNear ? 'excited' : 'wander'
          s.hopPhase = 'pause'
          s.hopTimer = 0.2 + Math.random() * 0.2
          s.vel.set(0, 0)
        }
      } else {
        s.state = knightNear ? 'excited' : 'wander'
      }

      // Movement: rest vs. hop/pause rhythm.
      if (s.state === 'rest') {
        s.vel.set(0, 0)
        s.stamina = Math.min(1, s.stamina + SLIME_STAMINA_RECOVER * s.drainBias * delta)
      } else {
        s.hopTimer -= delta
        if (s.hopTimer <= 0) {
          if (s.hopPhase === 'hop') {
            s.hopPhase = 'pause'
            s.hopTimer = s.state === 'excited'
              ? SLIME_PAUSE_MIN_EXCITED + Math.random() * (SLIME_PAUSE_MAX_EXCITED - SLIME_PAUSE_MIN_EXCITED)
              : SLIME_PAUSE_MIN_WANDER + Math.random() * (SLIME_PAUSE_MAX_WANDER - SLIME_PAUSE_MIN_WANDER)
            s.vel.set(0, 0)
          } else {
            s.hopPhase = 'hop'
            s.hopTimer = s.state === 'excited'
              ? SLIME_HOP_MIN_EXCITED + Math.random() * (SLIME_HOP_MAX_EXCITED - SLIME_HOP_MIN_EXCITED)
              : SLIME_HOP_MIN_WANDER + Math.random() * (SLIME_HOP_MAX_WANDER - SLIME_HOP_MIN_WANDER)
            const angle = Math.random() * Math.PI * 2
            const speed = s.state === 'excited' ? SLIME_SPEED_EXCITED : SLIME_SPEED_WANDER
            s.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed)
          }
        }

        s.pos.x += s.vel.x * delta
        s.pos.y += s.vel.y * delta
        if (s.pos.x > slimeBoundX) { s.pos.x = slimeBoundX; s.vel.x = -Math.abs(s.vel.x) }
        if (s.pos.x < -slimeBoundX) { s.pos.x = -slimeBoundX; s.vel.x = Math.abs(s.vel.x) }
        if (s.pos.y > slimeBoundY) { s.pos.y = slimeBoundY; s.vel.y = -Math.abs(s.vel.y) }
        if (s.pos.y < -slimeBoundY) { s.pos.y = -slimeBoundY; s.vel.y = Math.abs(s.vel.y) }

        if (s.hopPhase === 'hop') {
          const drain = s.state === 'excited' ? SLIME_STAMINA_DRAIN_EXCITED : SLIME_STAMINA_DRAIN_WANDER
          s.stamina = Math.max(0, s.stamina - drain * s.drainBias * delta)
        }
      }

      // Animation + transform.
      if (s.sprite) {
        const wantAnim: 'idle' | 'walk' =
          s.state !== 'rest' && s.hopPhase === 'hop' ? 'walk' : 'idle'
        if (wantAnim !== s.animation) {
          s.sprite.play(wantAnim)
          s.animation = wantAnim
        }
        s.sprite.position.set(s.pos.x, s.pos.y, 0)
        s.sprite.zIndex = -Math.floor(s.pos.y)
        if (Math.abs(s.vel.x) > 1) s.sprite.flipX = s.vel.x < 0
        s.sprite.update(animDelta * 1000)
      }

      // Steady glow — intensity reflects state.
      if (s.light) {
        s.light.enabled = params.slimeLights
        s.light.position.set(s.pos.x, s.pos.y, 0)
        s.light.intensity = s.state === 'excited' ? 0.35
          : s.state === 'rest' ? 0.2
            : 0.28
      }
    }

    flatland.render(renderer)
    updateDevtools()
  }

  renderer.setAnimationLoop(animate)

  // ─── Single-shot scene recorder ──────────────────────────────────
  //
  // Console-callable:
  //   await window.__captureScene('lighting-on', 3000)
  //   await window.__captureScene('lighting-off', 3000)
  //
  // Records the *current* visual state. Two files land in Downloads:
  //   <name>.webm         — durationMs of canvas video
  //   <name>-poster.jpg   — first-frame still
  //
  // Manual workflow:
  //   1. Set up scene 1 via Tweakpane (lighting on, ambient .8, etc).
  //   2. Run `await __captureScene('lighting-on', 3000)` from the console.
  //   3. Wait for both files to land in Downloads.
  //   4. Toggle Tweakpane to scene 2 state (lighting off, etc).
  //   5. Run `await __captureScene('lighting-off', 3000)`.
  //   6. Drop the four files into docs/public/diagrams/.
  //
  // To get matching animation phase across captures, both calls reset
  // every sprite to frame 0 of `idle` and zero the torch flicker. They
  // also force `stationary = true` AND LEAVE IT ON so entities don't
  // drift while you set up the next scene state in Tweakpane between
  // captures. Use `__endCapture()` (or just uncheck the Stationary box)
  // when you're done with a capture session — the demo resumes normal
  // entity motion. Lighting state is never touched.
  ;(window as Window & {
    __captureScene?: (name: string, durationMs?: number) => Promise<void>
    __endCapture?: () => void
  }).__captureScene = async function captureScene(name: string, durationMs = 3000): Promise<void> {
    if (!name || typeof name !== 'string') {
      console.error('[captureScene] usage: __captureScene("lighting-on", 3000)')
      return
    }
    // Always pause = false (rendering must continue), always stationary
    // = true (entities frozen, animations still play). We do NOT restore
    // these on exit — successive captures stay aligned. Sync the
    // Tweakpane UI so the checkboxes visibly reflect the forced state.
    params.paused = false
    params.stationary = true
    pane.refresh()

    const mainCanvas = renderer.domElement as HTMLCanvasElement

    function pickMimeType(): string {
      const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ]
      for (const m of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
      }
      return ''
    }

    function resetAnimations(): void {
      hero.play('idle', { startFrame: 0 })
      heroAnim = 'idle'
      for (const s of slimes) {
        if (s.sprite) {
          s.sprite.play('idle', { startFrame: 0 })
          s.animation = 'idle'
        }
        s.hopPhase = 'pause'
        s.hopTimer = 0.5
        s.vel.set(0, 0)
      }
      flickerT = 0
    }

    function downloadBlob(blob: Blob, filename: string): void {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    async function capturePoster(filename: string): Promise<void> {
      // Snapshot the current canvas to a JPG for the <Compare> poster
      // (paints instantly while the WebM streams in).
      const dataUrl = mainCanvas.toDataURL('image/jpeg', 0.9)
      const blob = await (await fetch(dataUrl)).blob()
      downloadBlob(blob, filename)
    }

    async function recordVideo(filename: string): Promise<void> {
      const stream = mainCanvas.captureStream(60)
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      return new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType || 'video/webm' })
          downloadBlob(blob, filename)
          resolve()
        }
        recorder.start()
        setTimeout(() => recorder.stop(), durationMs)
      })
    }

    // Reset to frame-0 of idle for every animated sprite so back-to-back
    // captures share the same animation phase. Wait one frame so the reset
    // takes visual effect before we snapshot the poster.
    resetAnimations()
    await new Promise((r) => requestAnimationFrame(r))

    console.log(`[captureScene] poster + ${durationMs}ms video → ${name}.webm + ${name}-poster.jpg`)
    // Capture the poster from the very first frame of recording so the
    // poster matches what the WebM starts with.
    await capturePoster(`${name}-poster.jpg`)
    await recordVideo(`${name}.webm`)

    // Stationary stays ON — set up the next scene and call again. Use
    // window.__endCapture() to resume normal entity motion when done.
    console.log(
      `[captureScene] done — ${name}.webm + ${name}-poster.jpg in Downloads. ` +
        `Stationary remains ON; call __endCapture() to resume motion.`,
    )
  }

  // Resume normal entity motion after a capture session.
  ;(window as Window & { __endCapture?: () => void }).__endCapture = function endCapture(): void {
    params.stationary = false
    pane.refresh()
    console.log('[endCapture] motion resumed')
  }
}

main()
