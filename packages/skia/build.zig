const std = @import("std");
const skia_sources = @import("src/zig/generated/skia_sources.zig");

pub fn build(b: *std.Build) void {
    var wasm_query: std.Target.Query = .{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    };
    // Enable tail-call — required by Skia's raster pipeline (skcms, SkRasterPipeline_opts)
    wasm_query.cpu_features_add = std.Target.wasm.featureSet(&.{.tail_call});
    const wasm_target = b.resolveTargetQuery(wasm_query);

    const optimize = b.standardOptimizeOption(.{});
    const skia_root = b.path("third_party/skia");

    // ── Skia C++ static libraries ──
    const skia_core = buildSkiaLib(b, "skia-core", skia_sources.core_files, skia_root, wasm_target, optimize);
    const skia_gpu = buildSkiaLib(b, "skia-gpu", skia_sources.gpu_core_files, skia_root, wasm_target, optimize);
    const skia_gl = buildSkiaLib(b, "skia-gl", skia_sources.gl_files, skia_root, wasm_target, optimize);
    const skia_pathops = buildSkiaLib(b, "skia-pathops", skia_sources.pathops_files, skia_root, wasm_target, optimize);
    const skia_svg = buildSkiaLib(b, "skia-svg", skia_sources.svg_files, skia_root, wasm_target, optimize);
    const skia_skshaper = buildSkiaLib(b, "skia-skshaper", skia_sources.skshaper_files, skia_root, wasm_target, optimize);
    // text_files requires FreeType which uses setjmp — blocked by WASM exception handling
    // TODO: Enable once Zig's WASM target supports setjmp/longjmp
    // const skia_text = buildSkiaLib(b, "skia-text", skia_sources.text_files, skia_root, wasm_target, optimize);

    // ── Variant 1: WebGL (core + gpu + gl + pathops + Zig bindings) ──
    const gl_variant = b.addExecutable(.{
        .name = "skia-gl",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/zig/bindings/skia_gl_variant.zig"),
            .target = wasm_target,
            .optimize = optimize,
        }),
    });
    gl_variant.rdynamic = true;
    // Allow GL imports to be unresolved at link time — JS provides them
    gl_variant.import_symbols = true;

    // Skia C API wrapper (C++ → C bridge)
    const skia_cpp_flags: []const []const u8 = &.{
        "-std=c++20",
        "-fno-exceptions",
        "-fno-rtti",
        "-DSK_BUILD_FOR_WASM",
        "-DSKVX_DISABLE_SIMD",
        "-DSK_FORCE_8_BYTE_ALIGNMENT",
        "-DSK_ASSUME_WEBGL=1",
        "-DSK_GL",
        "-DSK_GANESH",
        "-DNDEBUG",
        "-DSKIA_IMPLEMENTATION=1",
    };
    gl_variant.addCSourceFile(.{
        .file = b.path("src/zig/skia_c_api.cpp"),
        .flags = skia_cpp_flags,
    });
    gl_variant.addIncludePath(skia_root);
    gl_variant.addIncludePath(b.path("src/zig"));
    gl_variant.linkLibCpp();

    // GL function wrappers: non-inline C wrappers around WASM imports
    // (imported functions can't have their address taken in WASM)
    gl_variant.addCSourceFile(.{
        .file = b.path("src/zig/gl_shim/emscripten_gl_shim.c"),
        .flags = &.{},
    });
    gl_variant.addIncludePath(b.path("src/zig/gl_shim"));

    // wit-bindgen generated C glue: canonical ABI wrappers + WIT component type
    gl_variant.addCSourceFile(.{
        .file = b.path("src/zig/bindings/generated/skia_gl.c"),
        .flags = &.{},
    });
    gl_variant.addObjectFile(b.path("src/zig/bindings/generated/skia_gl_component_type.o"));

    // Include paths for C glue, Zig @cImport, and GL shim headers
    gl_variant.addIncludePath(b.path("src/zig/bindings/generated"));
    gl_variant.addIncludePath(b.path("src/zig/gl_shim"));
    gl_variant.linkLibC();

    gl_variant.linkLibrary(skia_core);
    gl_variant.linkLibrary(skia_gpu);
    gl_variant.linkLibrary(skia_gl);
    gl_variant.linkLibrary(skia_pathops);
    gl_variant.linkLibrary(skia_svg);
    gl_variant.linkLibrary(skia_skshaper);
    b.installArtifact(gl_variant);

    // ── Variant 2: WebGPU (TODO) ──
    // When Skia's Dawn/WebGPU backend is ready for WASM:
    //   1. Add skia_sources.dawn_files (or equivalent) to buildSkiaLib
    //   2. Create skia_webgpu_variant.zig root source (similar to skia_gl_variant.zig)
    //   3. Replace GL-specific defines (-DSK_GL, -DSK_GANESH) with Dawn equivalents
    //   4. Create a WebGPU shim header (like emscripten_gl_shim.h but for navigator.gpu)
    //   5. Add webgpu variant executable here, link against dawn libs instead of skia_gl
    //   6. Remove --gl-only default from build-wasm.mjs and setup.mjs
}

fn buildSkiaLib(
    b: *std.Build,
    name: []const u8,
    files: []const []const u8,
    skia_root: std.Build.LazyPath,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
) *std.Build.Step.Compile {
    const lib = b.addLibrary(.{
        .name = name,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    const cpp_flags: []const []const u8 = &.{
        "-std=c++20",
        "-fno-exceptions",
        "-fno-rtti",
        // WASM features needed by Skia's raster pipeline
        "-mtail-call",
        // Platform: tell Skia we're targeting WASM (not Unix/Mac/Win)
        "-DSK_BUILD_FOR_WASM",
        // WASM-specific (from GN is_wasm config)
        "-DSKVX_DISABLE_SIMD",
        "-DSK_FORCE_8_BYTE_ALIGNMENT",
        "-DSK_ASSUME_WEBGL=1",
        // GPU config
        "-DSK_GL",
        "-DSK_GANESH",
        // Text & SVG
        "-DSK_TYPEFACE_FACTORY_FREETYPE",
        // Matches GN official WASM build defines
        "-DNDEBUG",
        "-DSKIA_IMPLEMENTATION=1",
        "-DSK_GAMMA_APPLY_TO_A8",
        "-DSK_DISABLE_TRACING",
        "-DSK_ENABLE_PRECOMPILE",
    };

    lib.addCSourceFiles(.{
        .root = skia_root,
        .files = files,
        .flags = cpp_flags,
    });

    // Link libc and libc++ for C++ standard library headers
    lib.linkLibC();
    lib.linkLibCpp();

    // Add include paths
    for (skia_sources.include_paths) |inc| {
        lib.addIncludePath(skia_root.path(b, inc));
    }

    // Skia headers also need the root itself for #include "include/..."
    lib.addIncludePath(skia_root);

    // Third-party vendored library headers
    lib.addIncludePath(skia_root.path(b, "third_party/externals/expat/expat/lib"));
    lib.addIncludePath(skia_root.path(b, "third_party/externals/freetype/include"));
    lib.addIncludePath(skia_root.path(b, "third_party/externals/harfbuzz/src"));

    // GL shim: stub Emscripten WebGL headers (#include <webgl/webgl1.h> etc.)
    lib.addIncludePath(b.path("src/zig/gl_shim"));

    return lib;
}
