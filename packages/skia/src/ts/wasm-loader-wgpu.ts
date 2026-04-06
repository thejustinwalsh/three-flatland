/**
 * WASM loader for the Skia WebGPU (Dawn/Graphite) variant.
 *
 * Instantiates skia-wgpu.wasm with:
 *   - "wgpu" module: WebGPU C API function imports
 *   - "env" module: Skia runtime stubs (logging, semaphores)
 *   - "wasi_snapshot_preview1" module: minimal WASI stubs
 *
 * Mirrors wasm-loader.ts (GL variant) but provides WebGPU functions
 * instead of GL functions. The "wgpu" module maps C API calls like
 * wgpuDeviceCreateBuffer() to the browser's GPUDevice.createBuffer().
 *
 * @internal
 */

import { createEnvImports, createWasiImports, instantiateWasm } from './wasm-loader-shared'

// ── WebGPU object handle tables ──
// WebGPU uses JS objects, WASM uses integer handles (opaque pointers).
// We maintain bidirectional mappings, same pattern as the GL loader.

interface WGPUState {
  device: GPUDevice
  queue: GPUQueue
  memory: WebAssembly.Memory
  // Handle tables: handle (u32) → JS object
  objects: Map<number, unknown>
  nextHandle: number
  // Reverse map: JS object → handle (for passing objects back)
  reverseMap: WeakMap<object, number>
  // Typed accessors for common object types
  deviceHandle: number
  queueHandle: number
}

function createWGPUState(device: GPUDevice): WGPUState {
  const state: WGPUState = {
    device,
    queue: device.queue,
    memory: null!,
    objects: new Map(),
    nextHandle: 1,
    reverseMap: new WeakMap(),
    deviceHandle: 0,
    queueHandle: 0,
  }
  // Pre-register device and queue
  state.deviceHandle = registerObject(state, device)
  state.queueHandle = registerObject(state, state.queue)
  return state
}

function registerObject(state: WGPUState, obj: unknown): number {
  const handle = state.nextHandle++
  state.objects.set(handle, obj)
  if (obj && typeof obj === 'object') {
    state.reverseMap.set(obj, handle)
  }
  return handle
}

function getObject<T>(state: WGPUState, handle: number): T | null {
  return (state.objects.get(handle) as T) ?? null
}

function releaseObject(state: WGPUState, handle: number): void {
  const obj = state.objects.get(handle)
  if (obj && typeof obj === 'object') {
    state.reverseMap.delete(obj)
  }
  state.objects.delete(handle)
}

// ── Memory helpers ──

function readU32(state: WGPUState, ptr: number): number {
  return new Uint32Array(state.memory.buffer, ptr, 1)[0]!
}

function readU64(state: WGPUState, ptr: number): bigint {
  return new BigUint64Array(state.memory.buffer, ptr, 1)[0]!
}

function readF32(state: WGPUState, ptr: number): number {
  return new Float32Array(state.memory.buffer, ptr, 1)[0]!
}

function writeU32(state: WGPUState, ptr: number, value: number): void {
  new Uint32Array(state.memory.buffer, ptr, 1)[0] = value
}

function readStringView(state: WGPUState, ptr: number): string {
  // WGPUStringView: { const char* data; size_t length; }
  const dataPtr = readU32(state, ptr)
  const length = readU32(state, ptr + 4)
  if (dataPtr === 0 || length === 0) return ''
  const bytes = new Uint8Array(state.memory.buffer, dataPtr, length)
  return new TextDecoder().decode(bytes)
}

// ── WebGPU imports ──
// Each function maps a wgpu C API call to the browser's WebGPU API.
// Most functions are stubs — we implement the ones Skia's Graphite backend actually calls.

