#!/usr/bin/env python3
"""
Parse Skia's compile_commands.json (from GN/Ninja) into Zig-compatible source lists.

Usage:
    1. From packages/skia/third_party/skia/:
       gn gen out/wasm --args='<see spec for args>'
       ninja -C out/wasm -t compdb > compile_commands.json

    2. Run this script:
       python3 scripts/parse_compile_commands.py third_party/skia/compile_commands.json

Output:
    src/zig/generated/skia_sources.zig — committed to repo so downstream
    developers don't need GN/Ninja installed.
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict


def classify_source(filepath: str) -> str | None:
    """Classify a source file into a module category."""
    # Normalize path separators
    fp = filepath.replace("\\", "/")

    # ── Exclude files we don't need ──

    # Image codecs (we disabled all image libs: png, jpeg, webp, avif)
    if "/codec/" in fp or "/Codec" in fp:
        return None
    # Android-specific code
    if "/android/" in fp:
        return None
    # Threading (SkExecutor/SkThreadPool) — WASM is single-threaded
    if "SkExecutor" in fp:
        return None
    # Encoders (we don't need to encode images)
    if "/encode/" in fp:
        return None
    # POSIX-specific file ops with mmap (not available on WASI)
    if "SkOSFile_posix" in fp:
        return None
    # WebGL native interface — now handled by our GL shim headers
    # Platform-specific ports we don't use on WASM
    if "/ports/" in fp and not ("FreeType" in fp or "freetype" in fp):
        # Keep FreeType ports, skip everything else (Mac, Win, Linux-specific)
        if any(x in fp for x in ["SkDebug_stdio", "SkMemory_malloc", "SkOSFile_stdio",
                                   "SkOSFile_posix", "SkDiscardableMemory_none"]):
            return "core"  # Keep these platform-agnostic ports
        return None

    # ── Classify into modules ──

    # GPU backends
    if "/gpu/" in fp and ("/gl/" in fp or "GrGL" in fp or "GrWebGL" in fp):
        return "gl"
    if "/gpu/" in fp and ("/dawn/" in fp or "/webgpu/" in fp or "GrDawn" in fp):
        return "webgpu"
    if "/gpu/" in fp or "/ganesh/" in fp or "/graphite/" in fp:
        return "gpu_core"

    # Modules
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

    # Third-party vendored deps
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


def extract_defines(command: str) -> list[str]:
    """Extract -D flags from a compile command."""
    return re.findall(r"-D(\S+)", command)


def extract_includes(command: str, skia_root: str) -> list[str]:
    """Extract -I flags from a compile command, relative to skia root."""
    includes = re.findall(r"-I\s*(\S+)", command)
    result = []
    for inc in includes:
        # Make relative to skia root
        try:
            rel = os.path.relpath(inc, skia_root)
            result.append(rel)
        except ValueError:
            result.append(inc)
    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: parse_compile_commands.py <path/to/compile_commands.json>")
        sys.exit(1)

    cc_path = Path(sys.argv[1])
    if not cc_path.exists():
        print(f"Error: {cc_path} not found")
        sys.exit(1)

    skia_root = str(cc_path.parent.resolve())

    with open(cc_path) as f:
        commands = json.load(f)

    # Classify sources by module
    modules: dict[str, list[str]] = defaultdict(list)
    all_defines: set[str] = set()
    all_includes: set[str] = set()

    for entry in commands:
        filepath = entry.get("file", "")
        command = entry.get("command", "")
        directory = entry.get("directory", "")

        # Only process C/C++ sources
        if not any(filepath.endswith(ext) for ext in (".cpp", ".cc", ".c", ".cxx")):
            continue

        # Resolve the filepath relative to the compile directory, then make
        # it relative to the skia root. compile_commands.json paths are often
        # relative to the build output dir (e.g., out/wasm/).
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
        all_defines.update(extract_defines(command))

        # Resolve include paths: raw -I flags are relative to the build
        # directory (e.g., out/wasm/), so resolve them to absolute first,
        # then make relative to skia root.
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
            # Skip system paths that resolve outside the skia tree
            if rel_inc.startswith("..") and "/usr/" in abs_inc:
                continue
            all_includes.add(rel_inc.replace("\\", "/"))

    # Sort for deterministic output
    for category in modules:
        modules[category].sort()

    # Generate Zig source file
    output_path = Path(__file__).parent.parent / "src" / "zig" / "generated" / "skia_sources.zig"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        f.write("// Auto-generated by parse_compile_commands.py — do not edit\n")
        f.write("// Regenerate: python3 scripts/parse_compile_commands.py <compile_commands.json>\n\n")

        # Write source lists per module
        for category in sorted(modules.keys()):
            files = modules[category]
            f.write(f"pub const {category}_files: []const []const u8 = &.{{\n")
            for fp in files:
                f.write(f'    "{fp}",\n')
            f.write("};\n\n")

        # Write include paths
        sorted_includes = sorted(all_includes)
        f.write("pub const include_paths: []const []const u8 = &.{\n")
        for inc in sorted_includes:
            f.write(f'    "{inc}",\n')
        f.write("};\n")

    total = sum(len(files) for files in modules.values())
    print(f"Generated {output_path}")
    print(f"  Modules: {', '.join(sorted(modules.keys()))}")
    print(f"  Total source files: {total}")
    print(f"  Include paths: {len(all_includes)}")


if __name__ == "__main__":
    main()
