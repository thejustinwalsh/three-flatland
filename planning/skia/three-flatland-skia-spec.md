# three-flatland/skia — Engineering Specification

## Overview

`three-flatland/skia` is a custom, minimal build of Skia compiled to WebAssembly via Zig, designed to integrate directly with Three.js and react-three-fiber as part of the three-flatland 2D library. It provides high-quality vector drawing, text rendering, and SVG support as a first-class texture source within Three.js scenes.

The library ships as **two backend-variant WASM builds** (`skia-gl.wasm` and `skia-webgpu.wasm`), each containing the full Skia core statically linked with its respective GPU backend. The correct variant is lazy-loaded at runtime based on the Three.js renderer in use. A WIT interface describes the JS↔WASM boundary, and JCO transpiles the component into typed ES modules with full TypeScript declarations. PathOps (boolean path operations) is bundled into the core by default. The system targets both web (via WASM) and native (via wasm2c + Zig) for react-native-webgpu support.

### Design Goals

- **Lightweight**: Sub-1MB gzipped total for a typical web deployment, down from CanvasKit's ~2.9MB gzipped
- **Three.js native**: Integrates via Three.js base classes, providing automatic react-three-fiber support through the three-flatland pattern
- **Dual API**: Declarative JSX components for r3f and an imperative callback-based drawing API
- **Lazy by default**: Skia WASM is loaded on-demand when first needed, not at page load — with an opt-in preload API
- **Backend variants**: WebGL and WebGPU as separate build variants (not runtime-composed components), lazy-loaded based on renderer detection
- **Typed from WIT**: WIT interface definitions are the source of truth; JCO generates JS glue code and `.d.ts` TypeScript declarations automatically
- **Cross-platform**: Single Zig build targeting WASM for web, with wasm2c path for native react-native-webgpu deployment

### Why Not Separate WIT Components for Backends?

The original design proposed splitting Skia into separate WIT components (core, GL backend, WebGPU backend) composed at runtime via the Component Model. This does not work because:

1. **Shared-nothing isolation breaks Skia's object graph.** The Component Model gives each component its own linear memory. Skia's `GrDirectContext`, `SkSurface`, `SkCanvas`, and GPU command buffers form a single interconnected C++ object graph connected by raw pointers. These pointers cannot cross component memory boundaries.

2. **The backend boundary barely exists at runtime.** The GPU backend is wired in once during `GrDirectContext` creation. After that, all draw calls (`drawRect`, `drawPath`, etc.) execute entirely within the core — they never cross a component boundary. Only `flush()` touches the backend, and it does so through Skia's internal vtable dispatch, not through an external interface.

3. **The real modularity is at build time.** The choice of GL vs WebGPU is a compile-time decision about which Skia source files to include. Two build variants achieve the same tree-shaking benefit (users download only the backend they need) without the impossible shared-nothing split.

PathOps is bundled into core rather than kept as a separate component because it adds only ~40-60KB gzipped, is commonly needed for vector design use cases (design tools, font tools, SVG manipulation, shape combination), and avoids the complexity of a separate loading path for a small size savings.

---

## Architecture

### Module Structure

```
┌─────────────────────────────────────────────────┐
│                JS / TypeScript                   │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Declarative  │  │  Imperative Callback    │  │
│  │ r3f API      │  │  API                    │  │
│  │ <SkiaCanvas> │  │  layer.draw((ctx) => {  │  │
│  │ <SkiaRect>   │  │    ctx.drawRect(...)    │  │
│  │ <SkiaText>   │  │  })                     │  │
│  └──────┬───────┘  └───────────┬─────────────┘  │
│         │                      │                 │
│         └──────────┬───────────┘                 │
│                    │                             │
│         ┌──────────▼───────────┐                 │
│         │  SkiaLayer           │                 │
│         │  (THREE.Object3D)    │                 │
│         │  Manages surface     │                 │
│         │  lifecycle & texture │                 │
│         └──────────┬───────────┘                 │
│                    │                             │
│         ┌──────────▼───────────┐                 │
│         │  JS Binding Layer    │                 │
│         │  JCO-generated glue  │                 │
│         │  + TypeScript types  │                 │
│         └──────────┬───────────┘                 │
└────────────────────┼─────────────────────────────┘
                     │
    ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─  WASM boundary
                     │
           ┌─────────┴──────────┐
           │  (lazy loaded)     │
           │  one of:           │
           │                    │
    ┌──────▼───────┐  ┌────────▼──────┐
    │ skia-gl.wasm │  │skia-webgpu    │
    │              │  │ .wasm         │
    │ Skia core    │  │ Skia core     │
    │ + WebGL      │  │ + WebGPU/Dawn │
    │ + PathOps    │  │ + PathOps     │
    │ + Text/SVG   │  │ + Text/SVG    │
    │              │  │               │
    │ Full self-   │  │ Full self-    │
    │ contained    │  │ contained     │
    │ module       │  │ module        │
    └──────────────┘  └───────────────┘
```

Each `.wasm` variant is a **single WIT component** containing the full Skia core statically linked with one GPU backend. The JS binding layer (generated by JCO from the WIT interface) provides typed ES module imports and `.d.ts` declarations. Only one variant is ever downloaded and loaded per application.

### WIT Interface Definition

#### skia.wit

The WIT interface describes the JS↔WASM boundary for the combined core+backend module. This single WIT world is used for both build variants (`skia-gl.wasm` and `skia-webgpu.wasm`) — the only difference between them is which Skia backend sources are statically linked.

The WIT file is authored manually and is the source of truth for both:
1. **Zig guest bindings**: `wit-bindgen c` generates C headers from the WIT; Zig's `@cImport` consumes them, and the Zig binding layer implements the exports against Skia's C++ API.
2. **JS host bindings**: `wasm-tools component new` wraps the core WASM module with the WIT metadata, then `jco transpile` generates typed JS glue code and `.d.ts` TypeScript declarations.

```wit
package three-flatland:skia;

world skia {
    // ── Context & Surface lifecycle ──

    /// Initialize Skia with backend-specific GPU context.
    /// config-data contains GL proc table or WebGPU device reference as bytes.
    export init: func(config-data: list<u8>);
    export destroy: func();

    /// Begin a draw pass targeting a framebuffer/texture handle.
    /// Returns an opaque canvas handle, or none on failure.
    export begin-drawing: func(target-handle: u32, width: s32, height: s32) -> option<u32>;
    export end-drawing: func();
    export flush: func();

    // ── Path API ──

    resource path {
        constructor();
        move-to: func(x: f32, y: f32);
        line-to: func(x: f32, y: f32);
        quad-to: func(cx: f32, cy: f32, x: f32, y: f32);
        cubic-to: func(c1x: f32, c1y: f32, c2x: f32, c2y: f32, x: f32, y: f32);
        arc-to: func(rx: f32, ry: f32, rotation: f32, large: bool, sweep: bool, x: f32, y: f32);
        close: func();
        reset: func();
    }

    export path-from-svg-string: func(d: string) -> option<path>;
    export path-to-svg-string: func(p: borrow<path>) -> string;

    // ── Paint API ──

    resource paint {
        constructor();
        set-color: func(r: f32, g: f32, b: f32, a: f32);
        set-fill: func();
        set-stroke: func(width: f32);
        set-stroke-cap: func(cap: u8);
        set-stroke-join: func(join: u8);
        set-stroke-miter: func(limit: f32);
        set-anti-alias: func(aa: bool);
        set-blend-mode: func(mode: u8);
        set-alpha: func(alpha: f32);
        set-dash: func(intervals: list<f32>, phase: f32);
        clear-dash: func();
        set-blur: func(sigma: f32);
        clear-blur: func();
        set-linear-gradient: func(x0: f32, y0: f32, x1: f32, y1: f32, colors: list<u32>, stops: list<f32>);
        set-radial-gradient: func(cx: f32, cy: f32, r: f32, colors: list<u32>, stops: list<f32>);
        set-sweep-gradient: func(cx: f32, cy: f32, colors: list<u32>, stops: list<f32>);
        clear-shader: func();
    }

    // ── Font & Text ──

    resource font {
        constructor(data: list<u8>, size: f32);
        set-size: func(size: f32);
        measure-text: func(text: string) -> f32;
    }

    // ── SVG ──

    resource svg-dom {
        constructor(data: string);
        get-size: func() -> tuple<f32, f32>;
        set-size: func(w: f32, h: f32);
    }

    // ── Canvas drawing (operates on active canvas from begin-drawing) ──

    export canvas-clear: func(r: f32, g: f32, b: f32, a: f32);
    export canvas-draw-rect: func(x: f32, y: f32, w: f32, h: f32, p: borrow<paint>);
    export canvas-draw-round-rect: func(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32, p: borrow<paint>);
    export canvas-draw-circle: func(cx: f32, cy: f32, r: f32, p: borrow<paint>);
    export canvas-draw-oval: func(x: f32, y: f32, w: f32, h: f32, p: borrow<paint>);
    export canvas-draw-line: func(x0: f32, y0: f32, x1: f32, y1: f32, p: borrow<paint>);
    export canvas-draw-path: func(path: borrow<path>, p: borrow<paint>);
    export canvas-draw-text: func(text: string, x: f32, y: f32, f: borrow<font>, p: borrow<paint>);
    export canvas-draw-svg: func(svg: borrow<svg-dom>);

    // Transform stack
    export canvas-save: func();
    export canvas-restore: func();
    export canvas-translate: func(x: f32, y: f32);
    export canvas-rotate: func(degrees: f32);
    export canvas-scale: func(sx: f32, sy: f32);
    export canvas-concat-matrix: func(m: list<f32>);

    // Clipping
    export canvas-clip-rect: func(x: f32, y: f32, w: f32, h: f32);
    export canvas-clip-round-rect: func(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32);
    export canvas-clip-path: func(path: borrow<path>);

    // ── PathOps (bundled) ──

    enum path-op {
        difference,
        intersect,
        union,
        xor,
        reverse-difference,
    }

    export path-op-apply: func(a: borrow<path>, b: borrow<path>, op: path-op) -> option<path>;
    export path-simplify: func(p: borrow<path>) -> option<path>;
}
```

