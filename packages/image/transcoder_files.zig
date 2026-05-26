// transcoder_files.zig — source list for the basis_transcoder wasm target.
// Paths relative to vendor/basisu/transcoder/ (the addCSourceFiles root).
//
// The transcoder is monolithic: basisu_transcoder.cpp pulls every needed
// implementation through `.inc` file inclusion (see basisu_transcoder.h's
// header for the dependency map). One source file is enough.
//
// Note: zstd supercompression IS supported. `build.zig` sets
// BASISD_SUPPORT_KTX2_ZSTD=1 and compiles `vendor/basisu/zstd/zstddeclib.c`
// (decoder-only amalgamation) as a separate compile unit for the transcoder.
// `zstd.c` (full encoder+decoder) is intentionally NOT in this list — it is
// compiled with its own narrower flags directly in `build.zig` for the encoder
// target only.

pub const transcoder_files: []const []const u8 = &.{
    "basisu_transcoder.cpp",
};

pub const include_paths: []const []const u8 = &.{
    "vendor/basisu",
    "vendor/basisu/transcoder",
    "vendor/basisu_patches",
};
