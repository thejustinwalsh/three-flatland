import { WebGPURenderer } from 'three/webgpu'
import { Color, Vector2 } from 'three'
import { initializeRenderer } from './renderStartupError'
import { configureExampleRendererColor } from './rendererColorManagement'
import {
  Flatland,
  EmissiveEffect,
  Light2D,
  Sprite2D,
  AnimatedSprite2D,
  TileMap2D,
  SpriteSheetLoader,
  LDtkLoader,
  SortLayers,
  type TileMapData,
  type TileMapObject,
  type AnimationSetDefinition,
  type SpriteFrame,
  PixelPerfectCamera,
} from 'three-flatland'
import { DdaFixedRadianceLightEffect, NormalMapProvider } from '@three-flatland/presets'
import { createPane } from '@three-flatland/devtools'
import {
  DEFAULT_BENCHMARK_SEED,
  benchmarkParams,
  createBenchmarkSimulationGate,
  createSeededRandom,
  integerParam,
  numberParam,
  publishBenchmarkReady,
  rendererGpuAdapterInfo,
} from '../../_shared/benchmark'
import { expandDungeonMap } from './dungeonLayout'

// ============================================
// CONSTANTS
// ============================================

const TILE_PX = 16
const ART_WORLD_SCALE = 2
const TILE_SCALE = ART_WORLD_SCALE
const KNIGHT_SOURCE_PX = 32
const SLIME_SOURCE_PX = 24
const KNIGHT_SCALE = KNIGHT_SOURCE_PX * ART_WORLD_SCALE
const SLIME_SCALE = SLIME_SOURCE_PX * ART_WORLD_SCALE
const WALL_TILE = 24
const AUTHORED_LANDSCAPE = { width: 640, height: 360 } as const
const AUTHORED_PORTRAIT = { width: 360, height: 640 } as const
const DUNGEON_LIGHTING_DEFAULTS = {
  ambient: 0.28,
  torchEmission: 8,
  slimeEmission: 0.5,
  radianceRange: 8,
} as const
const WALL_TORCH_TILE_ID = 91
const FLOOR_TORCH_TILE_ID = 93
const TILE_FLIP_X = 0x80000000
const TILE_FLIP_Y = 0x40000000
const TILE_GID_MASK = 0x1fffffff

function authoredSurface(): { width: number; height: number } {
  const landscapeFit = Math.min(
    window.innerWidth / AUTHORED_LANDSCAPE.width,
    window.innerHeight / AUTHORED_LANDSCAPE.height
  )
  const portraitFit = Math.min(
    window.innerWidth / AUTHORED_PORTRAIT.width,
    window.innerHeight / AUTHORED_PORTRAIT.height
  )
  return landscapeFit >= 1 || landscapeFit >= portraitFit ? { ...AUTHORED_LANDSCAPE } : { ...AUTHORED_PORTRAIT }
}

function fitAuthoredCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  const fit = Math.min(window.innerWidth / width, window.innerHeight / height)
  const scale = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit
  canvas.style.width = `${Math.max(1, Math.floor(width * scale))}px`
  canvas.style.height = `${Math.max(1, Math.floor(height * scale))}px`
}

function pixelPerfectViewHeight(_canvasW: number, canvasH: number): number {
  // One authored framebuffer pixel is one world unit. ART_WORLD_SCALE then
  // maps every source-art pixel to an exact 2x2 output block, and DDA cell
  // sizes 2/4/8 share the same integer lattice as camera motion.
  return canvasH
}

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

function tileFlipAtObject(
  obj: TileMapObject,
  mapData: TileMapData,
  localTileId: number
): { flipX: boolean; flipY: boolean } {
  const cellX = Math.floor((obj.x + obj.width * 0.5) / mapData.tileWidth)
  const cellY = Math.floor((obj.y + obj.height * 0.5) / mapData.tileHeight)

  for (const layer of mapData.tileLayers) {
    const packed = layer.data[cellY * layer.width + cellX] ?? 0
    const tileset = mapData.tilesets.find(
      ({ firstGid, tileCount }) =>
        (packed & TILE_GID_MASK) >= firstGid && (packed & TILE_GID_MASK) < firstGid + tileCount
    )
    if (!tileset || (packed & TILE_GID_MASK) !== tileset.firstGid + localTileId) continue
    return {
      flipX: (packed & TILE_FLIP_X) !== 0,
      flipY: (packed & TILE_FLIP_Y) !== 0,
    }
  }

  return { flipX: false, flipY: false }
}

