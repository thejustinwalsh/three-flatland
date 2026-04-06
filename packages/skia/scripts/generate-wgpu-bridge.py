#!/usr/bin/env python3
"""
Generate TypeScript enum maps and struct layouts from Dawn's webgpu.h.

Parses the Dawn C header to produce:
  1. wgpu-enums.generated.ts — Dawn enum value → WebGPU string maps
  2. wgpu-structs.generated.ts — Struct field offset tables for WASM32

These files are imported by wasm-loader-wgpu.ts to parse C structs from
WASM memory without hand-written magic offsets.

Re-run after upgrading Dawn/Skia:
    python3 scripts/generate-wgpu-bridge.py

Source: src/zig/wgpu_shim/dawn/webgpu.h
"""

import re
import sys
from pathlib import Path
from typing import NamedTuple

SCRIPT_DIR = Path(__file__).parent
PKG_ROOT = SCRIPT_DIR.parent
HEADER = PKG_ROOT / "src" / "zig" / "wgpu_shim" / "dawn" / "webgpu.h"
OUT_DIR = PKG_ROOT / "src" / "ts"

# ── Enum parsing ──

# Dawn enum names → WebGPU string conversion rules
# Dawn: WGPUTextureFormat_R8Unorm = 0x01
# WebGPU: 'r8unorm'
# Rule: strip prefix, PascalCase → kebab-case (with special handling)

# Special WebGPU string mappings where the Dawn name doesn't trivially convert
ENUM_VALUE_OVERRIDES = {
    # Texture formats — many have numbers/special chars
    # Most convert by lowercasing: R8Unorm → r8unorm, RGBA8Unorm → rgba8unorm
    # But some need hyphens or special handling
}

def pascal_to_kebab(name: str) -> str:
    """Convert PascalCase to kebab-case for most enums.

    Examples:
        ClampToEdge → clamp-to-edge
        TriangleList → triangle-list
        OneMinusSrcAlpha → one-minus-src-alpha
        Src → src
    """
    result = ''
    for i, c in enumerate(name):
        if i > 0 and c.isupper():
            prev = name[i-1]
            if prev.islower() or prev.isdigit():
                result += '-'
            elif prev.isupper() and i+1 < len(name) and name[i+1].islower():
                result += '-'
        result += c
    return result.lower()


# Enums where the WebGPU string is just the lowercase Dawn name with
# specific hyphen insertion rules (not generic PascalCase splitting)
FORMAT_ENUMS = {'WGPUTextureFormat', 'WGPUVertexFormat'}

def format_name_to_webgpu(name: str) -> str:
    """Convert a Dawn texture/vertex format name to WebGPU string.

    Rules (from WebGPU spec):
    - Base is all lowercase
    - Insert hyphen before 'srgb' suffix
    - Insert hyphen in 'depth*-stencil*' compounds
    - Insert hyphens in compressed format prefixes: 'bc1-', 'etc2-', 'astc-'
    """
    s = name.lower()
    # -srgb suffix
    s = re.sub(r'srgb$', '-srgb', s)
    # depth-stencil compounds
    s = re.sub(r'(depth\d*(?:float|plus)?)(stencil)', r'\1-\2', s)
    # BC compressed: bc1-rgba-unorm, bc2-rgba-unorm, etc.
    s = re.sub(r'^(bc\d+)(rgba?)(unorm|snorm)', r'\1-\2-\3', s)
    # ETC2: etc2-rgb8unorm, etc2-rgba8unorm (no extra hyphens within format)
    s = re.sub(r'^(etc2)(rgb)', r'\1-\2', s)
    # EAC: eac-r11unorm, eac-rg11unorm
    s = re.sub(r'^(eac)(r)', r'\1-\2', s)
    # ASTC: astc-4x4-unorm, etc.
    s = re.sub(r'^(astc)(\d)', r'\1-\2', s)
    # ASTC: insert hyphen before unorm/srgb suffix after dimensions
    s = re.sub(r'(astc-\d+x\d+)(unorm)', r'\1-\2', s)
    # Vertex format: insert hyphens between type and count: float32x2 → float32x2 (already fine)
    # sint/uint: sint8x2 → sint8x2 (already fine)
    # unorm/snorm: unorm8x2 → unorm8x2 (already fine)
    return s