#### Why resources for Path, Paint, Font, SVG?

WIT resources map to opaque i32 handles in the canonical ABI. JCO generates a JS class for each resource with the declared methods, backed by a handle table that maps to WASM-side pointers. This gives us:

- **Automatic `.d.ts` types**: Each resource becomes a TypeScript class with typed methods
- **FinalizationRegistry integration**: JCO can hook resource drop to clean up WASM-side allocations
- **Zero-copy hot path**: `borrow<paint>` on a draw call passes a single i32 handle — no serialization

For example, `canvas-draw-rect(x, y, w, h, borrow<paint>)` lowers to a WASM call with 5 numeric params (4 f32 + 1 i32 handle). The JCO glue is essentially:

```javascript
// JCO-generated (simplified)
export function canvasDrawRect(x, y, w, h, paint) {
    exports['canvas-draw-rect'](x, y, w, h, handleTable[paint[symbolHandle]]);
}
```

#### PathOps bundled into core

PathOps is included in both build variants rather than as a separate WIT component. The reasons:

- **Size**: PathOps adds ~40-60KB gzipped — marginal relative to the ~800KB core
- **Common use**: Boolean path operations (union, intersect, difference, xor) are standard features in any vector graphics context — design tools, font manipulation, SVG preprocessing, procedural geometry, shape combination. They're the equivalent of CSG (constructive solid geometry) for 2D.
- **No boundary needed**: PathOps operates on `SkPath` objects that already live in the core's linear memory. Splitting it into a separate component would require serializing paths across a memory boundary for no benefit.
- **Simplicity**: One loading path, one component, one set of TypeScript types

### WIT → Zig → Component → JCO Toolchain

The build pipeline from WIT to usable JS imports:

```
                        ┌─────────────┐
                        │  skia.wit   │  (hand-authored, source of truth)
                        └──────┬──────┘
                               │
                 ┌─────────────┼──────────────┐
                 │             │              │
                 ▼             ▼              ▼
          ┌─────────┐   ┌──────────┐   ┌──────────┐
          │wit-bindgen   │jco types │   │(docs/    │
          │c         │   │          │   │ reference)│
          └────┬─────┘   └────┬─────┘   └──────────┘
               │              │
               ▼              ▼
        ┌────────────┐  ┌──────────┐
        │ skia.h     │  │ skia.d.ts│  (standalone dev types)
        │ skia.c     │  └──────────┘
        │ (C glue +  │
        │  WIT custom │
        │  section)   │
        └────┬────────┘
             │
             ▼  (@cImport in Zig)
        ┌──────────────┐
        │ Zig binding  │  (implements exports against Skia C++ API)
        │ + Skia libs  │
        └────┬─────────┘
             │  zig build
             ▼
        ┌──────────────┐
        │ skia-gl.wasm │  (core wasm module with WIT custom section embedded)
        └────┬─────────┘
             │  wasm-tools component new
             ▼
        ┌────────────────────┐
        │ skia-gl.component  │  (WIT component binary)
        │ .wasm              │
        └────┬───────────────┘
             │  jco transpile
             ▼
        ┌──────────────────────────┐
        │ dist/skia-gl/            │
        │   skia-gl.js        (ES module, typed exports)
        │   skia-gl.d.ts      (TypeScript declarations)
        │   skia-gl.core.wasm (raw wasm binary)
        └──────────────────────────┘
```

Key points:

- **WIT file is authored manually** — it defines the contract. You write it once and it drives everything downstream.
- **wit-bindgen generates C** (not Zig directly). Zig has no native wit-bindgen target, but Zig's `@cImport` seamlessly consumes C headers. The generated `.c` file also embeds the WIT metadata as a WASM custom section, which `wasm-tools component new` reads.
- **jco transpile generates both `.js` and `.d.ts`** from the component binary. The TypeScript types are derived from the WIT interface — every resource becomes a class, every enum becomes a union type, every function gets a typed signature. No manual `.d.ts` authoring.
- **jco types** can generate standalone `.d.ts` files from the WIT file alone (without a compiled component). This is useful during development for IDE support before the WASM binary is ready.

### Lazy Loading & Backend Selection

Skia is **lazy-loaded by default**. The WASM module is not fetched or instantiated until the first `SkiaContext` is created (typically when a `<SkiaCanvas>` mounts or `SkiaLayer` is constructed). Users who want to eliminate the first-frame delay can opt into preloading.

The backend variant is selected based on the Three.js renderer at the time of first use. Once loaded, the same module instance is reused for the lifetime of the application.

```typescript
// three-flatland/skia public API

/** Preload Skia WASM — optional, for eager initialization */
export function preloadSkia(renderer: THREE.WebGLRenderer | THREE.WebGPURenderer): Promise<void>;

/** Internal: lazy-load the correct variant */
let _skiaModulePromise: Promise<SkiaWasmModule> | null = null;

export function getSkiaModule(renderer: THREE.Renderer): Promise<SkiaWasmModule> {
    if (_skiaModulePromise) return _skiaModulePromise;

    _skiaModulePromise = loadSkiaVariant(renderer);
    return _skiaModulePromise;
}

async function loadSkiaVariant(renderer: THREE.Renderer): Promise<SkiaWasmModule> {
    const isWebGPU = 'backend' in renderer && renderer.backend?.device;

    if (isWebGPU) {
        try {
            // Dynamic import — bundler splits this into a separate chunk
            const mod = await import('./dist/skia-webgpu/skia-webgpu.js');
            return mod;
        } catch (e) {
            console.warn('three-flatland/skia: WebGPU variant failed, falling back to WebGL');
        }
    }

    const mod = await import('./dist/skia-gl/skia-gl.js');
    return mod;
}
```

The `./dist/skia-gl/skia-gl.js` and `./dist/skia-webgpu/skia-webgpu.js` files are the JCO-generated ES modules. Each imports its corresponding `.core.wasm` file and exports the typed interface. The dynamic `import()` ensures the unused variant is never fetched.

JCO links the selected backend to `skia-core` at instantiation time, satisfying the `gpu-backend` import.

---

## Skia Build Configuration

### Source

Clone from `https://skia.googlesource.com/skia` or GitHub mirror at `https://github.com/google/skia`.

### Feature Matrix

