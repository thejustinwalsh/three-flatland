const std = @import("std");
const enc = @import("encoder_files.zig");

pub fn build(b: *std.Build) void {
    var query: std.Target.Query = .{ .cpu_arch = .wasm32, .os_tag = .wasi };
    query.cpu_features_add = std.Target.wasm.featureSet(&.{
        .simd128, .bulk_memory, .sign_ext, .nontrapping_fptoint,
    });
    const target = b.resolveTargetQuery(query);
    // Lock to ReleaseFast: post-link wasm-opt -Oz collapses the inlined SPMD code
    // back to ~3MB, so we get -O3-grade speed at -Os-grade size.
    const optimize: std.builtin.OptimizeMode = .ReleaseFast;
    _ = b.standardOptimizeOption(.{ .preferred_optimize_mode = .ReleaseFast });

    const exe = b.addExecutable(.{
        .name = "basis_encoder",
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    exe.entry = .disabled;
    exe.rdynamic = true;
    exe.export_table = true;
    exe.initial_memory = 32 * 1024 * 1024;
    exe.max_memory = 512 * 1024 * 1024;
    // Reactor mode: use crt1-reactor.o which provides _initialize instead of
    // crt1-command.o (which requires main). We don't have a main() — exports
    // are called directly via WebAssembly.instantiate.
    exe.wasi_exec_model = .reactor;

    // WASI libc reactor stub — satisfies _start / __cxa_atexit linker requirements.
    exe.addCSourceFile(.{
        .file = b.path("src/zig/wasi_stub.c"),
        .flags = &.{"-std=c11"},
    });

    const cxx_flags: []const []const u8 = &.{
        "-std=c++17",
        "-fno-exceptions",
        "-fno-rtti",
        "-fno-math-errno",
        "-fno-signed-zeros",
        "-ffp-contract=fast",
        "-msimd128",
        // Path B Task 13: SSE=1 unlocks the `*_sse41` kernel call sites in basisu_enc.h /
        // basisu_etc.cpp / basisu_backend.cpp / basisu_frontend.cpp; basisu_kernels_wasm.cpp
        // provides those symbols backed by wasm_simd128 (via cppspmd_wasm.h + sse_to_wasm.h).
        // basisu_kernels_sse.cpp itself is excluded from the wasm build (see encoder_files.zig).
        "-DBASISU_SUPPORT_SSE=1",
        "-DBASISU_SUPPORT_WASM_SIMD=1",
        "-DBASISD_SUPPORT_KTX2=1",
        "-DBASISD_SUPPORT_KTX2_ZSTD=0",
        "-DNDEBUG",
    };

    // Main encoder sources (rooted at vendor/basisu/encoder)
    exe.addCSourceFiles(.{
        .root = b.path("vendor/basisu/encoder"),
        .files = enc.encoder_files,
        .flags = cxx_flags,
    });

    // Transcoder — encoder calls basisu_transcoder_init() and uses transcoder classes
    exe.addCSourceFiles(.{
        .root = b.path("vendor/basisu/transcoder"),
        .files = &.{"basisu_transcoder.cpp"},
        .flags = cxx_flags,
    });

    // zstd (single amalgamated C file).
    // The source patch in vendor/basisu/zstd/zstd.c guards ZSTD_MULTITHREAD with !__wasi__
    // so pthreads are not pulled in on WASI targets.
    exe.addCSourceFiles(.{
        .root = b.path("vendor/basisu/zstd"),
        .files = &.{"zstd.c"},
        .flags = &.{ "-msimd128", "-DZSTD_DISABLE_ASM=1", "-DNDEBUG" },
    });

    // Flat C ABI over basisu::basis_compressor — exports fl_* symbols.
    // __attribute__((export_name(...))) on each function is sufficient for wasm-ld
    // to surface them; no explicit --export linker flags needed.
    exe.addCSourceFile(.{
        .file = b.path("src/zig/basis_c_api.cpp"),
        .flags = cxx_flags,
    });

    for (enc.include_paths) |inc| {
        exe.addIncludePath(b.path(inc));
    }
    exe.linkLibC();
    exe.linkLibCpp();

    // Post-link: run wasm-opt -Oz for whole-program dedup + size optimization.
    // ReleaseFast inlines the SPMD kernels aggressively (~20MB raw); -Oz collapses
    // those duplicated bodies and strips DWARF/producers, landing at ~3MB while
    // preserving the speed wins. wasm-opt is provided by the binaryen npm package
    // (resolved via the workspace's transitive deps); falls back to PATH.
    const wasm_opt = b.addSystemCommand(&.{
        "wasm-opt",
        "-Oz",
        "--strip-debug",
        "--strip-producers",
        "--enable-simd",
        "--enable-bulk-memory",
        "--enable-sign-ext",
        "--enable-nontrapping-float-to-int",
        "-o",
        "vendor/basis/basis_encoder.wasm",
    });
    wasm_opt.addFileArg(exe.getEmittedBin());
    b.getInstallStep().dependOn(&wasm_opt.step);
}
