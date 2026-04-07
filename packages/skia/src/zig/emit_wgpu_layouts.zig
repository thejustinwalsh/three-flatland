//! Comptime struct layout emitter for Dawn WebGPU types.
//!
//! Builds as a standalone WASI executable that prints JSON to stdout.
//! Uses @offsetOf and @sizeOf on the actual C structs to produce
//! provably correct field offsets for the wasm32 ABI.
//!
//! Output is captured by the build script and written to
//! dist/wgpu-layouts.json. TypeScript imports this JSON directly.
//!
//! Usage: zig build-exe ... && ./emit_wgpu_layouts > dist/wgpu-layouts.json

const std = @import("std");
// Import Dawn's webgpu.h directly — not skia_gl.h which is the GL-only WIT header
const c = @cImport({
    @cInclude("webgpu.h");
});

const Writer = std.io.AnyWriter;

// ── Field descriptor ──

const FieldType = enum {
    ptr,
    u32,
    i32,
    u16,
    u64,
    f32,
    f64,
};

fn fieldTypeStr(comptime ft: FieldType) []const u8 {
    return switch (ft) {
        .ptr => "ptr",
        .u32 => "u32",
        .i32 => "i32",
        .u16 => "u16",
        .u64 => "u64",
        .f32 => "f32",
        .f64 => "f64",
    };
}

const Field = struct {
    name: []const u8,
    offset: usize,
    size: usize,
    field_type: FieldType,
};

// ── Struct descriptor builder ──

fn StructFields(comptime T: type) type {
    _ = T;
    return struct {
        fields: []const Field,
        size: usize,
        name: []const u8,
    };
}

fn makeField(comptime T: type, comptime c_name: []const u8, comptime ts_name: []const u8, comptime ft: FieldType) Field {
    return .{
        .name = ts_name,
        .offset = @offsetOf(T, c_name),
        .size = @sizeOf(@TypeOf(@field(@as(T, undefined), c_name))),
        .field_type = ft,
    };
}

fn makeStruct(comptime T: type, comptime name: []const u8, comptime fields: []const Field) StructFields(T) {
    return .{
        .fields = fields,
        .size = @sizeOf(T),
        .name = name,
    };
}

// Helper to get a zero-initialized value for @field access
fn zeroInit(comptime T: type) T {
    return std.mem.zeroes(T);
}

// ── Struct definitions ──
// Each entry maps C struct fields to TypeScript field names.
// The comptime @offsetOf calls ensure correctness.

