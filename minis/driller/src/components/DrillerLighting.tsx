import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery, useWorld } from 'koota/react'
import type { Light2D as Light2DType } from 'three-flatland/react'
import { biomeAt } from '../biomes'
import { PLAY_COLS, TILE_PX } from '../constants'
import {
  BIOME_AMBIENT,
  GEM_LIGHT_COLOR,
  MAX_CRYSTAL_LIGHTS,
  MAX_GEM_LIGHTS,
  selectVisibleLights,
  surfaceSunIntensity,
  type LightCandidate,
} from '../lib/driller-lighting'
import { Animation, Camera, Driller, Gem, Grid, TILE_FIXTURE_BASE } from '../traits'

const GEM_LIGHT_SLOTS = Array.from({ length: MAX_GEM_LIGHTS }, (_, index) => index)
const CRYSTAL_LIGHT_SLOTS = Array.from({ length: MAX_CRYSTAL_LIGHTS }, (_, index) => index)
const CRYSTAL_TILE = TILE_FIXTURE_BASE + 2
const DRILL_BOB = [0, -1, -2, -1, 0] as const

interface GemLightCandidate extends LightCandidate {
  color: keyof typeof GEM_LIGHT_COLOR
  size: 'small' | 'medium' | 'large' | 'huge'
}

const GEM_INTENSITY = {
  small: 0.34,
  medium: 0.44,
  large: 0.58,
  huge: 0.76,
} as const

/**
 * Imperative fixed light pools for the Driller world. React mounts each
 * Light2D once; per-frame ECS state only mutates positions and enabled flags.
 */
