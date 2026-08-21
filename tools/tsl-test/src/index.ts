import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseGLSL } from '@shaderfrog/glsl-parser'
// The package's `main` points at CommonJS syntax in a `.js` file while declaring
// `type: module`. Import its actual ESM build explicitly so every Vitest consumer
// resolves it consistently, regardless of that package's SSR externalization.
import { WgslReflect } from './wgsl-reflect.mjs'
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
  type BufferGeometry,
  type Camera,
  type Object3D,
} from 'three'
import { GLSLNodeBuilder, NodeMaterial, WGSLNodeBuilder } from 'three/webgpu'
import { context, Fn } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

export type ShaderBackend = 'glsl' | 'wgsl'
export type ShaderStage = 'fragment' | 'vertex'

export interface ShaderSource {
  backend: ShaderBackend
  label: string
  output: string
  stage: ShaderStage
}

export interface CompiledProgram {
  backend: ShaderBackend
  diagnostics: unknown[][]
  fragmentShader: string | null
  vertexShader: string | null
}

export interface CompileMaterialOptions {
  camera?: Camera
  geometry?: BufferGeometry
  object?: Object3D
  scene?: Scene
}

type TestNodeBuilder = {
  build(): void
  camera: Camera
  fragmentShader: string | null
  scene: Scene
  vertexShader: string | null
}

const require = createRequire(import.meta.url)

export function createShaderTexture(): DataTexture {
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
  return texture
}

export function createMockRenderer(backend: ShaderBackend) {
  // This intentionally pins one deterministic code-generation profile:
  // no shadows/MRT/MSAA/reversed depth/log depth, sRGB output, and only
  // float32-filterable feature support. Add explicit matrix axes when a
  // production graph depends on another renderer configuration.
  return {
    backend: {
      capabilities: { getUniformBufferLimit: () => 65_536 },
      isWebGLBackend: backend === 'glsl',
      isWebGPUBackend: backend === 'wgsl',
      utils: { getTextureSampleData: () => ({ isMSAA: false, primarySamples: 1, samples: 1 }) },
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

export function compileMaterial(
  material: NodeMaterial,
  backend: ShaderBackend,
  options: CompileMaterialOptions = {}
): CompiledProgram {
  const object = options.object ?? new Mesh(options.geometry ?? new PlaneGeometry(1, 1), material)
  const renderer = createMockRenderer(backend)
  const builder = (backend === 'wgsl'
    ? new WGSLNodeBuilder(object, renderer as never)
    : new GLSLNodeBuilder(object, renderer as never)) as unknown as TestNodeBuilder
  builder.camera = options.camera ?? new PerspectiveCamera()
  builder.scene = options.scene ?? new Scene()

  const diagnostics: unknown[][] = []
  const originalError = console.error
  // This process-global capture is safe only for synchronous, sequential
  // compilation. Consumers must not call compileMaterial from concurrent tests.
  console.error = (...error: unknown[]) => diagnostics.push(error)
  try {
    builder.build()
  } finally {
    console.error = originalError
  }

  return {
    backend,
    diagnostics,
    fragmentShader: builder.fragmentShader,
    vertexShader: builder.vertexShader,
  }
}

export function compileFragmentNode(
  fragmentNode: Node | (() => Node),
  backend: ShaderBackend,
  options: CompileMaterialOptions = {}
): CompiledProgram {
  const material = new NodeMaterial()
  material.fragmentNode = typeof fragmentNode === 'function' ? Fn(fragmentNode)() : fragmentNode
  return compileMaterial(material, backend, options)
}

export function shaderSources(program: CompiledProgram, label: string): ShaderSource[] {
  const sources: ShaderSource[] = []
  if (program.vertexShader)
    sources.push({ backend: program.backend, label, output: program.vertexShader, stage: 'vertex' })
  if (program.fragmentShader)
    sources.push({ backend: program.backend, label, output: program.fragmentShader, stage: 'fragment' })
  return sources
}

function normalizeUniformBlocksForShaderfrog(source: string): string {
  // Shaderfrog parses uniform blocks but does not add members of an unnamed
  // block to the global scope. Three emits unnamed std140 blocks, so expand
  // only those declarations for semantic validation. The original shader is
  // still the source checked by Three and returned to callers.
  return source.replace(/layout\s*\([^)]*\)\s*uniform\s+\w+\s*\{([\s\S]*?)\}\s*;/g, (_block, body: string) =>
    body
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => `uniform ${declaration};`)
      .join('\n')
  )
}

export function validateGLSL(shaders: ShaderSource[]): void {
  for (const shader of shaders) {
    try {
      parseGLSL(normalizeUniformBlocksForShaderfrog(shader.output), {
        failOnWarn: true,
        stage: shader.stage,
      })
    } catch (error) {
      throw new Error(`GLSL parser rejected ${shader.label} ${shader.stage}`, { cause: error })
    }
  }
}

interface TextureLoadCall {
  bodyEnd: number
  bodyStart: number
  end: number
}

function findTextureLoad(source: string, cursor: number): number {
  let lineComment = false
  let blockComment = false
  let string = false

  for (let index = cursor; index < source.length; index++) {
    const char = source[index]
    const next = source[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index++
      }
      continue
    }
    if (string) {
      if (char === '\\') index++
      else if (char === '"') string = false
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index++
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index++
      continue
    }
    if (char === '"') {
      string = true
      continue
    }
    if (source.startsWith('textureLoad(', index)) return index
  }

  return -1
}

