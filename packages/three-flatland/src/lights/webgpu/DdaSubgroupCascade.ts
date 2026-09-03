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
  invocationSubgroupIndex,
  ivec2,
  storage,
  subgroupAdd,
  subgroupBallot,
  subgroupElect,
  subgroupExclusiveAdd,
  subgroupMax,
  subgroupSize,
  textureStore,
  uint,
  uvec2,
  vec2,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js'
import { detectDdaAccelerationCapabilities } from '../DdaAcceleration'

export const DDA_SUBGROUP_REQUIRED_FEATURE = 'subgroups' as const
export const DDA_SUBGROUP_DEFAULT_WORKGROUP_SIZE = 64
export const DDA_SUBGROUP_DEFAULT_PERSISTENT_WORKGROUPS = 16

export const DDA_SUBGROUP_CAPABILITY_ASSUMPTIONS = Object.freeze({
  path: 'webgpu-subgroup' as const,
  requiresWebGpu: true,
  requiresCompute: true,
  requiresStorageTextures: true,
  requiresAtomics: true,
  requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
  queue: 'one persistent global atlas-job counter reserved once per subgroup',
  broadcast: 'subgroupMax of the subgroup-elected lane reservation',
  tslLimitation:
    'Three r185 declares subgroupBroadcastFirst with two parameters although WGSL accepts one, so the elected value is broadcast with subgroupMax instead.',
})

export type DdaSubgroupUnavailableReason = 'disabled' | 'not-webgpu' | 'subgroups-unavailable'

export interface DdaSubgroupAvailability {
  readonly available: boolean
  readonly reason: DdaSubgroupUnavailableReason | null
  readonly requiredFeature: typeof DDA_SUBGROUP_REQUIRED_FEATURE
}

export interface DdaSubgroupActiveSet {
  /** WebGPU's four-word ballot covering the implementation-defined subgroup width. */
  readonly ballot: Node<'uvec4'>
  /** Number of active lanes preceding this lane. This is its compacted queue index. */
  readonly rank: Node<'uint'>
  /** Number of active lanes in this subgroup. */
  readonly count: Node<'uint'>
  /** True when at least one lane is active. Derived from the ballot, not subgroupAny. */
  readonly any: Node<'bool'>
}

export interface DdaSubgroupCascadeInvocation {
  /** Integer texel in the direction-first cascade atlas. */
  readonly atlasTexel: Node<'uvec2'>
  /** Signed alias used by texture loads and the shared fragment/compute value builder. */
  readonly atlasCell: Node<'ivec2'>
  /** Pixel-centred atlas coordinate matching fragment-stage `uv * atlasSize`. */
  readonly fragCoord: Node<'vec2'>
  /** Linear atlas texel index. */
  readonly linearIndex: Node<'uint'>
  /** Invocation index inside the subgroup. Subgroup width is implementation-defined. */
  readonly laneIndex: Node<'uint'>
}

export type DdaSubgroupCascadeValueBuilder = (invocation: DdaSubgroupCascadeInvocation) => Node<'vec4'>

export interface DdaSubgroupCascadeKernelOptions {
  readonly width: number
  readonly height: number
  readonly buildValue: DdaSubgroupCascadeValueBuilder
  /** Defaults to a WebGPU-friendly 64 invocations. Must be a positive integer. */
  readonly workgroupSize?: number
  /** Persistent workgroups competing for jobs. Defaults to 16 and is capped by atlas size. */
  readonly persistentWorkgroups?: number
  /** Optional externally owned output used directly as the next cascade's sampled texture. */
  readonly outputTexture?: StorageTexture
  readonly name?: string
}

export interface DdaSubgroupExecutionResult {
  readonly executed: boolean
  readonly reason: DdaSubgroupUnavailableReason | null
}

/**
 * Resolve the hard execution gate separately from kernel construction.
 *
 * The returned kernel is always a WebGPU subgroup specialization. Unsupported
 * renderers never compile or dispatch it; the caller retains the fragment
 * baseline selected in JavaScript instead of emitting a runtime backend branch.
 */
export function getDdaSubgroupAvailability(renderer: unknown, enabled = true): DdaSubgroupAvailability {
  if (!enabled) {
    return {
      available: false,
      reason: 'disabled',
      requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
    }
  }

  const capabilities = detectDdaAccelerationCapabilities(renderer)
  if (!capabilities.webgpu) {
    return {
      available: false,
      reason: 'not-webgpu',
      requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
    }
  }
  if (!capabilities.subgroups) {
    return {
      available: false,
      reason: 'subgroups-unavailable',
      requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
    }
  }
  return {
    available: true,
    reason: null,
    requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
  }
}

