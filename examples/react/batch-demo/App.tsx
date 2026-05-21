import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree, extend } from '@react-three/fiber/webgpu'
import { Vector2, Raycaster, Plane, Vector3, type OrthographicCamera } from 'three'
import {
  Sprite2D,
  Sprite2DMaterial,
  SpriteGroup,
  Layers,
  TextureLoader,
  SpriteSheetLoader,
  type SpriteFrame,
  type SpriteSheet,
  type RenderStats,
} from 'three-flatland/react'
import { usePane, useStatsMonitor } from '@three-flatland/tweakpane/react'
import type { Pane } from 'tweakpane'
import type { StatsHandle } from '@three-flatland/tweakpane/react'
import { GemBackground } from './GemBackground'
import { GEM } from './gem'
// Extend R3F with our custom classes
extend({ SpriteGroup, Sprite2D, Sprite2DMaterial })

// Letterboxed orthographic camera that fits viewWidth × viewHeight in the canvas
function FitOrthoCamera({ viewWidth, viewHeight }: { viewWidth: number; viewHeight: number }) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height
  const viewAspect = viewWidth / viewHeight
  return (
    <orthographicCamera
      ref={(cam: OrthographicCamera | null) => {
        if (!cam) return
        if (aspect > viewAspect) {
          // Window wider — fit to height
          cam.top = viewHeight / 2
          cam.bottom = -viewHeight / 2
          cam.left = (-viewHeight * aspect) / 2
          cam.right = (viewHeight * aspect) / 2
        } else {
          // Window taller — fit to width
          cam.left = -viewWidth / 2
          cam.right = viewWidth / 2
          cam.top = viewWidth / aspect / 2
          cam.bottom = -viewWidth / aspect / 2
        }
        cam.updateProjectionMatrix()
        set({ camera: cam })
      }}
      position={[0, 0, 100]}
      near={0.1}
      far={1000}
      manual
    />
  )
}

// Configuration
const TILE_SIZE = 64
const GRID_WIDTH = 12
const GRID_HEIGHT = 8
const ASSET_BASE = './assets/'

// Grass tilemap UV size (32x32 tiles in 640x256 texture)
const TILE_UV_SIZE = { width: 32 / 640, height: 32 / 256 }
const SLICE_TILES = 6

function getGrassTileUV(x: number, y: number) {
  const maxX = GRID_WIDTH - 1
  const maxY = GRID_HEIGHT - 1

  let sliceCol = x === 0 ? 0 : x === maxX ? SLICE_TILES - 1 : 1 + ((x - 1) % (SLICE_TILES - 2))
  let sliceRow = y === 0 ? 0 : y === maxY ? SLICE_TILES - 1 : 1 + ((y - 1) % (SLICE_TILES - 2))

  const flippedSliceRow = SLICE_TILES - 1 - sliceRow
  return {
    x: sliceCol * TILE_UV_SIZE.width,
    y: 1 - (flippedSliceRow + 1) * TILE_UV_SIZE.height,
  }
}

// Building definitions — frame names refer to the shared sprites atlas
// (sprites.png + sprites.atlas.json). All buildings load from one
// texture → one material → one SpriteBatch, so per-sprite zIndex
// Y-sort works across building types.
// Two paths for the same content, by design:
//   `frame`   → atlas frame in sprites.png — used by the GAME RENDER so
//               all buildings share one material and batch together
//   `texture` → individual PNG — used by the PICKER UI `<img>` element
//               (atlas frames packed without padding bleed when scaled
//               via CSS background-size; HTML img tags don't benefit
//               from atlasing anyway since there's nothing to batch)
// Render dimensions = atlas sourceSize so manual scale and Sprite2D's
// auto-sizing (setFrame → updateSize on first frame) agree. Without
// this, hover sprite (reuses one Sprite2D across building switches, so
// updateSize fires only the first time) diverges from placed sprites
// (one Sprite2D per placement, updateSize always fires on init).
const BUILDINGS = [
  { name: 'house', frame: 'house',   texture: 'buildings/House_Blue.png', width: 108, height: 148, shadowScale: 1.2 },
  { name: 'tower', frame: 'tower_0', texture: 'buildings/Tower_Blue.png', width: 114, height: 183, shadowScale: 1.0 },
  { name: 'tree',  frame: 'tree_0',  texture: 'deco/Tree.png',            width: 111, height: 174, shadowScale: 1.5 },
] as const

// Entity state
interface PlacedEntity {
  id: number
  buildingIndex: number
  gridX: number
  gridY: number
}


// Grid positions for ground tiles (computed once)
const GROUND_POSITIONS = Array.from({ length: GRID_HEIGHT * GRID_WIDTH }, (_, i) => ({
  x: i % GRID_WIDTH,
  y: Math.floor(i / GRID_WIDTH),
}))

