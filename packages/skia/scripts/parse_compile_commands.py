#!/usr/bin/env python3
"""
Parse Skia's compile_commands.json (from GN/Ninja) into Zig-compatible source lists.

Accepts TWO compile_commands — one from the GL build, one from the WebGPU build —
and merges them into a single skia_sources.zig with:
  - Shared arrays:     core_files, pathops_files, svg_files, skshaper_files, text_files
  - GL-specific:       gl_gpu_files  (Ganesh gpu_core + GL backend)
  - WebGPU-specific:   wgpu_gpu_files (Graphite gpu_core + Dawn backend)
  - include_paths:     union of both builds

Usage:
    python3 scripts/parse_compile_commands.py \\
        --gl third_party/skia/compile_commands.json \\
        --wgpu third_party/skia/compile_commands_webgpu.json

    # Backward compat: single file (GL only, no wgpu arrays)
    python3 scripts/parse_compile_commands.py third_party/skia/compile_commands.json

Output:
    src/zig/generated/skia_sources.zig
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict


# Categories that are shared between both variants
SHARED_CATEGORIES = {"core", "pathops", "svg", "skshaper", "text"}

# Categories specific to GL variant
GL_CATEGORIES = {"gl", "gpu_core"}

# Categories specific to wgpu variant
WGPU_CATEGORIES = {"dawn", "gpu_core"}


def classify_source(filepath: str) -> str | None:
    """Classify a source file into a module category."""
    fp = filepath.replace("\\", "/")

    # ── Exclude files we don't need ──
    if "/codec/" in fp or "/Codec" in fp:
        return None
    if "/android/" in fp:
        return None
    if "SkExecutor" in fp:
        return None
    if "/encode/" in fp:
        return None
    if "SkOSFile_posix" in fp:
        return None
    if "/ports/" in fp and not ("FreeType" in fp or "freetype" in fp):
        if any(x in fp for x in ["SkDebug_stdio", "SkMemory_malloc", "SkOSFile_stdio",
                                   "SkOSFile_posix", "SkDiscardableMemory_none"]):
            return "core"
        return None

    # ── Classify into modules ──

    # GPU backends (variant-specific)
    if "/gpu/" in fp and ("/gl/" in fp or "GrGL" in fp or "GrWebGL" in fp):
        return "gl"
    if "/gpu/" in fp and ("/dawn/" in fp or "Dawn" in fp):
        return "dawn"
    if "/gpu/" in fp or "/ganesh/" in fp or "/graphite/" in fp:
        return "gpu_core"

    # Shared modules
    if "/pathops/" in fp:
        return "pathops"
    if "/svg/" in fp or "/modules/svg/" in fp:
        return "svg"
    if "/skshaper/" in fp or "/modules/skshaper/" in fp:
        return "skshaper"

    # Text rendering
    if "/sfnt/" in fp:
        return "text"
    if "/ports/" in fp and ("FreeType" in fp or "freetype" in fp):
        return "text"
    if "harfbuzz" in fp.lower() or "hb_" in fp.lower():
        return "text"

    # Third-party vendored deps (handled separately in build.zig)
    if "/third_party/freetype" in fp:
        return "freetype"
    if "/third_party/harfbuzz" in fp:
        return "harfbuzz"
    if "/third_party/expat" in fp:
        return "expat"

    # Core Skia
    if "/src/" in fp or "/include/" in fp or "/modules/" in fp:
        return "core"

    return None


def parse_compile_commands(cc_path: Path) -> tuple[dict[str, list[str]], set[str]]:
    """Parse a compile_commands.json and return (modules, include_paths)."""
    skia_root = str(cc_path.parent.resolve())

    with open(cc_path) as f:
        commands = json.load(f)

    modules: dict[str, list[str]] = defaultdict(list)
    all_includes: set[str] = set()

    for entry in commands:
        filepath = entry.get("file", "")
        command = entry.get("command", "")
        directory = entry.get("directory", "")

        if not any(filepath.endswith(ext) for ext in (".cpp", ".cc", ".c", ".cxx")):
            continue

        if not os.path.isabs(filepath) and directory:
            filepath = os.path.normpath(os.path.join(directory, filepath))

        category = classify_source(filepath)
        if category is None:
            continue

        try:
            rel_path = os.path.relpath(filepath, skia_root)
        except ValueError:
            rel_path = filepath

        modules[category].append(rel_path.replace("\\", "/"))

        # Resolve include paths
        raw_includes = re.findall(r"-I\s*(\S+)", command)
        for inc in raw_includes:
            if not os.path.isabs(inc) and directory:
                abs_inc = os.path.normpath(os.path.join(directory, inc))
            else:
                abs_inc = os.path.normpath(inc)
            try:
                rel_inc = os.path.relpath(abs_inc, skia_root)
            except ValueError:
                rel_inc = inc
            if rel_inc.startswith("..") and "/usr/" in abs_inc:
                continue
            all_includes.add(rel_inc.replace("\\", "/"))

    # Sort for deterministic output
    for category in modules:
        modules[category].sort()

    return dict(modules), all_includes


def write_zig_array(f, name: str, files: list[str]):
    """Write a Zig slice-of-strings constant."""
    f.write(f"pub const {name}: []const []const u8 = &.{{\n")
    for fp in sorted(set(files)):
        f.write(f'    "{fp}",\n')
    f.write("};\n\n")


def main():
    # Parse args
    gl_path = None
    wgpu_path = None
    positional = []

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--gl" and i + 1 < len(args):
            gl_path = Path(args[i + 1])
            i += 2
        elif args[i] == "--wgpu" and i + 1 < len(args):
            wgpu_path = Path(args[i + 1])
            i += 2
        # Backward compat: --variant is ignored, positional arg is GL
        elif args[i] == "--variant" and i + 1 < len(args):
            i += 2  # skip
        else:
            positional.append(args[i])
            i += 1

    # Backward compat: single positional arg = GL only
    if not gl_path and positional:
        gl_path = Path(positional[0])

    if not gl_path:
        print("Usage: parse_compile_commands.py --gl <gl_compile_commands.json> --wgpu <wgpu_compile_commands.json>")
        print("   or: parse_compile_commands.py <gl_compile_commands.json>  (GL only, backward compat)")
        sys.exit(1)

    # Parse GL
    if not gl_path.exists():
        print(f"Error: {gl_path} not found")
        sys.exit(1)
    print(f"Parsing GL compile_commands: {gl_path}")
    gl_modules, gl_includes = parse_compile_commands(gl_path)

    # Parse wgpu (optional)
    wgpu_modules: dict[str, list[str]] = {}
    wgpu_includes: set[str] = set()
    if wgpu_path:
        if not wgpu_path.exists():
            print(f"Error: {wgpu_path} not found")
            sys.exit(1)
        print(f"Parsing WebGPU compile_commands: {wgpu_path}")
        wgpu_modules, wgpu_includes = parse_compile_commands(wgpu_path)

    # ── Merge into one output ──

    # Shared files: union of core/pathops/svg/skshaper/text from both builds
    shared: dict[str, list[str]] = {}
    for cat in SHARED_CATEGORIES:
        gl_files = gl_modules.get(cat, [])
        wgpu_files = wgpu_modules.get(cat, [])
        merged = sorted(set(gl_files) | set(wgpu_files))
        if merged:
            shared[cat] = merged

    # GL-specific: gpu_core (Ganesh) + gl files
    gl_gpu = sorted(set(
        gl_modules.get("gpu_core", []) +
        gl_modules.get("gl", [])
    ))

    # wgpu-specific: gpu_core (Graphite) + dawn files
    wgpu_gpu = sorted(set(
        wgpu_modules.get("gpu_core", []) +
        wgpu_modules.get("dawn", [])
    ))

    # Include paths: union of both
    all_includes = sorted(gl_includes | wgpu_includes)

    # ── Write output ──

    output_path = Path(__file__).parent.parent / "src" / "zig" / "generated" / "skia_sources.zig"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        f.write("// Auto-generated by parse_compile_commands.py — do not edit\n")
        f.write("// Regenerate: python3 scripts/parse_compile_commands.py --gl <gl.json> --wgpu <wgpu.json>\n\n")

        f.write("// ── Shared (compiled into both GL and WebGPU variants) ──\n\n")
        for cat in sorted(shared.keys()):
            write_zig_array(f, f"{cat}_files", shared[cat])

        f.write("// ── GL-specific (Ganesh + GL backend) ──\n\n")
        write_zig_array(f, "gl_gpu_files", gl_gpu)

        if wgpu_gpu:
            f.write("// ── WebGPU-specific (Graphite + Dawn backend) ──\n\n")
            write_zig_array(f, "wgpu_gpu_files", wgpu_gpu)
        else:
            f.write("// ── WebGPU-specific (placeholder — run with --wgpu to populate) ──\n\n")
            f.write("pub const wgpu_gpu_files: []const []const u8 = &.{};\n\n")

        f.write("// ── Include paths (union of both builds) ──\n\n")
        f.write("pub const include_paths: []const []const u8 = &.{\n")
        for inc in all_includes:
            f.write(f'    "{inc}",\n')
        f.write("};\n")

    # Report
    shared_total = sum(len(files) for files in shared.values())
    print(f"\nGenerated {output_path}")
    print(f"  Shared files:   {shared_total} ({', '.join(f'{k}={len(v)}' for k, v in sorted(shared.items()))})")
    print(f"  GL GPU files:   {len(gl_gpu)}")
    print(f"  wgpu GPU files: {len(wgpu_gpu)}")
    print(f"  Include paths:  {len(all_includes)}")


if __name__ == "__main__":
    main()
