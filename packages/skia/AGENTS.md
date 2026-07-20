# @three-flatland/skia

> Skia 2D graphics wasm port with WebGL (Ganesh) and WebGPU (Graphite/Dawn) variants.

---

## IMPORTANT — Older Build Shape

**For wasm/Zig build work, read `.library/zig-wasi/cookbook.md` FIRST.**

Skia's build is the **OLDER shape** that predates the cookbook patterns. A tuning pass is planned (see `planning/superpowers/specs/2026-05-05-skia-zig-wasi-tuning.md`). **Do not copy from `build.zig` as a reference for new wasm work elsewhere in the repo** — the cookbook is the target, not the current skia build.

Concrete gaps (verified against `build.zig`):

| Cookbook prescription | Skia's current state | Line(s) in build.zig |
|---|---|---|
| `exe.rdynamic = false` | `exe.rdynamic = true` | `build.zig:125` |
| `exe.entry = .disabled` | not set | `buildVariant` fn, no entry field |
| `exe.wasi_exec_model = .reactor` | not set | `buildVariant` fn, no wasi_exec_model |
| No `import_symbols` | `exe.import_symbols = true` | `build.zig:126` |
| `-include no_stdio.h` force-include | not present | base cxx_flags, `build.zig:138–143` |
| `wasm-opt` post-link step | absent from build.zig | n/a (wasm-opt is run by `scripts/build-wasm.mjs` separately) |
| Don't use `tail_call` / `exception_handling` | both enabled | `build.zig:12`, `build.zig:192–193` |

Companion docs:
- `.library/zig-wasi/cookbook.md` — prescriptive wasm32-wasi build patterns (the target)
- `.library/three-flatland/loader-architecture.md` — if wiring skia into a runtime loader

---

## What's Here

```
packages/skia/
  build.zig                  — Zig build: GL + WebGPU variants, FreeType, curated source lists
  build.zig.zon              — Zig package manifest (minimum_zig_version = "0.14.0", no external Zig deps); Zig tool version (0.15.1) and skia commit pin (chrome/m147) live in package.json under "skiaDependencies"
  src/zig/
    skia_c_api_gl.cpp        — flat C ABI for GL variant (sk_* exports)
    skia_c_api_dawn.cpp      — flat C ABI for WebGPU variant (sk_* exports)
    skia_c_api.h             — shared C ABI header
    skia_c_api_common.inc    — common implementation included by both C APIs
    skia_c_api_shared.inc    — shared helpers
    wasm_sjlj_rt.c           — setjmp/longjmp WASM runtime (exception_handling feature)
    gl_shim/
      emscripten_gl_shim.c   — Emscripten GL API surface for skia's WebGL code paths
      emscripten_gl_shim.h
    wgpu_shim/
      emscripten_wgpu_shim.c — Emscripten WebGPU API surface for skia's Dawn code paths
      emscripten_wgpu_shim.h
    generated/
      skia_sources.zig       — curated source list (DO NOT hand-edit; see §Curated Source List)
    bindings/
      core.zig               — WIT component model glue entry
      skia_gl_variant.zig    — root source for GL variant executable
      skia_webgpu_variant.zig — root source for WebGPU variant executable
      generated/             — WIT-generated C glue + component type objects
  src/ts/
    index.ts                 — package root (re-exports Skia, types)
    init.ts                  — Skia.init() + Skia.preload() entry point
    context.ts               — SkiaContext singleton
    wasm-loader-gl.ts        — GL instantiation, GL object handle tables, GL import shim
    wasm-loader-wgpu.ts      — WebGPU instantiation
    wasm-loader-shared.ts    — shared instantiation helpers + hand-rolled WASI stubs
    drawing-context.ts       — SkiaDrawingContext (canvas API surface)
    paint.ts / path.ts / font.ts / image.ts … — Skia object wrappers
    three/                   — Three.js integration subpath
    react/                   — R3F integration subpath
  scripts/
    build-wasm.mjs           — orchestrates zig build + wasm-opt post-link copy
    parse_compile_commands.py — regenerates skia_sources.zig from compile_commands.json
    generate-gl-shim.py      — regenerates GL shim from skia headers
    generate-wgpu-shim.py    — regenerates WebGPU shim from Dawn headers
    setup.mjs                — ensures Zig, wasm-opt, wit-bindgen, wasm-tools are installed
  dist/
    skia-gl/skia-gl.wasm     — GL variant (~3.2 MB)
    skia-gl/skia-gl.opt.wasm — wasm-opt output (same file currently — build-wasm.mjs copies)
    skia-wgpu/skia-wgpu.wasm — WebGPU variant (~2.7 MB)
  third_party/skia/          — vendored skia (chrome/m147, commit 4502f88)
  vendor/
    freetype/                — vendored FreeType
    expat/                   — vendored expat (XML parsing for SVG)
    harfbuzz/                — vendored HarfBuzz (text shaping)
```

