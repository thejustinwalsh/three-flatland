import { mkdirSync, writeFileSync } from 'node:fs'
import {
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  PlaneGeometry,
  RenderTarget,
  type DataTexture,
  type Material,
  type Texture,
} from 'three'
import { uniform, vec4 } from 'three/tsl'
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
import { HierarchicalRadianceCascades } from './lights/HierarchicalRadianceCascades'
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

/** Guard the one-matrix-source contract on the production WebGPU backend. */
function expectSingleInstanceMatrixBinding(backend: ShaderBackend, vertexShader: string): void {
  if (backend !== 'wgsl') return
  const matrixArrays = vertexShader.match(/array<\s*mat4x4<f32>/g) ?? []
  expect(matrixArrays, 'sprite instancing must bind its current matrix buffer exactly once').toHaveLength(1)
}

/** Guard the large-batch vertex-attribute path against duplicated matrix columns. */
function expectSingleInstanceMatrixAttributeSet(backend: ShaderBackend, vertexShader: string): void {
  if (backend !== 'wgsl') return
  const matrixColumns = vertexShader.match(/nodeAttribute\d+\s*:\s*vec4<f32>/g) ?? []
  const matrixConstruction = vertexShader.match(
    /mat4x4<f32>\(\s*nodeAttribute\d+,\s*nodeAttribute\d+,\s*nodeAttribute\d+,\s*nodeAttribute\d+\s*\)/g
  )
  expect(matrixColumns, 'large sprite batches must expose one four-column matrix attribute set').toHaveLength(4)
  expect(matrixConstruction, 'large sprite batches must construct the instance matrix exactly once').toHaveLength(1)
}

/** Guard opted-out sprites from paying the projected-pivot matrix multiply. */
function expectPixelPivotTransformGuarded(vertexShader: string): void {
  const pivotAssignment = vertexShader.indexOf('spritePivotClip =')
  expect(pivotAssignment, 'projected pivot transform must be emitted').toBeGreaterThanOrEqual(0)

  const flagTests = [...vertexShader.matchAll(/&\s*16(?!\d)/g)]
  expect(flagTests, 'pixel-perfect flag test must be emitted exactly once').toHaveLength(1)
  const flagTest = flagTests[0]!.index
  const branchOpen = vertexShader.indexOf('{', flagTest)
  expect(branchOpen, 'pixel-perfect branch must have a body').toBeGreaterThan(flagTest)

  let depth = 0
  let branchClose = -1
  for (let index = branchOpen; index < vertexShader.length; index++) {
    const token = vertexShader[index]
    if (token === '{') depth++
    if (token !== '}') continue
    depth--
    if (depth === 0) {
      branchClose = index
      break
    }
  }

  expect(branchClose, 'pixel-perfect branch must close').toBeGreaterThan(branchOpen)
  expect(pivotAssignment, 'pivot transform must be inside the pixel-perfect branch').toBeGreaterThan(branchOpen)
  expect(pivotAssignment, 'pivot transform must be inside the pixel-perfect branch').toBeLessThan(branchClose)
}