/**
 * Construct subgroup ballot/scan metadata without changing ray semantics.
 *
 * Three r185's `subgroupAny` TSL declaration accepts no predicate, so using it
 * would silently lose the active-ray condition. OR-ing the exact ballot words
 * is both expressible in TSL and matches WebGPU's subgroup ballot contract.
 */
export function createDdaSubgroupActiveSet(active: Node<'bool'>): DdaSubgroupActiveSet {
  const activeCode = active.select(uint(1), uint(0)).toConst()
  const ballot = subgroupBallot(active) as Node<'uvec4'>
  const rank = subgroupExclusiveAdd(activeCode) as Node<'uint'>
  const count = subgroupAdd(activeCode) as Node<'uint'>
  const any = ballot.x
    .bitOr(ballot.y)
    .bitOr(ballot.z)
    .bitOr(ballot.w)
    .greaterThan(uint(0))
    .and(count.greaterThan(uint(0)))
    // Keep the scan in uniform control flow. TSL is lazy: without this true
    // dependency, the first use of `rank` inside the lane-divergent store
    // branch would illegally emit subgroupExclusiveAdd only for active lanes.
    .and(rank.lessThanEqual(count))
    .toConst()
  return { ballot, rank, count, any }
}

/**
 * WebGPU-only direction-atlas compute kernel for a single RC cascade.
 *
 * `buildValue` is deliberately the same `atlas texel -> encoded vec4` contract
 * as the fragment baseline. That keeps probe placement, interval traversal,
 * parent merging, and fixed-point encoding shared while only scheduling and
 * output storage change. Every texel is written exactly once with integer
 * coordinates; the compute path introduces no filtering or coordinate remap.
 *
 * The persistent queue load-balances complete variable-cost DDA rays between
 * subgroups and amortizes one atomic reservation over an entire subgroup. It
 * does not refill individual lanes while `buildValue` is inside its monolithic
 * DDA loop; that deeper wave compaction requires the shared tracer to expose a
 * resumable ray-state step rather than returning one opaque value node.
 */
export class DdaSubgroupCascadeKernel {
  readonly width: number
  readonly height: number
  readonly workgroupSize: number
  readonly persistentWorkgroups: number
  readonly persistentInvocationCount: number
  readonly maxQueueRounds: number
  readonly outputTexture: StorageTexture
  readonly counterAttribute: StorageBufferAttribute
  readonly resetNode: ComputeNode
  readonly computeNode: ComputeNode

  private readonly _ownsOutputTexture: boolean

