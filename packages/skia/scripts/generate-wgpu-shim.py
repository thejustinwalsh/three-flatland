#!/usr/bin/env python3
"""
Generate WebGPU C/C++ shim headers for the Zig/WASM build.

Mirrors generate-gl-shim.py but for the WebGPU/Dawn backend:
  1. Runs Dawn's code generator to produce webgpu.h and webgpu_cpp.h
  2. Post-processes webgpu.h to add WASM import attributes
  3. Generates a non-inline C wrapper file (wgpu functions can't have their address
     taken when imported directly — same constraint as GL)

The generated headers replace what Emscripten normally provides (Emscripten ships
its own webgpu.h for WASM builds). Since we use Zig instead of Emscripten, we
generate our own stubs that declare the functions as WASM imports from module "wgpu".

Usage:
    python3 scripts/generate-wgpu-shim.py

Prerequisites:
    - Python 3 with jinja2 (Dawn's generator uses it)
    - Dawn repo at third_party/skia/third_party/externals/dawn/

Outputs:
    src/zig/wgpu_shim/dawn/webgpu.h             — Generated C API with WASM imports
    src/zig/wgpu_shim/dawn/webgpu_cpp.h          — Generated C++ wrappers
    src/zig/wgpu_shim/dawn/webgpu_cpp_print.h    — Generated C++ print helpers
    src/zig/wgpu_shim/dawn/dawn_proc_table.h     — Proc table (not used but generated)
    src/zig/wgpu_shim/webgpu/webgpu.h            — Redirect: #include "dawn/webgpu.h"
    src/zig/wgpu_shim/webgpu/webgpu_cpp.h        — Redirect: #include "dawn/webgpu_cpp.h"
    src/zig/wgpu_shim/webgpu/webgpu_cpp_chained_struct.h — Generated
    src/zig/wgpu_shim/emscripten_wgpu_shim.h     — Internal WASM import declarations
    src/zig/wgpu_shim/emscripten_wgpu_shim.c     — Non-inline C wrappers
"""

import os
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PKG_ROOT = SCRIPT_DIR.parent
SKIA_DIR = PKG_ROOT / "third_party" / "skia"
DAWN_DIR = SKIA_DIR / "third_party" / "externals" / "dawn"
SHIM_DIR = PKG_ROOT / "src" / "zig" / "wgpu_shim"


def generate_dawn_headers():
    """Run Dawn's code generator to produce webgpu.h and webgpu_cpp.h."""
    generator = DAWN_DIR / "generator" / "dawn_json_generator.py"
    dawn_json = DAWN_DIR / "src" / "dawn" / "dawn.json"
    template_dir = DAWN_DIR / "generator" / "templates"
    jinja2_path = DAWN_DIR / "third_party" / "jinja2"
    markupsafe_path = DAWN_DIR / "third_party" / "markupsafe"

    if not generator.exists():
        print(f"Error: Dawn generator not found at {generator}")
        print("  Ensure the Skia submodule is initialized with Dawn.")
        sys.exit(1)

    # jinja2/markupsafe: prefer Dawn's vendored copies, fall back to system
    jinja2_args = []
    if jinja2_path.exists():
        jinja2_args += ["--jinja2-path", str(jinja2_path)]
    if markupsafe_path.exists():
        jinja2_args += ["--markupsafe-path", str(markupsafe_path)]
    # If neither vendored path exists, Dawn's generator will try system jinja2

    # Generate both C and C++ headers
    out_dir = SHIM_DIR / "_gen"
    os.makedirs(out_dir, exist_ok=True)

    for targets in ["headers", "cpp_headers"]:
        cmd = [
            sys.executable, str(generator),
            "--dawn-json", str(dawn_json),
            "--targets", targets,
            "--template-dir", str(template_dir),
            "--output-dir", str(out_dir),
        ] + jinja2_args
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error running Dawn generator (targets={targets}):")
            print(result.stderr)
            sys.exit(1)

    return out_dir


