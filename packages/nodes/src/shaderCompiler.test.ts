import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  DataTexture,
  Mesh,
  NoColorSpace,
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

type PublicNodeFunction = (...args: unknown[]) => unknown

const sourceRoot = dirname(fileURLToPath(import.meta.url))
const texture = new DataTexture(
  new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
  2,
  2,
  RGBAFormat,
  UnsignedByteType
)
texture.colorSpace = NoColorSpace
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

function normalizeShaderResult(name: string, result: unknown): Node {
  if (isNode(result)) return result

  if (typeof result === 'object' && result !== null) {
    if ('color' in result && 'attenuation' in result && isNode(result.color) && isNode(result.attenuation)) {
      return vec4(result.color, result.attenuation)
    }

    if ('uv' in result && 'cornerMask' in result && isNode(result.uv) && isNode(result.cornerMask)) {
      return vec4(result.uv, result.cornerMask, 1)
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
    hasFeature: () => false,
    highPrecision: true,
    library: { fromMaterial: (material: NodeMaterial) => material },
    lighting: { enabled: false },
    logarithmicDepthBuffer: false,
    outputColorSpace: SRGBColorSpace,
    reversedDepthBuffer: false,
    shadowMap: { enabled: false, type: 0 },
  }
}

function compileShader(spec: ShaderFunctionSpec, backend: ShaderBackend) {
  const publicFunction = Reflect.get(publicNodes, spec.name)
  if (!isPublicNodeFunction(publicFunction)) throw new Error(`${spec.name} is not exported from the package root`)

  const material = new NodeMaterial()
  material.fragmentNode = Fn(() => normalizeShaderResult(spec.name, publicFunction(...requiredArguments(spec))))()

  const mesh = new Mesh(new PlaneGeometry(1, 1), material)
  const renderer = createMockRenderer(backend)
  const builder =
    backend === 'wgsl' ? new WGSLNodeBuilder(mesh, renderer as never) : new GLSLNodeBuilder(mesh, renderer as never)
  builder.camera = new PerspectiveCamera()
  builder.scene = new Scene()
  builder.build()

  return {
    fragment: builder.fragmentShader,
    vertex: builder.vertexShader,
  }
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

const shaderFunctions = collectPublicShaderFunctions().filter(({ name }) =>
  isPublicNodeFunction(Reflect.get(publicNodes, name))
)

describe('public TSL shader compiler compatibility', () => {
  it('keeps every public function in the compiler matrix', () => {
    const runtimeExports = Object.entries(publicNodes)
      .filter(([, value]) => isPublicNodeFunction(value))
      .map(([name]) => name)
      .sort()
    const sourceExports = shaderFunctions.map(({ name }) => name)

    expect(sourceExports).toEqual(runtimeExports)
  })

  describe.each<ShaderBackend>(['wgsl', 'glsl'])('%s', (backend) => {
    it.each(shaderFunctions)('$name', (spec) => {
      const shader = compileShader(spec, backend)
      expectValidShaderOutput(backend, 'vertex', shader.vertex)
      expectValidShaderOutput(backend, 'fragment', shader.fragment)
    })
  })
})
