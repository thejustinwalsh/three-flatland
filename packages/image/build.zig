const std = @import("std");
const enc = @import("encoder_files.zig");
const trans = @import("transcoder_files.zig");

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

    // Shared C++ flags. Both encoder and transcoder targets compile against
    // basisu's SIMD-accelerated paths via wasm_simd128 (driven by sse_to_wasm.h
    // in vendor/basisu_patches/). BASISD_SUPPORT_KTX2_ZSTD=0 keeps zstd out of
    // both targets — three's KTX2Loader path handles zstd at the JS layer via
    // zstddec.module.js, and we match that contract.
    const cxx_flags: []const []const u8 = &.{
        "-std=c++17",
        "-fno-exceptions",
        "-fno-rtti",
        "-fno-math-errno",
        "-fno-signed-zeros",
        "-ffp-contract=fast",
        "-msimd128",
        // BASISU_SUPPORT_SSE=1 unlocks the *_sse41 kernel call sites in
        // basisu_enc.h / basisu_etc.cpp / basisu_backend.cpp / basisu_frontend.cpp
        // (encoder side) and basisu_transcoder.cpp (transcoder side, via
        // sse_to_wasm.h). basisu_kernels_wasm.cpp provides those symbols backed
        // by wasm_simd128. basisu_kernels_sse.cpp itself is excluded from the
        // wasm build (see encoder_files.zig).
        "-DBASISU_SUPPORT_SSE=1",
        "-DBASISU_SUPPORT_WASM_SIMD=1",
        "-DBASISD_SUPPORT_KTX2=1",
        // Enable Zstd supercompression for KTX2 — basisu's UASTC + zstd
        // pipeline (highest-quality, smallest-output basis variant; ~20-30%
        // smaller files than raw UASTC). Encoder side compiles
        // vendor/basisu/zstd/zstd.c; transcoder side now does too (added
        // below). Required for round-tripping UASTC+zstd files; ETC1S is
        // unaffected (uses VAQ codebooks, not zstd).
        "-DBASISD_SUPPORT_KTX2_ZSTD=1",
        "-DNDEBUG",
    };

    // ── Target 1: basis_encoder.wasm (encode-side, libs/basis/) ──────────────

    const encoder = b.addExecutable(.{
        .name = "basis_encoder",
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    encoder.entry = .disabled;
    encoder.rdynamic = true;
    encoder.export_table = true;
    encoder.initial_memory = 32 * 1024 * 1024;
    encoder.max_memory = 512 * 1024 * 1024;
    // Reactor mode: use crt1-reactor.o which provides _initialize instead of
    // crt1-command.o (which requires main). We don't have a main() — exports
    // are called directly via WebAssembly.instantiate.
    encoder.wasi_exec_model = .reactor;

    encoder.addCSourceFile(.{
        .file = b.path("src/zig/wasi_stub.c"),
        .flags = &.{"-std=c11"},
    });

    // Main encoder sources (rooted at vendor/basisu/encoder).
    encoder.addCSourceFiles(.{
        .root = b.path("vendor/basisu/encoder"),
        .files = enc.encoder_files,
        .flags = cxx_flags,
    });

    // Transcoder — encoder calls basisu_transcoder_init() and uses transcoder
    // classes internally. Compiled in alongside the encoder for that reason.
    encoder.addCSourceFiles(.{
        .root = b.path("vendor/basisu/transcoder"),
        .files = &.{"basisu_transcoder.cpp"},
        .flags = cxx_flags,
    });

    // zstd (single amalgamated C file). The source patch in
    // vendor/basisu/zstd/zstd.c guards ZSTD_MULTITHREAD with !__wasi__ so
    // pthreads are not pulled in on WASI targets.
    encoder.addCSourceFiles(.{
        .root = b.path("vendor/basisu/zstd"),
        .files = &.{"zstd.c"},
        .flags = &.{ "-msimd128", "-DZSTD_DISABLE_ASM=1", "-DNDEBUG" },
    });

    // Flat C ABI over basisu::basis_compressor — exports fl_basis_* symbols.
    encoder.addCSourceFile(.{
        .file = b.path("src/zig/basis_c_api.cpp"),
        .flags = cxx_flags,
    });

    for (enc.include_paths) |inc| {
        encoder.addIncludePath(b.path(inc));
    }
    encoder.linkLibC();
    encoder.linkLibCpp();

    // Post-link: wasm-opt -Oz for whole-program dedup + size. ReleaseFast
    // inlines the SPMD kernels aggressively (~20MB raw); -Oz collapses those
    // duplicated bodies and strips DWARF, landing at ~3MB while preserving
    // the speed wins. wasm-opt is provided by the binaryen npm package
    // (resolved via the workspace's transitive deps); falls back to PATH.
    const encoder_opt = b.addSystemCommand(&.{
        "wasm-opt",
        "-Oz",
        "--strip-debug",
        "--strip-producers",
        "--enable-simd",
        "--enable-bulk-memory",
        "--enable-sign-ext",
        "--enable-nontrapping-float-to-int",
        "-o",
        "libs/basis/basis_encoder.wasm",
    });
    encoder_opt.addFileArg(encoder.getEmittedBin());
    b.getInstallStep().dependOn(&encoder_opt.step);

    // ── Target 2: basis_transcoder.wasm (transcode-side, libs/basis/) ──
    //
    // KTX2-only transcoder consumed by Ktx2Loader. Smaller than the encoder
    // (no SPMD kernels, no jpgd, no PNG/EXR loaders). Initial memory 16MB —
    // worst case is decompressing ETC1S codebooks + holding one full mip
    // level of transcoded RGBA, which fits in tens of MB even for 4096²
    // textures.

    const transcoder = b.addExecutable(.{
        .name = "basis_transcoder",
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    transcoder.entry = .disabled;
    transcoder.rdynamic = true;
    transcoder.export_table = true;
    // Static data alone (basisu_transcoder_tables_*.inc) is ~17MB, so 16MB is
    // not enough for initial. Bumped to 32MB; max stays at 256MB since the
    // transcoder's working set (decompressed codebooks + one mip level of
    // RGBA) is much smaller than the encoder's.
    transcoder.initial_memory = 32 * 1024 * 1024;
    transcoder.max_memory = 256 * 1024 * 1024;
    transcoder.wasi_exec_model = .reactor;

    // Same WASI stub as the encoder (satisfies _start / __cxa_atexit).
    transcoder.addCSourceFile(.{
        .file = b.path("src/zig/wasi_stub.c"),
        .flags = &.{"-std=c11"},
    });

    // Transcoder source (just basisu_transcoder.cpp; .inc files are #included).
    transcoder.addCSourceFiles(.{
        .root = b.path("vendor/basisu/transcoder"),
        .files = trans.transcoder_files,
        .flags = cxx_flags,
    });

    // Zstd (single amalgamated C file) — required at link time when
    // BASISD_SUPPORT_KTX2_ZSTD=1 so the transcoder can decompress zstd-
    // supercompressed UASTC level data. Same source patch as the encoder
    // side guards ZSTD_MULTITHREAD with !__wasi__ to skip pthreads.
    transcoder.addCSourceFiles(.{
        .root = b.path("vendor/basisu/zstd"),
        .files = &.{"zstd.c"},
        .flags = &.{ "-msimd128", "-DZSTD_DISABLE_ASM=1", "-DNDEBUG" },
    });

    // Flat C ABI over basist::ktx2_transcoder — exports fl_transcoder_* /
    // fl_ktx2_* / fl_basis_* symbols.
    transcoder.addCSourceFile(.{
        .file = b.path("src/zig/basis_transcoder_c_api.cpp"),
        .flags = cxx_flags,
    });

    for (trans.include_paths) |inc| {
        transcoder.addIncludePath(b.path(inc));
    }
    transcoder.linkLibC();
    transcoder.linkLibCpp();

    const transcoder_opt = b.addSystemCommand(&.{
        "wasm-opt",
        "-Oz",
        "--strip-debug",
        "--strip-producers",
        "--enable-simd",
        "--enable-bulk-memory",
        "--enable-sign-ext",
        "--enable-nontrapping-float-to-int",
        "-o",
        "libs/basis/basis_transcoder.wasm",
    });
    transcoder_opt.addFileArg(transcoder.getEmittedBin());
    b.getInstallStep().dependOn(&transcoder_opt.step);
}
