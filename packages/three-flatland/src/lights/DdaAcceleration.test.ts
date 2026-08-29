import { describe, expect, it } from 'vitest'
import { detectDdaAccelerationCapabilities, resolveDdaExecutionPath } from './DdaAcceleration'

function renderer(webgpu: boolean, subgroups: boolean) {
  return {
    backend: {
      isWebGPUBackend: webgpu,
      device: { features: { has: (name: string) => name === 'subgroups' && subgroups } },
    },
    hasFeature: (name: string) => name === 'subgroups' && subgroups,
  }
}

describe('DDA acceleration path selection', () => {
  it('detects WebGPU core compute and optional subgroups', () => {
    expect(detectDdaAccelerationCapabilities(renderer(false, false))).toEqual({
      webgpu: false,
      workgroupCompute: false,
      subgroups: false,
    })
    expect(detectDdaAccelerationCapabilities(renderer(true, true))).toEqual({
      webgpu: true,
      workgroupCompute: true,
      subgroups: true,
    })
  })

  it('treats a not-yet-initialized subgroup feature probe as unavailable', () => {
    expect(
      detectDdaAccelerationCapabilities({
        backend: { isWebGPUBackend: true },
        hasFeature: () => {
          throw new Error('device not initialized')
        },
      })
    ).toEqual({ webgpu: true, workgroupCompute: true, subgroups: false })
  })

  it('hard-disables every WebGPU path for portable-path comparisons', () => {
    expect(
      resolveDdaExecutionPath(renderer(true, true), {
        webgpuEnabled: false,
        requestedPath: 'webgpu-subgroup',
      })
    ).toMatchObject({ path: 'fragment', fallbackReason: 'disabled' })
  })

  it('automatically selects the parity-validated workgroup path on WebGPU', () => {
    expect(resolveDdaExecutionPath(renderer(true, true), { webgpuEnabled: true, requestedPath: 'auto' })).toMatchObject(
      {
        path: 'webgpu-workgroup',
        fallbackReason: null,
      }
    )
    expect(
      resolveDdaExecutionPath(renderer(true, false), { webgpuEnabled: true, requestedPath: 'auto' })
    ).toMatchObject({
      path: 'webgpu-workgroup',
      fallbackReason: null,
    })
    expect(resolveDdaExecutionPath(renderer(false, false), { webgpuEnabled: true, requestedPath: 'auto' }).path).toBe(
      'fragment'
    )
  })

  it('quarantines subgroup behind the matching workgroup path until readback parity exists', () => {
    expect(
      resolveDdaExecutionPath(renderer(true, true), {
        webgpuEnabled: true,
        requestedPath: 'webgpu-subgroup',
      })
    ).toMatchObject({ path: 'webgpu-workgroup', fallbackReason: 'subgroup-parity-disabled' })
    expect(
      resolveDdaExecutionPath(renderer(true, false), {
        webgpuEnabled: true,
        requestedPath: 'webgpu-subgroup',
      })
    ).toMatchObject({ path: 'webgpu-workgroup', fallbackReason: 'subgroup-parity-disabled' })
  })
})
