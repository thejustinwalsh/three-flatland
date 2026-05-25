// basis_transcoder_c_api.cpp — flat C ABI implementation over
// basist::ktx2_transcoder. Compiled as a separate WASI reactor TU from the
// encoder; exports are surfaced via __attribute__((export_name)).

#include "basis_transcoder_c_api.h"

#include "transcoder/basisu_transcoder.h"

#include <stdlib.h>
#include <string.h>
#include <new>

using namespace basist;

extern "C" {

__attribute__((export_name("fl_transcoder_alloc")))
void* fl_transcoder_alloc(size_t bytes) { return malloc(bytes); }

__attribute__((export_name("fl_transcoder_free")))
void fl_transcoder_free(void* p) { free(p); }

static bool g_transcoder_initialized = false;

__attribute__((export_name("fl_transcoder_init")))
int fl_transcoder_init(void) {
    if (g_transcoder_initialized) return FL_TRANSCODER_E_OK;
    basisu_transcoder_init();
    g_transcoder_initialized = true;
    return FL_TRANSCODER_E_OK;
}

// Opaque handle wraps the transcoder + a flag tracking whether
// start_transcoding succeeded (transcode_image_level requires it).
struct fl_ktx2_transcoder {
    basist::ktx2_transcoder t;
    bool started;

    fl_ktx2_transcoder() : started(false) {}
};

__attribute__((export_name("fl_ktx2_transcoder_create")))
fl_ktx2_transcoder* fl_ktx2_transcoder_create(void) {
    if (!g_transcoder_initialized) return nullptr;
    return new (std::nothrow) fl_ktx2_transcoder();
}

__attribute__((export_name("fl_ktx2_transcoder_destroy")))
void fl_ktx2_transcoder_destroy(fl_ktx2_transcoder* t) {
    delete t;
}

__attribute__((export_name("fl_ktx2_init")))
int fl_ktx2_init(fl_ktx2_transcoder* t, const uint8_t* bytes, uint32_t bytes_len) {
    if (!t || !bytes || bytes_len == 0) return FL_TRANSCODER_E_BAD_INPUT;
    if (!g_transcoder_initialized) return FL_TRANSCODER_E_NO_INIT;
    t->started = false;
    if (!t->t.init(bytes, bytes_len)) return FL_TRANSCODER_E_INIT_FAIL;
    return FL_TRANSCODER_E_OK;
}

__attribute__((export_name("fl_ktx2_start_transcoding")))
int fl_ktx2_start_transcoding(fl_ktx2_transcoder* t) {
    if (!t) return FL_TRANSCODER_E_BAD_INPUT;
    if (!t->t.start_transcoding()) return FL_TRANSCODER_E_START_FAIL;
    t->started = true;
    return FL_TRANSCODER_E_OK;
}

__attribute__((export_name("fl_ktx2_get_header")))
int fl_ktx2_get_header(const fl_ktx2_transcoder* t, fl_ktx2_header* out) {
    if (!t || !out) return FL_TRANSCODER_E_BAD_INPUT;
    out->pixel_width        = t->t.get_width();
    out->pixel_height       = t->t.get_height();
    out->level_count        = t->t.get_levels();
    out->face_count         = t->t.get_faces();
    out->layer_count        = t->t.get_layers();
    out->is_etc1s           = t->t.is_etc1s() ? 1u : 0u;
    out->is_uastc           = t->t.is_uastc() ? 1u : 0u;
    out->is_hdr             = t->t.is_hdr() ? 1u : 0u;
    out->has_alpha          = t->t.get_has_alpha() ? 1u : 0u;
    out->is_video           = t->t.is_video() ? 1u : 0u;
    out->dfd_color_model    = t->t.get_dfd_color_model();
    out->dfd_transfer_func  = t->t.get_dfd_transfer_func();
    out->dfd_flags          = t->t.get_dfd_flags();
    out->dfd_total_samples  = t->t.get_dfd_total_samples();
    out->basis_tex_format   = static_cast<uint32_t>(t->t.get_basis_tex_format());
    return FL_TRANSCODER_E_OK;
}

__attribute__((export_name("fl_ktx2_get_level_info")))
int fl_ktx2_get_level_info(
    const fl_ktx2_transcoder* t,
    uint32_t level_index, uint32_t layer_index, uint32_t face_index,
    fl_ktx2_level_info* out
) {
    if (!t || !out) return FL_TRANSCODER_E_BAD_INPUT;
    basist::ktx2_image_level_info info;
    if (!t->t.get_image_level_info(info, level_index, layer_index, face_index)) {
        return FL_TRANSCODER_E_LEVEL_INFO_FAIL;
    }
    out->orig_width    = info.m_orig_width;
    out->orig_height   = info.m_orig_height;
    out->width         = info.m_width;
    out->height        = info.m_height;
    out->num_blocks_x  = info.m_num_blocks_x;
    out->num_blocks_y  = info.m_num_blocks_y;
    out->block_width   = info.m_block_width;
    out->block_height  = info.m_block_height;
    out->total_blocks  = info.m_total_blocks;
    out->alpha_flag    = info.m_alpha_flag ? 1u : 0u;
    out->iframe_flag   = info.m_iframe_flag ? 1u : 0u;
    return FL_TRANSCODER_E_OK;
}

__attribute__((export_name("fl_ktx2_transcode_level")))
int fl_ktx2_transcode_level(
    fl_ktx2_transcoder* t,
    uint32_t level_index, uint32_t layer_index, uint32_t face_index,
    uint32_t target_format,
    uint8_t* output_buf, uint32_t output_buf_size_in_blocks_or_pixels,
    uint32_t decode_flags
) {
    if (!t || !output_buf || output_buf_size_in_blocks_or_pixels == 0) {
        return FL_TRANSCODER_E_BAD_INPUT;
    }
    if (!t->started) return FL_TRANSCODER_E_NOT_STARTED;

    const transcoder_texture_format fmt =
        static_cast<transcoder_texture_format>(target_format);

    if (!t->t.transcode_image_level(
            level_index, layer_index, face_index,
            output_buf, output_buf_size_in_blocks_or_pixels,
            fmt,
            decode_flags
        )) {
        return FL_TRANSCODER_E_TRANSCODE_FAIL;
    }
    return FL_TRANSCODER_E_OK;
}

// ── Format query helpers ──────────────────────────────────────────────────

__attribute__((export_name("fl_basis_format_has_alpha")))
uint32_t fl_basis_format_has_alpha(uint32_t target_format) {
    return basis_transcoder_format_has_alpha(
        static_cast<transcoder_texture_format>(target_format)) ? 1u : 0u;
}

__attribute__((export_name("fl_basis_format_is_uncompressed")))
uint32_t fl_basis_format_is_uncompressed(uint32_t target_format) {
    return basis_transcoder_format_is_uncompressed(
        static_cast<transcoder_texture_format>(target_format)) ? 1u : 0u;
}

__attribute__((export_name("fl_basis_get_bytes_per_block_or_pixel")))
uint32_t fl_basis_get_bytes_per_block_or_pixel(uint32_t target_format) {
    return basis_get_bytes_per_block_or_pixel(
        static_cast<transcoder_texture_format>(target_format));
}

__attribute__((export_name("fl_basis_format_is_hdr")))
uint32_t fl_basis_format_is_hdr(uint32_t target_format) {
    return basis_transcoder_format_is_hdr(
        static_cast<transcoder_texture_format>(target_format)) ? 1u : 0u;
}

__attribute__((export_name("fl_basis_is_format_supported")))
uint32_t fl_basis_is_format_supported(uint32_t target_format, uint32_t basis_tex_format) {
    return basis_is_format_supported(
        static_cast<transcoder_texture_format>(target_format),
        static_cast<basist::basis_tex_format>(basis_tex_format)) ? 1u : 0u;
}

} // extern "C"
