import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseGLSL } from '@shaderfrog/glsl-parser'
import ts from 'typescript'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  DataTexture,
  LinearFilter,
  Mesh,
  NoColorSpace,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
} from 'three'
import { GLSLNodeBuilder, NodeMaterial, WGSLNodeBuilder } from 'three/webgpu'
import { bool, context, float, Fn, texture as sampleTexture, vec2, vec3, vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { oklabToOklchNode, oklchToOklabNode } from './color/oklch'
import * as publicNodes from './index'

type ShaderBackend = 'glsl' | 'wgsl'

interface ParameterSpec {
  name: string
  required: boolean
  type: string
}

interface ShaderFunctionSpec {
  name: string
  parameters: ParameterSpec[]
}

interface ShaderInvocation {
  args: unknown[]
  label: string
  spec: ShaderFunctionSpec
}

interface CompiledShader {
  backend: ShaderBackend
  label: string
  output: string
  stage: 'fragment' | 'vertex'
}

type PublicNodeFunction = (...args: unknown[]) => unknown
type TestNodeBuilder = {
  build(): void
  camera: PerspectiveCamera
  fragmentShader: string | null
  scene: Scene
  vertexShader: string | null
}

const sourceRoot = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const deepPublicNodes = { oklabToOklchNode, oklchToOklabNode }
const compiledShaders = new Map<string, CompiledShader>()
const texture = new DataTexture(
  new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
  2,
  2,
  RGBAFormat,
  UnsignedByteType
)
texture.colorSpace = NoColorSpace
texture.magFilter = LinearFilter
texture.minFilter = LinearFilter
texture.needsUpdate = true

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(path)
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return []
    return [path]
  })
}

function collectPublicShaderFunctions(): ShaderFunctionSpec[] {
  const functions: ShaderFunctionSpec[] = []

  for (const path of collectSourceFiles(sourceRoot)) {
    const sourceText = readFileSync(path, 'utf8')
    const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true)

    for (const statement of sourceFile.statements) {
      if (!ts.isFunctionDeclaration(statement) || !statement.name) continue
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      if (!exported) continue

      functions.push({
        name: statement.name.text,
        parameters: statement.parameters.map((parameter) => ({
          name: parameter.name.getText(sourceFile),
          required: parameter.initializer === undefined && parameter.questionToken === undefined,
          type: parameter.type?.getText(sourceFile) ?? '',
        })),
      })
    }
  }

  return functions.sort((a, b) => a.name.localeCompare(b.name))
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'isNode' in value && value.isNode === true
}

function isPublicNodeFunction(value: unknown): value is PublicNodeFunction {
  return typeof value === 'function'
}

function resolveShaderFunction(name: string): PublicNodeFunction {
  const publicFunction = Reflect.get(publicNodes, name) ?? Reflect.get(deepPublicNodes, name)
  if (!isPublicNodeFunction(publicFunction))
    throw new Error(`${name} is not reachable through a published package path`)
  return publicFunction
}

function lightFixture() {
  return {
    direction: vec3(0, 0, 1),
    color: vec3(1, 0.8, 0.6),
    attenuation: float(0.75),
  }
}

function requiredArgument(parameter: ParameterSpec): unknown {
  const { name, type } = parameter

  if (type.includes('DissolveOptions')) return { progress: 0.5, noiseTex: texture }
  if (type.includes('Light2DResult[]')) return [lightFixture()]
  if (type.includes('Light2DResult')) return lightFixture()
  if (type.includes('TextureNode')) return sampleTexture(texture)
  if (type.includes('Texture')) return texture
  if (type.includes("Node<'bool'>")) return bool(true)
  if (type.includes("Node<'vec4'>")) return vec4(0.2, 0.4, 0.6, 0.8)
  if (type.includes("Node<'vec3'>")) return vec3(0, 0, 1)
  if (type.includes("Node<'vec2'>")) return vec2(0.25, 0.75)
  if (type.includes("Node<'float'>")) return float(0.5)
  if (type.includes('Array<[number, number]>')) return [[0.02, 0]]
  if (type.includes('[number, number, number][]')) return [[0.2, 0.4, 0.6]]
  if (type.includes('Vec4Input')) return [0.1, 0.2, 0.3, 0.9]
  if (type.includes('Vec3Input')) return [0.2, 0.4, 0.6]
  if (type.includes('Vec2Input')) return [0.25, 0.75]
  if (type.includes('boolean')) return true
  if (type.includes('FloatInput')) return 0.5
  if (type.includes("'left'") || name === 'direction') return 'right'
  if (type.includes('number')) return 2

  throw new Error(`No shader fixture for required parameter ${name}: ${type}`)
}

function requiredArguments(spec: ShaderFunctionSpec): unknown[] {
  let lastRequired = -1
  for (let index = 0; index < spec.parameters.length; index++) {
    if (spec.parameters[index]?.required) lastRequired = index
  }

  return spec.parameters
    .slice(0, lastRequired + 1)
    .map((parameter) => (parameter.required ? requiredArgument(parameter) : undefined))
}