def extract_c_functions(webgpu_h_path: Path) -> list[tuple[str, str, str]]:
    """Extract function declarations from generated webgpu.h.

    Returns list of (return_type, function_name, params_str).
    """
    content = webgpu_h_path.read_text()
    functions = []

    # Match WGPU_EXPORT return_type wgpuFunctionName(params);
    # Also match multiline declarations
    pattern = re.compile(
        r'WGPU_EXPORT\s+'
        r'([\w\s\*]+?)\s+'  # return type
        r'(wgpu\w+)\s*'     # function name
        r'\(([^)]*)\)\s*'    # parameters
        r'WGPU_FUNCTION_ATTRIBUTE\s*;',
        re.MULTILINE | re.DOTALL
    )

    for m in pattern.finditer(content):
        ret_type = m.group(1).strip()
        func_name = m.group(2).strip()
        params = m.group(3).strip()
        functions.append((ret_type, func_name, params))

    return functions


def post_process_webgpu_h(gen_dir: Path):
    """Post-process generated webgpu.h to add WASM import attributes."""
    src = gen_dir / "include" / "dawn" / "webgpu.h"
    content = src.read_text()

    # Replace WGPU_EXPORT with our WASM import macro
    # We'll define WGPU_EXPORT to add import_module("wgpu") in the shim header
    # For now, just copy as-is — the non-inline wrappers handle the actual imports

    dst_dawn = SHIM_DIR / "dawn"
    os.makedirs(dst_dawn, exist_ok=True)

    # Copy the generated header as-is (C++ code includes this)
    (dst_dawn / "webgpu.h").write_text(content)

    # Copy C++ headers
    cpp_h = gen_dir / "include" / "dawn" / "webgpu_cpp.h"
    if cpp_h.exists():
        (dst_dawn / "webgpu_cpp.h").write_text(cpp_h.read_text())

    cpp_print_h = gen_dir / "include" / "dawn" / "webgpu_cpp_print.h"
    if cpp_print_h.exists():
        (dst_dawn / "webgpu_cpp_print.h").write_text(cpp_print_h.read_text())

    proc_table_h = gen_dir / "include" / "dawn" / "dawn_proc_table.h"
    if proc_table_h.exists():
        (dst_dawn / "dawn_proc_table.h").write_text(proc_table_h.read_text())

    chained_struct_h = gen_dir / "include" / "webgpu" / "webgpu_cpp_chained_struct.h"
    if chained_struct_h.exists():
        os.makedirs(SHIM_DIR / "webgpu", exist_ok=True)
        (SHIM_DIR / "webgpu" / "webgpu_cpp_chained_struct.h").write_text(
            chained_struct_h.read_text()
        )

    return content


def generate_shim_files(functions: list[tuple[str, str, str]]):
    """Generate WASM import header and non-inline C wrappers."""

    # ── emscripten_wgpu_shim.h ──
    # Declares each wgpu function as a WASM import from module "wgpu"
    h_lines = [
        "// Auto-generated WebGPU function WASM imports for Zig/WASM build.",
        "// WASM imported functions cannot have their address taken.",
        "// These declarations import from the \"wgpu\" JS module.",
        "//",
        "// Generated by generate-wgpu-shim.py — do not edit",
        "",
        "#pragma once",
        "",
        '#include "dawn/webgpu.h"',
        "",
        "#ifdef __cplusplus",
        'extern "C" {',
        "#endif",
        "",
    ]

    for ret, name, params in functions:
        import_attr = f'__attribute__((import_module("wgpu"), import_name("{name}")))'
        param_str = params if params else "void"
        h_lines.append(f'{import_attr} {ret} __wasm_import_{name}({param_str});')

    h_lines.extend([
        "",
        "#ifdef __cplusplus",
        "}",
        "#endif",
        "",
    ])

    (SHIM_DIR / "emscripten_wgpu_shim.h").write_text("\n".join(h_lines))

    # ── emscripten_wgpu_shim.c ──
    # Non-inline wrappers that delegate to the WASM imports
    c_lines = [
        "// Auto-generated WebGPU function wrappers for WASM.",
        "// WASM imported functions cannot have their address taken (not in indirect call table).",
        "// These non-inline wrappers ensure addressable function pointers.",
        "//",
        "// Generated by generate-wgpu-shim.py — do not edit",
        "",
        '#include "emscripten_wgpu_shim.h"',
        "",
    ]

    for ret, name, params in functions:
        param_str = params if params else "void"
        # Extract just parameter names for the call
        if params:
            # Parse "Type1 name1, Type2 name2" → "name1, name2"
            param_names = []
            for p in params.split(","):
                p = p.strip()
                if not p:
                    continue
                # Handle pointers: "const Type * name" or "Type* name"
                # Take the last word as the param name
                parts = p.replace("*", "* ").split()
                param_names.append(parts[-1].strip("*"))
            call_args = ", ".join(param_names)
        else:
            call_args = ""

        if ret == "void":
            c_lines.append(f'{ret} {name}({param_str}) {{ __wasm_import_{name}({call_args}); }}')
        else:
            c_lines.append(f'{ret} {name}({param_str}) {{ return __wasm_import_{name}({call_args}); }}')

    c_lines.append("")
    (SHIM_DIR / "emscripten_wgpu_shim.c").write_text("\n".join(c_lines))


