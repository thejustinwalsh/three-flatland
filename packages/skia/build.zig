const std = @import("std");
const skia_sources = @import("src/zig/generated/skia_sources.zig");

pub fn build(b: *std.Build) void {
    const skip_gl = b.option(bool, "skip-gl", "Skip the GL variant") orelse false;
    const skip_wgpu = b.option(bool, "skip-wgpu", "Skip the WebGPU variant") orelse false;

    var wasm_query: std.Target.Query = .{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    };
    wasm_query.cpu_features_add = std.Target.wasm.featureSet(&.{ .tail_call, .exception_handling, .simd128 });
    const wasm_target = b.resolveTargetQuery(wasm_query);

    const optimize = b.standardOptimizeOption(.{});
    const skia_root = b.path("third_party/skia");

    // ── Shared: FreeType (C library, same for both variants) ──

    const skia_freetype = buildFreeType(b, skia_root, wasm_target, optimize);

    // ══════════════════════════════════════════════════════════
    // Variant 1: WebGL (Ganesh)
    // ══════════════════════════════════════════════════════════

    if (!skip_gl) {
        const gl_flags: []const []const u8 = &.{ "-DSK_GL", "-DSK_GANESH", "-DSK_ASSUME_WEBGL=1" };

        const gl_core = buildSkiaLib(b, "skia-core-gl", skia_sources.core_files, skia_root, wasm_target, optimize, gl_flags, "src/zig/gl_shim");
        const gl_pathops = buildSkiaLib(b, "skia-pathops-gl", skia_sources.pathops_files, skia_root, wasm_target, optimize, gl_flags, "src/zig/gl_shim");
        const gl_svg = buildSkiaLib(b, "skia-svg-gl", skia_sources.svg_files, skia_root, wasm_target, optimize, gl_flags, "src/zig/gl_shim");
        const gl_skshaper = buildSkiaLib(b, "skia-skshaper-gl", skia_sources.skshaper_files, skia_root, wasm_target, optimize, gl_flags, "src/zig/gl_shim");
        const gl_text = buildSkiaLib(b, "skia-text-gl", skia_sources.text_files, skia_root, wasm_target, optimize, gl_flags, "src/zig/gl_shim");
        const gl_gpu = buildSkiaLib(b, "skia-gpu-gl", skia_sources.gl_gpu_files, skia_root, wasm_target, optimize, gl_flags, "src/zig/gl_shim");

        const gl_variant = buildVariant(b, .{
            .name = "skia-gl",
            .root_source = "src/zig/bindings/skia_gl_variant.zig",
            .c_api_source = "src/zig/skia_c_api_gl.cpp",
            .shim_source = "src/zig/gl_shim/emscripten_gl_shim.c",
            .shim_dir = "src/zig/gl_shim",
            .wit_glue = "src/zig/bindings/generated/skia_gl.c",
            .wit_component = "src/zig/bindings/generated/skia_gl_component_type.o",
            .variant_flags = gl_flags,
            .skia_root = skia_root,
            .target = wasm_target,
            .optimize = optimize,
        });
        gl_variant.linkLibrary(gl_core);
        gl_variant.linkLibrary(gl_pathops);
        gl_variant.linkLibrary(gl_svg);
        gl_variant.linkLibrary(gl_skshaper);
        gl_variant.linkLibrary(gl_text);
        gl_variant.linkLibrary(gl_gpu);
        gl_variant.linkLibrary(skia_freetype);
        b.installArtifact(gl_variant);
    }

    // ══════════════════════════════════════════════════════════
    // Variant 2: WebGPU (Graphite + Dawn)
    // ══════════════════════════════════════════════════════════

    if (!skip_wgpu) {
        // __EMSCRIPTEN__ selects browser-compatible WebGPU code paths in Skia's Graphite Dawn backend.
        // Critical for: depth format selection, buffer mapping, pipeline features.
        // Our shim headers provide the missing Emscripten-era API types.
        const wgpu_flags: []const []const u8 = &.{ "-DSK_GRAPHITE", "-DSK_DAWN", "-DSK_USE_WEBGPU", "-D__EMSCRIPTEN__" };

        const wgpu_core = buildSkiaLib(b, "skia-core-wgpu", skia_sources.core_files, skia_root, wasm_target, optimize, wgpu_flags, "src/zig/wgpu_shim");
        const wgpu_pathops = buildSkiaLib(b, "skia-pathops-wgpu", skia_sources.pathops_files, skia_root, wasm_target, optimize, wgpu_flags, "src/zig/wgpu_shim");
        const wgpu_svg = buildSkiaLib(b, "skia-svg-wgpu", skia_sources.svg_files, skia_root, wasm_target, optimize, wgpu_flags, "src/zig/wgpu_shim");
        const wgpu_skshaper = buildSkiaLib(b, "skia-skshaper-wgpu", skia_sources.skshaper_files, skia_root, wasm_target, optimize, wgpu_flags, "src/zig/wgpu_shim");
        const wgpu_text = buildSkiaLib(b, "skia-text-wgpu", skia_sources.text_files, skia_root, wasm_target, optimize, wgpu_flags, "src/zig/wgpu_shim");
        const wgpu_gpu = buildSkiaLib(b, "skia-gpu-wgpu", skia_sources.wgpu_gpu_files, skia_root, wasm_target, optimize, wgpu_flags, "src/zig/wgpu_shim");

        const wgpu_variant = buildVariant(b, .{
            .name = "skia-wgpu",
            .root_source = "src/zig/bindings/skia_webgpu_variant.zig",
            .c_api_source = "src/zig/skia_c_api_dawn.cpp",
            .shim_source = "src/zig/wgpu_shim/emscripten_wgpu_shim.c",
            .shim_dir = "src/zig/wgpu_shim",
            .wit_glue = "src/zig/bindings/generated/skia_gl.c",
            .wit_component = "src/zig/bindings/generated/skia_gl_component_type.o",
            .variant_flags = wgpu_flags,
            .skia_root = skia_root,
            .target = wasm_target,
            .optimize = optimize,
        });
        wgpu_variant.linkLibrary(wgpu_core);
        wgpu_variant.linkLibrary(wgpu_pathops);
        wgpu_variant.linkLibrary(wgpu_svg);
        wgpu_variant.linkLibrary(wgpu_skshaper);
        wgpu_variant.linkLibrary(wgpu_text);
        wgpu_variant.linkLibrary(wgpu_gpu);
        wgpu_variant.linkLibrary(skia_freetype);
        b.installArtifact(wgpu_variant);
    }
}