// ============================================
// DECLARATIVE COMPONENTS
// ============================================

interface GroundTileProps {
  gridX: number
  gridY: number
  material: Sprite2DMaterial
  gridOffsetX: number
  gridOffsetY: number
}

function GroundTile({ gridX, gridY, material, gridOffsetX, gridOffsetY }: GroundTileProps) {
  const uv = getGrassTileUV(gridX, gridY)
  const frame: SpriteFrame = {
    name: 'grass',
    x: uv.x,
    y: uv.y,
    width: TILE_UV_SIZE.width,
    height: TILE_UV_SIZE.height,
    sourceWidth: TILE_SIZE,
    sourceHeight: TILE_SIZE,
  }

  return (
    <sprite2D
      material={material}
      position={[gridOffsetX + gridX * TILE_SIZE, gridOffsetY + gridY * TILE_SIZE, 0]}
      layer={Layers.GROUND}
      zIndex={0}
      frame={frame}
    />
  )
}

interface EntitySpritesProps {
  entity: PlacedEntity
  spritesMaterial: Sprite2DMaterial
  spritesSheet: SpriteSheet
  shadowMaterial: Sprite2DMaterial
  gridOffsetX: number
  gridOffsetY: number
}

function EntitySprites({ entity, spritesMaterial, spritesSheet, shadowMaterial, gridOffsetX, gridOffsetY }: EntitySpritesProps) {
  const building = BUILDINGS[entity.buildingIndex]!
  const posX = gridOffsetX + entity.gridX * TILE_SIZE
  const posY = gridOffsetY + entity.gridY * TILE_SIZE
  const frame = spritesSheet.getFrame(building.frame)

  return (
    <>
      {/* Shadow */}
      <sprite2D
        material={shadowMaterial}
        position={[posX, posY - TILE_SIZE * 0.3, 0]}
        scale={[TILE_SIZE * building.shadowScale, TILE_SIZE * building.shadowScale * 0.5, 1]}
        layer={Layers.SHADOWS}
        zIndex={0}
        alpha={0.5}
      />
      {/* Building — shared spritesMaterial so all building types batch
         together → cross-entity zIndex Y-sort works */}
      <sprite2D
        material={spritesMaterial}
        position={[posX, posY + building.height / 2 - TILE_SIZE / 2, 0]}
        scale={[building.width, building.height, 1]}
        layer={Layers.ENTITIES}
        zIndex={-Math.floor(posY)}
        frame={frame}
      />
    </>
  )
}

interface HoverPreviewProps {
  visible: boolean
  position: [number, number, number]
  material: Sprite2DMaterial
  spritesSheet: SpriteSheet
  building: typeof BUILDINGS[number]
}

function HoverPreview({ visible, position, material, spritesSheet, building }: HoverPreviewProps) {
  const frame: SpriteFrame = spritesSheet.getFrame(building.frame)

  return (
    <sprite2D
      visible={visible}
      material={material}
      position={position}
      scale={[building.width, building.height, 1]}
      alpha={0.5}
      layer={Layers.FOREGROUND}
      renderOrder={1000}
      frame={frame}
    />
  )
}

// ============================================
// MAIN SCENE
// ============================================

function StatsMonitor({ pane, spriteStats }: { pane: Pane; spriteStats: RenderStats }) {
  const statsObjRef = useRef({ sprites: 0, batches: 0 })
  const folderRef = useRef<ReturnType<Pane['addFolder']> | null>(null)

  useEffect(() => {
    const statsFolder = pane.addFolder({ title: 'Batching', expanded: false })
    statsFolder.addBinding(statsObjRef.current, 'sprites', { readonly: true, format: (v: number) => v.toFixed(0) })
    statsFolder.addBinding(statsObjRef.current, 'batches', { readonly: true, format: (v: number) => v.toFixed(0) })
    folderRef.current = statsFolder

    return () => {
      statsFolder.dispose()
    }
  }, [pane])

  // Update stats values each frame via useFrame is not possible here (outside Canvas),
  // so we update on each render
  statsObjRef.current.sprites = spriteStats.spriteCount
  statsObjRef.current.batches = spriteStats.batchCount
  pane.refresh()

  return null
}

interface VillageSceneProps {
  entities: PlacedEntity[]
  selectedBuilding: number
  onPlaceBuilding: (gridX: number, gridY: number) => void
  onStats: (stats: RenderStats) => void
  stats: StatsHandle
}

