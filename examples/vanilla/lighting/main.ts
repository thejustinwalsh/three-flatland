import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu'
import {
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoBlending,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type OrthographicCamera,
  type Texture,
} from 'three'
import { Fn, uv, vec4, float, texture as sampleTexture } from 'three/tsl'
import {
  Flatland,
  Light2D,
  Sprite2D,
  SpriteSheetLoader,
  Layers,
  RadianceLightingStrategy,
} from 'three-flatland'

// ============================================
// CONSTANTS
// ============================================

const VIEW_SIZE = 400

// Simple box occluder size
const BOX_SIZE = 48

// ============================================
// MAIN
// ============================================

async function main() {
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const flatland = new Flatland({
    viewSize: VIEW_SIZE,
    aspect: window.innerWidth / window.innerHeight,
    clearColor: 0x050508,
    tiling: false,
    lightingStrategy: new RadianceLightingStrategy(),
  })
  // Debug: expose flatland for console
  ;(window as unknown as Record<string, unknown>).__flatland = flatland

  // --- Load knight sprite for occluder ---
  const asset = (path: string) => new URL(path, import.meta.url).href
  const knightSheet = await SpriteSheetLoader.load(asset('./sprites/knight.json'))
  knightSheet.texture.minFilter = NearestFilter
  knightSheet.texture.magFilter = NearestFilter

  // --- Lit background floor (white surface to receive light) ---
  const whiteTex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType)
  whiteTex.needsUpdate = true

  const aspect = window.innerWidth / window.innerHeight
  const floorW = VIEW_SIZE * aspect + 20
  const floorH = VIEW_SIZE + 20
  const floorTex = new DataTexture(new Uint8Array([180, 180, 190, 255]), 1, 1, RGBAFormat, UnsignedByteType)
  floorTex.needsUpdate = true
  const floor = new Sprite2D({
    texture: floorTex,
    layer: Layers.BACKGROUND,
    anchor: [0.5, 0.5],
    lit: true,
  })
  floor.scale.set(floorW, floorH, 1)
  floor.position.set(0, 0, 0)
  flatland.add(floor)

  // --- Create 3 colored point lights ---
  // Positioned to interact with walls — one on each side, one behind walls
  const lights: { light: Light2D; label: string }[] = [
    {
      light: new Light2D({
        type: 'point',
        position: [-120, 30],
        color: 0xff4422,
        intensity: 2.0,
        distance: 250,
        decay: 2,
      }),
      label: 'Red',
    },
    {
      light: new Light2D({
        type: 'point',
        position: [120, 40],
        color: 0x2288ff,
        intensity: 2.0,
        distance: 250,
        decay: 2,
      }),
      label: 'Blue',
    },
    {
      light: new Light2D({
        type: 'point',
        position: [0, -120],
        color: 0x44ff44,
        intensity: 2.0,
        distance: 250,
        decay: 2,
      }),
      label: 'Green',
    },
  ]

  // Dim ambient so lights don't fall off into pure black
  const ambient = new Light2D({
    type: 'ambient',
    color: 0x181828,
    intensity: 0.3,
  })

  flatland.add(ambient)
  for (const l of lights) flatland.add(l.light)

  // --- Wall occluders (gray blocks that cast shadows) ---
  // Distinct from white floor so they're visible.
  const wallTex = new DataTexture(new Uint8Array([140, 140, 160, 255]), 1, 1, RGBAFormat, UnsignedByteType)
  wallTex.needsUpdate = true

  function addWall(x: number, y: number, w: number, h: number) {
    const wall = new Sprite2D({
      texture: wallTex,
      layer: Layers.ENTITIES,
      anchor: [0.5, 0.5],
      lit: true,
      castShadow: true,
    })
    wall.scale.set(w, h, 1)
    wall.position.set(x, y, 0)
    flatland.add(wall)
    return wall
  }

  // L-shaped wall arrangement to show shadows + indirect bounce
  addWall(-60, 0, 16, 120)   // Vertical wall left of center
  addWall(-60, 60, 80, 16)   // Horizontal wall top-left
  addWall(60, -20, 16, 80)   // Vertical wall right of center
  addWall(20, -60, 80, 16)   // Horizontal wall bottom

  // Small pillar to show point shadow
  addWall(0, 0, 24, 24)

  // Shadow/radiance config (strategy already set to RadianceLightingStrategy in constructor)
  flatland.lighting.shadows = true
  flatland.lighting.shadowStrength = 0.9
  flatland.lighting.shadowSoftness = 5.0
  flatland.lighting.shadowBias = 0.005
  flatland.lighting.radianceIntensity = 1.0

  // --- Debug buffer visualization ---
  let debugVisible = false
  let debugMeshes: Mesh[] = []
  let debugDirty = true

  function rebuildDebugMeshes() {
    for (const m of debugMeshes) {
      flatland.remove(m)
      m.geometry.dispose()
      ;(m.material as MeshBasicMaterial).dispose()
    }
    debugMeshes = []

    const sdfGen = (flatland as unknown as Record<string, unknown>)._sdfGenerator as {
      sdfTexture: Texture
    } | null
    const occRT = (flatland as unknown as Record<string, unknown>)._occlusionRT as {
      texture: Texture
    } | null

    if (!sdfGen || !occRT) return

    const cam = (flatland as unknown as Record<string, unknown>)._camera as OrthographicCamera
    const viewW = cam.right - cam.left
    const miniW = viewW * 0.12
    const miniH = miniW
    const margin = 8
    const gap = 4

    const buffers: [Texture, string][] = [
      [occRT.texture, 'Occlusion'],
      [sdfGen.sdfTexture, 'SDF'],
    ]

    // Add radiance textures if available
    const strategy = flatland.lightingStrategy
    if (strategy instanceof RadianceLightingStrategy) {
      const rc = strategy.radianceCascades
      if (rc?.sceneRadianceTexture) {
        buffers.push([rc.sceneRadianceTexture, 'Scene Rad'])
      }
      const cascadeTextures = rc?.cascadeTextures ?? []
      for (let i = 0; i < cascadeTextures.length; i++) {
        const ct = cascadeTextures[i]
        if (ct) buffers.push([ct, `Cascade ${i}`])
      }
      if (rc?.finalRadianceTexture) {
        buffers.push([rc.finalRadianceTexture, 'GI Output'])
      }
    }

    const cols = Math.min(buffers.length, 4)
    for (let idx = 0; idx < buffers.length; idx++) {
      const [tex] = buffers[idx]
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const cx = cam.right - margin - miniW / 2 - col * (miniW + gap)
      const cy = cam.top - margin - miniH / 2 - row * (miniH + gap)

      const geo = new PlaneGeometry(miniW, miniH)
      const mat = new MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
      })
      const mesh = new Mesh(geo, mat)
      mesh.renderOrder = 9999
      mesh.position.set(cx, cy, 0)
      mesh.visible = debugVisible
      flatland.add(mesh)
      debugMeshes.push(mesh)
    }
  }

  // --- Fullscreen SDF overlay ---
  let sdfOverlayMesh: Mesh | null = null
  let sdfOverlayVisible = false

  function toggleSdfOverlay() {
    sdfOverlayVisible = !sdfOverlayVisible
    const fl = flatland as unknown as Record<string, unknown>
    const sdfGen = fl._sdfGenerator as { sdfTexture: Texture } | null
    const cam = fl._camera as OrthographicCamera

    if (sdfOverlayVisible && sdfGen) {
      if (sdfOverlayMesh) {
        flatland.remove(sdfOverlayMesh)
        sdfOverlayMesh.geometry.dispose()
        ;(sdfOverlayMesh.material as MeshBasicNodeMaterial).dispose()
      }
      const viewW = cam.right - cam.left
      const viewH = cam.top - cam.bottom
      const geo = new PlaneGeometry(viewW, viewH)
      const mat = new MeshBasicNodeMaterial()
      mat.transparent = true
      mat.depthTest = false
      mat.depthWrite = false
      mat.colorNode = Fn(() => {
        const sdfSample = sampleTexture(sdfGen.sdfTexture, uv())
        const dist = sdfSample.r.mul(float(10)).clamp(0, 1)
        return vec4(dist, dist, dist, float(0.8))
      })()
      sdfOverlayMesh = new Mesh(geo, mat)
      sdfOverlayMesh.renderOrder = 10000
      sdfOverlayMesh.position.set((cam.left + cam.right) / 2, (cam.bottom + cam.top) / 2, 0)
      flatland.add(sdfOverlayMesh)
    } else if (sdfOverlayMesh) {
      flatland.remove(sdfOverlayMesh)
      sdfOverlayMesh.geometry.dispose()
      ;(sdfOverlayMesh.material as MeshBasicNodeMaterial).dispose()
      sdfOverlayMesh = null
    }
  }

  // --- Drag lights with mouse ---
  let draggingLight: Light2D | null = null
  const dragOffset = new Vector2()

  function screenToWorld(sx: number, sy: number): Vector2 {
    const rect = renderer.domElement.getBoundingClientRect()
    const nx = ((sx - rect.left) / rect.width) * 2 - 1
    const ny = -((sy - rect.top) / rect.height) * 2 + 1
    const aspect = window.innerWidth / window.innerHeight
    return new Vector2((nx * VIEW_SIZE * aspect) / 2, (ny * VIEW_SIZE) / 2)
  }

  renderer.domElement.addEventListener('mousedown', (e) => {
    const wp = screenToWorld(e.clientX, e.clientY)
    for (const l of lights) {
      if (wp.distanceTo(l.light.position2D) < 20) {
        draggingLight = l.light
        dragOffset.copy(l.light.position2D).sub(wp)
        renderer.domElement.style.cursor = 'grabbing'
        return
      }
    }
  })

  renderer.domElement.addEventListener('mousemove', (e) => {
    const wp = screenToWorld(e.clientX, e.clientY)
    if (draggingLight) {
      draggingLight.position2D = wp.clone().add(dragOffset)
    } else {
      let hovering = false
      for (const l of lights) {
        if (wp.distanceTo(l.light.position2D) < 20) {
          hovering = true
          break
        }
      }
      renderer.domElement.style.cursor = hovering ? 'grab' : 'default'
    }
  })

  renderer.domElement.addEventListener('mouseup', () => {
    draggingLight = null
    renderer.domElement.style.cursor = 'default'
  })

  // --- Keyboard controls ---
  window.addEventListener('keydown', (e) => {
    // 1-3: Toggle individual lights
    if (e.code >= 'Digit1' && e.code <= 'Digit3') {
      const idx = parseInt(e.code.charAt(5)) - 1
      if (idx < lights.length) {
        lights[idx].light.enabled = !lights[idx].light.enabled
      }
    }
    // 0: Toggle all lights
    if (e.code === 'Digit0') {
      const anyEnabled = lights.some((l) => l.light.enabled) || ambient.enabled
      ambient.enabled = !anyEnabled
      for (const l of lights) l.light.enabled = !anyEnabled
    }
    // R: Toggle radiance mode
    if (e.code === 'KeyR') {
      if (flatland.radiance) {
        flatland.radiance = false
      } else {
        flatland.lighting.shadows = true
        flatland.radiance = true
        flatland.lighting.radianceIntensity = 1.0
      }
      debugDirty = true
    }
    // D: Toggle debug buffers
    if (e.code === 'KeyD') {
      debugVisible = !debugVisible
      for (const m of debugMeshes) m.visible = debugVisible
    }
    // S: Toggle SDF overlay
    if (e.code === 'KeyS') {
      toggleSdfOverlay()
    }
  })

  // --- Resize ---
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // --- FPS tracking ---
  let fpsFrames = 0
  let fpsTime = 0
  let fpsDisplay = 0

  const uiEl = document.getElementById('ui')!

  // --- Animation loop ---
  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - (animate as unknown as { lastTime: number }).lastTime
    ;(animate as unknown as { lastTime: number }).lastTime = now

    // FPS
    fpsFrames++
    fpsTime += deltaMs
    if (fpsTime >= 500) {
      fpsDisplay = Math.round((fpsFrames / fpsTime) * 1000)
      fpsFrames = 0
      fpsTime = 0
    }

    // Render
    flatland.render(renderer)

    // Rebuild debug meshes if needed
    if (debugDirty) {
      rebuildDebugMeshes()
      debugDirty = false
    }

    // Update UI
    const lightStatus = lights
      .map((l, i) => `${i + 1}:${l.light.enabled ? l.label : '--'}`)
      .join(' ')
    uiEl.textContent =
      `FPS: ${fpsDisplay}  Radiance [R]: ${flatland.radiance ? 'ON' : 'OFF'}  Debug [D]: ${debugVisible ? 'ON' : 'OFF'}  SDF [S]: ${sdfOverlayVisible ? 'ON' : 'OFF'}\n` +
      `Lights [1-3,0]: ${lightStatus}  Ambient: ${ambient.enabled ? 'ON' : '--'}\n` +
      `Drag lights with mouse`
  }
  ;(animate as unknown as { lastTime: number }).lastTime = performance.now()
  animate()
}

main()