// ── Variant executable builder ──

const VariantConfig = struct {
    name: []const u8,
    root_source: []const u8,
    c_api_source: []const u8,
    shim_source: []const u8,
    shim_dir: []const u8,
    wit_glue: []const u8,
    wit_component: []const u8,
    variant_flags: []const []const u8,
    skia_root: std.Build.LazyPath,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
};

fn buildVariant(b: *std.Build, cfg: VariantConfig) *std.Build.Step.Compile {
    const exe = b.addExecutable(.{
        .name = cfg.name,
        .root_module = b.createModule(.{
            .root_source_file = b.path(cfg.root_source),
            .target = cfg.target,
            .optimize = cfg.optimize,
        }),
    });
    exe.rdynamic = true;
    exe.import_symbols = true;
    exe.export_table = true;
    exe.initial_memory = 64 * 1024 * 1024;
    exe.max_memory = 256 * 1024 * 1024;

    // WASM setjmp/longjmp runtime
    exe.addCSourceFile(.{
        .file = b.path("src/zig/wasm_sjlj_rt.c"),
        .flags = &.{"-mexception-handling"},
    });

    // C API flags: base + variant-specific
    const c_api_flags = concatFlags(b, &.{
        "-std=c++20",       "-fno-exceptions", "-fno-rtti",
        "-fno-math-errno",  "-fno-signed-zeros", "-ffp-contract=fast",
        "-DSK_BUILD_FOR_WASM", "-DSK_FORCE_8_BYTE_ALIGNMENT",
        "-DNDEBUG",         "-DSKIA_IMPLEMENTATION=1",
    }, cfg.variant_flags);

    // Skia C API wrapper
    exe.addCSourceFile(.{ .file = b.path(cfg.c_api_source), .flags = c_api_flags });
    // Custom font manager
    exe.addCSourceFiles(.{
        .root = cfg.skia_root,
        .files = &.{ "src/ports/SkFontMgr_custom.cpp", "src/ports/SkFontMgr_custom_embedded.cpp" },
        .flags = c_api_flags,
    });
    exe.addIncludePath(cfg.skia_root);
    exe.addIncludePath(b.path("src/zig"));
    exe.linkLibCpp();

    // GPU shim (GL or wgpu non-inline wrappers)
    exe.addCSourceFile(.{ .file = b.path(cfg.shim_source), .flags = &.{} });
    exe.addIncludePath(b.path(cfg.shim_dir));

    // WIT-generated C glue
    exe.addCSourceFile(.{ .file = b.path(cfg.wit_glue), .flags = &.{} });
    exe.addObjectFile(b.path(cfg.wit_component));

    exe.addIncludePath(b.path("src/zig/bindings/generated"));
    exe.linkLibC();

    return exe;
}