const structs = .{
    makeStruct(c.WGPUStringView, "WGPUStringView", &.{
        .{ .name = "data", .offset = @offsetOf(c.WGPUStringView, "data"), .size = 4, .field_type = .ptr },
        .{ .name = "length", .offset = @offsetOf(c.WGPUStringView, "length"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUChainedStruct, "WGPUChainedStruct", &.{
        .{ .name = "next", .offset = @offsetOf(c.WGPUChainedStruct, "next"), .size = 4, .field_type = .ptr },
        .{ .name = "sType", .offset = @offsetOf(c.WGPUChainedStruct, "sType"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUExtent3D, "WGPUExtent3D", &.{
        .{ .name = "width", .offset = @offsetOf(c.WGPUExtent3D, "width"), .size = 4, .field_type = .u32 },
        .{ .name = "height", .offset = @offsetOf(c.WGPUExtent3D, "height"), .size = 4, .field_type = .u32 },
        .{ .name = "depthOrArrayLayers", .offset = @offsetOf(c.WGPUExtent3D, "depthOrArrayLayers"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUColor, "WGPUColor", &.{
        .{ .name = "r", .offset = @offsetOf(c.WGPUColor, "r"), .size = 8, .field_type = .f64 },
        .{ .name = "g", .offset = @offsetOf(c.WGPUColor, "g"), .size = 8, .field_type = .f64 },
        .{ .name = "b", .offset = @offsetOf(c.WGPUColor, "b"), .size = 8, .field_type = .f64 },
        .{ .name = "a", .offset = @offsetOf(c.WGPUColor, "a"), .size = 8, .field_type = .f64 },
    }),
    makeStruct(c.WGPUBufferDescriptor, "WGPUBufferDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUBufferDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUBufferDescriptor, "label"), .size = 8, .field_type = .ptr }, // WGPUStringView
        .{ .name = "usage", .offset = @offsetOf(c.WGPUBufferDescriptor, "usage"), .size = 8, .field_type = .u64 },
        .{ .name = "size", .offset = @offsetOf(c.WGPUBufferDescriptor, "size"), .size = 8, .field_type = .u64 },
        .{ .name = "mappedAtCreation", .offset = @offsetOf(c.WGPUBufferDescriptor, "mappedAtCreation"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUTextureDescriptor, "WGPUTextureDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUTextureDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUTextureDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "usage", .offset = @offsetOf(c.WGPUTextureDescriptor, "usage"), .size = 8, .field_type = .u64 },
        .{ .name = "dimension", .offset = @offsetOf(c.WGPUTextureDescriptor, "dimension"), .size = 4, .field_type = .u32 },
        .{ .name = "size", .offset = @offsetOf(c.WGPUTextureDescriptor, "size"), .size = 12, .field_type = .u32 }, // WGPUExtent3D embedded
        .{ .name = "format", .offset = @offsetOf(c.WGPUTextureDescriptor, "format"), .size = 4, .field_type = .u32 },
        .{ .name = "mipLevelCount", .offset = @offsetOf(c.WGPUTextureDescriptor, "mipLevelCount"), .size = 4, .field_type = .u32 },
        .{ .name = "sampleCount", .offset = @offsetOf(c.WGPUTextureDescriptor, "sampleCount"), .size = 4, .field_type = .u32 },
        .{ .name = "viewFormatCount", .offset = @offsetOf(c.WGPUTextureDescriptor, "viewFormatCount"), .size = 4, .field_type = .u32 },
        .{ .name = "viewFormats", .offset = @offsetOf(c.WGPUTextureDescriptor, "viewFormats"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPUShaderModuleDescriptor, "WGPUShaderModuleDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUShaderModuleDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUShaderModuleDescriptor, "label"), .size = 8, .field_type = .ptr },
    }),
    makeStruct(c.WGPUSamplerDescriptor, "WGPUSamplerDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUSamplerDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUSamplerDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "addressModeU", .offset = @offsetOf(c.WGPUSamplerDescriptor, "addressModeU"), .size = 4, .field_type = .u32 },
        .{ .name = "addressModeV", .offset = @offsetOf(c.WGPUSamplerDescriptor, "addressModeV"), .size = 4, .field_type = .u32 },
        .{ .name = "addressModeW", .offset = @offsetOf(c.WGPUSamplerDescriptor, "addressModeW"), .size = 4, .field_type = .u32 },
        .{ .name = "magFilter", .offset = @offsetOf(c.WGPUSamplerDescriptor, "magFilter"), .size = 4, .field_type = .u32 },
        .{ .name = "minFilter", .offset = @offsetOf(c.WGPUSamplerDescriptor, "minFilter"), .size = 4, .field_type = .u32 },
        .{ .name = "mipmapFilter", .offset = @offsetOf(c.WGPUSamplerDescriptor, "mipmapFilter"), .size = 4, .field_type = .u32 },
        .{ .name = "lodMinClamp", .offset = @offsetOf(c.WGPUSamplerDescriptor, "lodMinClamp"), .size = 4, .field_type = .f32 },
        .{ .name = "lodMaxClamp", .offset = @offsetOf(c.WGPUSamplerDescriptor, "lodMaxClamp"), .size = 4, .field_type = .f32 },
        .{ .name = "compare", .offset = @offsetOf(c.WGPUSamplerDescriptor, "compare"), .size = 4, .field_type = .u32 },
        .{ .name = "maxAnisotropy", .offset = @offsetOf(c.WGPUSamplerDescriptor, "maxAnisotropy"), .size = 2, .field_type = .u16 },
    }),
    makeStruct(c.WGPUBindGroupLayoutDescriptor, "WGPUBindGroupLayoutDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUBindGroupLayoutDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUBindGroupLayoutDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "entryCount", .offset = @offsetOf(c.WGPUBindGroupLayoutDescriptor, "entryCount"), .size = 4, .field_type = .u32 },
        .{ .name = "entries", .offset = @offsetOf(c.WGPUBindGroupLayoutDescriptor, "entries"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPUBindGroupDescriptor, "WGPUBindGroupDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUBindGroupDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUBindGroupDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "layout", .offset = @offsetOf(c.WGPUBindGroupDescriptor, "layout"), .size = 4, .field_type = .ptr },
        .{ .name = "entryCount", .offset = @offsetOf(c.WGPUBindGroupDescriptor, "entryCount"), .size = 4, .field_type = .u32 },
        .{ .name = "entries", .offset = @offsetOf(c.WGPUBindGroupDescriptor, "entries"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPUPipelineLayoutDescriptor, "WGPUPipelineLayoutDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUPipelineLayoutDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUPipelineLayoutDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "bindGroupLayoutCount", .offset = @offsetOf(c.WGPUPipelineLayoutDescriptor, "bindGroupLayoutCount"), .size = 4, .field_type = .u32 },
        .{ .name = "bindGroupLayouts", .offset = @offsetOf(c.WGPUPipelineLayoutDescriptor, "bindGroupLayouts"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPURenderPassDescriptor, "WGPURenderPassDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPURenderPassDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPURenderPassDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "colorAttachmentCount", .offset = @offsetOf(c.WGPURenderPassDescriptor, "colorAttachmentCount"), .size = 4, .field_type = .u32 },
        .{ .name = "colorAttachments", .offset = @offsetOf(c.WGPURenderPassDescriptor, "colorAttachments"), .size = 4, .field_type = .ptr },
        .{ .name = "depthStencilAttachment", .offset = @offsetOf(c.WGPURenderPassDescriptor, "depthStencilAttachment"), .size = 4, .field_type = .ptr },
        .{ .name = "occlusionQuerySet", .offset = @offsetOf(c.WGPURenderPassDescriptor, "occlusionQuerySet"), .size = 4, .field_type = .ptr },
        .{ .name = "timestampWrites", .offset = @offsetOf(c.WGPURenderPassDescriptor, "timestampWrites"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPURenderPassColorAttachment, "WGPURenderPassColorAttachment", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPURenderPassColorAttachment, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "view", .offset = @offsetOf(c.WGPURenderPassColorAttachment, "view"), .size = 4, .field_type = .ptr },
        .{ .name = "depthSlice", .offset = @offsetOf(c.WGPURenderPassColorAttachment, "depthSlice"), .size = 4, .field_type = .u32 },
        .{ .name = "resolveTarget", .offset = @offsetOf(c.WGPURenderPassColorAttachment, "resolveTarget"), .size = 4, .field_type = .ptr },
        .{ .name = "loadOp", .offset = @offsetOf(c.WGPURenderPassColorAttachment, "loadOp"), .size = 4, .field_type = .u32 },
        .{ .name = "storeOp", .offset = @offsetOf(c.WGPURenderPassColorAttachment, "storeOp"), .size = 4, .field_type = .u32 },
        .{ .name = "clearValue", .offset = @offsetOf(c.WGPURenderPassColorAttachment, "clearValue"), .size = 32, .field_type = .f64 }, // WGPUColor
    }),
    makeStruct(c.WGPURenderPassDepthStencilAttachment, "WGPURenderPassDepthStencilAttachment", &.{
        .{ .name = "view", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "view"), .size = 4, .field_type = .ptr },
        .{ .name = "depthLoadOp", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "depthLoadOp"), .size = 4, .field_type = .u32 },
        .{ .name = "depthStoreOp", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "depthStoreOp"), .size = 4, .field_type = .u32 },
        .{ .name = "depthClearValue", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "depthClearValue"), .size = 4, .field_type = .f32 },
        .{ .name = "depthReadOnly", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "depthReadOnly"), .size = 4, .field_type = .u32 },
        .{ .name = "stencilLoadOp", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "stencilLoadOp"), .size = 4, .field_type = .u32 },
        .{ .name = "stencilStoreOp", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "stencilStoreOp"), .size = 4, .field_type = .u32 },
        .{ .name = "stencilClearValue", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "stencilClearValue"), .size = 4, .field_type = .u32 },
        .{ .name = "stencilReadOnly", .offset = @offsetOf(c.WGPURenderPassDepthStencilAttachment, "stencilReadOnly"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUColorTargetState, "WGPUColorTargetState", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUColorTargetState, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "format", .offset = @offsetOf(c.WGPUColorTargetState, "format"), .size = 4, .field_type = .u32 },
        .{ .name = "blend", .offset = @offsetOf(c.WGPUColorTargetState, "blend"), .size = 4, .field_type = .ptr },
        .{ .name = "writeMask", .offset = @offsetOf(c.WGPUColorTargetState, "writeMask"), .size = 8, .field_type = .u64 },
    }),
    makeStruct(c.WGPUBlendState, "WGPUBlendState", &.{
        .{ .name = "color", .offset = @offsetOf(c.WGPUBlendState, "color"), .size = 12, .field_type = .u32 }, // WGPUBlendComponent
        .{ .name = "alpha", .offset = @offsetOf(c.WGPUBlendState, "alpha"), .size = 12, .field_type = .u32 },
    }),
    makeStruct(c.WGPUVertexAttribute, "WGPUVertexAttribute", &.{
        .{ .name = "format", .offset = @offsetOf(c.WGPUVertexAttribute, "format"), .size = 4, .field_type = .u32 },
        .{ .name = "offset", .offset = @offsetOf(c.WGPUVertexAttribute, "offset"), .size = 8, .field_type = .u64 },
        .{ .name = "shaderLocation", .offset = @offsetOf(c.WGPUVertexAttribute, "shaderLocation"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUVertexBufferLayout, "WGPUVertexBufferLayout", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUVertexBufferLayout, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "stepMode", .offset = @offsetOf(c.WGPUVertexBufferLayout, "stepMode"), .size = 4, .field_type = .u32 },
        .{ .name = "arrayStride", .offset = @offsetOf(c.WGPUVertexBufferLayout, "arrayStride"), .size = 8, .field_type = .u64 },
        .{ .name = "attributeCount", .offset = @offsetOf(c.WGPUVertexBufferLayout, "attributeCount"), .size = 4, .field_type = .u32 },
        .{ .name = "attributes", .offset = @offsetOf(c.WGPUVertexBufferLayout, "attributes"), .size = 4, .field_type = .ptr },
    }),

    // ── Sub-struct types (used as inline fields in larger descriptors) ──

    makeStruct(c.WGPUOrigin3D, "WGPUOrigin3D", &.{
        .{ .name = "x", .offset = @offsetOf(c.WGPUOrigin3D, "x"), .size = 4, .field_type = .u32 },
        .{ .name = "y", .offset = @offsetOf(c.WGPUOrigin3D, "y"), .size = 4, .field_type = .u32 },
        .{ .name = "z", .offset = @offsetOf(c.WGPUOrigin3D, "z"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUStencilFaceState, "WGPUStencilFaceState", &.{
        .{ .name = "compare", .offset = @offsetOf(c.WGPUStencilFaceState, "compare"), .size = 4, .field_type = .u32 },
        .{ .name = "failOp", .offset = @offsetOf(c.WGPUStencilFaceState, "failOp"), .size = 4, .field_type = .u32 },
        .{ .name = "depthFailOp", .offset = @offsetOf(c.WGPUStencilFaceState, "depthFailOp"), .size = 4, .field_type = .u32 },
        .{ .name = "passOp", .offset = @offsetOf(c.WGPUStencilFaceState, "passOp"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUBufferBindingLayout, "WGPUBufferBindingLayout", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUBufferBindingLayout, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "type", .offset = @offsetOf(c.WGPUBufferBindingLayout, "type"), .size = 4, .field_type = .u32 },
        .{ .name = "hasDynamicOffset", .offset = @offsetOf(c.WGPUBufferBindingLayout, "hasDynamicOffset"), .size = 4, .field_type = .u32 },
        .{ .name = "minBindingSize", .offset = @offsetOf(c.WGPUBufferBindingLayout, "minBindingSize"), .size = 8, .field_type = .u64 },
    }),
    makeStruct(c.WGPUSamplerBindingLayout, "WGPUSamplerBindingLayout", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUSamplerBindingLayout, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "type", .offset = @offsetOf(c.WGPUSamplerBindingLayout, "type"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUTextureBindingLayout, "WGPUTextureBindingLayout", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUTextureBindingLayout, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "sampleType", .offset = @offsetOf(c.WGPUTextureBindingLayout, "sampleType"), .size = 4, .field_type = .u32 },
        .{ .name = "viewDimension", .offset = @offsetOf(c.WGPUTextureBindingLayout, "viewDimension"), .size = 4, .field_type = .u32 },
        .{ .name = "multisampled", .offset = @offsetOf(c.WGPUTextureBindingLayout, "multisampled"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUStorageTextureBindingLayout, "WGPUStorageTextureBindingLayout", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUStorageTextureBindingLayout, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "access", .offset = @offsetOf(c.WGPUStorageTextureBindingLayout, "access"), .size = 4, .field_type = .u32 },
        .{ .name = "format", .offset = @offsetOf(c.WGPUStorageTextureBindingLayout, "format"), .size = 4, .field_type = .u32 },
        .{ .name = "viewDimension", .offset = @offsetOf(c.WGPUStorageTextureBindingLayout, "viewDimension"), .size = 4, .field_type = .u32 },
    }),

    // ── Entry types (arrays of these are pointed to by descriptors) ──

    makeStruct(c.WGPUBindGroupEntry, "WGPUBindGroupEntry", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUBindGroupEntry, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "binding", .offset = @offsetOf(c.WGPUBindGroupEntry, "binding"), .size = 4, .field_type = .u32 },
        .{ .name = "buffer", .offset = @offsetOf(c.WGPUBindGroupEntry, "buffer"), .size = 4, .field_type = .ptr },
        .{ .name = "offset", .offset = @offsetOf(c.WGPUBindGroupEntry, "offset"), .size = 8, .field_type = .u64 },
        .{ .name = "size", .offset = @offsetOf(c.WGPUBindGroupEntry, "size"), .size = 8, .field_type = .u64 },
        .{ .name = "sampler", .offset = @offsetOf(c.WGPUBindGroupEntry, "sampler"), .size = 4, .field_type = .ptr },
        .{ .name = "textureView", .offset = @offsetOf(c.WGPUBindGroupEntry, "textureView"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPUBindGroupLayoutEntry, "WGPUBindGroupLayoutEntry", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUBindGroupLayoutEntry, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "binding", .offset = @offsetOf(c.WGPUBindGroupLayoutEntry, "binding"), .size = 4, .field_type = .u32 },
        .{ .name = "visibility", .offset = @offsetOf(c.WGPUBindGroupLayoutEntry, "visibility"), .size = 8, .field_type = .u64 },
        .{ .name = "bindingArraySize", .offset = @offsetOf(c.WGPUBindGroupLayoutEntry, "bindingArraySize"), .size = 4, .field_type = .u32 },
        // Inline sub-structs — offset gives the base, use standalone struct layouts for sub-fields
        .{ .name = "buffer", .offset = @offsetOf(c.WGPUBindGroupLayoutEntry, "buffer"), .size = @sizeOf(c.WGPUBufferBindingLayout), .field_type = .u32 },
        .{ .name = "sampler", .offset = @offsetOf(c.WGPUBindGroupLayoutEntry, "sampler"), .size = @sizeOf(c.WGPUSamplerBindingLayout), .field_type = .u32 },
        .{ .name = "texture", .offset = @offsetOf(c.WGPUBindGroupLayoutEntry, "texture"), .size = @sizeOf(c.WGPUTextureBindingLayout), .field_type = .u32 },
        .{ .name = "storageTexture", .offset = @offsetOf(c.WGPUBindGroupLayoutEntry, "storageTexture"), .size = @sizeOf(c.WGPUStorageTextureBindingLayout), .field_type = .u32 },
    }),

    // ── Shader source ──

    makeStruct(c.WGPUShaderSourceWGSL, "WGPUShaderSourceWGSL", &.{
        .{ .name = "chain", .offset = @offsetOf(c.WGPUShaderSourceWGSL, "chain"), .size = @sizeOf(c.WGPUChainedStruct), .field_type = .u32 },
        .{ .name = "code", .offset = @offsetOf(c.WGPUShaderSourceWGSL, "code"), .size = @sizeOf(c.WGPUStringView), .field_type = .ptr },
    }),

    // ── View descriptor ──

    makeStruct(c.WGPUTextureViewDescriptor, "WGPUTextureViewDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "format", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "format"), .size = 4, .field_type = .u32 },
        .{ .name = "dimension", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "dimension"), .size = 4, .field_type = .u32 },
        .{ .name = "baseMipLevel", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "baseMipLevel"), .size = 4, .field_type = .u32 },
        .{ .name = "mipLevelCount", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "mipLevelCount"), .size = 4, .field_type = .u32 },
        .{ .name = "baseArrayLayer", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "baseArrayLayer"), .size = 4, .field_type = .u32 },
        .{ .name = "arrayLayerCount", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "arrayLayerCount"), .size = 4, .field_type = .u32 },
        .{ .name = "aspect", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "aspect"), .size = 4, .field_type = .u32 },
        .{ .name = "usage", .offset = @offsetOf(c.WGPUTextureViewDescriptor, "usage"), .size = 8, .field_type = .u64 },
    }),

    // ── Pipeline state structs ──

    makeStruct(c.WGPUVertexState, "WGPUVertexState", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUVertexState, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "module", .offset = @offsetOf(c.WGPUVertexState, "module"), .size = 4, .field_type = .ptr },
        .{ .name = "entryPoint", .offset = @offsetOf(c.WGPUVertexState, "entryPoint"), .size = 8, .field_type = .ptr },
        .{ .name = "constantCount", .offset = @offsetOf(c.WGPUVertexState, "constantCount"), .size = 4, .field_type = .u32 },
        .{ .name = "constants", .offset = @offsetOf(c.WGPUVertexState, "constants"), .size = 4, .field_type = .ptr },
        .{ .name = "bufferCount", .offset = @offsetOf(c.WGPUVertexState, "bufferCount"), .size = 4, .field_type = .u32 },
        .{ .name = "buffers", .offset = @offsetOf(c.WGPUVertexState, "buffers"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPUFragmentState, "WGPUFragmentState", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUFragmentState, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "module", .offset = @offsetOf(c.WGPUFragmentState, "module"), .size = 4, .field_type = .ptr },
        .{ .name = "entryPoint", .offset = @offsetOf(c.WGPUFragmentState, "entryPoint"), .size = 8, .field_type = .ptr },
        .{ .name = "constantCount", .offset = @offsetOf(c.WGPUFragmentState, "constantCount"), .size = 4, .field_type = .u32 },
        .{ .name = "constants", .offset = @offsetOf(c.WGPUFragmentState, "constants"), .size = 4, .field_type = .ptr },
        .{ .name = "targetCount", .offset = @offsetOf(c.WGPUFragmentState, "targetCount"), .size = 4, .field_type = .u32 },
        .{ .name = "targets", .offset = @offsetOf(c.WGPUFragmentState, "targets"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPUPrimitiveState, "WGPUPrimitiveState", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUPrimitiveState, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "topology", .offset = @offsetOf(c.WGPUPrimitiveState, "topology"), .size = 4, .field_type = .u32 },
        .{ .name = "stripIndexFormat", .offset = @offsetOf(c.WGPUPrimitiveState, "stripIndexFormat"), .size = 4, .field_type = .u32 },
        .{ .name = "frontFace", .offset = @offsetOf(c.WGPUPrimitiveState, "frontFace"), .size = 4, .field_type = .u32 },
        .{ .name = "cullMode", .offset = @offsetOf(c.WGPUPrimitiveState, "cullMode"), .size = 4, .field_type = .u32 },
        .{ .name = "unclippedDepth", .offset = @offsetOf(c.WGPUPrimitiveState, "unclippedDepth"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUMultisampleState, "WGPUMultisampleState", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUMultisampleState, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "count", .offset = @offsetOf(c.WGPUMultisampleState, "count"), .size = 4, .field_type = .u32 },
        .{ .name = "mask", .offset = @offsetOf(c.WGPUMultisampleState, "mask"), .size = 4, .field_type = .u32 },
        .{ .name = "alphaToCoverageEnabled", .offset = @offsetOf(c.WGPUMultisampleState, "alphaToCoverageEnabled"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUDepthStencilState, "WGPUDepthStencilState", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUDepthStencilState, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "format", .offset = @offsetOf(c.WGPUDepthStencilState, "format"), .size = 4, .field_type = .u32 },
        .{ .name = "depthWriteEnabled", .offset = @offsetOf(c.WGPUDepthStencilState, "depthWriteEnabled"), .size = 4, .field_type = .u32 },
        .{ .name = "depthCompare", .offset = @offsetOf(c.WGPUDepthStencilState, "depthCompare"), .size = 4, .field_type = .u32 },
        .{ .name = "stencilFront", .offset = @offsetOf(c.WGPUDepthStencilState, "stencilFront"), .size = @sizeOf(c.WGPUStencilFaceState), .field_type = .u32 },
        .{ .name = "stencilBack", .offset = @offsetOf(c.WGPUDepthStencilState, "stencilBack"), .size = @sizeOf(c.WGPUStencilFaceState), .field_type = .u32 },
        .{ .name = "stencilReadMask", .offset = @offsetOf(c.WGPUDepthStencilState, "stencilReadMask"), .size = 4, .field_type = .u32 },
        .{ .name = "stencilWriteMask", .offset = @offsetOf(c.WGPUDepthStencilState, "stencilWriteMask"), .size = 4, .field_type = .u32 },
        .{ .name = "depthBias", .offset = @offsetOf(c.WGPUDepthStencilState, "depthBias"), .size = 4, .field_type = .i32 },
        .{ .name = "depthBiasSlopeScale", .offset = @offsetOf(c.WGPUDepthStencilState, "depthBiasSlopeScale"), .size = 4, .field_type = .f32 },
        .{ .name = "depthBiasClamp", .offset = @offsetOf(c.WGPUDepthStencilState, "depthBiasClamp"), .size = 4, .field_type = .f32 },
    }),
    makeStruct(c.WGPUComputeState, "WGPUComputeState", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUComputeState, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "module", .offset = @offsetOf(c.WGPUComputeState, "module"), .size = 4, .field_type = .ptr },
        .{ .name = "entryPoint", .offset = @offsetOf(c.WGPUComputeState, "entryPoint"), .size = 8, .field_type = .ptr },
        .{ .name = "constantCount", .offset = @offsetOf(c.WGPUComputeState, "constantCount"), .size = 4, .field_type = .u32 },
        .{ .name = "constants", .offset = @offsetOf(c.WGPUComputeState, "constants"), .size = 4, .field_type = .ptr },
    }),

    // ── Pipeline descriptors ──

    makeStruct(c.WGPURenderPipelineDescriptor, "WGPURenderPipelineDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPURenderPipelineDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPURenderPipelineDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "layout", .offset = @offsetOf(c.WGPURenderPipelineDescriptor, "layout"), .size = 4, .field_type = .ptr },
        // Inline sub-structs — use standalone struct layouts for field-level access
        .{ .name = "vertex", .offset = @offsetOf(c.WGPURenderPipelineDescriptor, "vertex"), .size = @sizeOf(c.WGPUVertexState), .field_type = .u32 },
        .{ .name = "primitive", .offset = @offsetOf(c.WGPURenderPipelineDescriptor, "primitive"), .size = @sizeOf(c.WGPUPrimitiveState), .field_type = .u32 },
        .{ .name = "depthStencil", .offset = @offsetOf(c.WGPURenderPipelineDescriptor, "depthStencil"), .size = 4, .field_type = .ptr },
        .{ .name = "multisample", .offset = @offsetOf(c.WGPURenderPipelineDescriptor, "multisample"), .size = @sizeOf(c.WGPUMultisampleState), .field_type = .u32 },
        .{ .name = "fragment", .offset = @offsetOf(c.WGPURenderPipelineDescriptor, "fragment"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPUComputePipelineDescriptor, "WGPUComputePipelineDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUComputePipelineDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUComputePipelineDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "layout", .offset = @offsetOf(c.WGPUComputePipelineDescriptor, "layout"), .size = 4, .field_type = .ptr },
        .{ .name = "compute", .offset = @offsetOf(c.WGPUComputePipelineDescriptor, "compute"), .size = @sizeOf(c.WGPUComputeState), .field_type = .u32 },
    }),

    // ── Pass descriptors ──

    makeStruct(c.WGPUComputePassDescriptor, "WGPUComputePassDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUComputePassDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUComputePassDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "timestampWrites", .offset = @offsetOf(c.WGPUComputePassDescriptor, "timestampWrites"), .size = 4, .field_type = .ptr },
    }),

    // ── Copy operations ──

    makeStruct(c.WGPUTexelCopyBufferLayout, "WGPUTexelCopyBufferLayout", &.{
        .{ .name = "offset", .offset = @offsetOf(c.WGPUTexelCopyBufferLayout, "offset"), .size = 8, .field_type = .u64 },
        .{ .name = "bytesPerRow", .offset = @offsetOf(c.WGPUTexelCopyBufferLayout, "bytesPerRow"), .size = 4, .field_type = .u32 },
        .{ .name = "rowsPerImage", .offset = @offsetOf(c.WGPUTexelCopyBufferLayout, "rowsPerImage"), .size = 4, .field_type = .u32 },
    }),
    makeStruct(c.WGPUTexelCopyBufferInfo, "WGPUTexelCopyBufferInfo", &.{
        .{ .name = "layout", .offset = @offsetOf(c.WGPUTexelCopyBufferInfo, "layout"), .size = @sizeOf(c.WGPUTexelCopyBufferLayout), .field_type = .u32 },
        .{ .name = "buffer", .offset = @offsetOf(c.WGPUTexelCopyBufferInfo, "buffer"), .size = 4, .field_type = .ptr },
    }),
    makeStruct(c.WGPUTexelCopyTextureInfo, "WGPUTexelCopyTextureInfo", &.{
        .{ .name = "texture", .offset = @offsetOf(c.WGPUTexelCopyTextureInfo, "texture"), .size = 4, .field_type = .ptr },
        .{ .name = "mipLevel", .offset = @offsetOf(c.WGPUTexelCopyTextureInfo, "mipLevel"), .size = 4, .field_type = .u32 },
        .{ .name = "origin", .offset = @offsetOf(c.WGPUTexelCopyTextureInfo, "origin"), .size = @sizeOf(c.WGPUOrigin3D), .field_type = .u32 },
        .{ .name = "aspect", .offset = @offsetOf(c.WGPUTexelCopyTextureInfo, "aspect"), .size = 4, .field_type = .u32 },
    }),

    // ── Limits ──

    makeStruct(c.WGPULimits, "WGPULimits", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPULimits, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "maxTextureDimension1D", .offset = @offsetOf(c.WGPULimits, "maxTextureDimension1D"), .size = 4, .field_type = .u32 },
        .{ .name = "maxTextureDimension2D", .offset = @offsetOf(c.WGPULimits, "maxTextureDimension2D"), .size = 4, .field_type = .u32 },
        .{ .name = "maxTextureDimension3D", .offset = @offsetOf(c.WGPULimits, "maxTextureDimension3D"), .size = 4, .field_type = .u32 },
        .{ .name = "maxTextureArrayLayers", .offset = @offsetOf(c.WGPULimits, "maxTextureArrayLayers"), .size = 4, .field_type = .u32 },
        .{ .name = "maxBindGroups", .offset = @offsetOf(c.WGPULimits, "maxBindGroups"), .size = 4, .field_type = .u32 },
        .{ .name = "maxBindGroupsPlusVertexBuffers", .offset = @offsetOf(c.WGPULimits, "maxBindGroupsPlusVertexBuffers"), .size = 4, .field_type = .u32 },
        .{ .name = "maxBindingsPerBindGroup", .offset = @offsetOf(c.WGPULimits, "maxBindingsPerBindGroup"), .size = 4, .field_type = .u32 },
        .{ .name = "maxDynamicUniformBuffersPerPipelineLayout", .offset = @offsetOf(c.WGPULimits, "maxDynamicUniformBuffersPerPipelineLayout"), .size = 4, .field_type = .u32 },
        .{ .name = "maxDynamicStorageBuffersPerPipelineLayout", .offset = @offsetOf(c.WGPULimits, "maxDynamicStorageBuffersPerPipelineLayout"), .size = 4, .field_type = .u32 },
        .{ .name = "maxSampledTexturesPerShaderStage", .offset = @offsetOf(c.WGPULimits, "maxSampledTexturesPerShaderStage"), .size = 4, .field_type = .u32 },
        .{ .name = "maxSamplersPerShaderStage", .offset = @offsetOf(c.WGPULimits, "maxSamplersPerShaderStage"), .size = 4, .field_type = .u32 },
        .{ .name = "maxStorageBuffersPerShaderStage", .offset = @offsetOf(c.WGPULimits, "maxStorageBuffersPerShaderStage"), .size = 4, .field_type = .u32 },
        .{ .name = "maxStorageTexturesPerShaderStage", .offset = @offsetOf(c.WGPULimits, "maxStorageTexturesPerShaderStage"), .size = 4, .field_type = .u32 },
        .{ .name = "maxUniformBuffersPerShaderStage", .offset = @offsetOf(c.WGPULimits, "maxUniformBuffersPerShaderStage"), .size = 4, .field_type = .u32 },
        .{ .name = "maxUniformBufferBindingSize", .offset = @offsetOf(c.WGPULimits, "maxUniformBufferBindingSize"), .size = 8, .field_type = .u64 },
        .{ .name = "maxStorageBufferBindingSize", .offset = @offsetOf(c.WGPULimits, "maxStorageBufferBindingSize"), .size = 8, .field_type = .u64 },
        .{ .name = "minUniformBufferOffsetAlignment", .offset = @offsetOf(c.WGPULimits, "minUniformBufferOffsetAlignment"), .size = 4, .field_type = .u32 },
        .{ .name = "minStorageBufferOffsetAlignment", .offset = @offsetOf(c.WGPULimits, "minStorageBufferOffsetAlignment"), .size = 4, .field_type = .u32 },
        .{ .name = "maxVertexBuffers", .offset = @offsetOf(c.WGPULimits, "maxVertexBuffers"), .size = 4, .field_type = .u32 },
        .{ .name = "maxBufferSize", .offset = @offsetOf(c.WGPULimits, "maxBufferSize"), .size = 8, .field_type = .u64 },
        .{ .name = "maxVertexAttributes", .offset = @offsetOf(c.WGPULimits, "maxVertexAttributes"), .size = 4, .field_type = .u32 },
        .{ .name = "maxVertexBufferArrayStride", .offset = @offsetOf(c.WGPULimits, "maxVertexBufferArrayStride"), .size = 4, .field_type = .u32 },
        .{ .name = "maxInterStageShaderVariables", .offset = @offsetOf(c.WGPULimits, "maxInterStageShaderVariables"), .size = 4, .field_type = .u32 },
        .{ .name = "maxColorAttachments", .offset = @offsetOf(c.WGPULimits, "maxColorAttachments"), .size = 4, .field_type = .u32 },
        .{ .name = "maxColorAttachmentBytesPerSample", .offset = @offsetOf(c.WGPULimits, "maxColorAttachmentBytesPerSample"), .size = 4, .field_type = .u32 },
        .{ .name = "maxComputeWorkgroupStorageSize", .offset = @offsetOf(c.WGPULimits, "maxComputeWorkgroupStorageSize"), .size = 4, .field_type = .u32 },
        .{ .name = "maxComputeInvocationsPerWorkgroup", .offset = @offsetOf(c.WGPULimits, "maxComputeInvocationsPerWorkgroup"), .size = 4, .field_type = .u32 },
        .{ .name = "maxComputeWorkgroupSizeX", .offset = @offsetOf(c.WGPULimits, "maxComputeWorkgroupSizeX"), .size = 4, .field_type = .u32 },
        .{ .name = "maxComputeWorkgroupSizeY", .offset = @offsetOf(c.WGPULimits, "maxComputeWorkgroupSizeY"), .size = 4, .field_type = .u32 },
        .{ .name = "maxComputeWorkgroupSizeZ", .offset = @offsetOf(c.WGPULimits, "maxComputeWorkgroupSizeZ"), .size = 4, .field_type = .u32 },
        .{ .name = "maxComputeWorkgroupsPerDimension", .offset = @offsetOf(c.WGPULimits, "maxComputeWorkgroupsPerDimension"), .size = 4, .field_type = .u32 },
        .{ .name = "maxImmediateSize", .offset = @offsetOf(c.WGPULimits, "maxImmediateSize"), .size = 4, .field_type = .u32 },
    }),

    // ── Query set ──

    makeStruct(c.WGPUQuerySetDescriptor, "WGPUQuerySetDescriptor", &.{
        .{ .name = "nextInChain", .offset = @offsetOf(c.WGPUQuerySetDescriptor, "nextInChain"), .size = 4, .field_type = .ptr },
        .{ .name = "label", .offset = @offsetOf(c.WGPUQuerySetDescriptor, "label"), .size = 8, .field_type = .ptr },
        .{ .name = "type", .offset = @offsetOf(c.WGPUQuerySetDescriptor, "type"), .size = 4, .field_type = .u32 },
        .{ .name = "count", .offset = @offsetOf(c.WGPUQuerySetDescriptor, "count"), .size = 4, .field_type = .u32 },
    }),
};

// ── Comptime JSON generation ──
// The JSON is built entirely at comptime. The main() function just writes it to stdout.
// Run: zig build-exe ... && ./emit_wgpu_layouts > dist/wgpu-layouts.json

const json = blk: {
    @setEvalBranchQuota(200_000);
    var buf: [32768]u8 = undefined;
    var stream = std.io.fixedBufferStream(&buf);
    const w = stream.writer();

    w.writeAll("{\n") catch unreachable;

    for (structs, 0..) |s, si| {
        if (si > 0) w.writeAll(",\n") catch unreachable;
        std.fmt.format(w, "  \"{s}\": {{\n", .{s.name}) catch unreachable;
        std.fmt.format(w, "    \"_size\": {d},\n", .{s.size}) catch unreachable;
        w.writeAll("    \"fields\": {\n") catch unreachable;

        for (s.fields, 0..) |f, fi| {
            if (fi > 0) w.writeAll(",\n") catch unreachable;
            std.fmt.format(w, "      \"{s}\": {{ \"offset\": {d}, \"size\": {d}, \"type\": \"{s}\" }}", .{
                f.name, f.offset, f.size, fieldTypeStr(f.field_type),
            }) catch unreachable;
        }

        w.writeAll("\n    }\n  }") catch unreachable;
    }

    w.writeAll("\n}\n") catch unreachable;

    const len = stream.pos;
    break :blk buf[0..len].*;
};

pub fn main() void {
    // Just write the comptime-generated JSON to stdout
    const posix = std.posix;
    const fd: posix.fd_t = 1; // stdout
    _ = posix.write(fd, &json) catch {};
}