| Feature | GN Flag | Enabled | Rationale |
|---|---|---|---|
| GPU rendering | `skia_enable_gpu=true` | ✅ | Core requirement |
| WebGL backend | `skia_use_gl=true, skia_use_webgl=true` | ✅ | WebGL backend component |
| FreeType | `skia_use_freetype=true` | ✅ | Font rasterization |
| HarfBuzz | `skia_use_harfbuzz=true` | ✅ | Text shaping (ligatures, kerning, complex scripts) |
| SkShaper | `skia_enable_skshaper=true` | ✅ | Shaped text rendering without full paragraph |
| SVG | `skia_enable_svg=true` | ✅ | SVG parse + render + path extraction |
| Path Ops | `skia_enable_pathops=true` | ✅ | Boolean path operations (separate WIT component) |
| Expat XML | `skia_use_expat=true` | ✅ | Required by SVG module |
| PDF | `skia_enable_pdf=false` | ❌ | Out of scope |
| Skottie/Lottie | `skia_enable_skottie=false` | ❌ | Out of scope |
| SkParagraph | `skia_enable_skparagraph=false` | ❌ | Out of scope — bloats bundle with ICU |
| ICU | `skia_use_icu=false` | ❌ | Massive size cost (~1.5-2MB), not needed without paragraph |
| PNG codec | `skia_use_libpng=false` | ❌ | Image loading out of scope |
| JPEG codec | `skia_use_libjpeg_turbo=false` | ❌ | Image loading out of scope |
| WebP codec | `skia_use_libwebp=false` | ❌ | Image loading out of scope |
| AVIF codec | `skia_use_libavif=false` | ❌ | Image loading out of scope |
| zlib | `skia_use_zlib=false` | ❌ | Not needed without image codecs |
| Particles | N/A | ❌ | Out of scope |
| Runtime effects | N/A | ❌ | Out of scope |

### GN Args (Reference)

```bash
gn gen out/wasm --args='
  is_official_build=true
  is_debug=false
  skia_enable_gpu=true
  skia_use_gl=true
  skia_use_webgl=true
  skia_use_freetype=true
  skia_use_system_freetype=false
  skia_use_harfbuzz=true
  skia_use_system_harfbuzz=false
  skia_enable_skshaper=true
  skia_enable_svg=true
  skia_enable_pathops=true
  skia_use_expat=true
  skia_use_system_expat=false
  skia_enable_pdf=false
  skia_enable_skottie=false
  skia_enable_skparagraph=false
  skia_enable_sktext=false
  skia_use_icu=false
  skia_use_client_icu=false
  skia_use_libpng=false
  skia_use_libjpeg_turbo=false
  skia_use_libwebp=false
  skia_use_libavif=false
  skia_use_zlib=false
'
```

These args are used **only to generate the compilation database**. The actual build uses Zig (see Build System below).

---

## Build System

### Strategy

1. Run GN + Ninja in dry-run mode to extract `compile_commands.json`
2. Parse source file lists, include paths, and defines from the compilation database
3. Generate Zig source lists from the parsed data
4. Build everything with Zig targeting `wasm32-wasi` (or `wasm32-freestanding`)
5. Post-process with `wasm-opt -Oz` for size optimization
6. Wrap with `wasm-tools component new`, then `jco transpile` to generate JS + TypeScript bindings

### Source List Extraction

```bash
# Generate ninja build files
gn gen out/wasm --args='...'

# Export structured compilation database
ninja -C out/wasm -t compdb > compile_commands.json
```

A Python script (`scripts/parse_compile_commands.py`) parses this into Zig-compatible source lists:

```python
# parse_compile_commands.py
# Input: compile_commands.json
# Output: src/generated/skia_sources.zig
#
# Extracts:
#   - Source file paths (relative to skia root)
#   - Include paths (-I flags)
#   - Preprocessor defines (-D flags)
#   - Separates sources by module (core, gpu, pathops, svg, text)
```

### build.zig Structure

```zig
const std = @import("std");
const skia_sources = @import("src/generated/skia_sources.zig");

pub fn build(b: *std.Build) void {
    const wasm_target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    });

    const optimize = b.standardOptimizeOption(.{});

    // ── Skia static library (core + text + SVG + GPU plumbing) ──
    const skia_core = buildSkiaCore(b, wasm_target, optimize);

    // ── Skia GL backend (separate static lib) ──
    const skia_gl = buildSkiaGL(b, wasm_target, optimize);

    // ── Skia WebGPU/Dawn backend (separate static lib) ──
    const skia_webgpu = buildSkiaWebGPU(b, wasm_target, optimize);

    // ── Skia PathOps (standalone, no GPU dependency) ──
    const skia_pathops = buildSkiaPathOps(b, wasm_target, optimize);

    // ── Variant 1: WebGL (core + pathops + GL backend) ──
    const gl_variant = b.addExecutable(.{
        .name = "skia-gl",
        .root_source_file = b.path("src/bindings/skia_gl_variant.zig"),
        .target = wasm_target,
        .optimize = optimize,
    });
    gl_variant.linkLibrary(skia_core);
    gl_variant.linkLibrary(skia_pathops);
    gl_variant.linkLibrary(skia_gl);

    // ── Variant 2: WebGPU (core + pathops + WebGPU backend) ──
    const webgpu_variant = b.addExecutable(.{
        .name = "skia-webgpu",
        .root_source_file = b.path("src/bindings/skia_webgpu_variant.zig"),
        .target = wasm_target,
        .optimize = optimize,
    });
    webgpu_variant.linkLibrary(skia_core);
    webgpu_variant.linkLibrary(skia_pathops);
    webgpu_variant.linkLibrary(skia_webgpu);

    // Install both variants
    b.installArtifact(gl_variant);
    b.installArtifact(webgpu_variant);
}

fn buildSkiaCore(
    b: *std.Build,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
) *std.Build.Step.Compile {
    const lib = b.addStaticLibrary(.{
        .name = "skia-core",
        .target = target,
        .optimize = optimize,
    });

    const skia_root = b.path("third_party/skia");

    const cpp_flags = &.{
        "-std=c++17",
        "-fno-exceptions",
        "-fno-rtti",
        "-DSK_GL",
        "-DSK_SUPPORT_GPU=1",
        "-DSK_ASSUME_WEBGL=1",
        "-DSK_DISABLE_LEGACY_SHADERCONTEXT",
    };

    // Sources from generated list
    lib.addCSourceFiles(.{
        .root = skia_root,
        .files = skia_sources.core_files,
        .flags = cpp_flags,
    });

    // Include paths from generated list
    for (skia_sources.include_paths) |inc| {
        lib.addIncludePath(skia_root.path(b, inc));
    }

    return lib;
}

// buildSkiaGL, buildSkiaWebGPU, buildSkiaPathOps follow the same pattern
// using their respective source lists from skia_sources
```

### Post-Processing

```bash
# Size optimization on each variant
wasm-opt -Oz --strip-debug -o skia-gl.opt.wasm skia-gl.wasm
wasm-opt -Oz --strip-debug -o skia-webgpu.opt.wasm skia-webgpu.wasm

# WIT component wrapping (using wasm-tools)
# The WIT metadata must be embedded in the core wasm binary.
# wit-bindgen c generates C bindings that embed the WIT custom sections;
# wasm-tools component new reads those sections to wrap the module.
wasm-tools component new skia-gl.opt.wasm -o skia-gl.component.wasm
wasm-tools component new skia-webgpu.opt.wasm -o skia-webgpu.component.wasm

# JCO transpile for JS consumption — generates .js, .d.ts, and .core.wasm
jco transpile skia-gl.component.wasm -o dist/skia-gl/ --no-namespaced-exports
jco transpile skia-webgpu.component.wasm -o dist/skia-webgpu/ --no-namespaced-exports

# Alternatively, generate TypeScript types from WIT alone (for IDE support during dev):
jco types wit/skia.wit -o dist/types/
```

JCO's `transpile` output for each variant includes:

| File | Purpose |
|---|---|
| `skia-gl.js` | ES module with typed exports, imports the `.core.wasm` |
| `skia-gl.d.ts` | TypeScript declarations for all exported functions and resources |
| `skia-gl.core.wasm` | The raw WASM binary (loaded by the JS module) |

The `.d.ts` file is generated automatically from the WIT interface — every resource, method, function, enum, and record is reflected as a TypeScript type. No manual type authoring needed.

### Estimated Bundle Sizes

| Variant | Uncompressed | Gzipped | Contents |
|---|---|---|---|
| `skia-gl.wasm` | ~2.0-2.5MB | ~800KB-1.0MB | Core + WebGL + PathOps + Text + SVG |
| `skia-webgpu.wasm` | ~2.0-2.5MB | ~800KB-1.0MB | Core + WebGPU/Dawn + PathOps + Text + SVG |
| **Typical deployment** | | **~800KB-1.0MB** | **One variant loaded** |

For comparison, full CanvasKit is ~7-8MB uncompressed, ~2.9MB gzipped.