function createWGPUImports(state: WGPUState): Record<string, WebAssembly.ImportValue> {
  const { device, queue } = state

  const noop = (..._args: unknown[]) => 0

  // Implemented functions — anything not in this object falls through to the
  // Proxy handler which returns a no-op stub (returns 0). This ensures new
  // Dawn/WebGPU C API functions added across Skia versions don't break loading.
  const impl: Record<string, WebAssembly.ImportValue> = {
    // ── Instance ──
    wgpuCreateInstance: noop,
    wgpuGetInstanceFeatures: noop,
    wgpuGetInstanceLimits: noop,
    wgpuHasInstanceFeature: noop,
    wgpuGetProcAddress: noop,

    // ── Adapter ──
    wgpuAdapterCreateDevice: noop,
    wgpuAdapterGetFeatures: noop,
    wgpuAdapterGetFormatCapabilities: noop,
    wgpuAdapterGetInfo: noop,
    wgpuAdapterGetInstance: noop,
    wgpuAdapterGetLimits: noop,
    wgpuAdapterHasFeature: noop,
    wgpuAdapterRequestDevice: noop,
    wgpuAdapterAddRef: noop,
    wgpuAdapterRelease: noop,

    // ── Device ──
    wgpuDeviceCreateBuffer(deviceHandle: number, descriptorPtr: number): number {
      const dev = getObject<GPUDevice>(state, deviceHandle)
      if (!dev) return 0
      const size = Number(readU64(state, descriptorPtr + 16)) // offset of size in WGPUBufferDescriptor
      const usage = readU32(state, descriptorPtr + 24)
      const mappedAtCreation = readU32(state, descriptorPtr + 28) !== 0
      const buffer = dev.createBuffer({ size, usage, mappedAtCreation })
      return registerObject(state, buffer)
    },

    wgpuDeviceCreateTexture(deviceHandle: number, descriptorPtr: number): number {
      const dev = getObject<GPUDevice>(state, deviceHandle)
      if (!dev) return 0
      // Parse WGPUTextureDescriptor from WASM memory
      // Layout depends on generated struct — this is approximate
      const usage = readU32(state, descriptorPtr + 16)
      const dimension = readU32(state, descriptorPtr + 20) // 1D=0, 2D=1, 3D=2
      const width = readU32(state, descriptorPtr + 24)
      const height = readU32(state, descriptorPtr + 28)
      const depthOrArrayLayers = readU32(state, descriptorPtr + 32)
      const mipLevelCount = readU32(state, descriptorPtr + 36)
      const sampleCount = readU32(state, descriptorPtr + 40)
      const formatEnum = readU32(state, descriptorPtr + 44)
      // TODO: proper format enum mapping (Dawn enum → WebGPU string)
      const format = formatEnum as unknown as GPUTextureFormat
      const texture = dev.createTexture({
        usage,
        dimension: (['1d', '2d', '3d'] as const)[dimension] ?? '2d',
        size: { width, height, depthOrArrayLayers },
        mipLevelCount,
        sampleCount,
        format,
      })
      return registerObject(state, texture)
    },

    wgpuDeviceCreateShaderModule(deviceHandle: number, descriptorPtr: number): number {
      const dev = getObject<GPUDevice>(state, deviceHandle)
      if (!dev) return 0
      // ShaderModuleDescriptor has a chained struct for WGSL source
      // For Graphite, all shaders are WGSL
      const nextInChainPtr = readU32(state, descriptorPtr)
      if (nextInChainPtr === 0) return 0
      // Read the WGSL source from the chained WGPUShaderSourceWGSL struct
      const code = readStringView(state, nextInChainPtr + 8) // offset past chain header
      if (!code) return 0
      const module = dev.createShaderModule({ code })
      return registerObject(state, module)
    },

    wgpuDeviceCreateBindGroupLayout: noop,
    wgpuDeviceCreateBindGroup: noop,
    wgpuDeviceCreatePipelineLayout: noop,
    wgpuDeviceCreateRenderPipeline: noop,
    wgpuDeviceCreateRenderPipelineAsync: noop,
    wgpuDeviceCreateComputePipeline: noop,
    wgpuDeviceCreateSampler: noop,
    wgpuDeviceCreateQuerySet: noop,

    wgpuDeviceCreateCommandEncoder(deviceHandle: number, _descriptorPtr: number): number {
      const dev = getObject<GPUDevice>(state, deviceHandle)
      if (!dev) return 0
      const encoder = dev.createCommandEncoder()
      return registerObject(state, encoder)
    },

    wgpuDeviceGetLimits: noop,
    wgpuDeviceHasFeature: noop,
    wgpuDeviceGetFeatures: noop,
    wgpuDeviceGetAdapter: noop,
    wgpuDeviceGetQueue(deviceHandle: number): number {
      return state.queueHandle
    },
    wgpuDeviceTick: noop,
    wgpuDeviceAddRef: noop,
    wgpuDeviceRelease: noop,
    wgpuDeviceSetUncapturedErrorCallback: noop,
    wgpuDeviceSetDeviceLostCallback: noop,
    wgpuDevicePopErrorScope: noop,
    wgpuDevicePushErrorScope: noop,
    wgpuDeviceDestroy: noop,

    // ── Queue ──
    wgpuQueueSubmit(queueHandle: number, commandCount: number, commandsPtr: number): void {
      const q = getObject<GPUQueue>(state, queueHandle)
      if (!q) return
      const buffers: GPUCommandBuffer[] = []
      for (let i = 0; i < commandCount; i++) {
        const cmdHandle = readU32(state, commandsPtr + i * 4)
        const cmd = getObject<GPUCommandBuffer>(state, cmdHandle)
        if (cmd) buffers.push(cmd)
      }
      q.submit(buffers)
    },
    wgpuQueueWriteBuffer: noop,
    wgpuQueueWriteTexture: noop,
    wgpuQueueAddRef: noop,
    wgpuQueueRelease: noop,
    wgpuQueueOnSubmittedWorkDone: noop,

    // ── Buffer ──
    wgpuBufferMapAsync: noop,
    wgpuBufferGetMappedRange: noop,
    wgpuBufferGetConstMappedRange: noop,
    wgpuBufferUnmap: noop,
    wgpuBufferGetMapState: noop,
    wgpuBufferGetUsage: noop,
    wgpuBufferGetSize: noop,
    wgpuBufferAddRef: noop,
    wgpuBufferRelease(handle: number) { releaseObject(state, handle) },
    wgpuBufferDestroy(handle: number) {
      const buf = getObject<GPUBuffer>(state, handle)
      if (buf) buf.destroy()
      releaseObject(state, handle)
    },

    // ── Texture ──
    wgpuTextureCreateView(texHandle: number, _descriptorPtr: number): number {
      const tex = getObject<GPUTexture>(state, texHandle)
      if (!tex) return 0
      const view = tex.createView()
      return registerObject(state, view)
    },
    wgpuTextureGetWidth(texHandle: number): number {
      return getObject<GPUTexture>(state, texHandle)?.width ?? 0
    },
    wgpuTextureGetHeight(texHandle: number): number {
      return getObject<GPUTexture>(state, texHandle)?.height ?? 0
    },
    wgpuTextureGetFormat(texHandle: number): number {
      // TODO: map GPUTextureFormat string to WGPUTextureFormat enum value
      return 0
    },
    wgpuTextureGetUsage(texHandle: number): number {
      return getObject<GPUTexture>(state, texHandle)?.usage ?? 0
    },
    wgpuTextureGetMipLevelCount(texHandle: number): number {
      return getObject<GPUTexture>(state, texHandle)?.mipLevelCount ?? 1
    },
    wgpuTextureGetSampleCount(texHandle: number): number {
      return getObject<GPUTexture>(state, texHandle)?.sampleCount ?? 1
    },
    wgpuTextureAddRef: noop,
    wgpuTextureRelease(handle: number) { releaseObject(state, handle) },
    wgpuTextureDestroy(handle: number) {
      const tex = getObject<GPUTexture>(state, handle)
      if (tex) tex.destroy()
      releaseObject(state, handle)
    },

    // ── TextureView ──
    wgpuTextureViewAddRef: noop,
    wgpuTextureViewRelease(handle: number) { releaseObject(state, handle) },

    // ── CommandEncoder ──
    wgpuCommandEncoderBeginRenderPass: noop,
    wgpuCommandEncoderBeginComputePass: noop,
    wgpuCommandEncoderCopyBufferToBuffer: noop,
    wgpuCommandEncoderCopyBufferToTexture: noop,
    wgpuCommandEncoderCopyTextureToBuffer: noop,
    wgpuCommandEncoderCopyTextureToTexture: noop,
    wgpuCommandEncoderClearBuffer: noop,
    wgpuCommandEncoderFinish(encoderHandle: number, _descriptorPtr: number): number {
      const encoder = getObject<GPUCommandEncoder>(state, encoderHandle)
      if (!encoder) return 0
      const cmdBuffer = encoder.finish()
      return registerObject(state, cmdBuffer)
    },
    wgpuCommandEncoderAddRef: noop,
    wgpuCommandEncoderRelease(handle: number) { releaseObject(state, handle) },

    // ── RenderPassEncoder ──
    wgpuRenderPassEncoderSetPipeline: noop,
    wgpuRenderPassEncoderSetBindGroup: noop,
    wgpuRenderPassEncoderSetVertexBuffer: noop,
    wgpuRenderPassEncoderSetIndexBuffer: noop,
    wgpuRenderPassEncoderSetViewport: noop,
    wgpuRenderPassEncoderSetScissorRect: noop,
    wgpuRenderPassEncoderSetBlendConstant: noop,
    wgpuRenderPassEncoderDraw: noop,
    wgpuRenderPassEncoderDrawIndexed: noop,
    wgpuRenderPassEncoderDrawIndirect: noop,
    wgpuRenderPassEncoderDrawIndexedIndirect: noop,
    wgpuRenderPassEncoderEnd: noop,
    wgpuRenderPassEncoderAddRef: noop,
    wgpuRenderPassEncoderRelease: noop,

    // ── ComputePassEncoder ──
    wgpuComputePassEncoderSetPipeline: noop,
    wgpuComputePassEncoderSetBindGroup: noop,
    wgpuComputePassEncoderDispatchWorkgroups: noop,
    wgpuComputePassEncoderDispatchWorkgroupsIndirect: noop,
    wgpuComputePassEncoderEnd: noop,
    wgpuComputePassEncoderAddRef: noop,
    wgpuComputePassEncoderRelease: noop,

    // ── CommandBuffer ──
    wgpuCommandBufferAddRef: noop,
    wgpuCommandBufferRelease(handle: number) { releaseObject(state, handle) },

    // ── RenderPipeline ──
    wgpuRenderPipelineAddRef: noop,
    wgpuRenderPipelineRelease(handle: number) { releaseObject(state, handle) },
    wgpuRenderPipelineGetBindGroupLayout: noop,

    // ── ComputePipeline ──
    wgpuComputePipelineAddRef: noop,
    wgpuComputePipelineRelease(handle: number) { releaseObject(state, handle) },
    wgpuComputePipelineGetBindGroupLayout: noop,

    // ── Sampler ──
    wgpuSamplerAddRef: noop,
    wgpuSamplerRelease(handle: number) { releaseObject(state, handle) },

    // ── ShaderModule ──
    wgpuShaderModuleAddRef: noop,
    wgpuShaderModuleRelease(handle: number) { releaseObject(state, handle) },
    wgpuShaderModuleGetCompilationInfo: noop,

    // ── BindGroup / BindGroupLayout ──
    wgpuBindGroupAddRef: noop,
    wgpuBindGroupRelease(handle: number) { releaseObject(state, handle) },
    wgpuBindGroupLayoutAddRef: noop,
    wgpuBindGroupLayoutRelease(handle: number) { releaseObject(state, handle) },

    // ── PipelineLayout ──
    wgpuPipelineLayoutAddRef: noop,
    wgpuPipelineLayoutRelease(handle: number) { releaseObject(state, handle) },

    // ── QuerySet ──
    wgpuQuerySetAddRef: noop,
    wgpuQuerySetRelease(handle: number) { releaseObject(state, handle) },
    wgpuQuerySetDestroy(handle: number) { releaseObject(state, handle) },

    // ── Surface (not used — Three.js manages surfaces) ──
    wgpuSurfaceAddRef: noop,
    wgpuSurfaceRelease: noop,

    // ── Instance lifecycle ──
    wgpuInstanceAddRef: noop,
    wgpuInstanceRelease: noop,
    wgpuInstanceProcessEvents: noop,
    wgpuInstanceRequestAdapter: noop,
    wgpuInstanceCreateSurface: noop,
    wgpuInstanceWaitAny: noop,

    // ── Memory management ──
    wgpuAdapterInfoFreeMembers: noop,
    wgpuAdapterPropertiesMemoryHeapsFreeMembers: noop,
    wgpuSupportedFeaturesFreeMembers: noop,
    wgpuSupportedWGSLLanguageFeaturesFreeMembers: noop,
    wgpuSurfaceCapabilitiesFreeMembers: noop,

    // ── Render bundles ──
    wgpuRenderBundleAddRef: noop,
    wgpuRenderBundleRelease: noop,
    wgpuRenderBundleEncoderFinish: noop,
    wgpuRenderBundleEncoderAddRef: noop,
    wgpuRenderBundleEncoderRelease: noop,
    wgpuDeviceCreateRenderBundleEncoder: noop,

    // ── External textures (Dawn extensions) ──
    wgpuExternalTextureAddRef: noop,
    wgpuExternalTextureRelease: noop,
    wgpuDeviceCreateExternalTexture: noop,

    // ── Shared resources (Dawn extensions) ──
    wgpuSharedBufferMemoryAddRef: noop,
    wgpuSharedBufferMemoryRelease: noop,
    wgpuSharedTextureMemoryAddRef: noop,
    wgpuSharedTextureMemoryRelease: noop,
    wgpuSharedFenceAddRef: noop,
    wgpuSharedFenceRelease: noop,
  }

  // Wrap in a Proxy so any unimplemented wgpu function returns a no-op stub
  // instead of causing a "function import requires a callable" error.
  return new Proxy(impl, {
    get: (target, name) => {
      if (typeof name !== 'string') return undefined
      if (name in target) return target[name]
      return (..._args: unknown[]) => 0
    },
  })
}