def enum_value_to_webgpu(enum_name: str, value_name: str) -> str:
    """Convert a Dawn enum value name to its WebGPU string representation."""
    if enum_name in FORMAT_ENUMS:
        return format_name_to_webgpu(value_name)
    return pascal_to_kebab(value_name)


# Enums we need for the WebGPU bridge (maps Dawn u32 → WebGPU string)
NEEDED_ENUMS = {
    'WGPUTextureFormat': 'GPUTextureFormat',
    'WGPUTextureDimension': 'GPUTextureDimension',
    'WGPUTextureViewDimension': 'GPUTextureViewDimension',
    'WGPUTextureAspect': 'GPUTextureAspect',
    'WGPUTextureSampleType': 'GPUTextureSampleType',
    'WGPUPrimitiveTopology': 'GPUPrimitiveTopology',
    'WGPUFrontFace': 'GPUFrontFace',
    'WGPUCullMode': 'GPUCullMode',
    'WGPUBlendFactor': 'GPUBlendFactor',
    'WGPUBlendOperation': 'GPUBlendOperation',
    'WGPUCompareFunction': 'GPUCompareFunction',
    'WGPUStencilOperation': 'GPUStencilOperation',
    'WGPULoadOp': 'GPULoadOp',
    'WGPUStoreOp': 'GPUStoreOp',
    'WGPUFilterMode': 'GPUFilterMode',
    'WGPUMipmapFilterMode': 'GPUMipmapFilterMode',
    'WGPUAddressMode': 'GPUAddressMode',
    'WGPUVertexFormat': 'GPUVertexFormat',
    'WGPUVertexStepMode': 'GPUVertexStepMode',
    'WGPUIndexFormat': 'GPUIndexFormat',
    'WGPUBufferBindingType': 'GPUBufferBindingType',
    'WGPUSamplerBindingType': 'GPUSamplerBindingType',
    'WGPUStorageTextureAccess': 'GPUStorageTextureAccess',
    'WGPUQueryType': 'GPUQueryType',
    'WGPUFeatureName': 'GPUFeatureName',
}

class EnumValue(NamedTuple):
    name: str  # e.g., "R8Unorm"
    value: int  # e.g., 0x00000001
    webgpu_name: str  # e.g., "r8unorm"


def parse_enums(header_text: str) -> dict[str, list[EnumValue]]:
    """Parse all typedef enum blocks from the header."""
    enums: dict[str, list[EnumValue]] = {}

    # Match: typedef enum WGPUFoo { ... } WGPUFoo WGPU_ENUM_ATTRIBUTE;
    pattern = re.compile(
        r'typedef\s+enum\s+(\w+)\s*\{([^}]+)\}\s*\w+[^;]*;',
        re.DOTALL
    )

    for match in pattern.finditer(header_text):
        enum_name = match.group(1)
        if enum_name not in NEEDED_ENUMS:
            continue

        body = match.group(2)
        prefix = enum_name + '_'
        values = []

        for line in body.split('\n'):
            line = line.strip().rstrip(',')
            m = re.match(rf'\s*{re.escape(prefix)}(\w+)\s*=\s*(0x[0-9a-fA-F]+|\d+)', line)
            if not m:
                continue
            name = m.group(1)
            value = int(m.group(2), 0)

            # Skip sentinel/force values
            if name == 'Force32' or value == 0x7FFFFFFF:
                continue
            # Skip undefined/0 values
            if name == 'Undefined' and value == 0:
                continue

            webgpu = enum_value_to_webgpu(enum_name, name)
            values.append(EnumValue(name, value, webgpu))

        enums[enum_name] = values

    return enums