The shared core code (Canvas, Paint, Path, Text, SVG, PathOps) accounts for ~75-80% of each variant. The backend-specific code (GL or WebGPU) adds ~20-25%. Since users only download one variant, the "duplication" between builds has zero cost to end users.

---

## Native Build (react-native-wgpu)

### Strategy: wasm2c

Rather than maintaining a separate native build toolchain, we compile the WASM output to C using `wasm2c` from the WebAssembly Binary Toolkit. Zig then compiles this C output for each native target. wasm2c adds 0-14% overhead vs hand-written native code — acceptable for a graphics binding layer where the heavy work happens inside Skia/Dawn.

```
Skia C++ ──► Zig ──► .wasm ──► wasm2c ──► .c/.h ──► Zig ──► native .so/.dylib/.xcframework
```

This means:
- **Single source of truth**: The WASM build is the canonical build. Native is derived from it.
- **No divergent codepaths**: The same Skia code runs on both platforms.
- **Zig handles native compilation**: wasm2c outputs standard C, which Zig compiles to any target (iOS arm64, Android arm64/x86_64, macOS, Linux, Windows).

### Native Build Steps

```bash
# 1. Build WASM as normal (Dawn/WebGPU variant for native)
zig build -Dtarget=wasm32-wasi -Doptimize=ReleaseSmall

# 2. Convert to C
wasm2c skia-webgpu.wasm -o skia-webgpu.c --header skia-webgpu.h

# 3. Cross-compile to native shared libraries
zig build-lib -target aarch64-ios skia-webgpu.c           # iOS
zig build-lib -target aarch64-linux-android skia-webgpu.c  # Android arm64
zig build-lib -target x86_64-linux-android skia-webgpu.c   # Android x86_64

# 4. Package as .xcframework (iOS) or .aar (Android)
```

### The Shared Dawn Device Pattern

The key architectural insight for React Native is that Shopify has already proven the shared Dawn device pattern works in production. react-native-skia's Graphite backend accepts an externally-created `wgpu::Device` from react-native-wgpu via `DawnBackendContext`, enabling zero-copy GPU interop.

Our wasm2c-compiled Skia code follows the same pattern:

1. **react-native-wgpu owns the Dawn device** — it creates the `wgpu::Instance`, `wgpu::Device`, and `wgpu::Queue` at startup
2. **Our Turbo Module receives the device pointer** during initialization via JSI
3. **Skia creates its `DawnBackendContext`** from the shared device objects (Instance, Device, Queue)
4. **All rendering shares the same GPU context** — zero-copy texture sharing between Three.js and Skia

```cpp
// Turbo Module initialization (simplified)
void SkiaTurboModule::initialize(jsi::Runtime& rt, jsi::Object config) {
    // Receive Dawn device from react-native-wgpu
    auto devicePtr = config.getProperty(rt, "dawnDevice").asNumber();
    auto queuePtr = config.getProperty(rt, "dawnQueue").asNumber();

    wgpu::Device device = reinterpret_cast<wgpu::Device>(static_cast<uintptr_t>(devicePtr));
    wgpu::Queue queue = reinterpret_cast<wgpu::Queue>(static_cast<uintptr_t>(queuePtr));

    // Create Skia Graphite context with shared Dawn device
    skgpu::graphite::DawnBackendContext backendContext;
    backendContext.fDevice = device;
    backendContext.fQueue = queue;
    // ... initialize Skia with this context
}
```

### WIT Type Mapping to Turbo Module (JSI)

The wasm2c output produces C functions with WASM-compatible types. The Turbo Module wraps these with JSI bindings:

| WIT Type | wasm2c C Type | Turbo Module (JSI) | Notes |
|----------|---------------|-------------------|-------|
| `f32` | `float` | `double` → cast | JSI numbers are always double |
| `u32` | `uint32_t` | `double` → cast | Handle IDs, dimensions |
| `s32` | `int32_t` | `double` → cast | Signed dimensions |
| `bool` | `uint32_t` | `bool` | Direct mapping |
| `borrow<T>` | `uint32_t` (handle) | `double` → cast | Resource handle table index |
| `string` | `ptr, len` | `jsi::String` → copy | UTF-8 encoding, requires copy into WASM linear memory |
| `list<f32>` | `ptr, len` | `jsi::ArrayBuffer` | Zero-copy via shared memory for gradient stops, matrices |
| `list<u8>` | `ptr, len` | `jsi::ArrayBuffer` | Font data, config blobs |
| `list<u32>` | `ptr, len` | `jsi::ArrayBuffer` | Color arrays |
| `option<T>` | `i32` flag + `T` | `null \| T` | Nullable return values |

### Texture Sharing (Native)

Bidirectional texture sharing between Three.js (via react-native-wgpu) and Skia using Dawn's backend texture APIs:

```cpp
// Skia draws to a texture → Three.js samples it
// 1. Create a Dawn texture (owned by Three.js / react-native-wgpu)
wgpu::TextureDescriptor desc;
desc.size = {width, height, 1};
desc.format = wgpu::TextureFormat::RGBA8Unorm;
desc.usage = wgpu::TextureUsage::RenderAttachment | wgpu::TextureUsage::TextureBinding;
wgpu::Texture dawnTexture = device.CreateTexture(&desc);

// 2. Wrap as a Skia Graphite BackendTexture
auto backendTex = skgpu::graphite::BackendTextures::MakeDawn(dawnTexture.Get());

// 3. Wrap as a Skia Image for reading, or as a Surface for drawing
auto surface = SkSurfaces::WrapBackendTexture(recorder, backendTex, ...);

// 4. Three.js can sample the same Dawn texture — zero copy
```

### Native API Binding

The native binding layer is a separate concern from the WASM binding layer. On native, react-native-wgpu provides a Dawn `GPUDevice` directly, so the backend integration uses the shared device pattern described above — no need for the WIT component boundary, just link everything statically.

The JS API (described below) remains identical on web and native. Only the underlying WASM loading vs native module loading differs.

### Performance Characteristics

| Metric | Web (WASM) | React Native (wasm2c) |
|--------|------------|----------------------|
| Overhead vs native | ~10-30% | 0-14% |
| GPU context | Owned (shared GL/WebGPU context) | Shared Dawn device with rn-wgpu |
| Texture sharing | Shared framebuffer / GPUTexture | Zero-copy Dawn BackendTexture |
| Binary size (per platform) | ~800KB-1MB gzipped | ~7-12MB (Skia + Dawn + wasm2c runtime) |
| First use latency | WASM fetch + compile | Native load (near-instant) |

---

## Zig Binding Layer (WASM Exports)

The Zig binding layer wraps Skia's C/C++ API as flat `export fn` declarations callable from JavaScript. All Skia objects are exposed as opaque pointers.

### Context & Surface Lifecycle

```zig
// Initialization — called once with backend-provided GPU context
export fn skia_init(context_ptr: *anyopaque) void;
export fn skia_destroy() void;

// Surface lifecycle — called per draw pass
export fn skia_begin_drawing(target_handle: u32, width: i32, height: i32) ?*SkCanvas;
export fn skia_end_drawing() void;
export fn skia_flush() void;
```

### Path API

```zig
export fn path_new() *SkPath;
export fn path_free(path: *SkPath) void;
export fn path_move_to(path: *SkPath, x: f32, y: f32) void;
export fn path_line_to(path: *SkPath, x: f32, y: f32) void;
export fn path_quad_to(path: *SkPath, cx: f32, cy: f32, x: f32, y: f32) void;
export fn path_cubic_to(path: *SkPath, c1x: f32, c1y: f32, c2x: f32, c2y: f32, x: f32, y: f32) void;
export fn path_arc_to(path: *SkPath, rx: f32, ry: f32, rotation: f32, large: bool, sweep: bool, x: f32, y: f32) void;
export fn path_close(path: *SkPath) void;
export fn path_reset(path: *SkPath) void;
export fn path_from_svg_string(data: [*]const u8, len: u32) ?*SkPath;
export fn path_to_svg_string(path: *SkPath, buf: [*]u8, buf_len: u32) u32;
```

### Paint API

