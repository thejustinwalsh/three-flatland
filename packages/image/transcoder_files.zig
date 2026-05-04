// transcoder_files.zig — source list for the basis_transcoder wasm target.
// Paths relative to vendor/basisu/transcoder/ (the addCSourceFiles root).
//
// The transcoder is monolithic: basisu_transcoder.cpp pulls every needed
// implementation through `.inc` file inclusion (see basisu_transcoder.h's
// header for the dependency map). One source file is enough.
//
// Note: zstd.c is intentionally NOT compiled in. Three's KTX2Loader handles
// zstd-supercompressed KTX2 files at the JS layer (zstddec.module.js); we
// match that contract. BASISD_SUPPORT_KTX2_ZSTD=0 in build.zig makes the
// transcoder reject zstd files, matching three's basis_transcoder.wasm.

pub const transcoder_files: []const []const u8 = &.{
    "basisu_transcoder.cpp",
};

pub const include_paths: []const []const u8 = &.{
    "vendor/basisu",
    "vendor/basisu/transcoder",
    "vendor/basisu_patches",
};