def generate_enums_ts(enums: dict[str, list[EnumValue]]) -> str:
    """Generate TypeScript enum map file."""
    lines = [
        '// Auto-generated by generate-wgpu-bridge.py — do not edit',
        '// Source: src/zig/wgpu_shim/dawn/webgpu.h',
        '//',
        '// Dawn C enum values → WebGPU string values for the browser API.',
        '',
    ]

    for enum_name, values in sorted(enums.items()):
        ts_type = NEEDED_ENUMS[enum_name]
        lines.append(f'/** {enum_name} → {ts_type} */')
        lines.append(f'export const {enum_name}: Record<number, string> = {{')
        for v in values:
            lines.append(f"  0x{v.value:08X}: '{v.webgpu_name}',")
        lines.append('}')
        lines.append('')

    return '\n'.join(lines)


# ── Struct parsing ──

# C type sizes on WASM32
TYPE_SIZES = {
    'ptr': 4,       # void*, any pointer
    'u32': 4,
    'i32': 4,
    's32': 4,
    'u16': 2,
    'u64': 8,
    'i64': 8,
    'f32': 4,
    'f64': 8,
    'bool': 4,      # WGPUBool is uint32_t
}

TYPE_ALIGNMENTS = {
    'ptr': 4,
    'u32': 4,
    'i32': 4,
    's32': 4,
    'u16': 2,
    'u64': 8,
    'i64': 8,
    'f32': 4,
    'f64': 8,
    'bool': 4,
}

class StructField(NamedTuple):
    name: str
    type: str  # ptr, u32, u64, f32, f64, bool, stringview, struct:Name
    offset: int
    size: int


# Manually define the structs we need — parsing C structs with nested types
# from the header is complex and error-prone. These are verified against the
# Dawn header and the WASM32 ABI.

