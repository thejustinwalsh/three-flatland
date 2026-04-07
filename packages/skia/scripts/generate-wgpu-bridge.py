#!/usr/bin/env python3
"""
Generate TypeScript enum maps from Dawn's webgpu.h.

Parses the Dawn C header to produce:
  wgpu-enums.generated.ts — Dawn enum value → WebGPU string maps

Struct layouts are generated separately by emit_wgpu_layouts.zig
(Zig comptime @offsetOf → wgpu-layouts.json).

Re-run after upgrading Dawn/Skia:
    python3 scripts/generate-wgpu-bridge.py

Source: src/zig/wgpu_shim/dawn/webgpu.h
"""

import re
import sys
from pathlib import Path
from typing import NamedTuple  # used by EnumValue

SCRIPT_DIR = Path(__file__).parent
PKG_ROOT = SCRIPT_DIR.parent
HEADER = PKG_ROOT / "src" / "zig" / "wgpu_shim" / "dawn" / "webgpu.h"
OUT_DIR = PKG_ROOT / "src" / "ts"

# ── Enum parsing ──

# Dawn enum names → WebGPU string conversion rules
# Dawn: WGPUTextureFormat_R8Unorm = 0x01
# WebGPU: 'r8unorm'
# Rule: strip prefix, PascalCase → kebab-case (with special handling)

# Special WebGPU string mappings where the Dawn name doesn't trivially convert.
# Keys are (enum_name, value_name) tuples.
ENUM_VALUE_OVERRIDES = {
    # Dimension enums: WebGPU uses "1d", "2d", "3d" (no hyphen before 'd')
    ('WGPUTextureDimension', '1D'): '1d',
    ('WGPUTextureDimension', '2D'): '2d',
    ('WGPUTextureDimension', '3D'): '3d',
    ('WGPUTextureViewDimension', '1D'): '1d',
    ('WGPUTextureViewDimension', '2D'): '2d',
    ('WGPUTextureViewDimension', '2DArray'): '2d-array',
    ('WGPUTextureViewDimension', 'Cube'): 'cube',
    ('WGPUTextureViewDimension', 'CubeArray'): 'cube-array',
    ('WGPUTextureViewDimension', '3D'): '3d',
    # Feature names: WebGPU spec uses specific casing for format-like names
    ('WGPUFeatureName', 'CoreFeaturesAndLimits'): 'core-features-and-limits',
    ('WGPUFeatureName', 'DepthClipControl'): 'depth-clip-control',
    ('WGPUFeatureName', 'Depth32FloatStencil8'): 'depth32float-stencil8',
    ('WGPUFeatureName', 'TextureCompressionBC'): 'texture-compression-bc',
    ('WGPUFeatureName', 'TextureCompressionBCSliced3D'): 'texture-compression-bc-sliced-3d',
    ('WGPUFeatureName', 'TextureCompressionETC2'): 'texture-compression-etc2',
    ('WGPUFeatureName', 'TextureCompressionASTC'): 'texture-compression-astc',
    ('WGPUFeatureName', 'TextureCompressionASTCSliced3D'): 'texture-compression-astc-sliced-3d',
    ('WGPUFeatureName', 'TimestampQuery'): 'timestamp-query',
    ('WGPUFeatureName', 'IndirectFirstInstance'): 'indirect-first-instance',
    ('WGPUFeatureName', 'ShaderF16'): 'shader-f16',
    ('WGPUFeatureName', 'RG11B10UfloatRenderable'): 'rg11b10ufloat-renderable',
    ('WGPUFeatureName', 'BGRA8UnormStorage'): 'bgra8unorm-storage',
    ('WGPUFeatureName', 'Float32Filterable'): 'float32-filterable',
    ('WGPUFeatureName', 'Float32Blendable'): 'float32-blendable',
    ('WGPUFeatureName', 'ClipDistances'): 'clip-distances',
    ('WGPUFeatureName', 'DualSourceBlending'): 'dual-source-blending',
    ('WGPUFeatureName', 'Subgroups'): 'subgroups',
    ('WGPUFeatureName', 'TextureFormatsTier1'): 'texture-formats-tier1',
    ('WGPUFeatureName', 'TextureFormatsTier2'): 'texture-formats-tier2',
    ('WGPUFeatureName', 'PrimitiveIndex'): 'primitive-index',
    ('WGPUFeatureName', 'TextureComponentSwizzle'): 'texture-component-swizzle',
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
    override = ENUM_VALUE_OVERRIDES.get((enum_name, value_name))
    if override is not None:
        return override
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
    print("\nDone. Struct layouts are generated by emit_wgpu_layouts.zig (Zig comptime).")


if __name__ == '__main__':
    main()