// ── Public API ──

export interface SkiaWGPUWasmInstance {
  exports: WebAssembly.Exports & {
    memory: WebAssembly.Memory
    skia_init_dawn: (deviceHandle: number, queueHandle: number) => void
    exports_skia_wgpu_destroy: () => void
    exports_skia_wgpu_begin_drawing: (targetHandle: number, w: number, h: number, retPtr: number) => number
    exports_skia_wgpu_end_drawing: () => void
    exports_skia_wgpu_flush: () => void
  }
  wgpuState: WGPUState
}

export async function loadSkiaWGPU(
  wasmUrl: string | URL,
  device: GPUDevice,
  preloadedResponse?: Promise<Response>,
): Promise<SkiaWGPUWasmInstance> {
  const state = createWGPUState(device)

  const importObject: WebAssembly.Imports = {
    wgpu: createWGPUImports(state),
    env: createEnvImports(),
    wasi_snapshot_preview1: createWasiImports(() => state.memory),
  }

  const response = preloadedResponse ?? fetch(wasmUrl)
  const { instance } = await instantiateWasm(response, importObject)

  // Wire up memory reference so wgpu/WASI imports can read/write WASM memory
  state.memory = instance.exports.memory as WebAssembly.Memory

  return {
    exports: instance.exports as SkiaWGPUWasmInstance['exports'],
    wgpuState: state,
  }
}
