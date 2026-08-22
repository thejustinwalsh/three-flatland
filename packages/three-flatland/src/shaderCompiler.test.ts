import { BufferAttribute, Mesh, PlaneGeometry, RenderTarget, type Material, type Texture } from 'three'
import { vec4 } from 'three/tsl'
import type { NodeMaterial, WebGPURenderer } from 'three/webgpu'
import type Node from 'three/src/nodes/core/Node.js'
import {
  compileFragmentNode,
  compileMaterial,
  createMockRenderer,
  createShaderTexture,
  shaderSources,
  validateShaderSources,
  type ShaderBackend,
  type ShaderSource,
} from '@three-flatland/tsl-test'
import { afterAll, describe, expect, it } from 'vitest'
import type { BuffersSubscription } from './debug/SubscriberRegistry'
import { DebugTextureRegistry } from './debug/DebugTextureRegistry'
import { Flatland } from './Flatland'
import { SDFGenerator } from './lights/SDFGenerator'
import { OcclusionPass } from './lights/OcclusionPass'
import { EffectMaterial } from './materials/EffectMaterial'
import { Sprite2DMaterial } from './materials/Sprite2DMaterial'
import { createPassEffect } from './pipeline/PassEffect'
import { SpriteBatch } from './pipeline/SpriteBatch'
import { Sprite2D } from './sprites/Sprite2D'
import type { SpriteFrame } from './sprites/types'
import { TileLayer } from './tilemap/TileLayer'
import { Tileset } from './tilemap/Tileset'
import { registerAtlasMesh } from './loaders/atlasMeshRegistry'

const shaders = new Map<string, ShaderSource>()
const disposableMaterials = new Set<Material>()
const disposableTextures = new Set<Texture>()

function shaderTexture() {
  const texture = createShaderTexture()
  disposableTextures.add(texture)
  return texture
}

function trackMaterial<T extends Material>(material: T): T {
  disposableMaterials.add(material)
  return material
}

function reflected<T>(owner: object, key: string): T {
  const value = Reflect.get(owner, key) as T | undefined
  expect(value, `Expected reflected production field ${key}`).toBeDefined()
  return value!
}

function capture(label: string, backend: ShaderBackend, material: NodeMaterial, object?: Mesh) {
  const program = compileMaterial(material, backend, object ? { object } : undefined)
  expect(program.diagnostics, `${backend} ${label} logged shader code-generation errors`).toEqual([])
  for (const shader of shaderSources(program, label)) {
    shaders.set(`${shader.backend}:${shader.stage}:${shader.output}`, shader)
  }
  return program
}

function registerCompilerAtlas(texture: Texture): void {
  const frame: SpriteFrame = {
    name: 'compiler-diamond',
    x: 0,
    y: 0,
    width: 2,
    height: 2,
    sourceWidth: 2,
    sourceHeight: 2,
    mesh: {
      verts: new Float32Array([0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0, 0.5, 0.5, 1, -0.5, 0, 0, 0.5]),
      indices: Uint16Array.from([0, 1, 2, 0, 2, 3]),
      vertexCount: 4,
      vertexOffset: 0,
      indexOffset: 0,
    },
  }
  registerAtlasMesh(texture, { frames: [frame], complete: true })
}

function captureNode(label: string, backend: ShaderBackend, node: Node) {
  const program = compileFragmentNode(node, backend)
  expect(program.diagnostics, `${backend} ${label} logged shader code-generation errors`).toEqual([])
  for (const shader of shaderSources(program, label)) {
    shaders.set(`${shader.backend}:${shader.stage}:${shader.output}`, shader)
  }
}

const sdfGenerator = new SDFGenerator()
const sdfMaterials = (
  ['_jfaMaterialA', '_jfaMaterialB', '_finalMaterialA', '_finalMaterialB', '_blurHMaterial', '_blurVMaterial'] as const
).map((name) => [name.slice(1), reflected<NodeMaterial>(sdfGenerator, name)] satisfies [string, NodeMaterial])

const occlusionPass = new OcclusionPass()
const getOcclusionMaterial = reflected<
  (texture: ReturnType<typeof createShaderTexture>, tightMesh: boolean) => NodeMaterial
>(occlusionPass, '_getOrCreateOcclusionMaterial')
const occlusionTexture = shaderTexture()
const occlusionMaterials = [
  ['occlusion-synth-quad', getOcclusionMaterial.call(occlusionPass, occlusionTexture, false)],
  ['occlusion-tight-mesh', getOcclusionMaterial.call(occlusionPass, occlusionTexture, true)],
] satisfies Array<[string, NodeMaterial]>

const CompilerPass = createPassEffect({
  name: 'compiler-pass',
  schema: { amount: 0.5 },
  pass:
    ({ uniforms }) =>
    (input) =>
      input.mul(vec4(uniforms.amount, 1, 1, 1)),
})

function occlusionGeometry() {
  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute(
    'instanceUV',
    new BufferAttribute(new Float32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]), 4)
  )
  geometry.setAttribute(
    'instanceSystem',
    new BufferAttribute(new Float32Array([1, 1, 7, 0, 1, 1, 7, 0, 1, 1, 7, 0, 1, 1, 7, 0]), 4)
  )
  return geometry
}