---

## Two-Variant Architecture

### GL variant (Ganesh + WebGL2)
- Compile flags: `-DSK_GL -DSK_GANESH -DSK_ASSUME_WEBGL=1`
- Uses `gl_shim/emscripten_gl_shim.c` to bridge skia's Emscripten-era GL API into WASM imports
- JS side (`wasm-loader-gl.ts`) provides the `"gl"` import module — Skia calls `emscripten_gl*` functions; the TS shim maps them to a live `WebGL2RenderingContext`
- Broad browser support: everywhere with WebGL2

### WebGPU variant (Graphite + Dawn)
- Compile flags: `-DSK_GRAPHITE -DSK_DAWN -DSK_USE_WEBGPU -D__EMSCRIPTEN__`
- Uses `wgpu_shim/emscripten_wgpu_shim.c` to provide Emscripten-era WebGPU types for Dawn
- **`-D__EMSCRIPTEN__` is intentional and load-bearing** — Dawn checks it to select browser-compatible code paths (depth format selection, buffer mapping, pipeline feature gates). Do not remove this define.
- Faster and more capable, but Chromium-based browsers only

### Why compile shared libs twice
Skia's source uses `-DSK_GL` vs `-DSK_GRAPHITE`/`-DSK_DAWN` to gate entire code paths at compile time. Objects compiled for the GL variant are **incompatible** with the WebGPU variant at link time — different TUs, different ODR shapes. Each `skia-core-*`, `skia-pathops-*`, `skia-svg-*`, `skia-skshaper-*`, `skia-text-*`, `skia-gpu-*` static lib is built twice (once per variant).

FreeType (`freetype2` static lib, `buildFreeType` helper in `build.zig:217`) is variant-agnostic — built once, linked by both.

### Build variant helper
`buildVariant(b, cfg: VariantConfig)` in `build.zig:116` — creates the final wasm executable, links the static libs, adds the C API file + shim. The variant differences are in `cfg.variant_flags` and `cfg.shim_source`.

### CI fast paths
```sh
zig build -Dskip-gl=true    # build only WebGPU variant
zig build -Dskip-wgpu=true  # build only GL variant
```

---

## What This Package Emits

| File | Size | Notes |
|---|---|---|
| `dist/skia-gl/skia-gl.wasm` | ~3.2 MB | published; wasm-opt applied via build-wasm.mjs |
| `dist/skia-wgpu/skia-wgpu.wasm` | ~2.7 MB | published; wasm-opt applied |

Package exports the wasm files via `"./wasm/gl"` and `"./wasm/wgpu"` subpaths (`package.json:62–64`). The pre-publish `scripts/prepack.mjs` validates that all `dist/` artifacts exist and, outside CI, triggers a `pnpm build` if any are missing. The actual copy from `zig-out/bin/` to `dist/` is performed by `scripts/build-wasm.mjs` (step after `wasm-opt`).

The DCE roots are `export fn exports_skia_gl_*` functions defined in `src/zig/bindings/core.zig`. These are surfaced as `__attribute__((__export_name__(...)))` wrappers by the WIT-generated file `src/zig/bindings/generated/skia_gl.c`. Both the GL and WebGPU variants share the same WIT world (`skia-gl`) and therefore share the same `exports_skia_gl_*` export names — there is no separate `exports_skia_wgpu_*` set. The `.cpp` files (`skia_c_api_gl.cpp` / `skia_c_api_dawn.cpp`) are the C++ implementation behind the bindings, not where the WASM exports are declared.

