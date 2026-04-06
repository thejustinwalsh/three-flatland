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

import { createEnvImports, createWasiImports } from './wasm-loader-shared'

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
  return new Uint32Array(state.memory.buffer, ptr, 1)[0]
}

function readU64(state: WGPUState, ptr: number): bigint {
  return new BigUint64Array(state.memory.buffer, ptr, 1)[0]
}

function readF32(state: WGPUState, ptr: number): number {
  return new Float32Array(state.memory.buffer, ptr, 1)[0]
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

  // Helper to create a default stub that logs unimplemented calls in dev
  const stub = (name: string) => (..._args: unknown[]) => {
    if (typeof console !== 'undefined' && (globalThis as Record<string, unknown>).__SKIA_WGPU_DEBUG) {
      console.warn(`[skia-wgpu] unimplemented: ${name}`)
    }
    return 0
  }

  return {
    // ── Instance ──
    wgpuCreateInstance: stub('wgpuCreateInstance'),
    wgpuGetInstanceFeatures: stub('wgpuGetInstanceFeatures'),
    wgpuGetInstanceLimits: stub('wgpuGetInstanceLimits'),
    wgpuHasInstanceFeature: stub('wgpuHasInstanceFeature'),
    wgpuGetProcAddress: stub('wgpuGetProcAddress'),

    // ── Adapter ──
    wgpuAdapterCreateDevice: stub('wgpuAdapterCreateDevice'),
    wgpuAdapterGetFeatures: stub('wgpuAdapterGetFeatures'),
    wgpuAdapterGetFormatCapabilities: stub('wgpuAdapterGetFormatCapabilities'),
    wgpuAdapterGetInfo: stub('wgpuAdapterGetInfo'),
    wgpuAdapterGetInstance: stub('wgpuAdapterGetInstance'),
    wgpuAdapterGetLimits: stub('wgpuAdapterGetLimits'),
    wgpuAdapterHasFeature: stub('wgpuAdapterHasFeature'),
    wgpuAdapterRequestDevice: stub('wgpuAdapterRequestDevice'),
    wgpuAdapterAddRef: stub('wgpuAdapterAddRef'),
    wgpuAdapterRelease: stub('wgpuAdapterRelease'),

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
      const format = readU32(state, descriptorPtr + 44) as GPUTextureFormat
      // TODO: proper format enum mapping
      const texture = dev.createTexture({
        usage,
        dimension: (['1d', '2d', '3d'] as const)[dimension] ?? '2d',
        size: { width, height, depthOrArrayLayers },
        mipLevelCount,
        sampleCount,
        format: format as unknown as GPUTextureFormat,
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

    wgpuDeviceCreateBindGroupLayout: stub('wgpuDeviceCreateBindGroupLayout'),
    wgpuDeviceCreateBindGroup: stub('wgpuDeviceCreateBindGroup'),
    wgpuDeviceCreatePipelineLayout: stub('wgpuDeviceCreatePipelineLayout'),
    wgpuDeviceCreateRenderPipeline: stub('wgpuDeviceCreateRenderPipeline'),
    wgpuDeviceCreateRenderPipelineAsync: stub('wgpuDeviceCreateRenderPipelineAsync'),
    wgpuDeviceCreateComputePipeline: stub('wgpuDeviceCreateComputePipeline'),
    wgpuDeviceCreateSampler: stub('wgpuDeviceCreateSampler'),
    wgpuDeviceCreateQuerySet: stub('wgpuDeviceCreateQuerySet'),

    wgpuDeviceCreateCommandEncoder(deviceHandle: number, _descriptorPtr: number): number {
      const dev = getObject<GPUDevice>(state, deviceHandle)
      if (!dev) return 0
      const encoder = dev.createCommandEncoder()
      return registerObject(state, encoder)
    },

    wgpuDeviceGetLimits: stub('wgpuDeviceGetLimits'),
    wgpuDeviceHasFeature: stub('wgpuDeviceHasFeature'),
    wgpuDeviceGetFeatures: stub('wgpuDeviceGetFeatures'),
    wgpuDeviceGetAdapter: stub('wgpuDeviceGetAdapter'),
    wgpuDeviceGetQueue(deviceHandle: number): number {
      return state.queueHandle
    },
    wgpuDeviceTick: stub('wgpuDeviceTick'),
    wgpuDeviceAddRef: stub('wgpuDeviceAddRef'),
    wgpuDeviceRelease: stub('wgpuDeviceRelease'),
    wgpuDeviceSetUncapturedErrorCallback: stub('wgpuDeviceSetUncapturedErrorCallback'),
    wgpuDeviceSetDeviceLostCallback: stub('wgpuDeviceSetDeviceLostCallback'),
    wgpuDevicePopErrorScope: stub('wgpuDevicePopErrorScope'),
    wgpuDevicePushErrorScope: stub('wgpuDevicePushErrorScope'),
    wgpuDeviceDestroy: stub('wgpuDeviceDestroy'),

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
    wgpuQueueWriteBuffer: stub('wgpuQueueWriteBuffer'),
    wgpuQueueWriteTexture: stub('wgpuQueueWriteTexture'),
    wgpuQueueAddRef: stub('wgpuQueueAddRef'),
    wgpuQueueRelease: stub('wgpuQueueRelease'),
    wgpuQueueOnSubmittedWorkDone: stub('wgpuQueueOnSubmittedWorkDone'),

    // ── Buffer ──
    wgpuBufferMapAsync: stub('wgpuBufferMapAsync'),
    wgpuBufferGetMappedRange: stub('wgpuBufferGetMappedRange'),
    wgpuBufferGetConstMappedRange: stub('wgpuBufferGetConstMappedRange'),
    wgpuBufferUnmap: stub('wgpuBufferUnmap'),
    wgpuBufferGetMapState: stub('wgpuBufferGetMapState'),
    wgpuBufferGetUsage: stub('wgpuBufferGetUsage'),
    wgpuBufferGetSize: stub('wgpuBufferGetSize'),
    wgpuBufferAddRef: stub('wgpuBufferAddRef'),
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
    wgpuTextureAddRef: stub('wgpuTextureAddRef'),
    wgpuTextureRelease(handle: number) { releaseObject(state, handle) },
    wgpuTextureDestroy(handle: number) {
      const tex = getObject<GPUTexture>(state, handle)
      if (tex) tex.destroy()
      releaseObject(state, handle)
    },

    // ── TextureView ──
    wgpuTextureViewAddRef: stub('wgpuTextureViewAddRef'),
    wgpuTextureViewRelease(handle: number) { releaseObject(state, handle) },

    // ── CommandEncoder ──
    wgpuCommandEncoderBeginRenderPass: stub('wgpuCommandEncoderBeginRenderPass'),
    wgpuCommandEncoderBeginComputePass: stub('wgpuCommandEncoderBeginComputePass'),
    wgpuCommandEncoderCopyBufferToBuffer: stub('wgpuCommandEncoderCopyBufferToBuffer'),
    wgpuCommandEncoderCopyBufferToTexture: stub('wgpuCommandEncoderCopyBufferToTexture'),
    wgpuCommandEncoderCopyTextureToBuffer: stub('wgpuCommandEncoderCopyTextureToBuffer'),
    wgpuCommandEncoderCopyTextureToTexture: stub('wgpuCommandEncoderCopyTextureToTexture'),
    wgpuCommandEncoderClearBuffer: stub('wgpuCommandEncoderClearBuffer'),
    wgpuCommandEncoderFinish(encoderHandle: number, _descriptorPtr: number): number {
      const encoder = getObject<GPUCommandEncoder>(state, encoderHandle)
      if (!encoder) return 0
      const cmdBuffer = encoder.finish()
      return registerObject(state, cmdBuffer)
    },
    wgpuCommandEncoderAddRef: stub('wgpuCommandEncoderAddRef'),
    wgpuCommandEncoderRelease(handle: number) { releaseObject(state, handle) },

    // ── RenderPassEncoder ──
    wgpuRenderPassEncoderSetPipeline: stub('wgpuRenderPassEncoderSetPipeline'),
    wgpuRenderPassEncoderSetBindGroup: stub('wgpuRenderPassEncoderSetBindGroup'),
    wgpuRenderPassEncoderSetVertexBuffer: stub('wgpuRenderPassEncoderSetVertexBuffer'),
    wgpuRenderPassEncoderSetIndexBuffer: stub('wgpuRenderPassEncoderSetIndexBuffer'),
    wgpuRenderPassEncoderSetViewport: stub('wgpuRenderPassEncoderSetViewport'),
    wgpuRenderPassEncoderSetScissorRect: stub('wgpuRenderPassEncoderSetScissorRect'),
    wgpuRenderPassEncoderSetBlendConstant: stub('wgpuRenderPassEncoderSetBlendConstant'),
    wgpuRenderPassEncoderDraw: stub('wgpuRenderPassEncoderDraw'),
    wgpuRenderPassEncoderDrawIndexed: stub('wgpuRenderPassEncoderDrawIndexed'),
    wgpuRenderPassEncoderDrawIndirect: stub('wgpuRenderPassEncoderDrawIndirect'),
    wgpuRenderPassEncoderDrawIndexedIndirect: stub('wgpuRenderPassEncoderDrawIndexedIndirect'),
    wgpuRenderPassEncoderEnd: stub('wgpuRenderPassEncoderEnd'),
    wgpuRenderPassEncoderAddRef: stub('wgpuRenderPassEncoderAddRef'),
    wgpuRenderPassEncoderRelease: stub('wgpuRenderPassEncoderRelease'),

    // ── ComputePassEncoder ──
    wgpuComputePassEncoderSetPipeline: stub('wgpuComputePassEncoderSetPipeline'),
    wgpuComputePassEncoderSetBindGroup: stub('wgpuComputePassEncoderSetBindGroup'),
    wgpuComputePassEncoderDispatchWorkgroups: stub('wgpuComputePassEncoderDispatchWorkgroups'),
    wgpuComputePassEncoderDispatchWorkgroupsIndirect: stub('wgpuComputePassEncoderDispatchWorkgroupsIndirect'),
    wgpuComputePassEncoderEnd: stub('wgpuComputePassEncoderEnd'),
    wgpuComputePassEncoderAddRef: stub('wgpuComputePassEncoderAddRef'),
    wgpuComputePassEncoderRelease: stub('wgpuComputePassEncoderRelease'),

    // ── CommandBuffer ──
    wgpuCommandBufferAddRef: stub('wgpuCommandBufferAddRef'),
    wgpuCommandBufferRelease(handle: number) { releaseObject(state, handle) },

    // ── RenderPipeline ──
    wgpuRenderPipelineAddRef: stub('wgpuRenderPipelineAddRef'),
    wgpuRenderPipelineRelease(handle: number) { releaseObject(state, handle) },
    wgpuRenderPipelineGetBindGroupLayout: stub('wgpuRenderPipelineGetBindGroupLayout'),

    // ── ComputePipeline ──
    wgpuComputePipelineAddRef: stub('wgpuComputePipelineAddRef'),
    wgpuComputePipelineRelease(handle: number) { releaseObject(state, handle) },
    wgpuComputePipelineGetBindGroupLayout: stub('wgpuComputePipelineGetBindGroupLayout'),

    // ── Sampler ──
    wgpuSamplerAddRef: stub('wgpuSamplerAddRef'),
    wgpuSamplerRelease(handle: number) { releaseObject(state, handle) },

    // ── ShaderModule ──
    wgpuShaderModuleAddRef: stub('wgpuShaderModuleAddRef'),
    wgpuShaderModuleRelease(handle: number) { releaseObject(state, handle) },
    wgpuShaderModuleGetCompilationInfo: stub('wgpuShaderModuleGetCompilationInfo'),

    // ── BindGroup / BindGroupLayout ──
    wgpuBindGroupAddRef: stub('wgpuBindGroupAddRef'),
    wgpuBindGroupRelease(handle: number) { releaseObject(state, handle) },
    wgpuBindGroupLayoutAddRef: stub('wgpuBindGroupLayoutAddRef'),
    wgpuBindGroupLayoutRelease(handle: number) { releaseObject(state, handle) },

    // ── PipelineLayout ──
    wgpuPipelineLayoutAddRef: stub('wgpuPipelineLayoutAddRef'),
    wgpuPipelineLayoutRelease(handle: number) { releaseObject(state, handle) },

    // ── QuerySet ──
    wgpuQuerySetAddRef: stub('wgpuQuerySetAddRef'),
    wgpuQuerySetRelease(handle: number) { releaseObject(state, handle) },
    wgpuQuerySetDestroy(handle: number) { releaseObject(state, handle) },

    // ── Surface (not used — Three.js manages surfaces) ──
    wgpuSurfaceAddRef: stub('wgpuSurfaceAddRef'),
    wgpuSurfaceRelease: stub('wgpuSurfaceRelease'),

    // ── Instance lifecycle ──
    wgpuInstanceAddRef: stub('wgpuInstanceAddRef'),
    wgpuInstanceRelease: stub('wgpuInstanceRelease'),
    wgpuInstanceProcessEvents: stub('wgpuInstanceProcessEvents'),
    wgpuInstanceRequestAdapter: stub('wgpuInstanceRequestAdapter'),
    wgpuInstanceCreateSurface: stub('wgpuInstanceCreateSurface'),
    wgpuInstanceWaitAny: stub('wgpuInstanceWaitAny'),

    // ── Memory management ──
    wgpuAdapterInfoFreeMembers: stub('wgpuAdapterInfoFreeMembers'),
    wgpuAdapterPropertiesMemoryHeapsFreeMembers: stub('wgpuAdapterPropertiesMemoryHeapsFreeMembers'),
    wgpuSupportedFeaturesFreeMembers: stub('wgpuSupportedFeaturesFreeMembers'),
    wgpuSupportedWGSLLanguageFeaturesFreeMembers: stub('wgpuSupportedWGSLLanguageFeaturesFreeMembers'),
    wgpuSurfaceCapabilitiesFreeMembers: stub('wgpuSurfaceCapabilitiesFreeMembers'),

    // ── Render bundles ──
    wgpuRenderBundleAddRef: stub('wgpuRenderBundleAddRef'),
    wgpuRenderBundleRelease: stub('wgpuRenderBundleRelease'),
    wgpuRenderBundleEncoderFinish: stub('wgpuRenderBundleEncoderFinish'),
    wgpuRenderBundleEncoderAddRef: stub('wgpuRenderBundleEncoderAddRef'),
    wgpuRenderBundleEncoderRelease: stub('wgpuRenderBundleEncoderRelease'),
    wgpuDeviceCreateRenderBundleEncoder: stub('wgpuDeviceCreateRenderBundleEncoder'),

    // ── External textures (Dawn extensions) ──
    wgpuExternalTextureAddRef: stub('wgpuExternalTextureAddRef'),
    wgpuExternalTextureRelease: stub('wgpuExternalTextureRelease'),
    wgpuDeviceCreateExternalTexture: stub('wgpuDeviceCreateExternalTexture'),

    // ── Shared resources (Dawn extensions) ──
    wgpuSharedBufferMemoryAddRef: stub('wgpuSharedBufferMemoryAddRef'),
    wgpuSharedBufferMemoryRelease: stub('wgpuSharedBufferMemoryRelease'),
    wgpuSharedTextureMemoryAddRef: stub('wgpuSharedTextureMemoryAddRef'),
    wgpuSharedTextureMemoryRelease: stub('wgpuSharedTextureMemoryRelease'),
    wgpuSharedFenceAddRef: stub('wgpuSharedFenceAddRef'),
    wgpuSharedFenceRelease: stub('wgpuSharedFenceRelease'),
  }
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
    wasi_snapshot_preview1: createWasiImports(),
  }

  const response = preloadedResponse ? await preloadedResponse : await fetch(wasmUrl)
  const { instance } = await WebAssembly.instantiateStreaming(response, importObject)

  // Wire up memory reference so wgpu imports can read/write WASM memory
  state.memory = instance.exports.memory as WebAssembly.Memory

  return {
    exports: instance.exports as SkiaWGPUWasmInstance['exports'],
    wgpuState: state,
  }
}
