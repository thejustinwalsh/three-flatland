export type DdaExecutionPath = 'auto' | 'fragment' | 'webgpu-workgroup' | 'webgpu-subgroup'

export type ResolvedDdaExecutionPath = Exclude<DdaExecutionPath, 'auto'>

export interface DdaAccelerationCapabilities {
  readonly webgpu: boolean
  readonly workgroupCompute: boolean
  readonly subgroups: boolean
}

export interface DdaAccelerationPolicy {
  /** Hard master gate. `false` always selects the portable fragment path. */
  readonly webgpuEnabled: boolean
  /** `auto` chooses the fastest supported path; another value forces a test path. */
  readonly requestedPath: DdaExecutionPath
}

export interface DdaAccelerationResolution {
  readonly requestedPath: DdaExecutionPath
  readonly path: ResolvedDdaExecutionPath
  readonly capabilities: DdaAccelerationCapabilities
  readonly fallbackReason: 'disabled' | 'not-webgpu' | 'subgroups-unavailable' | null
}

interface DdaRendererProbe {
  readonly backend?: {
    readonly isWebGPUBackend?: boolean
    readonly device?: {
      readonly features?: {
        has(name: string): boolean
      }
    }
  }
  hasFeature?(name: string): boolean
}

/**
 * Read renderer/backend capabilities in JavaScript before TSL builds a kernel.
 * This keeps fragment, workgroup, and subgroup shaders separately specialized;
 * no backend branch survives into generated WGSL/GLSL.
 */
export function detectDdaAccelerationCapabilities(renderer: unknown): DdaAccelerationCapabilities {
  const probe = renderer as DdaRendererProbe | null | undefined
  const webgpu = probe?.backend?.isWebGPUBackend === true
  let subgroups = false
  if (webgpu) {
    try {
      subgroups =
        probe?.hasFeature?.('subgroups') === true || probe?.backend?.device?.features?.has('subgroups') === true
    } catch {
      // A renderer may expose `hasFeature()` before its async device exists.
      // Keep the portable path until a later generation can detect it safely.
      subgroups = false
    }
  }
  return {
    webgpu,
    // Compute shaders, storage buffers, and 32-bit atomics are WebGPU core.
    workgroupCompute: webgpu,
    subgroups,
  }
}

/** Resolve the requested path without silently upgrading a forced test path. */
export function resolveDdaExecutionPath(renderer: unknown, policy: DdaAccelerationPolicy): DdaAccelerationResolution {
  const capabilities = detectDdaAccelerationCapabilities(renderer)
  if (!policy.webgpuEnabled) {
    return {
      requestedPath: policy.requestedPath,
      path: 'fragment',
      capabilities,
      fallbackReason: 'disabled',
    }
  }

  if (policy.requestedPath === 'fragment') {
    return {
      requestedPath: policy.requestedPath,
      path: 'fragment',
      capabilities,
      fallbackReason: null,
    }
  }

  if (policy.requestedPath === 'webgpu-subgroup') {
    return {
      requestedPath: policy.requestedPath,
      path: capabilities.subgroups ? 'webgpu-subgroup' : 'fragment',
      capabilities,
      fallbackReason: capabilities.subgroups ? null : capabilities.webgpu ? 'subgroups-unavailable' : 'not-webgpu',
    }
  }

  if (policy.requestedPath === 'webgpu-workgroup') {
    return {
      requestedPath: policy.requestedPath,
      path: capabilities.workgroupCompute ? 'webgpu-workgroup' : 'fragment',
      capabilities,
      fallbackReason: capabilities.workgroupCompute ? null : 'not-webgpu',
    }
  }

  if (capabilities.subgroups) {
    return {
      requestedPath: policy.requestedPath,
      path: 'webgpu-subgroup',
      capabilities,
      fallbackReason: null,
    }
  }
  if (capabilities.workgroupCompute) {
    return {
      requestedPath: policy.requestedPath,
      path: 'webgpu-workgroup',
      capabilities,
      fallbackReason: null,
    }
  }
  return {
    requestedPath: policy.requestedPath,
    path: 'fragment',
    capabilities,
    fallbackReason: 'not-webgpu',
  }
}