function scanTextureLoadCall(source: string, callStart: number): TextureLoadCall {
  const bodyStart = callStart + 'textureLoad('.length
  let depth = 1
  let lineComment = false
  let blockComment = false
  let string = false

  for (let index = bodyStart; index < source.length; index++) {
    const char = source[index]
    const next = source[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index++
      }
      continue
    }
    if (string) {
      if (char === '\\') index++
      else if (char === '"') string = false
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index++
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index++
      continue
    }
    if (char === '"') {
      string = true
      continue
    }
    if (char === '(') depth++
    else if (char === ')' && --depth === 0) return { bodyEnd: index, bodyStart, end: index + 1 }
  }

  return { bodyEnd: source.length, bodyStart, end: source.length }
}

function lastTopLevelComma(source: string): number {
  let depth = 0
  let lastComma = -1
  let lineComment = false
  let blockComment = false
  let string = false

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    const next = source[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index++
      }
      continue
    }
    if (string) {
      if (char === '\\') index++
      else if (char === '"') string = false
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index++
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index++
      continue
    }
    if (char === '"') {
      string = true
      continue
    }
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) lastComma = index
  }
  return lastComma
}

/**
 * Current WGSL accepts signed or unsigned textureLoad indices, while Three
 * r185 emits an unsigned final selector with signed coordinates. Naga 24
 * rejects that current-spec form. Parse the untouched shader with a current
 * WGSL parser first, then narrow only Three's final textureLoad selector for
 * Naga's older semantic checker. i32(u32Value) preserves every valid
 * non-negative index while avoiding the false failure.
 */
function normalizeTextureLoadForNaga24(source: string): string {
  let output = ''
  let cursor = 0

  while (cursor < source.length) {
    const callStart = findTextureLoad(source, cursor)
    if (callStart === -1) return output + source.slice(cursor)
    output += source.slice(cursor, callStart)

    const call = scanTextureLoadCall(source, callStart)
    let body = normalizeTextureLoadForNaga24(source.slice(call.bodyStart, call.bodyEnd))
    const comma = lastTopLevelComma(body)
    const argument = comma === -1 ? '' : body.slice(comma + 1).trim()
    if (argument.startsWith('u32(')) body = `${body.slice(0, comma + 1)} i32(${argument})`

    output += `textureLoad(${body})`
    cursor = call.end
  }

  return output
}

export function validateWGSL(shaders: ShaderSource[]): void {
  if (shaders.length === 0) return

  const shaderDirectory = mkdtempSync(join(tmpdir(), 'three-flatland-wgsl-'))
  const nagaPackage = require.resolve('naga-wasi-cli/package.json')
  const nagaWasm = join(dirname(nagaPackage), 'wasi/naga.wasm')
  const nagaRunner = fileURLToPath(new URL('./naga-runner.mjs', import.meta.url))

  try {
    const filenames = shaders.map((shader, index) => {
      try {
        new WgslReflect(shader.output)
      } catch (error) {
        throw new Error(`WGSL parser rejected ${shader.label} ${shader.stage}`, { cause: error })
      }

      const safeLabel = shader.label.replace(/[^a-zA-Z0-9_-]+/g, '-')
      const filename = `${String(index).padStart(3, '0')}-${safeLabel}-${shader.stage}.wgsl`
      writeFileSync(join(shaderDirectory, filename), normalizeTextureLoadForNaga24(shader.output))
      return filename
    })
    execFileSync(process.execPath, [nagaRunner, nagaWasm, '--bulk-validate', ...filenames], {
      cwd: shaderDirectory,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      maxBuffer: 16 * 1024 * 1024,
      stdio: 'pipe',
      timeout: 30_000,
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WGSL parser rejected')) throw error
    const output =
      typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : String(error)
    throw new Error(`Naga rejected emitted WGSL:\n${output}`, { cause: error })
  } finally {
    rmSync(shaderDirectory, { force: true, recursive: true })
  }
}

export function validateShaderSources(shaders: ShaderSource[]): void {
  validateGLSL(shaders.filter((shader) => shader.backend === 'glsl'))
  validateWGSL(shaders.filter((shader) => shader.backend === 'wgsl'))
}

export function countShaderCalls(output: string, functionName: string): number {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return output.match(new RegExp(`\\b${escapedName}\\(`, 'g'))?.length ?? 0
}