function tilePositionsById(
  mapData: TileMapData,
  localTileId: number,
  scale: number
): Array<[number, number, boolean, boolean]> {
  const positions: Array<[number, number, boolean, boolean]> = []
  const mapWidth = mapData.width * mapData.tileWidth * scale
  const mapHeight = mapData.height * mapData.tileHeight * scale

  for (const layer of mapData.tileLayers) {
    for (let cellY = 0; cellY < layer.height; cellY++) {
      for (let cellX = 0; cellX < layer.width; cellX++) {
        const packed = layer.data[cellY * layer.width + cellX] ?? 0
        const gid = packed & TILE_GID_MASK
        const tileset = mapData.tilesets.find(
          ({ firstGid, tileCount }) => gid >= firstGid && gid < firstGid + tileCount
        )
        if (!tileset || gid !== tileset.firstGid + localTileId) continue
        positions.push([
          (cellX + 0.5) * mapData.tileWidth * scale - mapWidth * 0.5,
          mapHeight * 0.5 - (cellY + 0.5) * mapData.tileHeight * scale,
          (packed & TILE_FLIP_X) !== 0,
          (packed & TILE_FLIP_Y) !== 0,
        ])
      }
    }
  }

  return positions
}

// ============================================
// SLIME STATE
// ============================================

interface SlimeState {
  pos: Vector2
  vel: Vector2
  sprite: AnimatedSprite2D | null
  emission: InstanceType<typeof EmissiveEffect> | null
  stamina: number
  state: 'rest' | 'wander' | 'excited'
  hopPhase: 'hop' | 'pause'
  hopTimer: number
  animation: 'idle' | 'walk'
  drainBias: number
}