---

## Shim Layer

### GL shim — `src/zig/gl_shim/emscripten_gl_shim.c`
Provides struct definitions and API signatures that skia's source expects from Emscripten's GL headers (Emscripten's `GLES3/gl3.h`, `webgl/webgl1.h`). The functions in the shim are either:
- **No-ops** for bookkeeping that skia does internally, or
- **Declarations** only — actual GPU work flows through JS-imported `emscripten_gl*` functions provided by `wasm-loader-gl.ts`

Required because skia was originally built for emscripten and its `GLES3/` includes expect these API shapes.

### WebGPU shim — `src/zig/wgpu_shim/emscripten_wgpu_shim.c`
Same idea for Dawn. Dawn's browser-mode code path uses Emscripten-era WebGPU header types (`webgpu/webgpu.h`, `dawn/webgpu.h`). The shim provides type definitions and no-op stubs; actual GPU calls go through WASM imports provided by `wasm-loader-wgpu.ts`.

### WASM import structure

| Import module | Provided by | Purpose |
|---|---|---|
| `"gl"` | `wasm-loader-gl.ts` | full WebGL2 function table (emscripten_gl* style) |
| `"wgpu"` | `wasm-loader-wgpu.ts` | WebGPU function table |
| `"env"` | `wasm-loader-shared.ts` `createEnvImports()` | Skia runtime stubs (logging, semaphores) — Proxy returning 0 |
| `"wasi_snapshot_preview1"` | `wasm-loader-shared.ts` `createWasiImports()` | hand-rolled WASI stubs |

---

## JS-Side Runtime

The TS runtime lives in `src/ts/`. It does **NOT** use `uwasi` — it has a hand-rolled WASI stub (`createWasiImports` in `wasm-loader-shared.ts:91`). The stub correctly returns `EBADF` (8) for `fd_prestat_get` (not `ENOSYS` — see cookbook §11 gotcha). The tuning pass will migrate this to `uwasi`.

### Init pattern
```ts
import { Skia } from '@three-flatland/skia'

// Optional early preload — kicks off WASM fetch before renderer is ready
Skia.preload('auto')   // or 'webgl' / 'wgpu'

// Init with Three.js renderer (auto-detects backend)
const skia = await Skia.init(renderer)

// Or explicit raw context
const skia = await Skia.init(canvas.getContext('webgl2'))
const skia = await Skia.init(gpuDevice)
```

Concurrent calls to `Skia.init()` deduplate onto the same Promise (`init.ts:164`). The singleton is `SkiaContext.instance` (`context.ts`).

### Three.js / R3F subpaths
- `import {} from '@three-flatland/skia/three'` — plain Three.js integration
- `import {} from '@three-flatland/skia/react'` — R3F integration
- `import {} from '@three-flatland/skia/wasm/gl'` — raw GL wasm URL
- `import {} from '@three-flatland/skia/wasm/wgpu'` — raw WebGPU wasm URL

### WASM URL override
`SKIA_WASM_URL_GL` / `SKIA_WASM_URL_WGPU` env vars let bundlers (Vite define, webpack DefinePlugin) override the wasm URL at build time (`init.ts:116–128`).

---

## Curated Source List (cookbook §8)

`src/zig/generated/skia_sources.zig` — the curated source list for all Skia TUs compiled into the static libs. **DO NOT hand-edit.**

Regenerate when re-vendoring skia:
```sh
python3 scripts/parse_compile_commands.py --gl <gl.json> --wgpu <wgpu.json>
```

This produces `skia_sources.zig` from `compile_commands.json` artifacts generated by a reference skia build. The output lists `core_files`, `pathops_files`, `svg_files`, `skshaper_files`, `text_files`, `gl_gpu_files`, `wgpu_gpu_files`, and `include_paths`.

---

## Build Commands

```sh
# Install Zig, wasm-opt, wit-bindgen, wasm-tools (first time / CI)
pnpm --filter @three-flatland/skia skia:setup

# Build wasm only (both variants)
pnpm --filter @three-flatland/skia build:wasm

# GL variant only
pnpm --filter @three-flatland/skia build:wasm:gl

# WebGPU variant only
pnpm --filter @three-flatland/skia build:wasm:wgpu

# Build TS (requires wasm already built)
pnpm --filter @three-flatland/skia build

# Type-check only
pnpm --filter @three-flatland/skia typecheck
```

Outputs land in `dist/skia-gl/` and `dist/skia-wgpu/`. The `build-wasm.mjs` script calls `zig build`, then runs `wasm-opt -Oz` on the zig output, and copies the result into `dist/`.

---

## Tests

```sh
pnpm --filter @three-flatland/skia test          # both backends
pnpm --filter @three-flatland/skia test:gl       # GL variant only
pnpm --filter @three-flatland/skia test:wgpu     # WebGPU variant only
pnpm --filter @three-flatland/skia test:watch    # watch mode
```

Test files: `src/ts/**/*.test.ts` (e.g. `src/ts/paint.test.ts`, `src/ts/context.test.ts`).

---

## Common Gotchas

- **Adding a third variant**: you must build every static lib a third time with the new variant's defines. One `buildSkiaLib` call per lib per variant — do not reuse objects compiled with different `-DSK_*` flags.
- **`-D__EMSCRIPTEN__` on WebGPU**: `build.zig:67` — intentional. Dawn uses it to gate browser-compatible code paths. Removing it breaks depth format selection and buffer mapping at runtime.
- **`tail_call` + `exception_handling`**: both are enabled (`build.zig:12`). Cookbook §2 recommends against them — not all browser engines support them. The tuning pass will evaluate removing them. `wasm_sjlj_rt.c` provides the setjmp/longjmp runtime needed by the exception handling machinery.
- **`import_symbols = true`**: `build.zig:126` — this enables symbol imports that aren't covered by explicit wasm imports. It's used here alongside `rdynamic = true`. Both are cookbook deviations; the tuning pass will assess whether they can be dropped.
- **FreeType custom config**: FreeType is built with `-DFT_CONFIG_MODULES_H=<freetype-no-type1/freetype/config/ftmodule.h>` (`build.zig:261`) to suppress Type1 support and reduce size.
- **`cabi_realloc` export**: The GL shim allocates strings in WASM memory via `cabi_realloc` (WIT component model allocator). This is exported by the WIT-generated glue and must remain in the export surface (`wasm-loader-gl.ts:99`).
- **WASM MIME type fallback**: Vite dev server may serve `.wasm` without `application/wasm`. `instantiateWasm` in `wasm-loader-shared.ts:59` falls back to `arrayBuffer()` + `instantiate()` for TypeError or MIME errors.
- **No `_initialize` call needed**: the hand-rolled WASI stub in `wasm-loader-shared.ts` does not call `_initialize` — skia's C++ global ctors appear to run via `import_symbols` / reactor glue in the WIT bindings. Verify this assumption before the tuning pass changes `wasi_exec_model`.

---

## Future Tuning Pass

Reference: `planning/superpowers/specs/2026-05-05-skia-zig-wasi-tuning.md`

Migration targets:
- `exe.rdynamic = false` — enables proper DCE; currently all C++ symbols are live roots
- `exe.entry = .disabled` + `exe.wasi_exec_model = .reactor` — explicit reactor mode
- Drop `exe.import_symbols = true` — assess whether it's still needed after reactor mode
- `-include src/zig/no_stdio.h` — strip printf chain from all TUs (cookbook §5)
- `wasm-opt -Oz` as a `build.zig` step (currently in `scripts/build-wasm.mjs` externally)
- Migrate `wasm-loader-shared.ts` from hand-rolled WASI stubs to `uwasi` (cookbook §11)
- Evaluate removing `tail_call` / `exception_handling` — risky; requires confirming skia doesn't rely on C++ exceptions for normal flow in wasm mode