def copy_static_dawn_headers():
    """Copy static (non-generated) Dawn headers needed by the generated C++ code."""
    webgpu_dir = SHIM_DIR / "webgpu"
    os.makedirs(webgpu_dir, exist_ok=True)

    static_headers = [
        "webgpu_enum_class_bitmasks.h",
    ]

    dawn_include = DAWN_DIR / "include" / "webgpu"
    for name in static_headers:
        src = dawn_include / name
        if src.exists():
            (webgpu_dir / name).write_text(src.read_text())
        else:
            print(f"  Warning: static header {src} not found")


def generate_redirect_headers():
    """Generate webgpu/ redirect headers pointing to dawn/ headers."""
    webgpu_dir = SHIM_DIR / "webgpu"
    os.makedirs(webgpu_dir, exist_ok=True)

    redirects = {
        "webgpu.h": "dawn/webgpu.h",
        "webgpu_cpp.h": "dawn/webgpu_cpp.h",
    }

    for filename, target in redirects.items():
        path = webgpu_dir / filename
        path.write_text(
            f"// Redirect: maps #include <webgpu/{filename}> to Dawn's generated header\n"
            f'#include "../{target}"\n'
        )


def main():
    print("=== Generating WebGPU shim for Zig/WASM build ===")
    print()

    # Step 1: Run Dawn's code generator
    print("Running Dawn's code generator...")
    gen_dir = generate_dawn_headers()
    print(f"  Generated headers in {gen_dir}/")

    # Step 2: Post-process and copy headers
    print("Post-processing headers...")
    content = post_process_webgpu_h(gen_dir)

    # Step 3: Extract function declarations
    print("Extracting C function declarations...")
    webgpu_h = gen_dir / "include" / "dawn" / "webgpu.h"
    functions = extract_c_functions(webgpu_h)
    print(f"  Found {len(functions)} wgpu* functions")

    # Step 4: Generate WASM import shim
    print("Generating WASM import shim...")
    generate_shim_files(functions)

    # Step 5: Copy static Dawn headers
    print("Copying static Dawn headers...")
    copy_static_dawn_headers()

    # Step 6: Generate redirect headers
    print("Generating redirect headers...")
    generate_redirect_headers()

    # Cleanup temp dir
    import shutil
    shutil.rmtree(gen_dir, ignore_errors=True)

    print()
    print(f"Generated WebGPU shim in {SHIM_DIR}/")
    print(f"  {len(functions)} wgpu* WASM import functions")
    print(f"  dawn/webgpu.h — C API ({SHIM_DIR / 'dawn' / 'webgpu.h'})")
    print(f"  dawn/webgpu_cpp.h — C++ wrappers ({SHIM_DIR / 'dawn' / 'webgpu_cpp.h'})")
    print(f"  emscripten_wgpu_shim.h — WASM imports")
    print(f"  emscripten_wgpu_shim.c — non-inline wrappers")


if __name__ == "__main__":
    main()