function shaderVariants(spec: ShaderFunctionSpec): ShaderInvocation[] {
  const color = vec4(0.2, 0.4, 0.6, 0.8)
  const normal = vec3(0, 0, 1)
  const uv = vec2(0.25, 0.75)

  switch (spec.name) {
    case 'colorReplaceMultiple':
      return [
        {
          args: [
            color,
            [
              [0.2, 0.4, 0.6],
              [0.8, 0.6, 0.4],
            ],
            [
              [0.9, 0.1, 0.2],
              [0.1, 0.8, 0.3],
            ],
          ],
          label: 'multiple replacements',
          spec,
        },
      ]
    case 'dissolveDirectional':
      return (['left', 'up', 'down'] as const).map((direction) => ({
        args: [color, uv, 0.5, texture, direction, 0.4],
        label: direction,
        spec,
      }))
    case 'ghost':
      return [
        {
          args: [
            texture,
            uv,
            [
              [0.02, 0],
              [0.04, 0.01],
              [0.06, 0.02],
            ],
            0.3,
            false,
          ],
          label: 'multiple fixed-opacity samples',
          spec,
        },
      ]
    case 'litSprite':
      return [
        {
          args: [normal, color, lightFixture(), lightFixture(), { rim: true, specular: true }],
          label: 'ambient specular rim',
          spec,
        },
      ]
    case 'litSpriteMulti':
      return [
        {
          args: [normal, color, [lightFixture(), lightFixture()], lightFixture(), { rim: true, specular: true }],
          label: 'multiple lights with ambient specular rim',
          spec,
        },
      ]
    case 'outline':
    case 'outline8':
      return [
        {
          args: [color, uv, texture, { textureSize: [256, 128], thickness: 2 }],
          label: 'texture-size thickness',
          spec,
        },
      ]
    case 'palettizeNearest':
      return [{ args: [color, texture, 16], label: 'maximum palette', spec }]
    default:
      return []
  }
}

function normalizeShaderResult(name: string, result: unknown): Node {
  if (isNode(result)) return result

  if (typeof result === 'object' && result !== null) {
    if ('color' in result && 'attenuation' in result && isNode(result.color) && isNode(result.attenuation)) {
      return vec4(result.color as Node<'vec3'>, result.attenuation as Node<'float'>)
    }

    if ('uv' in result && 'cornerMask' in result && isNode(result.uv) && isNode(result.cornerMask)) {
      return vec4(result.uv as Node<'vec2'>, result.cornerMask as Node<'float'>, 1)
    }
  }

  throw new Error(`${name} did not return a TSL node or supported node result`)
}

function createMockRenderer(backend: ShaderBackend) {
  return {
    backend: {
      capabilities: { getUniformBufferLimit: () => 65_536 },
      isWebGLBackend: backend === 'glsl',
      isWebGPUBackend: backend === 'wgsl',
      utils: {
        getTextureSampleData: () => ({ isMSAA: false, primarySamples: 1, samples: 1 }),
      },
    },
    contextNode: context({}),
    coordinateSystem: backend === 'wgsl' ? WebGPUCoordinateSystem : WebGLCoordinateSystem,
    currentSamples: 1,
    depth: true,
    getMRT: () => null,
    getRenderTarget: () => null,
    hasCompatibility: () => false,
    hasFeature: (feature: string) => feature === 'float32-filterable',
    highPrecision: false,
    library: { fromMaterial: (material: NodeMaterial) => material },
    lighting: { enabled: true },
    logarithmicDepthBuffer: false,
    outputColorSpace: SRGBColorSpace,
    reversedDepthBuffer: false,
    shadowMap: { enabled: false, transmitted: false, type: PCFShadowMap },
  }
}

function compileShader(spec: ShaderFunctionSpec, backend: ShaderBackend, args = requiredArguments(spec)) {
  const publicFunction = resolveShaderFunction(spec.name)

  const material = new NodeMaterial()
  material.fragmentNode = Fn(() => normalizeShaderResult(spec.name, publicFunction(...args)))()

  const mesh = new Mesh(new PlaneGeometry(1, 1), material)
  const renderer = createMockRenderer(backend)
  const builder = (backend === 'wgsl'
    ? new WGSLNodeBuilder(mesh, renderer as never)
    : new GLSLNodeBuilder(mesh, renderer as never)) as unknown as TestNodeBuilder
  builder.camera = new PerspectiveCamera()
  builder.scene = new Scene()
  const codegenErrors: unknown[][] = []
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...error) => codegenErrors.push(error))
  try {
    builder.build()
  } finally {
    errorSpy.mockRestore()
  }
  expect(codegenErrors, `${backend} ${spec.name} logged shader code-generation errors`).toEqual([])

  const shader = {
    fragment: builder.fragmentShader,
    vertex: builder.vertexShader,
  }
  for (const [stage, output] of Object.entries(shader) as Array<['fragment' | 'vertex', string | null]>) {
    if (output) {
      compiledShaders.set(`${backend}:${stage}:${output}`, { backend, label: spec.name, output, stage })
    }
  }
  return shader
}

