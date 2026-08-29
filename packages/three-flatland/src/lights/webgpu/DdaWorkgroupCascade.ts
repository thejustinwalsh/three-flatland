import { ClampToEdgeWrapping, LinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from 'three'
import { StorageBufferAttribute, StorageTexture, type WebGPURenderer } from 'three/webgpu'
import {
  Break,
  Fn,
  If,
  Loop,
  atomicAdd,
  atomicStore,
  float,
  int,
  ivec2,
  storage,
  textureStore,
  uint,
  uvec2,
  vec2,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js'
import { detectDdaAccelerationCapabilities, type DdaAccelerationCapabilities } from '../DdaAcceleration'
import { DDA_WORKGROUP_2D_SIZE } from './DdaWorkgroupHierarchy'

type StorageTextureWithMipState = StorageTexture & { mipmapsAutoUpdate: boolean }

export const DDA_WORKGROUP_CAPABILITY_ASSUMPTIONS = Object.freeze({
  path: 'webgpu-workgroup' as const,
  requiresWebGpu: true,
  requiresCompute: true,
  requiresStorageTextures: true,
  requiresSubgroups: false,
  usesAtomics: true,
  atomicScope: 'one persistent global atlas-job counter',
  atomicRationale:
    'Atomics dynamically distribute variable-length DDA intervals across persistent lanes. Hierarchy/output writes remain exclusive and atomic-free.',
  supportsAnalyticLights: false,
})

export function getDdaWorkgroupAvailability(renderer: unknown): {
  readonly available: boolean
  readonly capabilities: DdaAccelerationCapabilities
  readonly reason: 'not-webgpu' | null
} {
  const capabilities = detectDdaAccelerationCapabilities(renderer)
  return {
    available: capabilities.workgroupCompute,
    capabilities,
    reason: capabilities.workgroupCompute ? null : 'not-webgpu',
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
}

function createOutputTexture(width: number, height: number): StorageTexture {
  const output = new StorageTexture(width, height)
  output.type = UnsignedByteType
  output.format = RGBAFormat
  output.colorSpace = NoColorSpace
  output.wrapS = ClampToEdgeWrapping
  output.wrapT = ClampToEdgeWrapping
  // Parent probes are spatially interpolated during cascade merging.
  output.minFilter = LinearFilter
  output.magFilter = LinearFilter
  output.generateMipmaps = false
  ;(output as StorageTextureWithMipState).mipmapsAutoUpdate = false
  return output
}

export interface DdaWorkgroupValueBuilderOptions {
  readonly atlasWidth: number
  readonly atlasHeight: number
  readonly label?: string
  /**
   * Called while the compute Fn graph is being built. `fragCoord` is the
   * pixel-centred atlas coordinate used by the fragment baseline.
   */
  readonly buildValue: (fragCoord: Node<'vec2'>, atlasCell: Node<'ivec2'>) => Node<'vec4'>
}

export interface DdaWorkgroupAtomicQueueKernelOptions extends DdaWorkgroupValueBuilderOptions {
  /** Fixed persistent lane count. Defaults to at most 4096 lanes. */
  readonly persistentInvocationCount?: number
}

export interface DdaWorkgroupAtomicQueueKernels {
  readonly resetNode: ComputeNode
  readonly computeNode: ComputeNode
  readonly persistentInvocationCount: number
  readonly persistentWorkgroups: number
}

/**
 * Global persistent atomic queue variant for benchmarking divergent rays.
 *
 * The reset is a distinct dispatch because WebGPU has no device-wide barrier
 * inside a compute pass. The caller must execute `resetNode`, end that compute
 * pass, then execute `computeNode`.
 */
export function createDdaWorkgroupAtomicQueueKernels(
  options: DdaWorkgroupAtomicQueueKernelOptions,
  output: StorageTexture,
  counterAttribute: StorageBufferAttribute
): DdaWorkgroupAtomicQueueKernels {
  assertPositiveInteger(options.atlasWidth, 'atlasWidth')
  assertPositiveInteger(options.atlasHeight, 'atlasHeight')
  if (counterAttribute.count < 1) throw new Error('counterAttribute must contain one uint')
  const jobCount = options.atlasWidth * options.atlasHeight
  const requestedInvocationCount = Math.min(
    jobCount,
    Math.max(1, Math.round(options.persistentInvocationCount ?? Math.min(jobCount, 4096)))
  )
  const persistentWorkgroups = Math.max(
    1,
    Math.ceil(requestedInvocationCount / (DDA_WORKGROUP_2D_SIZE * DDA_WORKGROUP_2D_SIZE))
  )
  const persistentInvocationCount = persistentWorkgroups * DDA_WORKGROUP_2D_SIZE * DDA_WORKGROUP_2D_SIZE
  const maxRounds = Math.ceil(jobCount / persistentInvocationCount) + 1
  const counter = storage(counterAttribute, 'uint', 1).toAtomic()

  const resetNode = Fn(() => {
    atomicStore(counter.element(uint(0)), uint(0))
  })()
    .compute(1, [1])
    .setName(`${options.label ?? 'dda-workgroup-atomic-queue'}-reset`)

  const computeNode = Fn(() => {
    Loop(maxRounds, () => {
      const linearIndex = atomicAdd(counter.element(uint(0)), uint(1)).toVar('rcAtomicJobIndex')
      If(linearIndex.greaterThanEqual(uint(jobCount)), () => {
        Break()
      })
      const atlasCell = ivec2(
        int(linearIndex.mod(uint(options.atlasWidth))),
        int(linearIndex.div(uint(options.atlasWidth)))
      ).toConst('rcComputeAtlasCell')
      const fragCoord = vec2(atlasCell).add(float(0.5)).toConst('rcFragCoord')
      textureStore(output, uvec2(atlasCell), options.buildValue(fragCoord, atlasCell)).toWriteOnly()
    })
  })().computeKernel([DDA_WORKGROUP_2D_SIZE * DDA_WORKGROUP_2D_SIZE])
  computeNode.dispatchSize = [persistentWorkgroups, 1, 1]
  computeNode.setName(options.label ?? 'dda-workgroup-atomic-queue')

  return { resetNode, computeNode, persistentInvocationCount, persistentWorkgroups }
}

export class DdaWorkgroupAtomicQueuePass {
  readonly output: StorageTexture
  readonly counterAttribute: StorageBufferAttribute
  readonly resetNode: ComputeNode
  readonly computeNode: ComputeNode
  readonly persistentInvocationCount: number
  readonly persistentWorkgroups: number

  constructor(readonly options: DdaWorkgroupAtomicQueueKernelOptions) {
    this.output = createOutputTexture(options.atlasWidth, options.atlasHeight)
    this.counterAttribute = new StorageBufferAttribute(new Uint32Array(1), 1)
    const kernels = createDdaWorkgroupAtomicQueueKernels(options, this.output, this.counterAttribute)
    this.resetNode = kernels.resetNode
    this.computeNode = kernels.computeNode
    this.persistentInvocationCount = kernels.persistentInvocationCount
    this.persistentWorkgroups = kernels.persistentWorkgroups
  }

  execute(renderer: WebGPURenderer): void {
    const availability = getDdaWorkgroupAvailability(renderer)
    if (!availability.available) throw new Error('DdaWorkgroupAtomicQueuePass requires a WebGPU renderer')
    // Sequential Renderer.compute calls create the device-wide pass boundary
    // required between the atomic reset and persistent queue consumption.
    void renderer.compute(this.resetNode)
    void renderer.compute(this.computeNode)
  }

  dispose(): void {
    this.resetNode.dispose()
    this.computeNode.dispose()
    this.output.dispose()
  }
}