// ── Skia C++ static library builder ──

fn buildSkiaLib(
    b: *std.Build,
    name: []const u8,
    files: []const []const u8,
    skia_root: std.Build.LazyPath,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
    variant_flags: []const []const u8,
    shim_dir: []const u8,
) *std.Build.Step.Compile {
    const lib = b.addLibrary(.{
        .name = name,
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });

    // Base flags + variant flags
    const all_flags = concatFlags(b, &.{
        "-std=c++20",        "-fno-exceptions",  "-fno-rtti",
        "-fno-math-errno",   "-fno-signed-zeros", "-ffp-contract=fast",
        "-mtail-call",       "-mexception-handling", "-mllvm", "-wasm-enable-sjlj",
        "-DSK_BUILD_FOR_WASM", "-DSK_FORCE_8_BYTE_ALIGNMENT",
        "-DSK_TYPEFACE_FACTORY_FREETYPE",
        "-DNDEBUG",          "-DSKIA_IMPLEMENTATION=1",
        "-DSK_GAMMA_APPLY_TO_A8", "-DSK_DISABLE_TRACING", "-DSK_ENABLE_PRECOMPILE",
    }, variant_flags);

    lib.addCSourceFiles(.{ .root = skia_root, .files = files, .flags = all_flags });
    lib.linkLibC();
    lib.linkLibCpp();

    for (skia_sources.include_paths) |inc| {
        lib.addIncludePath(skia_root.path(b, inc));
    }
    lib.addIncludePath(skia_root);
    lib.addIncludePath(b.path("vendor/expat/lib"));
    lib.addIncludePath(b.path("vendor/freetype/include"));
    lib.addIncludePath(b.path("vendor/harfbuzz/src"));
    lib.addIncludePath(b.path(shim_dir));

    return lib;
}

// ── FreeType (shared, no variant flags needed) ──

fn buildFreeType(
    b: *std.Build,
    skia_root: std.Build.LazyPath,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
) *std.Build.Step.Compile {
    const lib = b.addLibrary(.{
        .name = "freetype2",
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    lib.addCSourceFiles(.{
        .root = b.path("vendor/freetype"),
        .files = &.{
            "src/autofit/autofit.c",
            "src/base/ftbase.c",
            "src/base/ftbbox.c",
            "src/base/ftbitmap.c",
            "src/base/ftdebug.c",
            "src/base/ftfstype.c",
            "src/base/ftgasp.c",
            "src/base/ftglyph.c",
            "src/base/ftinit.c",
            "src/base/ftmm.c",
            "src/base/ftpatent.c",
            "src/base/ftstroke.c",
            "src/base/ftsynth.c",
            "src/base/ftsystem.c",
            "src/base/fttype1.c",
            "src/base/ftwinfnt.c",
            "src/cff/cff.c",
            "src/cid/type1cid.c",
            "src/gzip/ftgzip.c",
            "src/psaux/psaux.c",
            "src/pshinter/pshinter.c",
            "src/psnames/psnames.c",
            "src/raster/raster.c",
            "src/sfnt/sfnt.c",
            "src/smooth/smooth.c",
            "src/svg/svg.c",
            "src/truetype/truetype.c",
            "src/type1/type1.c",
        },
        .flags = &.{
            "-DFT2_BUILD_LIBRARY",            "-DNDEBUG",
            "-DSK_FREETYPE_MINIMUM_RUNTIME_VERSION_IS_BUILD_VERSION=1",
            "-DFT_CONFIG_MODULES_H=<freetype-no-type1/freetype/config/ftmodule.h>",
            "-mexception-handling",            "-mllvm", "-wasm-enable-sjlj",
        },
    });
    lib.linkLibC();
    lib.addIncludePath(b.path("vendor/freetype/include"));
    lib.addIncludePath(skia_root.path(b, "third_party/freetype2/include"));
    lib.addIncludePath(skia_root);
    return lib;
}

// ── Helper: concatenate two flag slices using the build allocator ──

fn concatFlags(
    b: *std.Build,
    base: []const []const u8,
    extra: []const []const u8,
) []const []const u8 {
    const result = b.allocator.alloc([]const u8, base.len + extra.len) catch @panic("OOM");
    @memcpy(result[0..base.len], base);
    @memcpy(result[base.len..], extra);
    return result;
}