STRUCT_DEFS: dict[str, list[tuple[str, str]]] = {
    'WGPUStringView': [
        ('data', 'ptr'),
        ('length', 'u32'),  # size_t on wasm32
    ],
    'WGPUChainedStruct': [
        ('next', 'ptr'),
        ('sType', 'u32'),
    ],
    'WGPUExtent3D': [
        ('width', 'u32'),
        ('height', 'u32'),
        ('depthOrArrayLayers', 'u32'),
    ],
    'WGPUColor': [
        ('r', 'f64'),
        ('g', 'f64'),
        ('b', 'f64'),
        ('a', 'f64'),
    ],
    'WGPUBlendComponent': [
        ('operation', 'u32'),
        ('srcFactor', 'u32'),
        ('dstFactor', 'u32'),
    ],
    'WGPUBlendState': [
        ('color_operation', 'u32'),
        ('color_srcFactor', 'u32'),
        ('color_dstFactor', 'u32'),
        ('alpha_operation', 'u32'),
        ('alpha_srcFactor', 'u32'),
        ('alpha_dstFactor', 'u32'),
    ],
    'WGPUStencilFaceState': [
        ('compare', 'u32'),
        ('failOp', 'u32'),
        ('depthFailOp', 'u32'),
        ('passOp', 'u32'),
    ],
    'WGPUBufferDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('usage', 'u64'),
        ('size', 'u64'),
        ('mappedAtCreation', 'bool'),
    ],
    'WGPUTextureDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('usage', 'u64'),
        ('dimension', 'u32'),
        ('width', 'u32'),
        ('height', 'u32'),
        ('depthOrArrayLayers', 'u32'),
        ('format', 'u32'),
        ('mipLevelCount', 'u32'),
        ('sampleCount', 'u32'),
        ('viewFormatCount', 'u32'),
        ('viewFormats', 'ptr'),
    ],
    'WGPUTextureViewDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('format', 'u32'),
        ('dimension', 'u32'),
        ('baseMipLevel', 'u32'),
        ('mipLevelCount', 'u32'),
        ('baseArrayLayer', 'u32'),
        ('arrayLayerCount', 'u32'),
        ('aspect', 'u32'),
        ('usage', 'u64'),
    ],
    'WGPUShaderModuleDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
    ],
    'WGPUShaderSourceWGSL': [
        ('chain_next', 'ptr'),
        ('chain_sType', 'u32'),
        ('code_data', 'ptr'),
        ('code_length', 'u32'),
    ],
    'WGPUSamplerDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('addressModeU', 'u32'),
        ('addressModeV', 'u32'),
        ('addressModeW', 'u32'),
        ('magFilter', 'u32'),
        ('minFilter', 'u32'),
        ('mipmapFilter', 'u32'),
        ('lodMinClamp', 'f32'),
        ('lodMaxClamp', 'f32'),
        ('compare', 'u32'),
        ('maxAnisotropy', 'u16'),
    ],
    'WGPUCommandEncoderDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
    ],
    'WGPUBindGroupLayoutDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('entryCount', 'u32'),
        ('entries', 'ptr'),
    ],
    'WGPUBindGroupLayoutEntry': [
        ('nextInChain', 'ptr'),
        ('binding', 'u32'),
        ('visibility', 'u32'),
        ('bindingArraySize', 'u32'),
        # buffer binding layout (inline sub-struct)
        ('buffer_nextInChain', 'ptr'),
        ('buffer_type', 'u32'),
        ('buffer_hasDynamicOffset', 'bool'),
        ('buffer_minBindingSize', 'u64'),
        # sampler binding layout
        ('sampler_nextInChain', 'ptr'),
        ('sampler_type', 'u32'),
        # texture binding layout
        ('texture_nextInChain', 'ptr'),
        ('texture_sampleType', 'u32'),
        ('texture_viewDimension', 'u32'),
        ('texture_multisampled', 'bool'),
        # storage texture binding layout
        ('storageTexture_nextInChain', 'ptr'),
        ('storageTexture_access', 'u32'),
        ('storageTexture_format', 'u32'),
        ('storageTexture_viewDimension', 'u32'),
    ],
    'WGPUBindGroupDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('layout', 'ptr'),
        ('entryCount', 'u32'),
        ('entries', 'ptr'),
    ],
    'WGPUBindGroupEntry': [
        ('nextInChain', 'ptr'),
        ('binding', 'u32'),
        ('buffer', 'ptr'),
        ('offset', 'u64'),
        ('size', 'u64'),
        ('sampler', 'ptr'),
        ('textureView', 'ptr'),
    ],
    'WGPUPipelineLayoutDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('bindGroupLayoutCount', 'u32'),
        ('bindGroupLayouts', 'ptr'),
        ('immediateSize', 'u32'),
    ],
    'WGPUVertexAttribute': [
        ('format', 'u32'),
        ('offset', 'u64'),
        ('shaderLocation', 'u32'),
    ],
    'WGPUVertexBufferLayout': [
        ('nextInChain', 'ptr'),
        ('stepMode', 'u32'),
        ('arrayStride', 'u64'),
        ('attributeCount', 'u32'),
        ('attributes', 'ptr'),
    ],
    'WGPUVertexState': [
        ('nextInChain', 'ptr'),
        ('module', 'ptr'),
        ('entryPoint_data', 'ptr'),
        ('entryPoint_length', 'u32'),
        ('constantCount', 'u32'),
        ('constants', 'ptr'),
        ('bufferCount', 'u32'),
        ('buffers', 'ptr'),
    ],
    'WGPUColorTargetState': [
        ('nextInChain', 'ptr'),
        ('format', 'u32'),
        ('blend', 'ptr'),
        ('writeMask', 'u32'),
    ],
    'WGPUFragmentState': [
        ('nextInChain', 'ptr'),
        ('module', 'ptr'),
        ('entryPoint_data', 'ptr'),
        ('entryPoint_length', 'u32'),
        ('constantCount', 'u32'),
        ('constants', 'ptr'),
        ('targetCount', 'u32'),
        ('targets', 'ptr'),
    ],
    'WGPUPrimitiveState': [
        ('nextInChain', 'ptr'),
        ('topology', 'u32'),
        ('stripIndexFormat', 'u32'),
        ('frontFace', 'u32'),
        ('cullMode', 'u32'),
        ('unclippedDepth', 'bool'),
    ],
    'WGPUMultisampleState': [
        ('nextInChain', 'ptr'),
        ('count', 'u32'),
        ('mask', 'u32'),
        ('alphaToCoverageEnabled', 'bool'),
    ],
    'WGPUDepthStencilState': [
        ('nextInChain', 'ptr'),
        ('format', 'u32'),
        ('depthWriteEnabled', 'u32'),  # WGPUOptionalBool
        ('depthCompare', 'u32'),
        # stencilFront (inline)
        ('stencilFront_compare', 'u32'),
        ('stencilFront_failOp', 'u32'),
        ('stencilFront_depthFailOp', 'u32'),
        ('stencilFront_passOp', 'u32'),
        # stencilBack (inline)
        ('stencilBack_compare', 'u32'),
        ('stencilBack_failOp', 'u32'),
        ('stencilBack_depthFailOp', 'u32'),
        ('stencilBack_passOp', 'u32'),
        ('stencilReadMask', 'u32'),
        ('stencilWriteMask', 'u32'),
        ('depthBias', 'i32'),
        ('depthBiasSlopeScale', 'f32'),
        ('depthBiasClamp', 'f32'),
    ],
    'WGPURenderPipelineDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('layout', 'ptr'),
        # vertex state (inline — 32 bytes)
        ('vertex_nextInChain', 'ptr'),
        ('vertex_module', 'ptr'),
        ('vertex_entryPoint_data', 'ptr'),
        ('vertex_entryPoint_length', 'u32'),
        ('vertex_constantCount', 'u32'),
        ('vertex_constants', 'ptr'),
        ('vertex_bufferCount', 'u32'),
        ('vertex_buffers', 'ptr'),
        # primitive state (inline — 24 bytes)
        ('primitive_nextInChain', 'ptr'),
        ('primitive_topology', 'u32'),
        ('primitive_stripIndexFormat', 'u32'),
        ('primitive_frontFace', 'u32'),
        ('primitive_cullMode', 'u32'),
        ('primitive_unclippedDepth', 'bool'),
        # depth stencil (pointer)
        ('depthStencil', 'ptr'),
        # multisample (inline — 16 bytes)
        ('multisample_nextInChain', 'ptr'),
        ('multisample_count', 'u32'),
        ('multisample_mask', 'u32'),
        ('multisample_alphaToCoverageEnabled', 'bool'),
        # fragment (pointer)
        ('fragment', 'ptr'),
    ],
    'WGPUComputePipelineDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('layout', 'ptr'),
        # compute state (inline)
        ('compute_nextInChain', 'ptr'),
        ('compute_module', 'ptr'),
        ('compute_entryPoint_data', 'ptr'),
        ('compute_entryPoint_length', 'u32'),
        ('compute_constantCount', 'u32'),
        ('compute_constants', 'ptr'),
    ],
    'WGPURenderPassColorAttachment': [
        ('nextInChain', 'ptr'),
        ('view', 'ptr'),
        ('depthSlice', 'u32'),
        ('resolveTarget', 'ptr'),
        ('loadOp', 'u32'),
        ('storeOp', 'u32'),
        ('clearValue_r', 'f64'),
        ('clearValue_g', 'f64'),
        ('clearValue_b', 'f64'),
        ('clearValue_a', 'f64'),
    ],
    'WGPURenderPassDepthStencilAttachment': [
        ('view', 'ptr'),
        ('depthLoadOp', 'u32'),
        ('depthStoreOp', 'u32'),
        ('depthClearValue', 'f32'),
        ('depthReadOnly', 'bool'),
        ('stencilLoadOp', 'u32'),
        ('stencilStoreOp', 'u32'),
        ('stencilClearValue', 'u32'),
        ('stencilReadOnly', 'bool'),
    ],
    'WGPURenderPassDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('colorAttachmentCount', 'u32'),
        ('colorAttachments', 'ptr'),
        ('depthStencilAttachment', 'ptr'),
        ('occlusionQuerySet', 'ptr'),
        ('timestampWrites', 'ptr'),
    ],
    'WGPUComputePassDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('timestampWrites', 'ptr'),
    ],
    'WGPUImageCopyBuffer': [
        ('nextInChain', 'ptr'),
        # layout (inline)
        ('layout_nextInChain', 'ptr'),
        ('layout_offset', 'u64'),
        ('layout_bytesPerRow', 'u32'),
        ('layout_rowsPerImage', 'u32'),
        ('buffer', 'ptr'),
    ],
    'WGPUImageCopyTexture': [
        ('nextInChain', 'ptr'),
        ('texture', 'ptr'),
        ('mipLevel', 'u32'),
        ('origin_x', 'u32'),
        ('origin_y', 'u32'),
        ('origin_z', 'u32'),
        ('aspect', 'u32'),
    ],
    'WGPUQuerySetDescriptor': [
        ('nextInChain', 'ptr'),
        ('label_data', 'ptr'),
        ('label_length', 'u32'),
        ('type', 'u32'),
        ('count', 'u32'),
    ],
}