```zig
export fn paint_new() *SkPaint;
export fn paint_free(paint: *SkPaint) void;
export fn paint_set_color(paint: *SkPaint, r: f32, g: f32, b: f32, a: f32) void;
export fn paint_set_fill(paint: *SkPaint) void;
export fn paint_set_stroke(paint: *SkPaint, width: f32) void;
export fn paint_set_stroke_cap(paint: *SkPaint, cap: u8) void;  // 0=butt, 1=round, 2=square
export fn paint_set_stroke_join(paint: *SkPaint, join: u8) void; // 0=miter, 1=round, 2=bevel
export fn paint_set_stroke_miter(paint: *SkPaint, limit: f32) void;
export fn paint_set_anti_alias(paint: *SkPaint, aa: bool) void;
export fn paint_set_blend_mode(paint: *SkPaint, mode: u8) void;
export fn paint_set_alpha(paint: *SkPaint, alpha: f32) void;

// Dash effect
export fn paint_set_dash(paint: *SkPaint, intervals: [*]const f32, count: u32, phase: f32) void;
export fn paint_clear_dash(paint: *SkPaint) void;

// Blur (for drop shadows)
export fn paint_set_blur(paint: *SkPaint, sigma: f32) void;
export fn paint_clear_blur(paint: *SkPaint) void;

// Gradients
export fn paint_set_linear_gradient(paint: *SkPaint, x0: f32, y0: f32, x1: f32, y1: f32, colors: [*]const u32, stops: [*]const f32, count: u32) void;
export fn paint_set_radial_gradient(paint: *SkPaint, cx: f32, cy: f32, r: f32, colors: [*]const u32, stops: [*]const f32, count: u32) void;
export fn paint_set_sweep_gradient(paint: *SkPaint, cx: f32, cy: f32, colors: [*]const u32, stops: [*]const f32, count: u32) void;
export fn paint_clear_shader(paint: *SkPaint) void;
```

### Canvas Drawing API

```zig
// Shapes
export fn canvas_clear(canvas: *SkCanvas, r: f32, g: f32, b: f32, a: f32) void;
export fn canvas_draw_rect(canvas: *SkCanvas, x: f32, y: f32, w: f32, h: f32, paint: *SkPaint) void;
export fn canvas_draw_round_rect(canvas: *SkCanvas, x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32, paint: *SkPaint) void;
export fn canvas_draw_round_rect_varying(canvas: *SkCanvas, x: f32, y: f32, w: f32, h: f32, tl: f32, tr: f32, br: f32, bl: f32, paint: *SkPaint) void;
export fn canvas_draw_circle(canvas: *SkCanvas, cx: f32, cy: f32, r: f32, paint: *SkPaint) void;
export fn canvas_draw_oval(canvas: *SkCanvas, x: f32, y: f32, w: f32, h: f32, paint: *SkPaint) void;
export fn canvas_draw_line(canvas: *SkCanvas, x0: f32, y0: f32, x1: f32, y1: f32, paint: *SkPaint) void;
export fn canvas_draw_path(canvas: *SkCanvas, path: *SkPath, paint: *SkPaint) void;

// Text
export fn canvas_draw_text(canvas: *SkCanvas, text: [*]const u8, len: u32, x: f32, y: f32, font: *SkFont, paint: *SkPaint) void;

// Transform stack
export fn canvas_save(canvas: *SkCanvas) void;
export fn canvas_restore(canvas: *SkCanvas) void;
export fn canvas_translate(canvas: *SkCanvas, x: f32, y: f32) void;
export fn canvas_rotate(canvas: *SkCanvas, degrees: f32) void;
export fn canvas_scale(canvas: *SkCanvas, sx: f32, sy: f32) void;
export fn canvas_concat_matrix(canvas: *SkCanvas, m: [*]const f32) void; // 3x3 or 4x4

// Clipping
export fn canvas_clip_rect(canvas: *SkCanvas, x: f32, y: f32, w: f32, h: f32) void;
export fn canvas_clip_round_rect(canvas: *SkCanvas, x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32) void;
export fn canvas_clip_path(canvas: *SkCanvas, path: *SkPath) void;
```

### Font / Text API

```zig
export fn font_new(data: [*]const u8, len: u32, size: f32) ?*SkFont;
export fn font_free(font: *SkFont) void;
export fn font_set_size(font: *SkFont, size: f32) void;
export fn font_measure_text(font: *SkFont, text: [*]const u8, len: u32) f32;
export fn font_get_metrics(font: *SkFont, ascent: *f32, descent: *f32, leading: *f32) void;
```

### SVG API

```zig
export fn svg_load(data: [*]const u8, len: u32) ?*SkSVGDOM;
export fn svg_free(svg: *SkSVGDOM) void;
export fn svg_get_size(svg: *SkSVGDOM, w: *f32, h: *f32) void;
export fn svg_set_size(svg: *SkSVGDOM, w: f32, h: f32) void;
export fn svg_render(canvas: *SkCanvas, svg: *SkSVGDOM) void;
```

### Path Effects

```zig
export fn path_trim(path: *SkPath, start: f32, end: f32) ?*SkPath;
export fn path_dash(path: *SkPath, intervals: [*]const f32, count: u32, phase: f32) ?*SkPath;
```

Total exported surface: ~70 functions.

---

## JavaScript API

### Core: SkiaContext

The low-level JS wrapper around the WASM module. This class manages WASM memory, object lifetimes, and provides a typed API over the raw exports.

```typescript
class SkiaContext {
    private module: WebAssembly.Module;
    private backend: SkiaBackend;

    static async create(renderer: THREE.WebGLRenderer | THREE.WebGPURenderer): Promise<SkiaContext>;

    // Object factories
    createPaint(): SkiaPaint;
    createPath(): SkiaPath;
    loadFont(data: ArrayBuffer, size: number): SkiaFont;
    loadSVG(data: string | ArrayBuffer): SkiaSVG;

    // PathOps (lazy-loads pathops component on first use)
    pathOp(a: SkiaPath, b: SkiaPath, op: PathOp): SkiaPath | null;
    pathSimplify(path: SkiaPath): SkiaPath | null;
}
```

### Object Wrappers

Thin JS classes wrapping WASM pointers with automatic cleanup via `FinalizationRegistry`.

```typescript
class SkiaPaint {
    setColor(r: number, g: number, b: number, a?: number): this;
    setFill(): this;
    setStroke(width: number): this;
    setStrokeCap(cap: 'butt' | 'round' | 'square'): this;
    setStrokeJoin(join: 'miter' | 'round' | 'bevel'): this;
    setAntiAlias(aa: boolean): this;
    setBlendMode(mode: BlendMode): this;
    setDash(intervals: number[], phase?: number): this;
    setBlur(sigma: number): this;
    setLinearGradient(x0: number, y0: number, x1: number, y1: number, colors: number[], stops?: number[]): this;
    setRadialGradient(cx: number, cy: number, r: number, colors: number[], stops?: number[]): this;
    setSweepGradient(cx: number, cy: number, colors: number[], stops?: number[]): this;
    clearShader(): this;
    dispose(): void;
}

class SkiaPath {
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    quadTo(cx: number, cy: number, x: number, y: number): this;
    cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this;
    arcTo(rx: number, ry: number, rotation: number, largeArc: boolean, sweep: boolean, x: number, y: number): this;
    close(): this;
    reset(): this;
    toSVGString(): string;
    static fromSVGString(ctx: SkiaContext, d: string): SkiaPath;
    trim(start: number, end: number): SkiaPath;
    dash(intervals: number[], phase?: number): SkiaPath;
    dispose(): void;
}

class SkiaFont {
    setSize(size: number): void;
    measureText(text: string): number;
    getMetrics(): { ascent: number; descent: number; leading: number };
    dispose(): void;
}

class SkiaSVG {
    getSize(): { width: number; height: number };
    setSize(width: number, height: number): void;
    dispose(): void;
}
```

### Drawing Context (Imperative API)

Passed to draw callbacks. Wraps the active `SkCanvas` pointer with a convenient chainable API.

```typescript
class SkiaDrawingContext {
    // Shapes
    clear(r: number, g: number, b: number, a?: number): void;
    drawRect(x: number, y: number, w: number, h: number, paint: SkiaPaint): void;
    drawRoundRect(x: number, y: number, w: number, h: number, rx: number, ry: number, paint: SkiaPaint): void;
    drawRoundRectVarying(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number, paint: SkiaPaint): void;
    drawCircle(cx: number, cy: number, r: number, paint: SkiaPaint): void;
    drawOval(x: number, y: number, w: number, h: number, paint: SkiaPaint): void;
    drawLine(x0: number, y0: number, x1: number, y1: number, paint: SkiaPaint): void;
    drawPath(path: SkiaPath, paint: SkiaPaint): void;

    // Text
    drawText(text: string, x: number, y: number, font: SkiaFont, paint: SkiaPaint): void;

    // SVG
    drawSVG(svg: SkiaSVG): void;

    // Transform
    save(): void;
    restore(): void;
    translate(x: number, y: number): void;
    rotate(degrees: number): void;
    scale(sx: number, sy?: number): void;

    // Clipping
    clipRect(x: number, y: number, w: number, h: number): void;
    clipRoundRect(x: number, y: number, w: number, h: number, rx: number, ry: number): void;
    clipPath(path: SkiaPath): void;
}
```