/** Guard SpriteBatch's custom instance transform from being projected early. */
function expectInstanceTransformBeforeProjection(vertexShader: string): void {
  const clipAssignment = vertexShader.indexOf('spriteClipPosition =')
  expect(clipAssignment, 'sprite clip projection must be emitted').toBeGreaterThanOrEqual(0)

  const finalPositionAssignment = vertexShader.lastIndexOf('positionLocal =')
  expect(finalPositionAssignment, 'instance-transformed position must be emitted').toBeGreaterThanOrEqual(0)
  expect(
    finalPositionAssignment,
    'instance transform must run before sprite clip projection or batched sprites collapse to the unit quad'
  ).toBeLessThan(clipAssignment)
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
  (texture: ReturnType<typeof createShaderTexture>, tightMesh: boolean) => Sprite2DMaterial
>(occlusionPass, '_getOrCreateOcclusionMaterial')
const occlusionTexture = shaderTexture()
const occlusionTightTexture = shaderTexture()
registerCompilerAtlas(occlusionTightTexture)
const occlusionMaterials = [
  ['occlusion-synth-quad', getOcclusionMaterial.call(occlusionPass, occlusionTexture, false)],
  ['occlusion-tight-mesh', getOcclusionMaterial.call(occlusionPass, occlusionTightTexture, true)],
] satisfies Array<[string, Sprite2DMaterial]>

const fixedHrc = new HierarchicalRadianceCascades({
  cascadeResolution: 64,
  baseRayCount: 4,
  compositionMode: 'holographic',
  holographicTraversal: 'dda-fixed',
  holographicFinalResolutionScale: 4,
  ddaPixelSize: 4,
  ddaQuantizationBits: 6,
  ddaTransferRange: 4,
  ddaRadianceRange: 1,
  filterRadius: 0,
  filterStrength: 0,
  mipBlur: 0,
  mipStrength: 0,
})
fixedHrc.init(64, 64, shaderTexture() as DataTexture, uniform(1))
fixedHrc.setSdfTexture(shaderTexture())
fixedHrc.setOcclusionTexture(shaderTexture())
const ensureFixedDirect = reflected<(level: number) => NodeMaterial | null>(
  fixedHrc,
  '_ensureHolographicDirectTransferMaterial'
)
const ensureFixedRecursive = reflected<(level: number) => NodeMaterial | null>(
  fixedHrc,
  '_ensureHolographicRecursiveTransferMaterial'
)
const ensureFixedRadiance = reflected<(level: number) => NodeMaterial | null>(
  fixedHrc,
  '_ensureHolographicRadianceMaterial'
)
const ensureFixedFinal = reflected<(sourceTexture: Texture) => void>(
  fixedHrc,
  '_ensureHolographicFinalRadianceMaterial'
)
const fixedHrcMaterials = {
  direct: ensureFixedDirect.call(fixedHrc, 0)!,
  recursive: ensureFixedRecursive.call(fixedHrc, 3)!,
  radiance: ensureFixedRadiance.call(fixedHrc, 0)!,
  final: (() => {
    ensureFixedFinal.call(fixedHrc, fixedHrc.holographicRadianceAtlasTextures[0]!)
    return reflected<NodeMaterial>(fixedHrc, '_finalRadianceMaterial')
  })(),
}
fixedHrc.ddaPaletteBands = 8
const ensureFixedPalette = reflected<() => void>(fixedHrc, '_ensureFilterRadianceMaterial')
ensureFixedPalette.call(fixedHrc)
const fixedHrcPaletteMaterial = reflected<NodeMaterial>(fixedHrc, '_filterRadianceMaterial')

const CompilerPass = createPassEffect({
  name: 'compiler-pass',
  schema: { amount: 0.5 },
  pass:
    ({ uniforms }) =>
    (input) =>
      input.mul(vec4(uniforms.amount, 1, 1, 1)),
})

afterAll(async () => {
  try {
    await validateShaderSources([...shaders.values()])
    const exportDirectory = process.env.THREE_FLATLAND_SHADER_EXPORT_DIR
    if (exportDirectory) {
      mkdirSync(exportDirectory, { recursive: true })
      for (const shader of shaders.values()) {
        const filename = `${shader.label}-${shader.stage}.${shader.backend === 'wgsl' ? 'wgsl' : 'glsl'}`.replace(
          /[^a-zA-Z0-9._-]/g,
          '-'
        )
        writeFileSync(`${exportDirectory}/${filename}`, shader.output)
      }
    }
  } finally {
    sdfGenerator.dispose()
    occlusionPass.dispose()
    fixedHrc.dispose()
    for (const material of disposableMaterials) material.dispose()
    for (const texture of disposableTextures) texture.dispose()
  }
}, 60_000)

describe('shader assertion contracts', () => {
  it('rejects a projected-pivot multiply hoisted after the pixel-perfect branch', () => {
    const unsafeShader = `
      if ((instanceSystem.z & 16) > 0) {
        positionLocal.xy += vec2(1.0);
      }
      spritePivotClip = cameraProjectionMatrix * modelViewMatrix * vec4(spritePixelPivot, 1.0);
    `

    expect(() => expectPixelPivotTransformGuarded(unsafeShader)).toThrow(
      'pivot transform must be inside the pixel-perfect branch'
    )
  })

  it('rejects clip projection emitted before the final instance transform', () => {
    const unsafeShader = `
      spriteClipPosition = cameraProjectionMatrix * positionView;
      positionLocal = instanceMatrix * positionLocal;
    `

    expect(() => expectInstanceTransformBeforeProjection(unsafeShader)).toThrow(
      'instance transform must run before sprite clip projection'
    )
  })
})

describe.each<ShaderBackend>(['wgsl', 'glsl'])('%s core TSL compatibility', (backend) => {
  it('compiles standalone sprite materials', () => {
    const sprite = new Sprite2D({ texture: shaderTexture() })
    trackMaterial(sprite.material)
    const program = capture('sprite-material', backend, sprite.material, sprite)
    expectInstanceTransformBeforeProjection(program.vertexShader)
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
      expectPixelPivotTransformGuarded(program.vertexShader)
      expectInstanceTransformBeforeProjection(program.vertexShader)
      expectSingleInstanceMatrixBinding(backend, program.vertexShader)
    } finally {
      batch.dispose()
    }
  })

  it('preserves projection ordering when a batch color transform reads world position', () => {
    const material = trackMaterial(
      new Sprite2DMaterial({
        map: shaderTexture(),
        colorTransform: ({ color, worldPosition }) =>
          vec4(color.rgb.mul(worldPosition.x.add(1)), color.a) as Node<'vec4'>,
      })
    )
    const batch = new SpriteBatch(material, 1)

    try {
      const program = capture('sprite-batch-world-position-color-transform', backend, material, batch)
      expectInstanceTransformBeforeProjection(program.vertexShader)
      expectSingleInstanceMatrixBinding(backend, program.vertexShader)
    } finally {
      batch.dispose()
    }
  })

  it('compiles the large-batch matrix attribute path without duplicate columns', () => {
    const material = trackMaterial(new Sprite2DMaterial({ map: shaderTexture() }))
    const batch = new SpriteBatch(material, 2048)

    try {
      const program = capture('sprite-batch-large-matrix-attributes', backend, material, batch)
      expect(program.vertexShader).toContain('spritePixelPivot')
      expectInstanceTransformBeforeProjection(program.vertexShader)
      expectSingleInstanceMatrixAttributeSet(backend, program.vertexShader)
    } finally {
      batch.dispose()
    }
  })

  it('preserves canonical instance color on custom instanced meshes', () => {
    const material = trackMaterial(new Sprite2DMaterial({ map: shaderTexture() }))
    material.positionNode = null
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, 2)
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0]), 3)
    mesh.geometry.setAttribute(
      'instanceUV',
      new InstancedBufferAttribute(new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]), 4)
    )
    mesh.geometry.setAttribute(
      'instanceColor',
      new InstancedBufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]), 4)
    )
    mesh.geometry.setAttribute(
      'instanceSystem',
      new InstancedBufferAttribute(new Float32Array([1, 1, 0, 0, 1, 1, 0, 0]), 4)
    )

    try {
      const program = capture('sprite-custom-instanced-color', backend, material, mesh)
      expect(program.vertexShader).toContain('vInstanceColor')
    } finally {
      mesh.geometry.dispose()
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
      expectPixelPivotTransformGuarded(program.vertexShader)
      expectInstanceTransformBeforeProjection(program.vertexShader)
      expectSingleInstanceMatrixBinding(backend, program.vertexShader)
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
    const batch = new SpriteBatch(material, 1)
    try {
      batch.writeSystemFlags(0, 7)
      const program = capture(label, backend, material, batch)
      expectInstanceTransformBeforeProjection(program.vertexShader)
      expectSingleInstanceMatrixBinding(backend, program.vertexShader)
      if (backend === 'wgsl') {
        expect(program.vertexShader, 'packed system flags must be decoded before fragment interpolation').toMatch(
          /&\s*4(?!\d)/
        )
        expect(program.fragmentShader, 'fragment shader must consume the decoded 0/1 cast varying').toContain(
          'vSystemFlag4'
        )
        expect(program.fragmentShader, 'fragment shader must not decode the packed cast bit').not.toMatch(/&\s*4(?!\d)/)
      }
    } finally {
      batch.dispose()
    }
  })

  it('compiles packed fixed-point DDA HRC transport and final reconstruction', () => {
    const directProgram = capture('hrc-dda-fixed-direct', backend, fixedHrcMaterials.direct)
    capture('hrc-dda-fixed-recursive', backend, fixedHrcMaterials.recursive)
    capture('hrc-dda-fixed-radiance', backend, fixedHrcMaterials.radiance)
    const finalProgram = capture('hrc-dda-fixed-final', backend, fixedHrcMaterials.final)
    const finalLoops = finalProgram.fragmentShader.match(/\bloop\b|\bfor\s*\(/g) ?? []
    expect(finalLoops, 'HRC rotations must remain one runtime loop instead of four inlined wedge graphs').toHaveLength(
      6
    )
    expect(
      finalProgram.fragmentShader.length,
      'fixed-point HRC final reconstruction must stay below the audited shader-size ceiling'
    ).toBeLessThan(60_000)
    expect(directProgram.fragmentShader, 'DDA T0 must use its five-cell geometric traversal bound').toMatch(
      /<\s*5(?:\.0)?\s*;/
    )
    expect(finalProgram.fragmentShader, 'DDA final reconstruction must use its local seven-cell wedge bound').toMatch(
      /<\s*7(?:\.0)?\s*;/
    )
  })

  it('compiles DDA palette snapping for both shader backends', () => {
    capture('hrc-dda-fixed-palette', backend, fixedHrcPaletteMaterial)
  })
})
