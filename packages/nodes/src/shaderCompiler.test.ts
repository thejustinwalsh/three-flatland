import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compileFragmentNode,
  countShaderCalls,
  createShaderTexture,
  shaderSources,
  validateShaderSources,
  type ShaderBackend,
  type ShaderSource,
} from '@three-flatland/tsl-test'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import { bool, float, texture as sampleTexture, vec2, vec3, vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { oklabToOklchNode, oklchToOklabNode } from './color/oklch'
import * as publicNodes from './index'

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

type PublicNodeFunction = (...args: unknown[]) => unknown

const sourceRoot = dirname(fileURLToPath(import.meta.url))
const deepPublicNodes = { oklabToOklchNode, oklchToOklabNode }
const compiledShaders = new Map<string, ShaderSource>()
const texture = createShaderTexture()

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
    case 'phosphorMask':
      return (['slot', 'shadow'] as const).map((maskType) => ({
        args: [color, uv, maskType, 320, 0.4],
        label: maskType,
        spec,
      }))
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

function compileShader(spec: ShaderFunctionSpec, backend: ShaderBackend, args = requiredArguments(spec)) {
  const publicFunction = resolveShaderFunction(spec.name)
  const program = compileFragmentNode(() => normalizeShaderResult(spec.name, publicFunction(...args)), backend)
  expect(program.diagnostics, `${backend} ${spec.name} logged shader code-generation errors`).toEqual([])
  for (const shader of shaderSources(program, spec.name)) {
    compiledShaders.set(`${shader.backend}:${shader.stage}:${shader.output}`, shader)
  }
  return program
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
  expect(countShaderCalls(fragment, 'textureSample'), `${name} duplicated texture samples`).toBe(expectedSamples)
}

const shaderFunctions = collectPublicShaderFunctions()
const shaderInvocations = shaderFunctions.flatMap(shaderVariants)

afterAll(() => {
  try {
    const shaders = [...compiledShaders.values()]
    const wgslShaders = shaders.filter((shader) => shader.backend === 'wgsl')

    expect(wgslShaders.some((shader) => shader.output.includes('textureSample'))).toBe(true)
    validateShaderSources(shaders)
  } finally {
    texture.dispose()
  }
}, 60_000)

describe('public TSL shader compiler compatibility', () => {
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
      expectValidShaderOutput(backend, 'vertex', shader.vertexShader)
      expectValidShaderOutput(backend, 'fragment', shader.fragmentShader)
      expectScalerSampleBudget(spec.name, backend, shader.fragmentShader)
    })

    it.each(shaderInvocations)('$spec.name ($label)', (invocation) => {
      const shader = compileShader(invocation.spec, backend, invocation.args)
      expectValidShaderOutput(backend, 'vertex', shader.vertexShader)
      expectValidShaderOutput(backend, 'fragment', shader.fragmentShader)
    })
  })
})