def compute_offsets(fields: list[tuple[str, str]]) -> list[StructField]:
    """Compute byte offsets for struct fields on WASM32."""
    result = []
    offset = 0

    for name, type_name in fields:
        size = TYPE_SIZES.get(type_name, 4)
        align = TYPE_ALIGNMENTS.get(type_name, 4)

        # Align offset
        if offset % align != 0:
            offset += align - (offset % align)

        result.append(StructField(name, type_name, offset, size))
        offset += size

    return result


def generate_structs_ts(struct_defs: dict[str, list[tuple[str, str]]]) -> str:
    """Generate TypeScript struct layout file."""
    lines = [
        '// Auto-generated by generate-wgpu-bridge.py — do not edit',
        '// Source: src/zig/wgpu_shim/dawn/webgpu.h',
        '//',
        '// WASM32 struct field offsets for parsing Dawn descriptors from memory.',
        '',
        'export interface FieldDef {',
        '  readonly offset: number',
        "  readonly type: 'ptr' | 'u32' | 'i32' | 'u16' | 'u64' | 'f32' | 'f64' | 'bool'",
        '}',
        '',
        'export type StructLayout = Record<string, FieldDef>',
        '',
    ]

    for struct_name, fields in sorted(struct_defs.items()):
        computed = compute_offsets(fields)
        total_size = max(f.offset + f.size for f in computed) if computed else 0
        # Align total to largest field alignment
        max_align = max((TYPE_ALIGNMENTS.get(f.type, 4) for f in computed), default=4)
        if total_size % max_align != 0:
            total_size += max_align - (total_size % max_align)

        lines.append(f'/** {struct_name} — {total_size} bytes on WASM32 */')
        lines.append(f'export const {struct_name}: StructLayout = {{')
        for f in computed:
            lines.append(f"  {f.name}: {{ offset: {f.offset}, type: '{f.type}' }},")
        lines.append('} as const')
        lines.append(f'export const {struct_name}_SIZE = {total_size}')
        lines.append('')

    return '\n'.join(lines)


# ── Main ──

def main():
    if not HEADER.exists():
        print(f"Error: Dawn header not found at {HEADER}")
        print("  Run: pnpm run skia:setup")
        sys.exit(1)

    header_text = HEADER.read_text()

    # Generate enums
    enums = parse_enums(header_text)
    enums_ts = generate_enums_ts(enums)
    enums_path = OUT_DIR / 'wgpu-enums.generated.ts'
    enums_path.write_text(enums_ts)

    total_values = sum(len(v) for v in enums.values())
    print(f"  Generated {enums_path.relative_to(PKG_ROOT)}: {len(enums)} enums, {total_values} values")

    # Generate structs
    structs_ts = generate_structs_ts(STRUCT_DEFS)
    structs_path = OUT_DIR / 'wgpu-structs.generated.ts'
    structs_path.write_text(structs_ts)

    print(f"  Generated {structs_path.relative_to(PKG_ROOT)}: {len(STRUCT_DEFS)} structs")

    print("\nDone. Re-run after upgrading Dawn/Skia.")


if __name__ == '__main__':
    main()