function expectValidShaderOutput(backend: ShaderBackend, stage: 'fragment' | 'vertex', output: string | null) {
  expect(output, `${backend} ${stage} shader was not generated`).toBeTypeOf('string')
  expect(output).not.toMatch(/\b(?:NaN|null|undefined)\b/)

  if (backend === 'wgsl') {
    expect(output).toContain(`@${stage}`)
    expect(output).toContain('fn main')
  } else {
    expect(output).toContain('#version 300 es')
    expect(output).toContain('void main')
  }
}

function expectScalerSampleBudget(name: string, backend: ShaderBackend, fragment: string | null) {
  if (backend !== 'wgsl' || fragment === null) return
  const sampleBudget: Record<string, number> = { eagle: 12, scale2x: 8 }
  const expectedSamples = sampleBudget[name]
  if (expectedSamples === undefined) return
  expect(fragment.match(/\btextureSample\(/g) ?? [], `${name} duplicated texture samples`).toHaveLength(expectedSamples)
}

function validateGLSL(shaders: CompiledShader[]) {
  for (const shader of shaders) {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      parseGLSL(shader.output, { stage: shader.stage })
    } catch (error) {
      throw new Error(`GLSL parser rejected ${shader.label} ${shader.stage}`, { cause: error })
    } finally {
      warningSpy.mockRestore()
    }
  }
}

function validateWGSL(shaders: CompiledShader[]) {
  const shaderDirectory = mkdtempSync(join(tmpdir(), 'three-flatland-wgsl-'))
  const nagaPackage = require.resolve('naga-wasi-cli/package.json')
  const nagaBin = join(dirname(nagaPackage), 'bin/naga.mjs')

  try {
    const filenames = shaders.map((shader, index) => {
      const filename = `${String(index).padStart(3, '0')}-${shader.label}-${shader.stage}.wgsl`
      writeFileSync(join(shaderDirectory, filename), shader.output)
      return filename
    })
    execFileSync(process.execPath, [nagaBin, '--bulk-validate', ...filenames], {
      cwd: shaderDirectory,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      stdio: 'pipe',
    })
  } catch (error) {
    const output =
      typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : String(error)
    throw new Error(`Naga rejected emitted WGSL:\n${output}`, { cause: error })
  } finally {
    rmSync(shaderDirectory, { force: true, recursive: true })
  }
}

const shaderFunctions = collectPublicShaderFunctions()
const shaderInvocations = shaderFunctions.flatMap(shaderVariants)

afterAll(() => {
  const shaders = [...compiledShaders.values()]
  const glslShaders = shaders.filter((shader) => shader.backend === 'glsl')
  const wgslShaders = shaders.filter((shader) => shader.backend === 'wgsl')

  expect(wgslShaders.some((shader) => shader.output.includes('textureSample'))).toBe(true)
  validateGLSL(glslShaders)
  validateWGSL(wgslShaders)
})

describe('public TSL shader compiler compatibility', () => {
  it('rejects invalid emitted shader source', () => {
    expect(() =>
      validateGLSL([{ backend: 'glsl', label: 'invalid', output: '#version 300 es\nvoid main( {', stage: 'fragment' }])
    ).toThrow()
    expect(() =>
      validateWGSL([
        {
          backend: 'wgsl',
          label: 'invalid',
          output: '@fragment fn main() { retrn; }',
          stage: 'fragment',
        },
      ])
    ).toThrow()
  })

  it('keeps every public function in the compiler matrix', () => {
    const publishedExports = Object.entries({ ...publicNodes, ...deepPublicNodes })
      .filter(([, value]) => isPublicNodeFunction(value))
      .map(([name]) => name)
      .sort()
    const sourceExports = shaderFunctions.map(({ name }) => name)

    expect(sourceExports).toEqual(publishedExports)
  })

  describe.each<ShaderBackend>(['wgsl', 'glsl'])('%s', (backend) => {
    it.each(shaderFunctions)('$name', (spec) => {
      const shader = compileShader(spec, backend)
      expectValidShaderOutput(backend, 'vertex', shader.vertex)
      expectValidShaderOutput(backend, 'fragment', shader.fragment)
      expectScalerSampleBudget(spec.name, backend, shader.fragment)
    })

    it.each(shaderInvocations)('$spec.name ($label)', (invocation) => {
      const shader = compileShader(invocation.spec, backend, invocation.args)
      expectValidShaderOutput(backend, 'vertex', shader.vertex)
      expectValidShaderOutput(backend, 'fragment', shader.fragment)
    })
  })
})
