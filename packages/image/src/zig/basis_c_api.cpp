// basis_c_api.cpp — flat C ABI implementation over basisu::basis_compressor.
// Compiled as a WASI reactor TU; exports are surfaced via __attribute__((export_name)).

#include "basis_c_api.h"

#include "encoder/basisu_comp.h"
#include "encoder/basisu_enc.h"
#include "encoder/basisu_uastc_enc.h"

#include <stdlib.h>
#include <string.h>
#include <new>

using namespace basisu;

extern "C" {

__attribute__((export_name("fl_basis_alloc")))
void* fl_basis_alloc(size_t bytes) { return malloc(bytes); }

__attribute__((export_name("fl_basis_free")))
void fl_basis_free(void* p) { free(p); }

static bool g_initialized = false;

__attribute__((export_name("fl_basis_init")))
int fl_basis_init(void) {
    if (g_initialized) return FL_BASIS_E_OK;
    basisu_encoder_init();
    g_initialized = true;
    return FL_BASIS_E_OK;
}

struct fl_basis_encoder {
    basis_compressor_params params;
    basis_compressor        comp;
    uint8_vec               last_output;
    // job_pool with num_threads=1 means "just the calling thread" (WASI has no pthreads).
    job_pool                jpool;

    fl_basis_encoder() : jpool(1) {}
};

// Single-use: call fl_basis_encoder_destroy then fl_basis_encoder_create
// for each new image. Reuse is rejected with FL_BASIS_E_ALREADY_ENCODED.
__attribute__((export_name("fl_basis_encoder_create")))
fl_basis_encoder* fl_basis_encoder_create(void) {
    if (!g_initialized) return nullptr;
    return new (std::nothrow) fl_basis_encoder();
}

__attribute__((export_name("fl_basis_encoder_destroy")))
void fl_basis_encoder_destroy(fl_basis_encoder* enc) {
    delete enc;
}

__attribute__((export_name("fl_basis_encode")))
int fl_basis_encode(
    fl_basis_encoder* enc,
    const uint8_t* rgba, uint32_t w, uint32_t h,
    const fl_basis_opts* opts,
    uint8_t** out_ptr, uint32_t* out_len
) {
    if (!enc || !rgba || !opts || !out_ptr || !out_len || w == 0 || h == 0) {
        return FL_BASIS_E_BAD_INPUT;
    }
    if (!g_initialized) return FL_BASIS_E_NO_INIT;

    // Single-use guard: basisu::basis_compressor is documented as single-shot
    // (see vendor/basisu/encoder/basisu_comp.h's comment on init()). Reuse
    // would silently corrupt internal state. Caller must destroy and recreate
    // the encoder per image.
    if (!enc->last_output.empty()) return FL_BASIS_E_ALREADY_ENCODED;

    auto& p = enc->params;
    p = basis_compressor_params(); // reset to defaults

    // Source: one image, RGBA8.
    p.m_source_images.resize(1);
    image& src = p.m_source_images[0];
    src.resize(w, h);
    static_assert(sizeof(color_rgba) == 4, "color_rgba must be 4 bytes");
    memcpy(src.get_ptr(), rgba, (size_t)w * h * 4);

    // Output: KTX2.
    p.m_create_ktx2_file = true;

    // Mode + quality.
    // v2.1.0: m_uastc is bool_param<false>; set via direct assignment.
    p.m_uastc = (opts->uastc != 0);
    if (opts->uastc) {
        // UASTC level 0..4 maps directly to cPackUASTCLevelFastest..cPackUASTCLevelVerySlow.
        // In v2.1.0 the field is m_pack_uastc_ldr_4x4_flags (renamed from m_pack_uastc_flags).
        uint32_t level = opts->uastc_level;
        if (level > 4) level = 4;
        p.m_pack_uastc_ldr_4x4_flags =
            (p.m_pack_uastc_ldr_4x4_flags & ~(uint32_t)cPackUASTCLevelMask) | level;
    } else {
        // ETC1S quality [1,255]. In v2.1.0 it's still m_quality_level (not renamed).
        int q = (int)opts->quality;
        if (q < 1)   q = 1;
        if (q > 255) q = 255;
        p.m_quality_level = q;
    }

    p.m_mip_gen         = (opts->mipmaps != 0);
    p.m_check_for_alpha = (opts->check_for_alpha != 0);

    // KTX2 colour space.
    // In v2.1.0 the field was renamed from m_ktx2_srgb_transfer_func to
    // m_ktx2_and_basis_srgb_transfer_function (also gates basis sRGB flag).
    p.m_ktx2_and_basis_srgb_transfer_function = true;

    // KTX2 supercompression: caller-controlled. zstd is gated to UASTC
    // (basisu's encoder ignores supercompression for ETC1S — that mode
    // already uses VAQ codebooks). For ETC1S inputs we always pass NONE
    // regardless of opts->supercompression.
    p.m_ktx2_uastc_supercompression =
        (opts->uastc != 0 && opts->supercompression == 1)
            ? basist::KTX2_SS_ZSTANDARD
            : basist::KTX2_SS_NONE;

    // Single-threaded: WASI has no pthreads. job_pool(1) uses only the calling thread.
    p.m_multithreading = false;
    p.m_pJob_pool      = &enc->jpool;

    // Quiet.
    p.m_status_output = false;
    p.m_debug         = false;

    if (!enc->comp.init(p)) return FL_BASIS_E_ENCODE_FAIL;

    auto rc = enc->comp.process();
    if (rc != basis_compressor::cECSuccess) return FL_BASIS_E_ENCODE_FAIL;

    // Copy out the encoder's KTX2 buffer. enc->last_output is declared after
    // enc->comp in the struct, so it is destroyed first on `delete enc` —
    // *out_ptr remains valid until fl_basis_encoder_destroy is called.
    enc->last_output = enc->comp.get_output_ktx2_file();
    *out_ptr = enc->last_output.data();
    *out_len = (uint32_t)enc->last_output.size();
    return FL_BASIS_E_OK;
}

} // extern "C"
