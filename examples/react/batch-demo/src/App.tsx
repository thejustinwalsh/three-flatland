import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import { TextureLoader, NearestFilter, SRGBColorSpace, Vector2, Raycaster, Plane, Vector3, type Texture } from 'three'
import { Sprite2D, Sprite2DMaterial, Renderer2D, Layers, type RenderStats } from '@three-flatland/core'

// Configuration
const TILE_SIZE = 64
const GRID_WIDTH = 12
const GRID_HEIGHT = 8
const ASSET_BASE = '/react/batch-demo/assets/'

// Grass tilemap UV size (32x32 tiles in 640x256 texture)
const TILE_UV_SIZE = { width: 32 / 640, height: 32 / 256 }
const SLICE_TILES = 6 // 6x6 region for 9-slice
const SLICE_START_X = 0 // in tiles
const SLICE_START_Y = 0 // in tiles

// Helper to get the correct grass tile UV based on grid position
function getGrassTileUV(x: number, y: number) {
  const maxX = GRID_WIDTH - 1
  const maxY = GRID_HEIGHT - 1

  let sliceCol = 0
  let sliceRow = 0
  if (x === 0) sliceCol = 0
  else if (x === maxX) sliceCol = SLICE_TILES - 1
  else sliceCol = 1 + ((x - 1) % (SLICE_TILES - 2))

  if (y === 0) sliceRow = 0
  else if (y === maxY) sliceRow = SLICE_TILES - 1
  else sliceRow = 1 + ((y - 1) % (SLICE_TILES - 2))

  const flippedSliceRow = SLICE_TILES - 1 - sliceRow
  return {
    x: (SLICE_START_X + sliceCol) * TILE_UV_SIZE.width,
    y: 1 - (SLICE_START_Y + flippedSliceRow + 1) * TILE_UV_SIZE.height,
  }
}

// Building definitions
interface BuildingDef {
  name: string
  texture: string
  width: number
  height: number
  shadowScale: number
}

const BUILDINGS: BuildingDef[] = [
  { name: 'house', texture: 'buildings/House_Blue.png', width: 128, height: 192, shadowScale: 1.2 },
  { name: 'tower', texture: 'buildings/Tower_Blue.png', width: 128, height: 224, shadowScale: 1.0 },
  { name: 'tree', texture: 'deco/Tree.png', width: 192, height: 192, shadowScale: 1.5 },
]

// Stable texture URLs (outside component to avoid recreation)
const BUILDING_TEXTURE_URLS = BUILDINGS.map((b) => ASSET_BASE + b.texture)

// Placed entity data
interface PlacedEntity {
  id: number
  buildingIndex: number
  gridX: number
  gridY: number
}

let nextEntityId = 0

// Styles
const uiStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 8,
  padding: 12,
  background: 'rgba(0, 0, 0, 0.7)',
  borderRadius: 12,
  zIndex: 100,
}

const buttonStyle = (selected: boolean, isTree: boolean = false): React.CSSProperties => ({
  width: 64,
  height: 64,
  border: `3px solid ${selected ? '#4a9eff' : 'transparent'}`,
  borderRadius: 8,
  backgroundSize: isTree ? '400% 300%' : 'contain',
  backgroundPosition: isTree ? '0% 0%' : 'center',
  backgroundRepeat: 'no-repeat',
  backgroundColor: selected ? 'rgba(74, 158, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
})

const statsStyle: React.CSSProperties = {
  position: 'fixed',
  top: 20,
  left: 20,
  padding: '10px 16px',
  background: 'rgba(0, 0, 0, 0.7)',
  color: '#4a9eff',
  fontFamily: 'monospace',
  fontSize: 13,
  borderRadius: 8,
  zIndex: 100,
}

const titleStyle: React.CSSProperties = {
  position: 'fixed',
  top: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '10px 20px',
  background: 'rgba(0, 0, 0, 0.7)',
  color: 'white',
  fontSize: 18,
  fontWeight: 600,
  borderRadius: 8,
  zIndex: 100,
}

const hintStyle: React.CSSProperties = {
  position: 'fixed',
  top: 70,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '8px 16px',
  background: 'rgba(0, 0, 0, 0.5)',
  color: 'rgba(255, 255, 255, 0.8)',
  fontSize: 13,
  borderRadius: 6,
  zIndex: 100,
}

const creditsStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 115,
  left: '50%',
  transform: 'translateX(-50%)',
  color: 'rgba(0, 0, 0, 0.5)',
  fontSize: 11,
  zIndex: 100,
}

interface VillageSceneProps {
  entities: PlacedEntity[]
  selectedBuilding: number
  onPlaceBuilding: (gridX: number, gridY: number) => void
  onStats: (stats: RenderStats) => void
}

function VillageScene({ entities, selectedBuilding, onPlaceBuilding, onStats }: VillageSceneProps) {
  const { camera, gl } = useThree()

  // Load textures (stable URL arrays)
  const grassTex = useLoader(TextureLoader, ASSET_BASE + 'terrain/Tilemap_Flat.png')
  const shadowTex = useLoader(TextureLoader, ASSET_BASE + 'terrain/Shadows.png')
  const buildingTextures = useLoader(TextureLoader, BUILDING_TEXTURE_URLS) as Texture[]

  // Configure textures (run once - textures are stable from useLoader)
  useState(() => {
    ;[grassTex, shadowTex, ...buildingTextures].forEach((tex) => {
      tex.minFilter = NearestFilter
      tex.magFilter = NearestFilter
      tex.colorSpace = SRGBColorSpace
    })
  })

  // Create materials ONCE using useState initializer (never recreated)
  // useMemo can rerun if dependencies change, useState initializer runs exactly once
  const [grassMaterial] = useState(() => new Sprite2DMaterial({ map: grassTex }))
  const [shadowMaterial] = useState(() => new Sprite2DMaterial({ map: shadowTex }))
  const [buildingMaterials] = useState(() =>
    buildingTextures.map((tex) => new Sprite2DMaterial({ map: tex }))
  )

  // Grid calculations
  const gridOffsetX = (-GRID_WIDTH * TILE_SIZE) / 2 + TILE_SIZE / 2
  const gridOffsetY = (-GRID_HEIGHT * TILE_SIZE) / 2 + TILE_SIZE / 2

  // Create renderer2D ONCE (never recreated)
  const [renderer2D] = useState(() => new Renderer2D())

  // Create ground tiles ONCE on mount (useRef to track, not state)
  const groundTilesCreated = useRef(false)
  if (!groundTilesCreated.current) {
    groundTilesCreated.current = true
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const tile = new Sprite2D({ material: grassMaterial })
        const uv = getGrassTileUV(x, y)
        tile.setFrame({
          name: 'grass',
          x: uv.x,
          y: uv.y,
          width: TILE_UV_SIZE.width,
          height: TILE_UV_SIZE.height,
          sourceWidth: TILE_SIZE,
          sourceHeight: TILE_SIZE,
        })
        tile.position.set(gridOffsetX + x * TILE_SIZE, gridOffsetY + y * TILE_SIZE, 0)
        tile.layer = Layers.GROUND
        tile.zIndex = 0
        renderer2D.add(tile)
      }
    }
  }

  // Track entity sprites (ref for mutable map, not for React lifecycle)
  const entitySpritesRef = useRef(new Map<number, { sprite: Sprite2D; shadow: Sprite2D }>())

  // Sync entities with sprites (useEffect for side effects)
  useEffect(() => {
    const currentIds = new Set(entities.map((e) => e.id))

    // Remove sprites for deleted entities
    for (const [id, { sprite, shadow }] of entitySpritesRef.current) {
      if (!currentIds.has(id)) {
        renderer2D.remove(sprite)
        renderer2D.remove(shadow)
        entitySpritesRef.current.delete(id)
      }
    }

    // Add sprites for new entities
    for (const entity of entities) {
      if (!entitySpritesRef.current.has(entity.id)) {
        const buildingDef = BUILDINGS[entity.buildingIndex]!
        const material = buildingMaterials[entity.buildingIndex]!
        const pos = {
          x: gridOffsetX + entity.gridX * TILE_SIZE,
          y: gridOffsetY + entity.gridY * TILE_SIZE,
        }

        // Create shadow
        const shadow = new Sprite2D({ material: shadowMaterial })
        shadow.scale.set(TILE_SIZE * buildingDef.shadowScale, TILE_SIZE * buildingDef.shadowScale * 0.5, 1)
        shadow.position.set(pos.x, pos.y - TILE_SIZE * 0.3, 0)
        shadow.layer = Layers.SHADOWS
        shadow.zIndex = 0
        shadow.alpha = 0.5
        renderer2D.add(shadow)

        // Create building sprite
        const sprite = new Sprite2D({ material })
        if (buildingDef.name === 'tree') {
          sprite.setFrame({
            name: 'tree',
            x: 0,
            y: (576 - 192) / 576,
            width: 192 / 768,
            height: 192 / 576,
            sourceWidth: buildingDef.width,
            sourceHeight: buildingDef.height,
          })
        }
        sprite.scale.set(buildingDef.width, buildingDef.height, 1)
        sprite.position.set(pos.x, pos.y + buildingDef.height / 2 - TILE_SIZE / 2, 0)
        sprite.layer = Layers.ENTITIES
        sprite.zIndex = -Math.floor(pos.y)
        renderer2D.add(sprite)

        entitySpritesRef.current.set(entity.id, { sprite, shadow })
      }
    }
  }, [entities, renderer2D, buildingMaterials, shadowMaterial, gridOffsetX, gridOffsetY])

  // Create hover sprite ONCE (never recreated)
  const [hoverSprite] = useState(() => {
    const sprite = new Sprite2D({ material: buildingMaterials[0]! })
    sprite.alpha = 0.5
    sprite.layer = Layers.FOREGROUND
    sprite.renderOrder = 1000
    sprite.visible = false
    return sprite
  })

  // Update hover sprite when selection changes
  useEffect(() => {
    const buildingDef = BUILDINGS[selectedBuilding]!
    hoverSprite.material = buildingMaterials[selectedBuilding]!
    hoverSprite.scale.set(buildingDef.width, buildingDef.height, 1)
    if (buildingDef.name === 'tree') {
      hoverSprite.setFrame({
        name: 'tree',
        x: 0,
        y: (576 - 192) / 576,
        width: 192 / 768,
        height: 192 / 576,
        sourceWidth: buildingDef.width,
        sourceHeight: buildingDef.height,
      })
    } else {
      hoverSprite.setFrame({
        name: 'full',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        sourceWidth: buildingDef.width,
        sourceHeight: buildingDef.height,
      })
    }
  }, [hoverSprite, selectedBuilding, buildingMaterials])

  // Track occupied cells
  const occupiedCells = useMemo(() => {
    const cells = new Set<string>()
    entities.forEach((e) => cells.add(`${e.gridX},${e.gridY}`))
    return cells
  }, [entities])

  // Mouse handling
  const lastHoverGridRef = useRef<{ x: number; y: number } | null>(null)
  const raycaster = useMemo(() => new Raycaster(), [])
  const groundPlane = useMemo(() => new Plane(new Vector3(0, 0, 1), 0), [])
  const mouse = useMemo(() => new Vector2(), [])
  const worldPos = useMemo(() => new Vector3(), [])

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      raycaster.ray.intersectPlane(groundPlane, worldPos)
      return worldPos
    },
    [camera, gl, raycaster, groundPlane, mouse, worldPos]
  )

  const worldToGrid = useCallback(
    (worldX: number, worldY: number) => {
      const gx = Math.floor((worldX - gridOffsetX + TILE_SIZE / 2) / TILE_SIZE)
      const gy = Math.floor((worldY - gridOffsetY + TILE_SIZE / 2) / TILE_SIZE)
      if (gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
        return { x: gx, y: gy }
      }
      return null
    },
    [gridOffsetX, gridOffsetY]
  )

  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const world = screenToWorld(e.clientX, e.clientY)
      const grid = worldToGrid(world.x, world.y)

      if (grid && !occupiedCells.has(`${grid.x},${grid.y}`)) {
        const pos = {
          x: gridOffsetX + grid.x * TILE_SIZE,
          y: gridOffsetY + grid.y * TILE_SIZE,
        }
        const buildingDef = BUILDINGS[selectedBuilding]!
        hoverSprite.position.set(pos.x, pos.y + buildingDef.height / 2 - TILE_SIZE / 2, 0)
        hoverSprite.visible = true
        lastHoverGridRef.current = grid
      } else {
        hoverSprite.visible = false
        lastHoverGridRef.current = null
      }
    }

    const handleMouseLeave = () => {
      hoverSprite.visible = false
      lastHoverGridRef.current = null
    }

    const handleClick = () => {
      if (lastHoverGridRef.current) {
        onPlaceBuilding(lastHoverGridRef.current.x, lastHoverGridRef.current.y)
      }
    }

    const canvas = gl.domElement
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('click', handleClick)

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('click', handleClick)
    }
  }, [gl, screenToWorld, worldToGrid, selectedBuilding, hoverSprite, occupiedCells, gridOffsetX, gridOffsetY, onPlaceBuilding])

  // Update loop
  useFrame(() => {
    renderer2D.update()
    onStats(renderer2D.stats)
  })

  return (
    <>
      <primitive object={renderer2D} />
      <primitive object={hoverSprite} />
    </>
  )
}