---

## Three.js Integration

### SkiaLayer (Core Integration Class)

`SkiaLayer` extends `THREE.Object3D` and manages the lifecycle of a Skia drawing surface bound to a Three.js render target texture.

```typescript
class SkiaLayer extends THREE.Object3D {
    readonly texture: THREE.Texture;
    readonly width: number;
    readonly height: number;

    constructor(skia: SkiaContext, width: number, height: number);

    /**
     * Imperative draw API.
     * The callback receives a SkiaDrawingContext that is valid only
     * during the callback's execution. Drawing outside the callback
     * is an error.
     */
    draw(callback: (ctx: SkiaDrawingContext) => void): void;

    /**
     * Mark the layer as needing a redraw on the next frame.
     * Used by declarative children to batch updates.
     */
    invalidate(): void;

    dispose(): void;
}
```

### Texture Handoff

The `SkiaLayer` creates a `WebGLRenderTarget` or `GPUTexture` owned by Three.js, then hands the underlying framebuffer/texture handle to Skia.

#### WebGL Path

```javascript
// Inside SkiaLayer (WebGL)
this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
});

// Extract framebuffer ID from Three.js internals
const props = renderer.properties.get(this.renderTarget);
const fboId = props.__webglFramebuffer;

// Skia draws into this framebuffer
draw(callback) {
    const canvas = this.skia.module.skia_begin_drawing(fboId, this.width, this.height);
    const ctx = new SkiaDrawingContext(canvas, this.skia);
    callback(ctx);
    this.skia.module.skia_end_drawing();
    this.skia.module.skia_flush();

    // Three.js can now sample this.renderTarget.texture
    // No copy needed — shared framebuffer
    renderer.resetState();
}
```

#### WebGPU Path

```javascript
// Inside SkiaLayer (WebGPU)
const device = renderer.backend.device;

this.gpuTexture = device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
});

// Wrap as Three.js texture
this.texture = new THREE.StorageTexture(width, height);
// ... bind gpuTexture to Three.js texture internals

draw(callback) {
    const canvas = this.skia.module.skia_begin_drawing_webgpu(
        this.gpuTextureHandle, this.width, this.height
    );
    const ctx = new SkiaDrawingContext(canvas, this.skia);
    callback(ctx);
    this.skia.module.skia_end_drawing();
    this.skia.module.skia_flush();
    // Command buffer submitted, texture ready for sampling
}
```

### Frame Loop Integration

Skia drawing is scoped to a specific point in the Three.js frame loop. All drawing happens before the Three.js render pass.

```javascript
// In the three-flatland render loop
function onBeforeRender() {
    // Collect all dirty SkiaLayers
    for (const layer of skiaLayers) {
        if (layer.needsRedraw) {
            layer.executeDraw();
            layer.needsRedraw = false;
        }
    }

    // Reset Three.js GL state cache (WebGL only)
    if (!isWebGPU) {
        renderer.resetState();
    }
}
```

---

## React Three Fiber API (Declarative)

### Component Hierarchy

All Skia components extend `THREE.Object3D` to get automatic r3f support via three-flatland's existing pattern. Children register drawing commands with their parent `SkiaCanvas` which batches and executes them during the draw pass.

```jsx
import { SkiaCanvas, SkiaRect, SkiaCircle, SkiaText, SkiaPath, SkiaSVG, SkiaGroup } from 'three-flatland/skia'

function MyUI() {
    const font = useSkiaFont('/fonts/Inter.ttf', 16)

    return (
        <SkiaCanvas width={1024} height={512}>
            {/* Background */}
            <SkiaRect x={0} y={0} width={1024} height={512}
                fill={[0.1, 0.1, 0.1, 1]} />

            {/* Grouped + transformed elements */}
            <SkiaGroup translateX={50} translateY={50}>
                <SkiaRect x={0} y={0} width={200} height={100}
                    fill={[1, 0, 0, 1]}
                    cornerRadius={12} />

                <SkiaText x={20} y={60} font={font}
                    fill={[1, 1, 1, 1]}>
                    Hello from Skia
                </SkiaText>
            </SkiaGroup>

            {/* Stroked path */}
            <SkiaPath d="M10 200 Q100 100 200 200 T400 200"
                stroke={[0, 0.5, 1, 1]}
                strokeWidth={3} />

            {/* Circle with gradient */}
            <SkiaCircle cx={500} cy={250} r={80}
                fill={{
                    type: 'radial',
                    cx: 500, cy: 250, r: 80,
                    colors: [0xFFFF0000, 0xFF0000FF],
                    stops: [0, 1]
                }} />

            {/* SVG icon */}
            <SkiaSVG src="/icons/check.svg" x={700} y={200} width={48} height={48} />
        </SkiaCanvas>
    )
}
```

### Component Catalog

| Component | Props | Description |
|---|---|---|
| `<SkiaCanvas>` | `width`, `height` | Root container. Creates `SkiaLayer`, exposes `.texture` |
| `<SkiaRect>` | `x`, `y`, `width`, `height`, `cornerRadius`, `cornerRadii` | Rectangle / rounded rectangle |
| `<SkiaCircle>` | `cx`, `cy`, `r` | Circle |
| `<SkiaOval>` | `x`, `y`, `width`, `height` | Oval / ellipse |
| `<SkiaLine>` | `x1`, `y1`, `x2`, `y2` | Line segment |
| `<SkiaPath>` | `d` (SVG string) or `commands` (array) | Arbitrary path |
| `<SkiaText>` | `x`, `y`, `font`, `children` (string) | Single-line text |
| `<SkiaSVG>` | `src` or `data`, `x`, `y`, `width`, `height` | SVG render |
| `<SkiaGroup>` | `translateX/Y`, `rotate`, `scaleX/Y`, `clipRect`, `clipPath`, `opacity` | Transform + clip group |

### Common Paint Props (all drawing components)

All drawing components accept these props for styling:

| Prop | Type | Description |
|---|---|---|
| `fill` | `[r,g,b,a]` or gradient descriptor | Fill color or gradient |
| `stroke` | `[r,g,b,a]` | Stroke color |
| `strokeWidth` | `number` | Stroke width |
| `strokeCap` | `'butt' \| 'round' \| 'square'` | Line cap style |
| `strokeJoin` | `'miter' \| 'round' \| 'bevel'` | Line join style |
| `blendMode` | `BlendMode` | Porter-Duff blend mode |
| `opacity` | `number` | Alpha (0-1) |
| `antiAlias` | `boolean` | Anti-aliasing (default: true) |
| `dash` | `{ intervals: number[], phase?: number }` | Dash pattern |
| `blur` | `number` | Blur sigma (for shadow effects) |

### Imperative API (Callback Pattern)

For cases where declarative components are insufficient or performance-critical:

```jsx
import { SkiaCanvas, useSkiaContext, useSkiaDraw } from 'three-flatland/skia'

function DynamicViz() {
    const skia = useSkiaContext()

    useSkiaDraw((ctx) => {
        // Full access to SkiaDrawingContext
        const paint = skia.createPaint()
            .setFill()
            .setColor(1, 0, 0, 1);

        ctx.save();
        ctx.translate(100, 100);
        ctx.rotate(Date.now() * 0.01);
        ctx.drawRect(-50, -50, 100, 100, paint);
        ctx.restore();

        paint.dispose();
    }, [/* deps */])

    return <SkiaCanvas width={512} height={512} />
}
```

### Hooks

| Hook | Signature | Description |
|---|---|---|
| `useSkiaContext()` | `() => SkiaContext` | Access the shared Skia WASM context |
| `useSkiaDraw(callback, deps)` | `(cb: (ctx: SkiaDrawingContext) => void, deps: any[]) => void` | Register an imperative draw callback on the nearest `<SkiaCanvas>` |
| `useSkiaFont(url, size)` | `(url: string, size: number) => SkiaFont \| null` | Async font loading |
| `useSkiaSVG(url)` | `(url: string) => SkiaSVG \| null` | Async SVG loading |
| `useSkiaPath(d)` | `(d: string) => SkiaPath` | Create a path from SVG string |