function VillageScene({ entities, selectedBuilding, onPlaceBuilding, onStats, stats }: VillageSceneProps) {
  const { camera, gl } = useThree()

  // Load textures (presets are automatically applied - NearestFilter + SRGBColorSpace)
  const grassTex = useLoader(TextureLoader, ASSET_BASE + 'terrain/Tilemap_Flat.png')
  const shadowTex = useLoader(TextureLoader, ASSET_BASE + 'terrain/Shadows.png')
  const spritesSheet = useLoader(SpriteSheetLoader, ASSET_BASE + 'buildings/sprites.atlas.json')

  // Create materials (stable - each texture is a stable reference)
  const grassMaterial = useMemo(() => new Sprite2DMaterial({ map: grassTex }), [grassTex])
  const shadowMaterial = useMemo(() => new Sprite2DMaterial({ map: shadowTex }), [shadowTex])
  // ONE material for ALL buildings + trees → ONE batch → cross-entity
  // zIndex Y-sort works correctly.
  const spritesMaterial = useMemo(
    () => new Sprite2DMaterial({ map: spritesSheet.texture }),
    [spritesSheet]
  )

  // Grid calculations
  const gridOffsetX = (-GRID_WIDTH * TILE_SIZE) / 2 + TILE_SIZE / 2
  const gridOffsetY = (-GRID_HEIGHT * TILE_SIZE) / 2 + TILE_SIZE / 2

  // Occupied cells
  const occupiedCells = useMemo(() => {
    const cells = new Set<string>()
    entities.forEach((e) => cells.add(`${e.gridX},${e.gridY}`))
    return cells
  }, [entities])

  // Hover state
  const [hoverGrid, setHoverGrid] = useState<{ x: number; y: number } | null>(null)
  const hoverGridRef = useRef(hoverGrid)
  hoverGridRef.current = hoverGrid
  const hoverVisible = hoverGrid !== null && !occupiedCells.has(`${hoverGrid.x},${hoverGrid.y}`)

  // Mouse helpers
  const raycaster = useMemo(() => new Raycaster(), [])
  const groundPlane = useMemo(() => new Plane(new Vector3(0, 0, 1), 0), [])

  const screenToGrid = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      const mouse = new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.setFromCamera(mouse, camera)
      const worldPos = new Vector3()
      raycaster.ray.intersectPlane(groundPlane, worldPos)

      const gx = Math.floor((worldPos.x - gridOffsetX + TILE_SIZE / 2) / TILE_SIZE)
      const gy = Math.floor((worldPos.y - gridOffsetY + TILE_SIZE / 2) / TILE_SIZE)

      if (gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
        return { x: gx, y: gy }
      }
      return null
    },
    [camera, gl, raycaster, groundPlane, gridOffsetX, gridOffsetY]
  )

  // Mouse events - use useEffect for proper cleanup
  useEffect(() => {
    const canvas = gl.domElement

    const onMouseMove = (e: MouseEvent) => setHoverGrid(screenToGrid(e.clientX, e.clientY))
    const onMouseLeave = () => setHoverGrid(null)
    const onClick = () => {
      const grid = hoverGridRef.current
      if (grid && !occupiedCells.has(`${grid.x},${grid.y}`)) {
        onPlaceBuilding(grid.x, grid.y)
      }
    }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('click', onClick)

    return () => {
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('click', onClick)
    }
  }, [gl, screenToGrid, occupiedCells, onPlaceBuilding])

  // SpriteGroup ref for stats
  const spriteGroupRef = useRef<SpriteGroup>(null)

  useStatsMonitor(stats)

  // Surface SpriteGroup batching stats to the parent each frame
  useFrame(() => {
    if (spriteGroupRef.current) {
      onStats(spriteGroupRef.current.stats)
    }
  }, { priority: -Infinity })

  // Hover position
  const hoverPosition: [number, number, number] = hoverGrid
    ? [
        gridOffsetX + hoverGrid.x * TILE_SIZE,
        gridOffsetY + hoverGrid.y * TILE_SIZE + BUILDINGS[selectedBuilding]!.height / 2 - TILE_SIZE / 2,
        0,
      ]
    : [0, 0, 0]

  return (
    <>
      {/* Batched sprites */}
      <spriteGroup ref={spriteGroupRef}>
        {/* Ground tiles */}
        {GROUND_POSITIONS.map(({ x, y }) => (
          <GroundTile
            key={`ground-${x}-${y}`}
            gridX={x}
            gridY={y}
            material={grassMaterial}
            gridOffsetX={gridOffsetX}
            gridOffsetY={gridOffsetY}
          />
        ))}

        {/* Entity sprites */}
        {entities.map((entity) => (
          <EntitySprites
            key={entity.id}
            entity={entity}
            spritesMaterial={spritesMaterial}
            spritesSheet={spritesSheet}
            shadowMaterial={shadowMaterial}
            gridOffsetX={gridOffsetX}
            gridOffsetY={gridOffsetY}
          />
        ))}
      </spriteGroup>

      {/* Hover preview - NOT batched, renders separately with high renderOrder */}
      <HoverPreview
        visible={hoverVisible}
        position={hoverPosition}
        material={spritesMaterial}
        spritesSheet={spritesSheet}
        building={BUILDINGS[selectedBuilding]!}
      />
    </>
  )
}

