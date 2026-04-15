import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color, NearestFilter } from 'three'
import { AnimatedSprite2D, SpriteSheetLoader, Layers } from 'three-flatland'
import { createPane } from '@three-flatland/devtools'

async function main() {
  // Scene setup
  const scene = new Scene()
  scene.background = new Color(0x1a1a2e)

  // Orthographic camera for 2D rendering
  const frustumSize = 200
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
  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1) // Pixel-perfect for pixel art
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)

  // Wait for renderer to initialize
  await renderer.init()

  // Load the knight spritesheet
  const spriteSheet = await SpriteSheetLoader.load('./sprites/knight.json')

  // Use nearest neighbor filtering for pixel art
  spriteSheet.texture.minFilter = NearestFilter
  spriteSheet.texture.magFilter = NearestFilter

  // Create the animated sprite
  const knight = new AnimatedSprite2D({
    spriteSheet,
    animationSet: {
      fps: 10,
      animations: {
        idle: {
          frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'],
          fps: 8,
          loop: true,
        },
        run: {
          frames: [
            'run_0',
            'run_1',
            'run_2',
            'run_3',
            'run_4',
            'run_5',
            'run_6',
            'run_7',
            'run_8',
            'run_9',
            'run_10',
            'run_11',
            'run_12',
            'run_13',
            'run_14',
            'run_15',
          ],
          fps: 12,
          loop: true,
        },
        roll: {
          frames: [
            'roll_0',
            'roll_1',
            'roll_2',
            'roll_3',
            'roll_4',
            'roll_5',
            'roll_6',
            'roll_7',
          ],
          fps: 15,
          loop: true,
        },
        hit: {
          frames: ['hit_0', 'hit_1', 'hit_2', 'hit_3'],
          fps: 10,
          loop: false,
        },
        death: {
          frames: [
            'death_0',
            'death_1',
            'death_2',
            'death_3',
          ],
          fps: 8,
          loop: false,
        },
      },
    },
    animation: 'idle',
    layer: Layers.ENTITIES,
    anchor: [0.5, 0.5],
  })

  // Scale up for visibility (pixel art is 16x16, scale 8x = 128px)
  knight.scale.set(128, 128, 1)
  knight.position.set(0, 0, 0)
  scene.add(knight)

  // Tweakpane UI — pass `scene` so draws/triangles are auto-wired
  const { pane, stats } = createPane({ scene })

  const animFolder = pane.addFolder({ title: 'Animation' })

  const animNames = ['idle', 'run', 'roll', 'hit', 'death']
  const animLabels = ['Idle', 'Run', 'Roll', 'Hit', 'Death']
  const animGrid = animFolder.addBlade({
    view: 'radiogrid',
    groupName: 'animation',
    size: [5, 1],
    cells: (x: number) => ({ title: animLabels[x]!, value: animNames[x]! }),
    value: 'idle',
    label: 'anim',
  } as any) as any

  function playAnimation(name: string) {
    knight.play(name, {
      onComplete: () => {
        if (name === 'hit' || name === 'death') {
          animGrid.value.rawValue = 'idle'
          knight.play('idle')
        }
      },
    })
  }

  animGrid.on('change', (ev: any) => {
    playAnimation(ev.value as string)
  })

  const speeds = [0.5, 1, 1.5, 2, 3]
  const speedLabels = ['0.5x', '1x', '1.5x', '2x', '3x']
  ;(animFolder.addBlade({
    view: 'radiogrid',
    groupName: 'speed',
    size: [5, 1],
    cells: (x: number) => ({ title: speedLabels[x]!, value: speeds[x]! }),
    value: 1,
    label: 'speed',
  } as any) as any).on('change', (ev: any) => {
    knight.speed = ev.value
  })

  // Handle resize
  window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight
    camera.left = (-frustumSize * aspect) / 2
    camera.right = (frustumSize * aspect) / 2
    camera.top = frustumSize / 2
    camera.bottom = -frustumSize / 2
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // Animation loop
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    lastTime = now

    stats.begin()

    // Update sprite animation
    knight.update(deltaMs)

    renderer.render(scene, camera)

    stats.end()
  }

  animate()
}

main()