  constructor(options: DdaSubgroupCascadeKernelOptions) {
    const width = Math.round(options.width)
    const height = Math.round(options.height)
    const workgroupSize = options.workgroupSize ?? DDA_SUBGROUP_DEFAULT_WORKGROUP_SIZE
    const requestedPersistentWorkgroups = options.persistentWorkgroups ?? DDA_SUBGROUP_DEFAULT_PERSISTENT_WORKGROUPS
    if (!Number.isInteger(width) || width <= 0) throw new Error('DDA subgroup cascade width must be a positive integer')
    if (!Number.isInteger(height) || height <= 0)
      throw new Error('DDA subgroup cascade height must be a positive integer')
    if (!Number.isInteger(workgroupSize) || workgroupSize <= 0)
      throw new Error('DDA subgroup workgroup size must be a positive integer')
    if (!Number.isInteger(requestedPersistentWorkgroups) || requestedPersistentWorkgroups <= 0)
      throw new Error('DDA subgroup persistent workgroups must be a positive integer')

    this.width = width
    this.height = height
    this.workgroupSize = workgroupSize
    const jobCount = width * height
    this.persistentWorkgroups = Math.min(requestedPersistentWorkgroups, Math.ceil(jobCount / workgroupSize))
    this.persistentInvocationCount = this.persistentWorkgroups * workgroupSize
    this.maxQueueRounds = Math.ceil(jobCount / this.persistentInvocationCount) + 1
    this._ownsOutputTexture = options.outputTexture === undefined
    this.outputTexture = options.outputTexture ?? new StorageTexture(width, height)
    this.outputTexture.setSize(width, height, 1)
    this.outputTexture.format = RGBAFormat
    this.outputTexture.type = UnsignedByteType
    this.outputTexture.colorSpace = NoColorSpace
    this.outputTexture.wrapS = ClampToEdgeWrapping
    this.outputTexture.wrapT = ClampToEdgeWrapping
    // Fixed cascade values are packed into rgba8unorm, then spatially
    // interpolated between parent probes exactly like the fragment baseline.
    this.outputTexture.minFilter = LinearFilter
    this.outputTexture.magFilter = LinearFilter
    this.outputTexture.generateMipmaps = false
    const storageOutput = this.outputTexture as StorageTexture & { mipmapsAutoUpdate: boolean }
    storageOutput.mipmapsAutoUpdate = false

    this.counterAttribute = new StorageBufferAttribute(new Uint32Array(1), 1)
    const counter = storage(this.counterAttribute, 'uint', 1).toAtomic()
    this.resetNode = Fn(() => {
      atomicStore(counter.element(uint(0)), uint(0))
    })()
      .compute(1, [1])
      .setName(`${options.name ?? 'dda-subgroup-cascade'}-reset`)

    const outputTexture = this.outputTexture
    const buildValue = options.buildValue
    const kernel = Fn(() => {
      const laneIndex = invocationSubgroupIndex.toConst('ddaSubgroupLaneIndex')
      Loop(this.maxQueueRounds, () => {
        const elected = subgroupElect() as Node<'bool'>
        const electedReservation = uint(0).toVar('ddaElectedReservation')
        If(elected, () => {
          electedReservation.assign(atomicAdd(counter.element(uint(0)), subgroupSize))
        })

        // `subgroupBroadcastFirst` cannot be emitted correctly by Three r185:
        // its TSL proxy injects a spurious second argument. Exactly one elected
        // lane has a non-zero reservation, so subgroupMax is an equivalent,
        // uniformly executed broadcast (including reservation zero).
        const batchBase = subgroupMax(electedReservation) as Node<'uint'>
        const candidateIndex = batchBase.add(laneIndex).toConst('ddaSubgroupCandidateIndex')
        const candidateActive = candidateIndex.lessThan(uint(jobCount)).toConst('ddaSubgroupCandidateActive')
        const activeSet = createDdaSubgroupActiveSet(candidateActive)

        If(activeSet.any.not(), () => {
          Break()
        })

        If(candidateActive, () => {
          // At the final partial batch, the active candidates are a prefix of
          // the subgroup. The exclusive scan therefore compacts them without
          // holes and preserves one exact job index per output texel.
          const linearIndex = batchBase.add(activeSet.rank).toConst('ddaSubgroupLinearIndex')
          const atlasTexel = uvec2(linearIndex.mod(uint(width)), linearIndex.div(uint(width))).toConst(
            'ddaSubgroupAtlasTexel'
          )
          const atlasCell = ivec2(int(atlasTexel.x), int(atlasTexel.y)).toConst('ddaSubgroupAtlasCell')
          const fragCoord = vec2(atlasCell).add(float(0.5)).toConst('rcFragCoord')
          const invocation: DdaSubgroupCascadeInvocation = {
            atlasTexel,
            atlasCell,
            fragCoord,
            linearIndex,
            laneIndex,
          }
          textureStore(outputTexture, atlasTexel, buildValue(invocation)).toWriteOnly()
        })
      })
      // Passing an invocation count makes Three inject an `instanceIndex`
      // early-return guard. Even when the count is an exact workgroup multiple,
      // WGSL treats that guard as non-uniform control flow and rejects every
      // subgroup collective below it. An explicit workgroup dispatch has no
      // synthetic guard and is exact because persistentWorkgroups is integral.
    })().computeKernel([workgroupSize])
    kernel.dispatchSize = [this.persistentWorkgroups, 1, 1]
    kernel.setName(options.name ?? 'dda-subgroup-cascade')
    this.computeNode = kernel
  }

  /** Dispatch only when both the hard gate and the renderer subgroup feature pass. */
  execute(renderer: WebGPURenderer, enabled = true): DdaSubgroupExecutionResult {
    const availability = getDdaSubgroupAvailability(renderer, enabled)
    if (!availability.available) return { executed: false, reason: availability.reason }
    // A distinct dispatch creates the device-wide ordering boundary required
    // before persistent subgroups consume the reset atomic counter.
    void renderer.compute(this.resetNode)
    void renderer.compute(this.computeNode)
    return { executed: true, reason: null }
  }

  dispose(): void {
    this.resetNode.dispose()
    this.computeNode.dispose()
    if (this._ownsOutputTexture) this.outputTexture.dispose()
  }
}

export function createDdaSubgroupCascadeKernel(options: DdaSubgroupCascadeKernelOptions): DdaSubgroupCascadeKernel {
  return new DdaSubgroupCascadeKernel(options)
}
