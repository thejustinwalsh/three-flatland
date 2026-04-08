/**
 * Minimal WebGPU blit pipeline for compositing Skia textures onto a destination.
 *
 * Uses a vertex-less fullscreen triangle (no vertex buffers) with a fragment
 * shader that samples the source texture. The GPU handles format conversion
 * (e.g., RGBA→BGRA) automatically through the pipeline.
 *
 * Supports premultiplied alpha blending for overlay compositing.
 *
 * @internal
 */

const BLIT_WGSL = /* wgsl */`
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vsFlip(@builtin(vertex_index) i: u32) -> VOut {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return VOut(vec4f(uv * 2.0 - 1.0, 0.0, 1.0), vec2f(uv.x, 1.0 - uv.y));
}

@vertex fn vsNoFlip(@builtin(vertex_index) i: u32) -> VOut {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return VOut(vec4f(uv * 2.0 - 1.0, 0.0, 1.0), uv);
}

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(tex, samp, uv);
}
`

export class SkiaBlitPipeline {
  private device: GPUDevice
  private sampler: GPUSampler
  private bindGroupLayout: GPUBindGroupLayout
  private pipelines = new Map<string, GPURenderPipeline>()
  private bindGroups = new Map<GPUTexture, GPUBindGroup>()
  private shaderModule: GPUShaderModule

  constructor(device: GPUDevice) {
    this.device = device
    this.shaderModule = device.createShaderModule({ code: BLIT_WGSL })
    this.sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' })
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    })
  }

  private getPipeline(destFormat: GPUTextureFormat, blend: boolean, flipY: boolean): GPURenderPipeline {
    const key = `${destFormat}:${blend}:${flipY}`
    let pipeline = this.pipelines.get(key)
    if (pipeline) return pipeline

    pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module: this.shaderModule, entryPoint: flipY ? 'vsFlip' : 'vsNoFlip' },
      fragment: {
        module: this.shaderModule,
        entryPoint: 'fs',
        targets: [{
          format: destFormat,
          ...(blend ? {
            blend: {
              // Premultiplied alpha: src*1 + dst*(1-srcAlpha)
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          } : {}),
        }],
      },
      primitive: { topology: 'triangle-list' },
    })
    this.pipelines.set(key, pipeline)
    return pipeline
  }

  private lastSource: GPUTexture | null = null
  private lastBindGroup: GPUBindGroup | null = null

  private getBindGroup(source: GPUTexture): GPUBindGroup {
    if (source === this.lastSource && this.lastBindGroup) return this.lastBindGroup

    this.lastSource = source
    this.lastBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: source.createView() },
        { binding: 1, resource: this.sampler },
      ],
    })
    return this.lastBindGroup
  }

  /**
   * Blit source texture to destination texture.
   * @param source - Source texture (any format, must have TEXTURE_BINDING)
   * @param dest - Destination texture (must have RENDER_ATTACHMENT)
   * @param blend - If true, uses premultiplied alpha blending (for overlay)
   * @param flipY - If true, flip Y (needed for canvas targets, not for render targets)
   */
  blit(source: GPUTexture, dest: GPUTexture, blend: boolean, flipY = true): void {
    const pipeline = this.getPipeline(dest.format, blend, flipY)
    const bindGroup = this.getBindGroup(source)

    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: dest.createView(),
        loadOp: blend ? 'load' : 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }],
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindGroup)
    pass.draw(3) // fullscreen triangle
    pass.end()

    this.device.queue.submit([encoder.finish()])
  }

  /** Clear cached bind groups (call when source textures change) */
  clearCache(): void {
    this.bindGroups.clear()
  }
}