export default function App() {
  const [entities, setEntities] = useState<PlacedEntity[]>([])
  const [selectedBuilding, setSelectedBuilding] = useState(0)
  const [stats, setStats] = useState<RenderStats>({
    spriteCount: 0,
    batchCount: 0,
    drawCalls: 0,
    visibleSprites: 0,
  })

  const viewWidth = TILE_SIZE * (GRID_WIDTH + 2)
  const viewHeight = TILE_SIZE * (GRID_HEIGHT + 4)

  const handlePlaceBuilding = useCallback(
    (gridX: number, gridY: number) => {
      setEntities((prev) => {
        const key = `${gridX},${gridY}`
        if (prev.some((e) => `${e.gridX},${e.gridY}` === key)) return prev
        return [...prev, { id: nextEntityId++, buildingIndex: selectedBuilding, gridX, gridY }]
      })
    },
    [selectedBuilding]
  )

  // Place initial entities
  useEffect(() => {
    const initial: PlacedEntity[] = [
      { id: nextEntityId++, buildingIndex: 0, gridX: 2, gridY: 3 },
      { id: nextEntityId++, buildingIndex: 0, gridX: 5, gridY: 5 },
      { id: nextEntityId++, buildingIndex: 1, gridX: 8, gridY: 2 },
      { id: nextEntityId++, buildingIndex: 2, gridX: 1, gridY: 6 },
      { id: nextEntityId++, buildingIndex: 2, gridX: 10, gridY: 4 },
      { id: nextEntityId++, buildingIndex: 2, gridX: 7, gridY: 6 },
    ]
    setEntities(initial)
  }, [])

  return (
    <>
      <Canvas
        orthographic
        camera={{
          position: [0, 0, 100],
          zoom: 1,
          near: 0.1,
          far: 1000,
          left: -viewWidth / 2,
          right: viewWidth / 2,
          top: viewHeight / 2,
          bottom: -viewHeight / 2,
        }}
        style={{ background: '#87ceeb' }}
      >
        <VillageScene
          entities={entities}
          selectedBuilding={selectedBuilding}
          onPlaceBuilding={handlePlaceBuilding}
          onStats={setStats}
        />
      </Canvas>

      <div style={titleStyle}>Village Builder</div>
      <div style={hintStyle}>Click to place buildings</div>
      <div style={statsStyle}>
        Sprites: {stats.spriteCount} | Batches: {stats.batchCount} | Draw Calls: {stats.drawCalls}
      </div>

      <div style={uiStyle}>
        {BUILDINGS.map((building, index) => (
          <button
            key={building.name}
            style={{
              ...buttonStyle(index === selectedBuilding, building.name === 'tree'),
              backgroundImage: `url(${ASSET_BASE}${building.texture})`,
            }}
            onClick={() => setSelectedBuilding(index)}
            title={building.name}
          />
        ))}
      </div>

      <div style={creditsStyle}>
        Assets from{' '}
        <a href="https://pixelfrog-assets.itch.io/tiny-swords" target="_blank" style={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Tiny Swords
        </a>{' '}
        by Pixel Frog
      </div>
    </>
  )
}