afterAll(async () => {
  try {
    await validateShaderSources([...shaders.values()])
  } finally {
    sdfGenerator.dispose()
    occlusionPass.dispose()
    for (const material of disposableMaterials) material.dispose()
    for (const texture of disposableTextures) texture.dispose()
  }
}, 60_000)

describe.each<ShaderBackend>(['wgsl', 'glsl'])('%s core TSL compatibility', (backend) => {
  it('compiles standalone sprite materials', () => {
    const sprite = new Sprite2D({ texture: shaderTexture() })
    trackMaterial(sprite.material)
    capture('sprite-material', backend, sprite.material, sprite)
  })

  it('compiles opaque premultiplied sprite variants', () => {
    const material = trackMaterial(
      new Sprite2DMaterial({
        alphaTest: 0.5,
        map: shaderTexture(),
        premultipliedAlpha: true,
        transparent: false,
      })
    )
    const sprite = new Sprite2D({ material })
    capture('sprite-material-opaque-premultiplied', backend, material, sprite)
  })

  it('compiles the production SpriteBatch geometry and attribute layout', () => {
    const material = trackMaterial(new Sprite2DMaterial({ map: shaderTexture() }))
    const batch = new SpriteBatch(material, 1)

    try {
      const program = capture('sprite-batch-material', backend, material, batch)
      expect(program.vertexShader).toContain('spritePixelPivot')
      expect(program.vertexShader).toContain('floor')
    } finally {
      batch.dispose()
    }
  })

  it('compiles projected snapping through the tight-mesh batch path', () => {
    const texture = shaderTexture()
    registerCompilerAtlas(texture)
    const material = trackMaterial(new Sprite2DMaterial({ map: texture, transparent: true }))
    const batch = new SpriteBatch(material, 1)

    try {
      expect(batch.geometryKind).toBe('tight-mesh')
      const program = capture('sprite-batch-tight-mesh-pixel-snap', backend, material, batch)
      expect(program.vertexShader).toContain('spritePixelPivot')
      expect(program.vertexShader).toContain('floor')
    } finally {
      batch.dispose()
    }
  })

  it('compiles the public EffectMaterial no-base-color branch', () => {
    const material = trackMaterial(new EffectMaterial({ effectTier: 0 }))
    capture('effect-material-empty-base', backend, material)
  })

  it('compiles the TileLayer production material permutation', () => {
    const texture = shaderTexture()
    const tileset = new Tileset({
      columns: 1,
      firstGid: 1,
      imageHeight: 16,
      imageWidth: 16,
      name: 'compiler-tileset',
      tileCount: 1,
      tileHeight: 16,
      tiles: new Map(),
      tileWidth: 16,
      texture,
    })
    const layer = new TileLayer(
      { data: Uint32Array.of(1), height: 1, id: 1, name: 'compiler-layer', width: 1 },
      tileset,
      16,
      16
    )

    try {
      const mesh = layer.children[0]
      expect(mesh).toBeInstanceOf(Mesh)
      capture('tile-layer-material', backend, layer.material, mesh as Mesh)
    } finally {
      layer.dispose()
      layer.material.dispose()
    }
  })

  it('compiles the auto-managed Flatland post-processing graph', () => {
    const flatland = new Flatland()

    try {
      flatland.addPass(new CompilerPass())
      const ensurePipeline = reflected<(renderer: WebGPURenderer) => void>(flatland, '_ensureRenderPipeline')
      ensurePipeline.call(flatland, createMockRenderer(backend) as unknown as WebGPURenderer)
      const outputNode = flatland.renderPipeline?.outputNode
      expect(outputNode, 'Flatland did not materialize the production output graph').toBeDefined()
      captureNode('flatland-auto-post-processing', backend, outputNode!)
    } finally {
      flatland.dispose()
    }
  })

  it('compiles the debug thumbnail downsampler material', () => {
    const registry = new DebugTextureRegistry()
    const source = new RenderTarget(512, 256)
    const subscription = new Map([
      ['compiler-debug-target', { mode: 'thumbnail' as const, thumbSize: 32 }],
    ]) as BuffersSubscription
    const renderer = {
      getRenderTarget: () => null,
      readRenderTargetPixelsAsync: () => Promise.resolve(new Uint8Array(32 * 16 * 4)),
      render: () => undefined,
      setRenderTarget: () => undefined,
    } as unknown as WebGPURenderer

    try {
      registry.register('compiler-debug-target', source, 'rgba8')
      registry.readbackAll(subscription, renderer)
      const downsampler = reflected<object>(registry, '_downsampler')
      const material = reflected<NodeMaterial>(downsampler, '_material')
      capture('debug-thumbnail-downsampler', backend, material)
    } finally {
      registry.dispose()
      source.dispose()
    }
  })

  it.each(sdfMaterials)('compiles the %s pass', (label, material) => {
    capture(label, backend, material)
  })

  it.each(occlusionMaterials)('compiles the %s pass', (label, material) => {
    const geometry = occlusionGeometry()
    try {
      const mesh = new Mesh(geometry, material)
      capture(label, backend, material, mesh)
    } finally {
      geometry.dispose()
    }
  })
})
