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

    // ── Variant 1: WebGL (core + gpu + gl + pathops + Zig bindings) ──
    const gl_variant = b.addExecutable(.{
        .name = "skia-gl",
        .root_source_file = b.path("src/zig/bindings/skia_gl_variant.zig"),
        .target = wasm_target,
        .optimize = optimize,
    });
    gl_variant.rdynamic = true;
    gl_variant.entry = .disabled;
    // WASI libc crt references main — allow undefined symbols at link time
    gl_variant.import_symbols = true;
    gl_variant.linkLibrary(skia_core);
    gl_variant.linkLibrary(skia_gpu);
    gl_variant.linkLibrary(skia_gl);
    gl_variant.linkLibrary(skia_pathops);
    b.installArtifact(gl_variant);
}

fn buildSkiaLib(
    b: *std.Build,
    name: []const u8,
    files: []const []const u8,
    skia_root: std.Build.LazyPath,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
) *std.Build.Step.Compile {
    const lib = b.addStaticLibrary(.{
        .name = name,
        .target = target,
        .optimize = optimize,
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

    return lib;
}