### TSL Integration

The `SkiaCanvas` texture is a standard `THREE.Texture`, usable in any Three.js material or TSL node graph:

```javascript
import { texture, mix } from 'three/tsl'

// In TSL
const skiaMap = texture(skiaCanvas.texture);
const baseColor = /* ... */;

material.colorNode = mix(baseColor, skiaMap, skiaMap.a);
```

---

## Implementation Plan

### Phase 1: Build System & Minimal Core

**Goal**: Skia compiling with Zig, drawing a rect into a raster buffer.

1. Clone Skia, run `gn gen` with target args, extract `compile_commands.json`
2. Write `scripts/parse_compile_commands.py` to generate `skia_sources.zig`
3. Create `build.zig` with skia-core static library target (host platform first, not WASM)
4. Write minimal Zig binding: `init`, `create_raster_surface`, `draw_rect`, `get_pixels`
5. Verify: draw a red rect, dump pixels to a file, confirm it's correct
6. Switch target to `wasm32-wasi`, verify compilation succeeds
7. Run `wasm-opt`, measure binary size

**Deliverable**: `skia-core.wasm` that can draw shapes to a raster buffer. Size baseline established.

### Phase 2: GPU Backend (WebGL)

**Goal**: Skia drawing into a WebGL framebuffer.

1. Add GL backend sources to `build.zig` as `skia-gl` static library
2. Implement GL function pointer table import from JS host
3. Write `GrGLInterface` population from imported function pointers
4. Create `GrDirectContext` wrapping the Three.js WebGL context
5. Implement `skia_begin_drawing` / `skia_end_drawing` with `SkSurfaces::WrapBackendRenderTarget`
6. Test: Three.js creates `WebGLRenderTarget`, Skia draws into it, Three.js displays the texture
7. Verify `renderer.resetState()` is sufficient for GL state management

**Deliverable**: Skia drawing into a Three.js-owned texture via shared WebGL context.

### Phase 3: Text & SVG

**Goal**: Full drawing API surface.

1. Add FreeType + HarfBuzz + SkShaper sources to `build.zig`
2. Implement font loading (from `ArrayBuffer`), text measurement, text drawing
3. Add SVG module + Expat sources
4. Implement SVG loading, rendering, path extraction
5. Implement remaining drawing APIs: gradients, dash, blur, blend modes, clip, per-corner radii
6. Expose full binding layer (~70 exports)

**Deliverable**: Complete Zig binding layer with all drawing capabilities.

### Phase 4: WIT Interface & JCO Toolchain

**Goal**: WIT-described interface, JCO-generated JS bindings with TypeScript types.

1. Author `wit/skia.wit` defining the full `three-flatland:skia/skia` world (resources, functions, enums)
2. Run `wit-bindgen c wit/skia.wit --out-dir src/bindings/generated/` to generate C headers with WIT custom section
3. Update Zig binding layer to `@cImport` the generated C headers and implement all exports
4. Build both variants (`skia-gl.wasm`, `skia-webgpu.wasm`) with WIT metadata embedded
5. Run `wasm-tools component new` on each variant to wrap as WIT components
6. Run `jco transpile` on each component to generate JS + `.d.ts` for each variant
7. Implement lazy-load variant selection in `backend-loader.ts`
8. Verify: `import { ... } from './dist/skia-gl/skia-gl.js'` works with full TypeScript types
9. Run `jco types wit/skia.wit -o dist/types/` to generate standalone type declarations for development use

**Deliverable**: Two self-contained WASM component variants with typed ES module + `.d.ts` output. Lazy loading tested.

### Phase 5: WebGPU Backend Variant

**Goal**: WebGPU build variant working with Three.js WebGPU renderer.

1. Add Dawn/WebGPU backend sources to `build.zig` as `skia-webgpu` static library
2. Create `skia_webgpu_variant.zig` root file with WebGPU-specific initialization
3. Implement `GPUDevice` handle passing from Three.js WebGPU renderer
4. Implement surface creation from `GPUTexture`
5. Build `skia-webgpu.wasm`, wrap as component, transpile with JCO
6. Test with Three.js WebGPU renderer
7. Verify lazy-load fallback: WebGPU variant fails → loads GL variant automatically

**Deliverable**: `skia-webgpu.wasm` variant with automatic fallback to GL.

### Phase 6: JavaScript API & Three.js Integration

**Goal**: Production JS API.

1. Implement `SkiaContext`, `SkiaPaint`, `SkiaPath`, `SkiaFont`, `SkiaSVG` JS wrappers
2. Implement `FinalizationRegistry`-based cleanup for all WASM objects
3. Implement `SkiaLayer` (extends `THREE.Object3D`)
4. Implement `SkiaDrawingContext` (imperative draw API)
5. Implement `draw()` callback pattern with surface lifecycle
6. Write comprehensive tests for object lifecycle, drawing correctness

**Deliverable**: Working imperative API with Three.js integration.

### Phase 7: React Three Fiber Declarative API

**Goal**: Full r3f component library.

1. Implement `SkiaCanvas` component (root, manages `SkiaLayer`)
2. Implement drawing primitives: `SkiaRect`, `SkiaCircle`, `SkiaOval`, `SkiaLine`, `SkiaPath`
3. Implement `SkiaText`, `SkiaSVG`
4. Implement `SkiaGroup` with transform, clip, opacity
5. Implement paint prop resolution (fill, stroke, gradients, dash, blur)
6. Implement dirty tracking / `invalidate()` for batched redraws
7. Implement hooks: `useSkiaContext`, `useSkiaDraw`, `useSkiaFont`, `useSkiaSVG`, `useSkiaPath`
8. Integrate into three-flatland

**Deliverable**: Full declarative API usable in r3f applications.

### Phase 8: Native (react-native-wgpu)

**Goal**: Native deployment via wasm2c with shared Dawn device.

1. Run `wasm2c` on the WebGPU variant WASM module to produce C output
2. Compile C output with Zig targeting iOS arm64, Android arm64/x86_64
3. Write Turbo Module wrapper with JSI bindings (using WIT type mapping table)
4. Implement Dawn shared device initialization — receive `wgpu::Device` and `wgpu::Queue` from react-native-wgpu
5. Create `DawnBackendContext` from shared device for Skia Graphite context
6. Implement zero-copy texture sharing via `BackendTextures::MakeDawn` / `SkImages::WrapTexture`
7. Package as `.xcframework` (iOS) and `.aar` (Android)
8. Build WIT → Turbo Module codegen tool (or extend wit-bindgen) to auto-generate JSI bindings from the WIT interface
9. Verify identical rendering output between web and native
10. Profile wasm2c overhead (target: <14% vs hand-written native)

**Deliverable**: three-flatland/skia running natively on iOS and Android via react-native-wgpu with zero-copy Dawn texture sharing.

---

## Project Structure

