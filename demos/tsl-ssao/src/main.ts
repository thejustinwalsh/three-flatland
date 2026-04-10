/**
 * TSL SSAO Demo — N8AO algorithm ported to Three.js Shading Language.
 *
 * Demonstrates screen-space ambient occlusion using pure TSL node functions.
 * No GLSL, no ShaderMaterial, no onBeforeCompile.
 */
import * as THREE from 'three/webgpu'
import {
  pass,
  mrt,
  output,
  float,
  vec2,
  vec4,
  uniform,
  screenUV,
  mix,
  clamp,
} from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import StatsGL from 'stats-gl'
import {
  generateHemisphereSamples,
  ssao,
  ssaoComposite,
} from './ssao'

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGPURenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
document.body.appendChild(renderer.domElement)

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x222228)

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
)
camera.position.set(5, 4, 7)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1, 0)
controls.update()

// Stats
const stats = new StatsGL({ trackGPU: true })
document.body.appendChild(stats.domElement)

// ---------------------------------------------------------------------------
// Scene objects: white boxes + ground to show AO in crevices
// ---------------------------------------------------------------------------

const groundGeo = new THREE.PlaneGeometry(20, 20)
const groundMat = new THREE.MeshStandardNodeMaterial({
  color: 0xcccccc,
  roughness: 0.9,
  metalness: 0.0,
})
const ground = new THREE.Mesh(groundGeo, groundMat)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

const boxGeo = new THREE.BoxGeometry(1, 1, 1)
const boxMat = new THREE.MeshStandardNodeMaterial({
  color: 0xeeeeee,
  roughness: 0.7,
  metalness: 0.0,
})

function addBox(
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number
) {
  const mesh = new THREE.Mesh(boxGeo, boxMat)
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  scene.add(mesh)
}

// Cluster of boxes — AO visible in crevices between them
addBox(0, 0.5, 0, 1, 1, 1)
addBox(1.1, 0.5, 0, 1, 1, 1)
addBox(0, 0.5, 1.1, 1, 1, 1)
addBox(1.1, 0.5, 1.1, 1, 1, 1)
addBox(0.55, 1.5, 0.55, 1.2, 1, 1.2)

// Bridge structure
addBox(-2, 1, -1, 0.8, 2, 0.8)
addBox(-2, 1, 0.5, 0.8, 2, 0.8)
addBox(-2, 2.5, -0.25, 1.2, 0.5, 2)

// Small boxes near ground
addBox(3, 0.25, 0, 0.5, 0.5, 0.5)
addBox(3.6, 0.25, 0, 0.5, 0.5, 0.5)
addBox(3, 0.25, 0.6, 0.5, 0.5, 0.5)
addBox(3.3, 0.75, 0.3, 0.7, 0.5, 0.7)

// Sphere
const sphereGeo = new THREE.SphereGeometry(0.6, 32, 32)
const sphere = new THREE.Mesh(sphereGeo, boxMat)
sphere.position.set(-3.5, 0.6, 2)
scene.add(sphere)

// Lighting
const dirLight = new THREE.DirectionalLight(0xffffff, 2)
dirLight.position.set(3, 8, 5)
scene.add(dirLight)
scene.add(new THREE.AmbientLight(0x404050, 0.5))

// ---------------------------------------------------------------------------
// Noise texture (procedural for demo — real app would use blue noise)
// ---------------------------------------------------------------------------

function createNoiseTexture(size = 4): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = Math.floor(Math.random() * 256)
    data[i * 4 + 1] = Math.floor(Math.random() * 256)
    data[i * 4 + 2] = Math.floor(Math.random() * 256)
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

const noiseTex = createNoiseTexture()

// ---------------------------------------------------------------------------
// Post-processing: TSL pass() → SSAO → composite
// ---------------------------------------------------------------------------

// Hemisphere samples — generated at build time (JS), baked into shader
const aoSamples = generateHemisphereSamples(16)

// AO uniforms — .value updates from JS, GPU sees changes without recompilation
const aoIntensity = uniform(1.5)
const invProjMatrix = uniform(new THREE.Matrix4())

// CRITICAL: await renderer.init() before any render or compute
await renderer.init()

// Scene pass with MRT to capture both color and depth
const scenePass = pass(scene, camera)
scenePass.setMRT(mrt({
  output: output,
}))

// Get texture nodes from the pass
const colorTexture = scenePass.getTextureNode('output')
const depthTexture = scenePass.getTextureNode('depth')

// Texel size for neighbor sampling
const texelSizeNode = vec2(
  float(1).div(float(window.innerWidth)),
  float(1).div(float(window.innerHeight))
)

// Build the SSAO node graph
const aoNode = ssao(
  depthTexture.value,
  noiseTex,
  screenUV,
  texelSizeNode,
  invProjMatrix,
  aoSamples,
  {
    radius: 0.5,
    intensity: aoIntensity,
    bias: 0.01,
    near: 0.1,
    far: 100,
  }
)

// Composite: darken scene color by AO factor
const composited = ssaoComposite(colorTexture, aoNode, 1.0)

// Wire up the post-processing pipeline
const postProcessing = new THREE.PostProcessing(renderer)
postProcessing.outputNode = composited

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

function onResize() {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}
window.addEventListener('resize', onResize)

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

function animate() {
  stats.begin()
  controls.update()

  // Update inverse projection matrix — uniform.value, not reassignment
  invProjMatrix.value.copy(camera.projectionMatrixInverse)

  postProcessing.render()

  stats.end()
  stats.update()
  requestAnimationFrame(animate)
}

animate()