function newSlime(mapHalfW: number, mapHalfH: number, random: () => number): SlimeState {
  // Full-tile wall inset (TILE_PX * TILE_SCALE = 32) keeps the
  // slime's tight body clear of the wall art.
  const wallInset = TILE_PX * TILE_SCALE
  const entityHalf = SLIME_SCALE / 2
  const mx = mapHalfW - wallInset - entityHalf
  const my = mapHalfH - wallInset - entityHalf
  const stamina = random()
  const state: SlimeState['state'] = stamina < 0.4 ? 'rest' : 'wander'
  const hopPhase: SlimeState['hopPhase'] = random() < 0.5 ? 'hop' : 'pause'
  return {
    pos: new Vector2((random() * 2 - 1) * mx, (random() * 2 - 1) * my),
    vel: new Vector2(),
    sprite: null,
    emission: null,
    stamina,
    state,
    hopPhase,
    hopTimer: random() * 0.5,
    animation: state === 'rest' || hopPhase === 'pause' ? 'idle' : 'walk',
    drainBias: 0.85 + random() * 0.3,
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const query = benchmarkParams()
  const benchmarkEnabled = query.get('bench') === '1'
  const automatedGpuSampleCount = Number(query.get('autoGpuBenchmark') ?? 0)
  const initialLightingEnabled = query.get('lighting') !== '0'
  const requestedSlimes = integerParam(query, 'slimes', 5)
  const seed = integerParam(query, 'seed', DEFAULT_BENCHMARK_SEED)
  const fixedDeltaMs = numberParam(query, 'fixedDelta')
  const benchmarkBaseRayCount = integerParam(query, 'rays', 16)
  const ddaResolutionScale = Math.max(1, numberParam(query, 'ddaScale') ?? 1)
  const simulationGate = createBenchmarkSimulationGate(benchmarkEnabled)
  const random = benchmarkEnabled ? createSeededRandom(seed) : Math.random

  // ─── Renderer ───────────────────────────────────────────────────
  const renderer = new WebGPURenderer({ antialias: false })
  configureExampleRendererColor(renderer)
  let renderSurface = authoredSurface()
  renderer.setSize(renderSurface.width, renderSurface.height, false)
  renderer.setPixelRatio(1)
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)
  fitAuthoredCanvas(renderer.domElement, renderSurface.width, renderSurface.height)
  if (!(await initializeRenderer(renderer))) return

  const benchmarkStatus = document.createElement('output')
  benchmarkStatus.id = 'benchmark-status'
  benchmarkStatus.hidden = true
  document.body.appendChild(benchmarkStatus)

  // ─── Flatland ───────────────────────────────────────────────────
  const flatland = new Flatland({
    viewSize: pixelPerfectViewHeight(renderSurface.width, renderSurface.height),
    clearColor: 0x06060c,
  })

  // ─── Lighting ───────────────────────────────────────────────────
  const lightEffect = new DdaFixedRadianceLightEffect()
  lightEffect.radianceIntensity = 2.5
  lightEffect.radiance.filterRadius = 1.25
  lightEffect.radiance.filterStrength = 0.85
  lightEffect.radiance.ddaRadianceRange = DUNGEON_LIGHTING_DEFAULTS.radianceRange
  if (benchmarkBaseRayCount === 4 || benchmarkBaseRayCount === 16) {
    lightEffect.radiance.config.baseRayCount = benchmarkBaseRayCount
  }

  // ─── Assets ─────────────────────────────────────────────────────
  const [knightSheet, slimeSheet, sourceMapData] = await Promise.all([
    SpriteSheetLoader.load('./sprites/knight.json', { normals: true, forceRuntime: true }),
    SpriteSheetLoader.load('./sprites/slime.json', { normals: true, forceRuntime: true }),
    LDtkLoader.load('./maps/dungeon.ldtk', undefined, { normals: true }),
  ])
  const mapData = expandDungeonMap(sourceMapData)

  const mapHalfW = (mapData.width * mapData.tileWidth * TILE_SCALE) / 2
  const mapHalfH = (mapData.height * mapData.tileHeight * TILE_SCALE) / 2
  const collisionRects = extractObjectsByType(mapData, 'collision').map((object) => {
    const [x, y] = mapToWorld(object, mapData, TILE_SCALE)
    return {
      minX: x - (object.width * TILE_SCALE) / 2,
      maxX: x + (object.width * TILE_SCALE) / 2,
      minY: y - (object.height * TILE_SCALE) / 2,
      maxY: y + (object.height * TILE_SCALE) / 2,
    }
  })
  const isBlocked = (x: number, y: number, halfExtent: number): boolean =>
    collisionRects.some(
      (rect) =>
        x + halfExtent > rect.minX &&
        x - halfExtent < rect.maxX &&
        y + halfExtent > rect.minY &&
        y - halfExtent < rect.maxY
    )

  const refitView = () => {
    flatland.viewSize = pixelPerfectViewHeight(renderSurface.width, renderSurface.height)
  }

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
  const fixedLightPositions: Array<[number, number, boolean, boolean]> = extractObjectsByType(mapData, 'light').map(
    (obj) => {
      const [x, y] = mapToWorld(obj, mapData, TILE_SCALE)
      const { flipX, flipY } = tileFlipAtObject(obj, mapData, WALL_TORCH_TILE_ID)
      return [x, y, flipX, flipY]
    }
  )
  const switchPositions: Array<[number, number]> = extractObjectsByType(mapData, 'torch_switch').map((obj) =>
    mapToWorld(obj, mapData, TILE_SCALE)
  )
  const floorTorchPositions = tilePositionsById(mapData, FLOOR_TORCH_TILE_ID, TILE_SCALE)

  // ─── Ambient + emissive source sprites ──────────────────────────
  const ambientLight = new Light2D({
    type: 'ambient',
    color: 0x8190bd,
    intensity: DUNGEON_LIGHTING_DEFAULTS.ambient,
  })
  flatland.add(ambientLight)

  type TorchState = {
    emission: InstanceType<typeof EmissiveEffect>
    enabled: boolean
    current: number
    target: number
    changeIn: number
    response: number
  }
  const torchStates: TorchState[] = []
  const torchTexture = mapData.tilesets[0]?.texture
  const fixedTorchFrame: SpriteFrame = {
    name: 'wall-torch',
    // The tile layer already draws its wall fixture with tile 91 at atlas
    // pixel (16, 144). Overlay the same frame at the same cell so the
    // emissive source is visually indistinguishable from the authored tile.
    x: 0.1,
    y: 0,
    width: 0.1,
    height: 0.1,
    sourceWidth: TILE_PX,
    sourceHeight: TILE_PX,
  }
  const floorTorchFrame: SpriteFrame = {
    name: 'floor-torch',
    x: 0.3,
    y: 0,
    width: 0.1,
    height: 0.1,
    sourceWidth: TILE_PX,
    sourceHeight: TILE_PX,
  }
  const switchToTorch = switchPositions.map(([sx, sy]) => {
    let best = 0
    let bestDistance = Infinity
    for (let i = 0; i < fixedLightPositions.length; i++) {
      const [tx, ty] = fixedLightPositions[i]!
      const distance = (tx - sx) ** 2 + (ty - sy) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    return best
  })
  if (torchTexture) {
    const addTorchEmitter = (position: [number, number, boolean, boolean], frame: SpriteFrame): void => {
      const [x, y, flipX, flipY] = position
      const sprite = new Sprite2D({
        texture: torchTexture,
        frame,
        flipX,
        flipY,
        lit: false,
        // This is a source-only overlay on top of the visible tile. The
        // tilemap owns physical wall/fixture occlusion; allowing the duplicate
        // emissive silhouette to cast creates a dark moat around its flame.
        castsShadow: false,
        sortLayer: SortLayers.EFFECTS,
      })
      sprite.position.set(x, y, 0)
      sprite.scale.set(TILE_PX * TILE_SCALE, TILE_PX * TILE_SCALE, 1)
      const emission = new EmissiveEffect()
      emission.color = [1, 0.2, 0.02]
      emission.intensity = 1
      emission.threshold = 0.18
      sprite.addEffect(emission)
      flatland.add(sprite)
      torchStates.push({ emission, enabled: true, current: 1, target: 1, changeIn: random() * 0.2, response: 8 })
    }
    for (const position of fixedLightPositions) addTorchEmitter(position, fixedTorchFrame)
    for (const position of floorTorchPositions) addTorchEmitter(position, floorTorchFrame)
  }

  // ─── Hero ───────────────────────────────────────────────────────
  const hero = new AnimatedSprite2D({
    spriteSheet: knightSheet,
    animationSet: knightAnimations,
    animation: 'idle',
    sortLayer: SortLayers.ENTITIES + 1,
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
    let s = newSlime(mapHalfW, mapHalfH, random)
    for (let attempt = 0; attempt < 24 && isBlocked(s.pos.x, s.pos.y, TILE_PX * 0.4); attempt++) {
      s = newSlime(mapHalfW, mapHalfH, random)
    }
    const sprite = new AnimatedSprite2D({
      spriteSheet: slimeSheet,
      animationSet: slimeAnimations,
      animation: s.animation,
      anchor: [0.5, 0.5],
      sortLayer: SortLayers.ENTITIES,
    })
    sprite.scale.set(SLIME_SCALE, SLIME_SCALE, 1)
    sprite.lit = true
    // Emission is resolved before occupancy in the DDA traversal, so an
    // opaque emissive sprite can terminate rays with its own radiance while
    // still blocking light arriving from every other source.
    sprite.castsShadow = true
    const slimeEmission = new EmissiveEffect()
    const slimeColor = new Color(0x33ff66)
    slimeEmission.color = [slimeColor.r, slimeColor.g, slimeColor.b]
    slimeEmission.intensity = params.slimeIntensity
    slimeEmission.threshold = 0.1
    sprite.addEffect(slimeEmission)
    const slimeNormals = new NormalMapProvider()
    slimeNormals.normalMap = slimeSheet.normalMap ?? null
    sprite.addEffect(slimeNormals)
    // Stagger animation cursor so slimes don't lock-step on first frame.
    const frames = slimeAnimations.animations[s.animation]!.frames.length
    sprite.play(s.animation, { startFrame: Math.floor(random() * frames) })
    flatland.add(sprite)

    s.sprite = sprite
    s.emission = slimeEmission
    slimes.push(s)
  }

  function removeSlime(): void {
    const s = slimes.pop()
    if (!s) return
    if (s.sprite) flatland.remove(s.sprite)
  }

  function setSlimeCount(count: number): void {
    while (slimes.length < count) addSlime()
    while (slimes.length > count) removeSlime()
  }

  // ─── Tweakpane params ───────────────────────────────────────────
  // `paused` and `stationary` are NOT exposed in the pane — they exist
  // only so the `__captureScene` / `__endCapture` console helpers can
  // freeze the scene during recording. If you want them back on the
  // UI, add `pane.addBinding(params, 'paused')` etc. below.
  //   paused     — full freeze: rawDelta zeroed, no animation, no motion
  //   stationary — animations and torch flicker keep ticking, but
  //                entities don't move. Used by the synchronized
  //                pair-capture recorder so two takes share identical
  //                entity positions.
  const params = {
    paused: false,
    stationary: false,
    lightingEnabled: initialLightingEnabled,
    pixelSize: Math.max(1, Math.round(ART_WORLD_SCALE * ddaResolutionScale)),
    cameraCellSnap: query.get('gridlock') === '1',
    renderSurface: `${renderSurface.width}x${renderSurface.height}`,
    ambient: DUNGEON_LIGHTING_DEFAULTS.ambient,
    torchIntensity: DUNGEON_LIGHTING_DEFAULTS.torchEmission,
    slimeIntensity: DUNGEON_LIGHTING_DEFAULTS.slimeEmission,
    slimeCount: requestedSlimes,
  }

  setSlimeCount(params.slimeCount)

  // Attach after the scene is populated so the first frame includes every
  // occluder and emissive source.
  flatland.setLighting(params.lightingEnabled ? lightEffect : null)

  // ─── Tweakpane UI ───────────────────────────────────────────────
  const paneBundle = createPane({ driver: 'manual' })
  const { pane } = paneBundle
  const updateDevtools = () => paneBundle.update()

  const lightFolder = pane.addFolder({ title: 'Lighting', expanded: true })
  lightFolder.addBinding(params, 'lightingEnabled', { label: 'enabled' }).on('change', () => {
    flatland.setLighting(params.lightingEnabled ? lightEffect : null)
  })
  lightFolder.addBinding(params, 'pixelSize', {
    min: 1,
    max: 16,
    step: 1,
    label: 'DDA cell px',
  })
  lightFolder.addBinding(params, 'cameraCellSnap', { label: 'camera cell snap' })
  lightFolder.addBinding(params, 'renderSurface', { label: 'buffer', readonly: true })
  lightFolder.addBinding(params, 'ambient', { min: 0, max: 0.5, step: 0.01 }).on('change', () => {
    ambientLight.intensity = params.ambient
  })
  lightFolder.addBinding(lightEffect.radiance, 'ddaPaletteBands', {
    min: 0,
    max: 64,
    step: 1,
    label: 'bands',
  })
  const torchFolder = pane.addFolder({ title: 'Torches', expanded: false })
  torchFolder.addBinding(params, 'torchIntensity', { min: 0, max: 16, step: 0.1, label: 'emission' })

  const slimeFolder = pane.addFolder({ title: 'Slimes', expanded: false })
  slimeFolder.addBinding(params, 'slimeIntensity', { min: 0, max: 12, step: 0.1, label: 'emission' })
  slimeFolder
    .addBinding(params, 'slimeCount', { min: 0, max: 1000, step: 1, label: 'count' })
    .on('change', (ev) => setSlimeCount(ev.value))

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
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    if (bestIdx < 0) return
    const torch = torchStates[switchToTorch[bestIdx]!]
    if (torch) torch.enabled = !torch.enabled
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
    if (k) {
      heroKeys[k] = false
      e.preventDefault()
    }
  })

  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect()
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    const camera = flatland.camera
    const worldX = camera.position.x + camera.left + ((ndcX + 1) / 2) * (camera.right - camera.left)
    const worldY = camera.position.y + camera.bottom + ((ndcY + 1) / 2) * (camera.top - camera.bottom)

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
        torchIdx = switchToTorch[i]!
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
    const nextSurface = authoredSurface()
    if (nextSurface.width !== renderSurface.width || nextSurface.height !== renderSurface.height) {
      renderSurface = nextSurface
      renderer.setSize(renderSurface.width, renderSurface.height, false)
      params.renderSurface = `${renderSurface.width}x${renderSurface.height}`
      refitView()
    }
    fitAuthoredCanvas(renderer.domElement, renderSurface.width, renderSurface.height)
  })

  // ─── Render loop ────────────────────────────────────────────────
  let lastTime = performance.now()
  let appliedDdaPixelSize = 0

  function renderFrame(): void {
    const ddaPixelSize = Math.max(1, Math.round(params.pixelSize))
    if (ddaPixelSize !== appliedDdaPixelSize) {
      lightEffect.radiance.ddaPixelSize = ddaPixelSize
      params.pixelSize = ddaPixelSize
      appliedDdaPixelSize = ddaPixelSize
    }
    flatland.render(renderer)
    if (benchmarkEnabled) {
      publishBenchmarkReady({
        example: 'radiance-dungeon',
        variant: 'three',
        seed,
        fixedDeltaMs: fixedDeltaMs ?? null,
        requestedSprites: requestedSlimes,
        actualSprites: slimes.length,
        actualBatches: flatland.spriteGroup.batchCount,
        simulationGated: benchmarkEnabled,
        simulationFrame: simulationGate.frame(),
        gpuAdapter: rendererGpuAdapterInfo(renderer),
        requestedLights: 0,
        actualLights: 0,
      })
    }
    updateDevtools()
  }

  function animate(): void {
    const now = performance.now()
    const rawDelta = fixedDeltaMs === undefined ? Math.min(0.1, (now - lastTime) / 1000) : fixedDeltaMs / 1000
    lastTime = now
    if (!simulationGate.advance()) {
      renderFrame()
      return
    }
    // Two deltas:
    //   `animDelta` — sprite animation cursors + torch flicker. Zero only
    //                 when paused.
    //   `delta`     — entity *position* updates (hero walk, slime hop,
    //                 stamina). Zero when paused OR stationary.
    // Most call sites care about position, so the motion variant keeps the
    // shorter name `delta` to minimize diff churn.
    const animDelta = params.paused ? 0 : rawDelta
    const delta = params.paused || params.stationary ? 0 : rawDelta
    // ── Torch flicker ────────────────────────────────────────────
    for (const torch of torchStates) {
      torch.changeIn -= animDelta
      if (torch.changeIn <= 0) {
        const fastFlicker = random() < 0.08
        torch.target = fastFlicker ? 0.2 + random() * 0.45 : 0.86 + random() * 0.24
        torch.changeIn = fastFlicker ? 0.025 + random() * 0.055 : 0.12 + random() * 0.28
        torch.response = fastFlicker ? 30 : 7 + random() * 4
      }
      const smoothing = 1 - Math.exp(-torch.response * animDelta)
      torch.current += (torch.target - torch.current) * smoothing
      torch.emission.intensity = torch.enabled ? params.torchIntensity * torch.current : 0
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
          const torch = torchStates[heroTargetTorchIdx]
          if (torch) torch.enabled = !torch.enabled
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
      const mx = mapHalfW - WALL_TILE - KNIGHT_SCALE / 2
      const my = mapHalfH - WALL_TILE - KNIGHT_SCALE / 2
      const nextX = Math.max(-mx, Math.min(mx, heroPos.x + moveX))
      const nextY = Math.max(-my, Math.min(my, heroPos.y + moveY))
      const heroHalfExtent = TILE_PX * 0.5
      if (!isBlocked(nextX, heroPos.y, heroHalfExtent)) heroPos.x = nextX
      if (!isBlocked(heroPos.x, nextY, heroHalfExtent)) heroPos.y = nextY

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

    const camera = flatland.camera
    const halfViewW = (camera.right - camera.left) / 2
    const halfViewH = (camera.top - camera.bottom) / 2
    const cameraLimitX = Math.max(0, mapHalfW - halfViewW)
    const cameraLimitY = Math.max(0, mapHalfH - halfViewH)
    const followX = Math.max(-cameraLimitX, Math.min(cameraLimitX, heroPos.x))
    const followY = Math.max(-cameraLimitY, Math.min(cameraLimitY, heroPos.y))
    const cameraSnapStep = params.cameraCellSnap ? Math.max(1, Math.round(params.pixelSize)) : ART_WORLD_SCALE
    camera.position.set(followX, followY, camera.position.z)
    if (camera instanceof PixelPerfectCamera) camera.snapPositionToGrid(cameraSnapStep)
    if (moving && heroAnim !== 'run') {
      hero.play('run')
      heroAnim = 'run'
    } else if (!moving && heroAnim !== 'idle') {
      hero.play('idle')
      heroAnim = 'idle'
    }
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
          s.hopTimer = 0.2 + random() * 0.2
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
            s.hopTimer =
              s.state === 'excited'
                ? SLIME_PAUSE_MIN_EXCITED + random() * (SLIME_PAUSE_MAX_EXCITED - SLIME_PAUSE_MIN_EXCITED)
                : SLIME_PAUSE_MIN_WANDER + random() * (SLIME_PAUSE_MAX_WANDER - SLIME_PAUSE_MIN_WANDER)
            s.vel.set(0, 0)
          } else {
            s.hopPhase = 'hop'
            s.hopTimer =
              s.state === 'excited'
                ? SLIME_HOP_MIN_EXCITED + random() * (SLIME_HOP_MAX_EXCITED - SLIME_HOP_MIN_EXCITED)
                : SLIME_HOP_MIN_WANDER + random() * (SLIME_HOP_MAX_WANDER - SLIME_HOP_MIN_WANDER)
            const angle = random() * Math.PI * 2
            const speed = s.state === 'excited' ? SLIME_SPEED_EXCITED : SLIME_SPEED_WANDER
            s.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed)
          }
        }

        const nextSlimeX = s.pos.x + s.vel.x * delta
        const nextSlimeY = s.pos.y + s.vel.y * delta
        const slimeHalfExtent = TILE_PX * 0.4
        if (isBlocked(nextSlimeX, s.pos.y, slimeHalfExtent)) s.vel.x *= -1
        else s.pos.x = nextSlimeX
        if (isBlocked(s.pos.x, nextSlimeY, slimeHalfExtent)) s.vel.y *= -1
        else s.pos.y = nextSlimeY
        if (s.pos.x > slimeBoundX) {
          s.pos.x = slimeBoundX
          s.vel.x = -Math.abs(s.vel.x)
        }
        if (s.pos.x < -slimeBoundX) {
          s.pos.x = -slimeBoundX
          s.vel.x = Math.abs(s.vel.x)
        }
        if (s.pos.y > slimeBoundY) {
          s.pos.y = slimeBoundY
          s.vel.y = -Math.abs(s.vel.y)
        }
        if (s.pos.y < -slimeBoundY) {
          s.pos.y = -slimeBoundY
          s.vel.y = Math.abs(s.vel.y)
        }

        if (s.hopPhase === 'hop') {
          const drain = s.state === 'excited' ? SLIME_STAMINA_DRAIN_EXCITED : SLIME_STAMINA_DRAIN_WANDER
          s.stamina = Math.max(0, s.stamina - drain * s.drainBias * delta)
        }
      }

      // Animation + transform.
      if (s.sprite) {
        const wantAnim: 'idle' | 'walk' = s.state !== 'rest' && s.hopPhase === 'hop' ? 'walk' : 'idle'
        if (wantAnim !== s.animation) {
          s.sprite.play(wantAnim)
          s.animation = wantAnim
        }
        s.sprite.position.set(s.pos.x, s.pos.y, 0)
        s.sprite.zIndex = -Math.floor(s.pos.y)
        if (Math.abs(s.vel.x) > 1) s.sprite.flipX = s.vel.x < 0
        s.sprite.update(animDelta * 1000)
      }

      if (s.emission) {
        const stateScale = s.state === 'excited' ? 1.35 : s.state === 'rest' ? 0.65 : 1
        s.emission.intensity = params.slimeIntensity * stateScale
      }
    }
    renderFrame()
  }

  async function sampleGpuTime(sampleCount = 20): Promise<{
    supported: boolean
    samples: number[]
    median: number | null
    p95: number | null
    min: number | null
    max: number | null
  }> {
    const backend = renderer.backend as unknown as {
      trackTimestamp?: boolean
      device?: { features?: { has(name: string): boolean } }
    }
    const resolve = (
      renderer as unknown as {
        resolveTimestampsAsync?: (type: 'render') => Promise<void>
      }
    ).resolveTimestampsAsync
    if (backend.device?.features?.has('timestamp-query') !== true || typeof resolve !== 'function') {
      return { supported: false, samples: [], median: null, p95: null, min: null, max: null }
    }

    const previousTracking = backend.trackTimestamp
    backend.trackTimestamp = true
    const samples: number[] = []
    const requested = Math.max(1, Math.min(60, Math.round(sampleCount)))
    try {
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame)
      for (let i = 0; i < requested * 3 && samples.length < requested; i++) {
        await new Promise(requestAnimationFrame)
        await resolve.call(renderer, 'render')
        const value = renderer.info.render.timestamp
        if (Number.isFinite(value) && value > 0) samples.push(value)
      }
    } finally {
      if (previousTracking !== true) {
        await resolve.call(renderer, 'render').catch(() => undefined)
        backend.trackTimestamp = previousTracking
      }
    }

    const sorted = [...samples].sort((a, b) => a - b)
    const quantile = (q: number): number | null => {
      if (sorted.length === 0) return null
      return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? null
    }
    return {
      supported: true,
      samples,
      median: quantile(0.5),
      p95: quantile(0.95),
      min: sorted[0] ?? null,
      max: sorted.at(-1) ?? null,
    }
  }

  ;(
    window as Window & {
      __radianceDungeonBenchmark?: { sampleGpuTime: typeof sampleGpuTime }
    }
  ).__radianceDungeonBenchmark = { sampleGpuTime }

  void renderer.setAnimationLoop(animate)

  if (automatedGpuSampleCount > 0) {
    setTimeout(() => {
      void sampleGpuTime(automatedGpuSampleCount)
        .then((result) => {
          benchmarkStatus.dataset.gpuBenchmark = JSON.stringify(result)
        })
        .catch((error: unknown) => {
          benchmarkStatus.dataset.gpuBenchmark = JSON.stringify({ error: String(error) })
        })
    }, 500)
  }

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
  ;(
    window as Window & {
      __captureScene?: (name: string, durationMs?: number) => Promise<void>
      __endCapture?: () => void
    }
  ).__captureScene = async function captureScene(name: string, durationMs = 3000): Promise<void> {
    if (!name || typeof name !== 'string') {
      console.error('[captureScene] usage: __captureScene("lighting-on", 3000)')
      return
    }
    // Always pause = false (rendering must continue), always stationary
    // = true (entities frozen, animations still play). We do NOT restore
    // these on exit — successive captures stay aligned. The state lives
    // only in `params`; there are no Tweakpane checkboxes for it.
    params.paused = false
    params.stationary = true

    const mainCanvas = renderer.domElement as HTMLCanvasElement

    function pickMimeType(): string {
      const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
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
      for (const torch of torchStates) {
        torch.current = 1
        torch.target = 1
        torch.changeIn = 0
      }
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
        `Stationary remains ON; call __endCapture() to resume motion.`
    )
  }

  // Resume normal entity motion after a capture session.
  ;(window as Window & { __endCapture?: () => void }).__endCapture = function endCapture(): void {
    params.stationary = false
    console.log('[endCapture] motion resumed')
  }
}

void main().catch((error: unknown) => console.error('[three-flatland] Example startup failed', error))