```
three-flatland/skia/
├── build.zig                          # Main build file (two variant targets)
├── scripts/
│   └── parse_compile_commands.py      # GN → Zig source list generator
├── third_party/
│   └── skia/                          # Skia source (git submodule)
├── wit/
│   └── skia.wit                       # Single WIT world (source of truth)
├── src/
│   ├── generated/
│   │   └── skia_sources.zig           # Auto-generated source lists
│   └── bindings/
│       ├── generated/                 # wit-bindgen C output (auto-generated)
│       │   ├── skia.c                 # C glue with WIT custom section
│       │   └── skia.h                 # C headers for Zig @cImport
│       ├── core.zig                   # Shared binding exports (draw, paint, path, etc.)
│       ├── pathops.zig                # PathOps binding exports
│       ├── skia_gl_variant.zig        # GL variant root (imports core.zig + GL init)
│       └── skia_webgpu_variant.zig    # WebGPU variant root (imports core.zig + WebGPU init)
├── js/
│   ├── context.ts                     # SkiaContext
│   ├── paint.ts                       # SkiaPaint wrapper
│   ├── path.ts                        # SkiaPath wrapper
│   ├── font.ts                        # SkiaFont wrapper
│   ├── svg.ts                         # SkiaSVG wrapper
│   ├── drawing-context.ts             # SkiaDrawingContext
│   ├── layer.ts                       # SkiaLayer (THREE.Object3D)
│   ├── backend-loader.ts              # Lazy-load variant selection
│   ├── preload.ts                     # Optional eager preload API
│   └── components/
│       ├── SkiaCanvas.tsx             # Root r3f component
│       ├── SkiaRect.tsx
│       ├── SkiaCircle.tsx
│       ├── SkiaOval.tsx
│       ├── SkiaLine.tsx
│       ├── SkiaPath.tsx
│       ├── SkiaText.tsx
│       ├── SkiaSVG.tsx
│       ├── SkiaGroup.tsx
│       └── hooks.ts                   # useSkiaContext, useSkiaDraw, etc.
├── dist/
│   ├── skia-gl/                       # JCO transpiled GL variant
│   │   ├── skia-gl.js                 # ES module with typed exports
│   │   ├── skia-gl.d.ts              # TypeScript declarations (auto-generated from WIT)
│   │   └── skia-gl.core.wasm         # Raw WASM binary
│   ├── skia-webgpu/                   # JCO transpiled WebGPU variant
│   │   ├── skia-webgpu.js
│   │   ├── skia-webgpu.d.ts
│   │   └── skia-webgpu.core.wasm
│   └── types/                         # Standalone types (jco types output, for dev use)
│       └── skia.d.ts
└── native/
    ├── wasm2c/                        # Generated C from wasm2c
    │   ├── skia-webgpu.c             # wasm2c transpiled output
    │   └── skia-webgpu.h             # wasm2c generated header
    ├── turbo-module/                  # React Native Turbo Module
    │   ├── SkiaTurboModule.h         # JSI bridge header
    │   ├── SkiaTurboModule.cpp       # JSI bridge implementation
    │   └── generated/                # WIT → JSI codegen output
    │       └── skia-jsi-bindings.cpp # Auto-generated JSI wrappers from WIT
    ├── ios/                           # iOS-specific packaging
    │   └── SkiaFlatland.xcframework
    └── android/                       # Android-specific packaging
        └── skia-flatland.aar
```

---

## Resolved Design Decisions

These were originally open questions, now resolved by research and the RFC process.

1. **wasm2c runtime overhead** — Research confirms 0-14% overhead vs hand-written native code. This is acceptable for a binding layer where the GPU work dominates. No fallback to a separate native build is needed.

2. **WebGPU texture handle passing (web)** — A JS-side handle table maps integer IDs to `GPUTexture` objects. The WASM module receives opaque `u32` handles; the JCO-generated JS glue resolves them to actual `GPUTexture` references before passing to the WebGPU API. This is the same pattern JCO uses for WIT resources.

3. **WebGPU texture sharing (native)** — On React Native, the shared Dawn device pattern eliminates the problem entirely. Both Three.js (via react-native-wgpu) and Skia operate on the same `wgpu::Device`, so textures are shared via `BackendTextures::MakeDawn` with zero copy.

4. **Preload timing** — `preloadSkia()` accepts an optional renderer type hint: `preloadSkia('webgl' | 'webgpu')`. If called without a hint and no renderer exists yet, it defaults to WebGL (the common case). If the renderer turns out to be WebGPU, the WebGL module is discarded and the WebGPU variant is loaded. This is a rare edge case — most apps know their renderer type upfront.

---

## Open Questions

1. **SkShaper vs raw FreeType+HarfBuzz**: SkShaper provides a nicer API but pulls in more Skia module code. Evaluate during Phase 3 whether wrapping FreeType+HarfBuzz directly produces a meaningfully smaller binary.

2. **Three.js WebGPU internals stability**: Three.js's WebGPU backend is still evolving. The `renderer.backend.device` access pattern and `StorageTexture` API may change. Pin to a specific Three.js version for initial development.

3. **SkSVGDOM dependencies** *(resolved)*: SVG `<image>` elements use `skresources::ResourceProvider::loadImageAsset()` — a virtual interface. Without a provider, image elements are silently skipped. No codec dependency is pulled in.

   **Future: Browser-polyfilled SVG image loading.** To support `<image>` in SVG without compiling image codecs into WASM, implement a custom `ResourceProvider` subclass in the C++ layer that calls back to JS via a WASM import. The JS side would:
   1. Receive the image URL from the WASM callback
   2. `fetch()` + `createImageBitmap()` to decode using the browser's native decoder
   3. Draw to an offscreen canvas, `getImageData()` to get raw pixels
   4. Write pixels into WASM memory, create `SkImage::MakeRasterData()` from the buffer

   This keeps **zero image codec code in WASM** — the browser handles all decoding (PNG, JPEG, WebP, AVIF, etc.). Add a WIT import like `import load-image: func(url: string) -> option<list<u8>>` and a C++ callback that constructs the `SkImage`. This is a post-Phase 4 enhancement.

4. **wit-bindgen Zig ergonomics**: wit-bindgen generates C bindings (no native Zig target). The Zig code consumes these via `@cImport`. Evaluate during Phase 4 whether a thin Zig wrapper around the generated C headers is worth maintaining for better type safety, or whether raw `@cImport` is sufficient. See the blog post "Zig and the WASM Component Model" for the pattern.

5. **JCO transpile output size**: Measure the JS glue code size that JCO generates. For a component with ~70 exports and ~10 resource types, the glue should be small (few KB), but verify it doesn't balloon with validation code. The `--valid-lifting-optimization` flag can strip internal validations if needed.

6. **Dawn version pinning**: Skia Graphite depends on a specific Dawn revision. react-native-wgpu ships its own Dawn build. These must be compatible. Strategy: pin our Skia build to the same Dawn revision that react-native-wgpu uses, and document the pairing. During development, test against react-native-wgpu's current Dawn version and establish a compatibility matrix.

7. **WIT → Turbo Module codegen**: The JSI binding layer maps WIT types to JSI types (see type mapping table). Writing this by hand for ~70 functions is tedious and error-prone. Options:
   - **Custom codegen tool**: Read the WIT file and emit C++ JSI bindings. Simplest to maintain since we control the output format.
   - **Extend wit-bindgen**: Add a JSI/Turbo Module backend to wit-bindgen. More principled but higher upfront investment and upstream maintenance burden.
   - **Recommendation**: Start with a custom Python/Zig script during Phase 8. If the pattern stabilizes, consider upstreaming to wit-bindgen.

8. **Font handling strategy**: The WIT interface takes font data as `list<u8>` (raw bytes). The question is how fonts reach the application:
   - **Web**: User provides font URLs; `useSkiaFont()` fetches and passes the `ArrayBuffer`. This is the simplest and most portable approach.
   - **React Native**: Same `ArrayBuffer` approach works, but system font access would be convenient. Options: (a) expose a `loadSystemFont(familyName)` API that resolves to bytes on the native side, or (b) keep it user-provided only and let apps bundle their fonts as assets.
   - **Recommendation**: Ship with user-provided fonts only (Phase 3). System font access is a Phase 8+ stretch goal that requires platform-specific code outside the WIT boundary.

9. **Thread safety with worklets**: react-native-wgpu uses worklets for GPU operations on a separate thread. If Skia draw calls happen on a worklet thread while the JS thread accesses the same resources (Paint, Path objects), we need synchronization. Options:
   - **Single-threaded constraint**: All Skia calls happen on the JS thread. Simple but may limit performance for complex scenes.
   - **Worklet-aware handle table**: The wasm2c runtime's linear memory is accessed from one thread at a time, with synchronization at the Turbo Module boundary.
   - **Recommendation**: Start single-threaded (Phase 8). Profile before adding worklet support — the wasm2c overhead is small enough that JS-thread-only may be sufficient for most use cases.

---

## References

- [Skia](https://skia.org/) — 2D graphics library (Google)
- [Skia Graphite](https://skia.org/docs/user/api/) — Skia's modern GPU backend with Dawn/WebGPU support
- [react-native-webgpu](https://github.com/wcandillon/react-native-webgpu) — Dawn WebGPU for React Native
- [react-native-skia](https://github.com/Shopify/react-native-skia) — Shopify's Skia integration (proves shared Dawn device pattern in production)
- [wasm2c (WABT)](https://github.com/WebAssembly/wabt) — WebAssembly Binary Toolkit, includes WASM-to-C transpiler
- [WIT Component Model](https://component-model.bytecodealliance.org/) — WebAssembly Interface Types specification
- [JCO](https://github.com/bytecodealliance/jco) — JavaScript Component Tools for transpiling WIT components to ES modules (Bytecode Alliance)
- [wit-bindgen](https://github.com/bytecodealliance/wit-bindgen) — WIT binding generator for C, Rust, and other languages
