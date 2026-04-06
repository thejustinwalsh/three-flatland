#!/usr/bin/env python3
"""
Generate WIT interface declarations for the WebGPU functions Skia's
Dawn/Graphite backend needs.

Reads the generated dawn/webgpu.h (from generate-wgpu-shim.py) and
extracts wgpu* function declarations, then maps C types to WIT types.

Usage:
    python3 scripts/generate-wgpu-wit.py

Prerequisites:
    Run generate-wgpu-shim.py first (it generates dawn/webgpu.h).

Outputs:
    wit/wgpu.wit — WIT interface with WebGPU function imports
"""

import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PKG_ROOT = SCRIPT_DIR.parent
SHIM_DIR = PKG_ROOT / "src" / "zig" / "wgpu_shim"
WEBGPU_H = SHIM_DIR / "dawn" / "webgpu.h"

# ── C type → WIT type mapping ──
# WebGPU C API uses opaque handles (pointers → u32 in WASM),
# enums (u32), booleans (u32), and sizes (u32/u64).

C_TO_WIT = {
    "void": "void",
    "uint32_t": "u32",
    "int32_t": "s32",
    "uint64_t": "u64",
    "int64_t": "s64",
    "size_t": "u32",
    "float": "f32",
    "double": "f64",
    "bool": "u32",
}

# Opaque handle types — all become u32 in WASM (pointer-sized)
HANDLE_TYPES = {
    "WGPUAdapter", "WGPUBindGroup", "WGPUBindGroupLayout", "WGPUBuffer",
    "WGPUCommandBuffer", "WGPUCommandEncoder", "WGPUComputePassEncoder",
    "WGPUComputePipeline", "WGPUDevice", "WGPUExternalTexture",
    "WGPUInstance", "WGPUPipelineLayout", "WGPUQuerySet", "WGPUQueue",
    "WGPURenderBundle", "WGPURenderBundleEncoder", "WGPURenderPassEncoder",
    "WGPURenderPipeline", "WGPUSampler", "WGPUShaderModule", "WGPUSurface",
    "WGPUTexture", "WGPUTextureView", "WGPUSharedBufferMemory",
    "WGPUSharedTextureMemory", "WGPUSharedFence",
}


def c_type_to_wit(c_type: str) -> str:
    """Map a C type to a WIT type."""
    t = c_type.strip()

    # Remove const, WGPU_NULLABLE, and pointer decorations for classification
    clean = t.replace("const", "").replace("WGPU_NULLABLE", "").replace("*", "").strip()

    # Pointer types → u32 (WASM pointer)
    if "*" in t:
        return "u32"

    # Known handle types → u32
    if clean in HANDLE_TYPES:
        return "u32"

    # Direct type mapping
    if clean in C_TO_WIT:
        return C_TO_WIT[clean]

    # WGPUBool
    if clean == "WGPUBool":
        return "u32"

    # WGPUStatus and other enum-like types → u32
    if clean.startswith("WGPU"):
        return "u32"

    # Fallback
    return "u32"


def to_wit_name(c_name: str) -> str:
    """Convert a C function name like wgpuDeviceCreateBuffer to WIT kebab-case."""
    # Remove 'wgpu' prefix
    name = c_name
    if name.startswith("wgpu"):
        name = name[4:]

    # Insert hyphens before uppercase letters (camelCase → kebab-case)
    result = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0:
            # Don't insert hyphen between consecutive uppercase (e.g., "GPU" → "gpu")
            prev_upper = name[i - 1].isupper()
            next_lower = (i + 1 < len(name)) and name[i + 1].islower()
            if not prev_upper or next_lower:
                result.append("-")
        result.append(ch.lower())

    return "".join(result)


WIT_KEYWORDS = {"type", "use", "enum", "flags", "record", "variant", "resource",
                "own", "borrow", "list", "option", "result", "string", "tuple",
                "char", "bool", "u8", "u16", "u32", "u64", "s8", "s16", "s32",
                "s64", "f32", "f64", "interface", "world", "import", "export",
                "include", "package", "static", "func", "ref"}


def escape_wit_param(name: str) -> str:
    """Escape WIT parameter names that conflict with keywords."""
    if name in WIT_KEYWORDS:
        return f"%{name}"
    return name


def extract_functions(webgpu_h: Path) -> list[tuple[str, str, str]]:
    """Extract wgpu* function declarations from webgpu.h."""
    content = webgpu_h.read_text()
    functions = []

    pattern = re.compile(
        r'WGPU_EXPORT\s+'
        r'([\w\s\*]+?)\s+'
        r'(wgpu\w+)\s*'
        r'\(([^)]*)\)\s*'
        r'WGPU_FUNCTION_ATTRIBUTE\s*;',
        re.MULTILINE | re.DOTALL
    )

    for m in pattern.finditer(content):
        ret_type = m.group(1).strip()
        func_name = m.group(2).strip()
        params = m.group(3).strip()
        functions.append((ret_type, func_name, params))

    return functions


def parse_params(params_str: str) -> list[tuple[str, str]]:
    """Parse C parameter list into (name, wit_type) pairs."""
    if not params_str or params_str.strip() == "void":
        return []

    result = []
    for param in params_str.split(","):
        param = param.strip()
        if not param:
            continue

        # Split type and name — last word is the name (handling pointers)
        # e.g., "WGPUDevice device" → ("device", "u32")
        # e.g., "WGPUBufferDescriptor const * descriptor" → ("descriptor", "u32")
        parts = param.replace("*", "* ").split()
        if not parts:
            continue

        param_name = parts[-1].strip("*").strip()
        # The type is everything except the last word
        c_type = " ".join(parts[:-1]).strip()
        if not c_type:
            c_type = param_name
            param_name = "arg"

        wit_type = c_type_to_wit(c_type)

        # Sanitize param name
        param_name = re.sub(r'[^a-zA-Z0-9_]', '', param_name)
        if not param_name:
            param_name = "arg"
        # Convert camelCase to kebab-case
        param_name = re.sub(r'([a-z])([A-Z])', r'\1-\2', param_name).lower()

        result.append((param_name, wit_type))

    return result


def main():
    if not WEBGPU_H.exists():
        print(f"Error: {WEBGPU_H} not found")
        print("  Run generate-wgpu-shim.py first to generate Dawn headers.")
        sys.exit(1)

    functions = extract_functions(WEBGPU_H)
    print(f"Extracted {len(functions)} wgpu* functions from {WEBGPU_H.name}")

    # Generate WIT
    lines = [
        "// Auto-generated by generate-wgpu-wit.py — do not edit",
        "// WebGPU functions required by Skia's Graphite/Dawn backend",
        "//",
        f"// {len(functions)} functions extracted from dawn/webgpu.h",
        "",
        "interface wgpu {",
    ]

    for ret_type, func_name, params_str in functions:
        wit_name = to_wit_name(func_name)
        params = parse_params(params_str)
        param_str = ", ".join(f"{escape_wit_param(n)}: {t}" for n, t in params)
        wit_ret = c_type_to_wit(ret_type)

        if wit_ret == "void":
            lines.append(f"    {wit_name}: func({param_str});")
        else:
            lines.append(f"    {wit_name}: func({param_str}) -> {wit_ret};")

    lines.append("}")

    wit_content = "\n".join(lines) + "\n"

    # Write output
    wit_path = PKG_ROOT / "wit" / "wgpu.wit"
    with open(wit_path, "w") as f:
        f.write(wit_content)

    print(f"Generated {wit_path}")
    print(f"  {len(functions)} functions")


if __name__ == "__main__":
    main()
