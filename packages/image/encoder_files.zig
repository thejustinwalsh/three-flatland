// encoder_files.zig — curated list of BasisU encoder sources compiled into wasm.
// Paths are relative to vendor/basisu/encoder/ (the addCSourceFiles root).
// Keep in sync with upstream CMakeLists.txt BASISU_ENCODER_SRCS when re-vendoring.
// Transcoder sources (basisu_transcoder.cpp) are listed separately with their own root.

pub const encoder_files: []const []const u8 = &.{
    // Core encoder
    "basisu_astc_hdr_6x6_enc.cpp",
    "basisu_astc_hdr_common.cpp",
    "basisu_astc_ldr_common.cpp",
    "basisu_astc_ldr_encode.cpp",
    "basisu_backend.cpp",
    "basisu_basis_file.cpp",
    "basisu_bc7enc.cpp",
    "basisu_comp.cpp",
    "basisu_enc.cpp",
    "basisu_etc.cpp",
    "basisu_frontend.cpp",
    "basisu_gpu_texture.cpp",
    // basisu_kernels_sse.cpp is dropped on wasm; basisu_kernels_wasm.cpp provides the
    // _sse41-suffixed kernels that callers expect.
    "basisu_kernels_wasm.cpp", // wasm_simd128 kernels, gated by BASISU_SUPPORT_WASM_SIMD
    "basisu_pvrtc1_4.cpp",
    "basisu_resample_filters.cpp",
    "basisu_resampler.cpp",
    "basisu_ssim.cpp",
    "basisu_uastc_enc.cpp",
    "basisu_uastc_hdr_4x4_enc.cpp",
    // WASM API (encoder side — provides bu_* exports; transcoder side compiled separately)
    "basisu_wasm_api.cpp",
    // OpenCL stub — provides no-op implementations; original basisu_opencl.cpp was removed at vendor time
    "basisu_opencl_stub.cpp",
    // Image loaders used by the encoder
    "jpgd.cpp",
    "pvpngreader.cpp",
    // 3rdparty image libs
    "3rdparty/android_astc_decomp.cpp",
    "3rdparty/tinyexr.cpp",
};

pub const include_paths: []const []const u8 = &.{
    "vendor/basisu",
    "vendor/basisu/encoder",
    "vendor/basisu/transcoder",
    "vendor/basisu/zstd",
    "vendor/basisu_patches", // sse_to_wasm.h, basisu_simd_compat.h
};