// ============================================
// UI STYLES
// ============================================

const styles = {
  ui: {
    position: 'fixed',
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 6,
    padding: 8,
    background: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    zIndex: 100,
  } as React.CSSProperties,

  button: (selected: boolean) =>
    ({
      width: 40,
      height: 40,
      border: `2px solid ${selected ? '#4a9eff' : 'transparent'}`,
      borderRadius: 6,
      backgroundColor: selected ? 'rgba(74, 158, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      overflow: 'hidden',
      position: 'relative',
      padding: 0,
    }) as React.CSSProperties,

  credits: {
    position: 'fixed',
    bottom: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 9,
    whiteSpace: 'nowrap',
    zIndex: 100,
  } as React.CSSProperties,
}

// ============================================
// APP
// ============================================

// Initial entities
const INITIAL_ENTITIES: PlacedEntity[] = [
  { id: 1, buildingIndex: 0, gridX: 2, gridY: 3 },
  { id: 2, buildingIndex: 0, gridX: 5, gridY: 5 },
  { id: 3, buildingIndex: 1, gridX: 8, gridY: 2 },
  { id: 4, buildingIndex: 2, gridX: 1, gridY: 6 },
  { id: 5, buildingIndex: 2, gridX: 10, gridY: 4 },
  { id: 6, buildingIndex: 2, gridX: 7, gridY: 6 },
]

export default function App() {
  const [entities, setEntities] = useState<PlacedEntity[]>(INITIAL_ENTITIES)
  const [selectedBuilding, setSelectedBuilding] = useState(0)
  const [spriteStats, setSpriteStats] = useState<RenderStats>({ spriteCount: 0, batchCount: 0, drawCalls: 0, visibleSprites: 0 })

  const { pane, stats } = usePane()

  const viewWidth = TILE_SIZE * (GRID_WIDTH + 2)
  const viewHeight = TILE_SIZE * (GRID_HEIGHT + 4)

  const handlePlaceBuilding = useCallback(
    (gridX: number, gridY: number) => {
      setEntities((prev) => {
        if (prev.some((e) => e.gridX === gridX && e.gridY === gridY)) return prev
        // Derive next ID from existing entities to survive HMR
        const nextId = Math.max(0, ...prev.map((e) => e.id)) + 1
        return [...prev, { id: nextId, buildingIndex: selectedBuilding, gridX, gridY }]
      })
    },
    [selectedBuilding]
  )

  return (
    <>
      <Canvas
        dpr={1}
        style={{ background: "#16191e" }}
        renderer={{ antialias: false, trackTimestamp: true }}
        onCreated={({ gl }) => {
          gl.domElement.style.imageRendering = 'pixelated'
        }}
      >
        {/* L1 + L2 — gem-tinted clear color + lit radial gradient. */}
        <GemBackground gem={GEM} />
        <FitOrthoCamera viewWidth={viewWidth} viewHeight={viewHeight} />
        <VillageScene
          entities={entities}
          selectedBuilding={selectedBuilding}
          onPlaceBuilding={handlePlaceBuilding}
          onStats={setSpriteStats}
          stats={stats}
        />
      </Canvas>

      <StatsMonitor pane={pane} spriteStats={spriteStats} />

      {/* TODO: migrate game UI to three-flatland events */}
      <div style={styles.ui}>
        {BUILDINGS.map((building, index) => {
          const isTree = building.name === 'tree'
          return (
            <button
              key={building.name}
              style={styles.button(index === selectedBuilding)}
              onClick={() => setSelectedBuilding(index)}
              title={building.name}
            >
              <img
                src={`${ASSET_BASE}${building.texture}`}
                alt={building.name}
                style={isTree
                  ? { position: 'absolute', inset: 0, width: '400%', height: '300%', maxWidth: 'none', objectFit: 'cover', objectPosition: '0 0', pointerEvents: 'none' }
                  : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }
                }
              />
            </button>
          )
        })}
      </div>

      <div style={styles.credits}>
        Assets from{' '}
        <a href="https://pixelfrog-assets.itch.io/tiny-swords" target="_blank" style={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Tiny Swords
        </a>{' '}
        by Pixel Frog
      </div>
    </>
  )
}
