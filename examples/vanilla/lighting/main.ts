import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu'
import { uniform, vec3, vec4, float, length, max, smoothstep, mix, Fn, add } from 'three/tsl'
import {
  Scene,
  OrthographicCamera,
  Color,
  NearestFilter,
  PlaneGeometry,
  Mesh,
  Vector2,
  Vector4,
} from 'three'
import {
  Flatland,
  Light2D,
  SpriteSheetLoader,
  sampleSprite,
  pointLight2D,
  ambientLight2D,
  litSprite,
  Sprite2D,
} from '@three-flatland/core'

async function main() {
  // Create renderer
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  // Create Flatland
  const flatland = new Flatland({
    viewSize: 300,
    aspect: window.innerWidth / window.innerHeight,
    clearColor: 0x0a0a12,
  })

  // Load knight spritesheet
  const spriteSheet = await SpriteSheetLoader.load('./sprites/knight.json')
  spriteSheet.texture.minFilter = NearestFilter
  spriteSheet.texture.magFilter = NearestFilter

  // Create Light2D instances
  const torch1 = new Light2D({
    type: 'point',
    position: [-80, 50],
    color: 0xff6600,
    intensity: 1.2,
    radius: 150,
    falloff: 2,
  })

  const torch2 = new Light2D({
    type: 'point',
    position: [80, 50],
    color: 0xffaa00,
    intensity: 1.0,
    radius: 150,
    falloff: 2,
  })

  // Add lights to flatland
  flatland.add(torch1)
  flatland.add(torch2)

  // Lighting uniforms (updated from Light2D objects)
  const light1Pos = uniform(new Vector2(-80, 50))
  const light1Color = uniform(new Color(0xff6600))
  const light1Intensity = uniform(1.2)
  const light1Radius = uniform(150)
  const light1Enabled = uniform(1)

  const light2Pos = uniform(new Vector2(80, 50))
  const light2Color = uniform(new Color(0xffaa00))
  const light2Intensity = uniform(1.0)
  const light2Radius = uniform(150)
  const light2Enabled = uniform(1)

  const ambientColor = uniform(new Color(0x111122))
  const ambientIntensity = uniform(0.15)

  // Frame uniform for sprites
  const frameUniform = uniform(new Vector4(0, 0, 0.125, 0.125))

  // Create lit sprite material using TSL
  const litMaterial = new MeshBasicNodeMaterial()
  litMaterial.transparent = true

  // Custom lighting calculation for sprites
  litMaterial.colorNode = Fn(() => {
    // Sample sprite
    const spriteColor = sampleSprite(spriteSheet.texture, frameUniform, { alphaTest: 0.01 })

    // Calculate lighting contributions
    // Point light 1
    const toLight1 = light1Pos.sub(vec3(0, 0, 0).xy)
    const dist1 = length(toLight1)
    const attenuation1 = max(float(0), float(1).sub(dist1.div(light1Radius))).pow(float(2))
    const light1Contribution = light1Color.mul(attenuation1).mul(light1Intensity).mul(light1Enabled)

    // Point light 2
    const toLight2 = light2Pos.sub(vec3(0, 0, 0).xy)
    const dist2 = length(toLight2)
    const attenuation2 = max(float(0), float(1).sub(dist2.div(light2Radius))).pow(float(2))
    const light2Contribution = light2Color.mul(attenuation2).mul(light2Intensity).mul(light2Enabled)

    // Ambient light
    const ambient = ambientColor.mul(ambientIntensity)

    // Combine lighting
    const totalLight = add(add(light1Contribution, light2Contribution), ambient)

    // Apply lighting to sprite color
    const lit = vec4(spriteColor.rgb.mul(totalLight), spriteColor.a)
    return lit
  })()

  // Create sprites
  const geometry = new PlaneGeometry(1, 1)
  const positions = [
    [-60, -20],
    [0, -20],
    [60, -20],
  ]

  const sprites: Mesh[] = []
  for (const pos of positions) {
    const mesh = new Mesh(geometry, litMaterial)
    mesh.scale.set(64, 64, 1)
    mesh.position.set(pos[0], pos[1], 0)
    flatland.scene.add(mesh)
    sprites.push(mesh)
  }

  // Create light indicator meshes (small circles)
  const indicatorGeometry = new PlaneGeometry(1, 1)

  const indicator1Mat = new MeshBasicNodeMaterial()
  indicator1Mat.transparent = true
  indicator1Mat.colorNode = vec4(light1Color.mul(light1Enabled), float(0.8).mul(light1Enabled))
  const indicator1 = new Mesh(indicatorGeometry, indicator1Mat)
  indicator1.scale.set(20, 20, 1)
  flatland.scene.add(indicator1)

  const indicator2Mat = new MeshBasicNodeMaterial()
  indicator2Mat.transparent = true
  indicator2Mat.colorNode = vec4(light2Color.mul(light2Enabled), float(0.8).mul(light2Enabled))
  const indicator2 = new Mesh(indicatorGeometry, indicator2Mat)
  indicator2.scale.set(20, 20, 1)
  flatland.scene.add(indicator2)

  // Animation state
  const animations = {
    idle: {
      frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'],
      fps: 8,
    },
  }
  let frameIndex = 0
  let frameTimer = 0

  // Drag state
  let draggingLight: Light2D | null = null
  let dragOffset = new Vector2()

  // Convert screen to world coordinates
  function screenToWorld(screenX: number, screenY: number): Vector2 {
    const rect = renderer.domElement.getBoundingClientRect()
    const x = ((screenX - rect.left) / rect.width) * 2 - 1
    const y = -((screenY - rect.top) / rect.height) * 2 + 1

    const viewSize = flatland.viewSize
    const aspect = window.innerWidth / window.innerHeight
    const worldX = (x * viewSize * aspect) / 2
    const worldY = (y * viewSize) / 2

    return new Vector2(worldX, worldY)
  }

  // Mouse event handlers
  renderer.domElement.addEventListener('mousedown', (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)

    // Check if clicking on a light indicator
    const dist1 = worldPos.distanceTo(torch1.position2D)
    const dist2 = worldPos.distanceTo(torch2.position2D)

    if (dist1 < 15) {
      draggingLight = torch1
      dragOffset.copy(torch1.position2D).sub(worldPos)
    } else if (dist2 < 15) {
      draggingLight = torch2
      dragOffset.copy(torch2.position2D).sub(worldPos)
    }

    if (draggingLight) {
      renderer.domElement.style.cursor = 'grabbing'
    }
  })

  renderer.domElement.addEventListener('mousemove', (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)

    if (draggingLight) {
      const newPos = worldPos.clone().add(dragOffset)
      draggingLight.position2D = newPos

      // Update corresponding uniform
      if (draggingLight === torch1) {
        light1Pos.value.copy(newPos)
        indicator1.position.set(newPos.x, newPos.y, 1)
      } else {
        light2Pos.value.copy(newPos)
        indicator2.position.set(newPos.x, newPos.y, 1)
      }
    } else {
      // Check for hover
      const dist1 = worldPos.distanceTo(torch1.position2D)
      const dist2 = worldPos.distanceTo(torch2.position2D)
      if (dist1 < 15 || dist2 < 15) {
        renderer.domElement.style.cursor = 'grab'
      } else {
        renderer.domElement.style.cursor = 'default'
      }
    }
  })

  renderer.domElement.addEventListener('mouseup', () => {
    draggingLight = null
    renderer.domElement.style.cursor = 'default'
  })

  renderer.domElement.addEventListener('mouseleave', () => {
    draggingLight = null
    renderer.domElement.style.cursor = 'default'
  })

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (e.key === '1') {
      torch1.enabled = !torch1.enabled
      light1Enabled.value = torch1.enabled ? 1 : 0
    }
    if (e.key === '2') {
      torch2.enabled = !torch2.enabled
      light2Enabled.value = torch2.enabled ? 1 : 0
    }
    if (e.key === 'ArrowUp') {
      ambientIntensity.value = Math.min(1, ambientIntensity.value + 0.05)
    }
    if (e.key === 'ArrowDown') {
      ambientIntensity.value = Math.max(0, ambientIntensity.value - 0.05)
    }
  })

  // Handle resize
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // Initialize light indicator positions
  indicator1.position.set(torch1.position.x, torch1.position.y, 1)
  indicator2.position.set(torch2.position.x, torch2.position.y, 1)

  // Flickering effect
  let flickerTimer = 0

  // Animation loop
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    // Animate sprites
    frameTimer += delta * 1000
    const anim = animations.idle
    const frameDuration = 1000 / anim.fps

    if (frameTimer >= frameDuration) {
      frameTimer -= frameDuration
      frameIndex = (frameIndex + 1) % anim.frames.length
    }

    const frameName = anim.frames[frameIndex]
    const frame = spriteSheet.getFrame(frameName)
    frameUniform.value.set(frame.x, frame.y, frame.width, frame.height)

    // Flicker effect for torches
    flickerTimer += delta
    const flicker1 = 1 + Math.sin(flickerTimer * 15) * 0.1 + Math.sin(flickerTimer * 23) * 0.05
    const flicker2 = 1 + Math.sin(flickerTimer * 17 + 1) * 0.1 + Math.sin(flickerTimer * 19 + 2) * 0.05

    if (torch1.enabled) {
      light1Intensity.value = 1.2 * flicker1
    }
    if (torch2.enabled) {
      light2Intensity.value = 1.0 * flicker2
    }

    // Update batches and render
    flatland.spriteGroup.update()
    renderer.render(flatland.scene, flatland.camera)
  }

  animate()
}

main()