export function DrillerLighting() {
  const world = useWorld()
  const drillers = useQuery(Driller)
  const gems = useQuery(Gem)
  const headlampRef = useRef<Light2DType>(null)
  const ambientRef = useRef<Light2DType>(null)
  const sunRef = useRef<Light2DType>(null)
  const gemLightRefs = useRef<(Light2DType | null)[]>([])
  const crystalLightRefs = useRef<(Light2DType | null)[]>([])
  const lastAmbientBiome = useRef<string>('')

  useFrame(() => {
    const drillerEntity = drillers[0]
    const d = drillerEntity?.get(Driller)
    const cam = world.get(Camera)
    const grid = world.get(Grid)
    if (!drillerEntity || !d || !cam || !grid) {
      if (headlampRef.current) headlampRef.current.enabled = false
      disablePool(gemLightRefs.current)
      disablePool(crystalLightRefs.current)
      return
    }

    const biome = biomeAt(d.row).name
    const ambient = ambientRef.current
    if (ambient && lastAmbientBiome.current !== biome) {
      const profile = BIOME_AMBIENT[biome]
      ambient.color = profile.color
      ambient.intensity = profile.intensity
      lastAmbientBiome.current = biome
    }

    const animation = drillerEntity.get(Animation)
    const state = animation?.state ?? 'idle'
    const isDrilling = state.startsWith('drill')
    const frameMs = isDrilling ? 85 : 220
    const frame = Math.floor(performance.now() / frameMs) % (isDrilling ? 5 : 4)
    const bob = isDrilling ? (DRILL_BOB[frame] ?? 0) : Math.sin(performance.now() / 360) * 0.5
    const headlamp = headlampRef.current
    if (headlamp) {
      headlamp.enabled = true
      headlamp.position.set(d.px + d.facing * 6, -(d.py - 8 + bob), 0)
    }

    const cameraTopRow = Math.floor(cam.y / TILE_PX)
    const sun = sunRef.current
    if (sun) {
      const intensity = biome === 'topsoil' ? surfaceSunIntensity(cameraTopRow) : 0
      sun.intensity = intensity
      sun.enabled = intensity > 0
    }

    const margin = TILE_PX * 1.5
    const candidates: GemLightCandidate[] = []
    for (const entity of gems) {
      const gem = entity.get(Gem)
      if (!gem || gem.collected) continue
      candidates.push({
        x: gem.px || gem.col * TILE_PX + TILE_PX / 2,
        y: gem.py || gem.row * TILE_PX + TILE_PX / 2,
        color: gem.color,
        size: gem.size,
      })
    }
    const visibleGems = selectVisibleLights(
      candidates,
      {
        left: -margin,
        right: PLAY_COLS * TILE_PX + margin,
        top: cam.y - margin,
        bottom: cam.y + cam.rows * TILE_PX + margin,
      },
      { x: d.px, y: d.py },
      MAX_GEM_LIGHTS
    )
    for (let index = 0; index < gemLightRefs.current.length; index++) {
      const light = gemLightRefs.current[index]
      if (!light) continue
      const gem = visibleGems[index]
      if (!gem) {
        light.enabled = false
        continue
      }
      light.enabled = true
      light.position.set(gem.x, -gem.y, 0)
      light.color = GEM_LIGHT_COLOR[gem.color]
      light.intensity = GEM_INTENSITY[gem.size]
    }

    const topRow = Math.max(0, cameraTopRow - 2)
    const bottomRow = Math.min(grid.rows, cameraTopRow + cam.rows + 2)
    let crystalSlot = 0
    for (let row = topRow; row < bottomRow && crystalSlot < MAX_CRYSTAL_LIGHTS; row++) {
      for (let col = 0; col < grid.cols && crystalSlot < MAX_CRYSTAL_LIGHTS; col++) {
        const index = row * grid.cols + col
        if (grid.tiles[index] !== CRYSTAL_TILE) continue
        if (col > 0 && grid.tiles[index - 1] === CRYSTAL_TILE) continue
        if (row > 0 && grid.tiles[index - grid.cols] === CRYSTAL_TILE) continue
        const fixtureBiome = biomeAt(row).name
        if (fixtureBiome !== 'crystal-caverns' && fixtureBiome !== 'core') continue

        let width = 1
        while (col + width < grid.cols && grid.tiles[index + width] === CRYSTAL_TILE) width++
        let height = 1
        while (
          row + height < grid.rows &&
          grid.tiles[(row + height) * grid.cols + col] === CRYSTAL_TILE
        ) {
          height++
        }
        const light = crystalLightRefs.current[crystalSlot++]
        if (!light) continue
        light.enabled = true
        light.position.set((col + width / 2) * TILE_PX, -(row + height / 2) * TILE_PX, 0)
        light.color = fixtureBiome === 'core' ? 0x7c3aed : 0xa78bfa
        light.intensity = fixtureBiome === 'core' ? 0.58 : 0.5
      }
    }
    for (let index = crystalSlot; index < crystalLightRefs.current.length; index++) {
      const light = crystalLightRefs.current[index]
      if (light) light.enabled = false
    }
  })

  return (
    <>
      <light2D ref={ambientRef} lightType="ambient" color={0x755c45} intensity={0.72} />
      <light2D
        ref={sunRef}
        lightType="directional"
        direction={[0.35, -1]}
        color={0xfff4d6}
        intensity={1}
        castsShadow={false}
      />
      <light2D
        ref={headlampRef}
        lightType="point"
        color={0xfcd34d}
        intensity={1.35}
        distance={TILE_PX * 6}
        decay={1.65}
        importance={20}
      />
      {GEM_LIGHT_SLOTS.map((index) => (
        <light2D
          key={`gem-light-${index}`}
          ref={(light) => {
            gemLightRefs.current[index] = light
          }}
          lightType="point"
          color={0xffffff}
          intensity={0}
          distance={TILE_PX * 3}
          decay={2}
          castsShadow={false}
          category="gem"
        />
      ))}
      {CRYSTAL_LIGHT_SLOTS.map((index) => (
        <light2D
          key={`crystal-light-${index}`}
          ref={(light) => {
            crystalLightRefs.current[index] = light
          }}
          lightType="point"
          color={0xa78bfa}
          intensity={0}
          distance={TILE_PX * 4}
          decay={1.75}
          castsShadow={false}
          category="crystal"
        />
      ))}
    </>
  )
}

function disablePool(pool: (Light2DType | null)[]): void {
  for (const light of pool) if (light) light.enabled = false
}
