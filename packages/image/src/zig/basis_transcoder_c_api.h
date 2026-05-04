// basis_transcoder_c_api.h — flat C ABI for the BasisU transcoder (KTX2
// reader path), exported from wasm. Mirrors basis_c_api.h's shape.
//
// We expose only the KTX2 surface (`basist::ktx2_transcoder`). Three.js's
// KTX2Loader is the consumer; .basis files without a KTX2 container are not
// in scope.

#ifndef BASIS_TRANSCODER_C_API_H
#define BASIS_TRANSCODER_C_API_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Memory helpers (caller manages lifetimes). Identical semantics to the
// encoder's allocator helpers, redeclared so a transcoder-only consumer
// doesn't need to link against the encoder's headers.
void* fl_transcoder_alloc(size_t bytes);
void  fl_transcoder_free(void* ptr);

// Process-wide one-shot init. Idempotent. Returns 0 on success.
int fl_transcoder_init(void);

// Opaque KTX2 transcoder handle.
typedef struct fl_ktx2_transcoder fl_ktx2_transcoder;

fl_ktx2_transcoder* fl_ktx2_transcoder_create(void);
void                fl_ktx2_transcoder_destroy(fl_ktx2_transcoder* t);

// Ingest a KTX2 file. The caller retains ownership of `bytes`; the
// transcoder reads them on demand during transcode_level. The buffer must
// remain live and unchanged until fl_ktx2_transcoder_destroy.
//
// Returns FL_TRANSCODER_E_OK on success.
int fl_ktx2_init(fl_ktx2_transcoder* t, const uint8_t* bytes, uint32_t bytes_len);

// Prepare for transcoding (decompresses ETC1S global codebooks if present,
// validates internal offsets). Must be called after fl_ktx2_init and
// before fl_ktx2_transcode_level.
int fl_ktx2_start_transcoding(fl_ktx2_transcoder* t);

// File-level metadata. Populated by fl_ktx2_get_header.
typedef struct {
    uint32_t pixel_width;
    uint32_t pixel_height;
    uint32_t level_count;        // mipmap chain length, 1 = base only
    uint32_t face_count;         // 1 = 2D, 6 = cubemap
    uint32_t layer_count;        // 0 = non-array, N = array of N
    uint32_t is_etc1s;           // 0 / 1
    uint32_t is_uastc;           // 0 / 1
    uint32_t is_hdr;             // 0 / 1 (true for any HDR variant)
    uint32_t has_alpha;          // 0 / 1
    uint32_t is_video;           // 0 / 1
    uint32_t dfd_color_model;    // raw KTX2 DFD color model
    uint32_t dfd_transfer_func;  // raw KTX2 DFD transfer function (sRGB vs linear)
    uint32_t dfd_flags;          // raw KTX2 DFD flags
    uint32_t dfd_total_samples;  // raw KTX2 DFD sample count
    uint32_t basis_tex_format;   // raw basist::basis_tex_format value
} fl_ktx2_header;

int fl_ktx2_get_header(const fl_ktx2_transcoder* t, fl_ktx2_header* out);

// Per-level info for a (level, layer, face) selection.
typedef struct {
    uint32_t orig_width;
    uint32_t orig_height;
    uint32_t width;          // physical width (block-aligned)
    uint32_t height;         // physical height (block-aligned)
    uint32_t num_blocks_x;
    uint32_t num_blocks_y;
    uint32_t block_width;
    uint32_t block_height;
    uint32_t total_blocks;
    uint32_t alpha_flag;     // 0 / 1
    uint32_t iframe_flag;    // 0 / 1
} fl_ktx2_level_info;

int fl_ktx2_get_level_info(
    const fl_ktx2_transcoder* t,
    uint32_t level_index, uint32_t layer_index, uint32_t face_index,
    fl_ktx2_level_info* out
);

// Transcode one (level, layer, face) into a caller-allocated output buffer.
//
// `target_format` is a value from basist::transcoder_texture_format
// (forwarded as uint32_t to keep the C ABI pure). The JS wrapper picks
// the format based on the renderer's caps.
//
// `output_buf` and `output_buf_size_in_blocks_or_pixels` describe the
// destination. For block-compressed targets, size is in BLOCKS; for
// uncompressed targets (cTFRGBA32, cTFRGBA_HALF, etc.) size is in PIXELS.
// The JS wrapper computes the correct size using fl_basis_get_bytes_per_*
// helpers below.
//
// `decode_flags` forwards basist::basisu_decode_flags (default 0).
//
// Returns FL_TRANSCODER_E_OK on success.
int fl_ktx2_transcode_level(
    fl_ktx2_transcoder* t,
    uint32_t level_index, uint32_t layer_index, uint32_t face_index,
    uint32_t target_format,
    uint8_t* output_buf, uint32_t output_buf_size_in_blocks_or_pixels,
    uint32_t decode_flags
);

// Format query helpers (free functions; do not require a transcoder
// instance). Used by the JS wrapper to size output buffers and pick a
// target format compatible with the source.

// 1 if the format carries alpha, 0 otherwise.
uint32_t fl_basis_format_has_alpha(uint32_t target_format);

// 1 if the format is uncompressed (raw RGBA, RGB565, etc.), 0 if it's a
// block-compressed GPU format.
uint32_t fl_basis_format_is_uncompressed(uint32_t target_format);

// Bytes per block for compressed formats, or bytes per pixel for
// uncompressed formats. Returns 0 on unknown format.
uint32_t fl_basis_get_bytes_per_block_or_pixel(uint32_t target_format);

// 1 if the format is HDR (cTFBC6H, cTFASTC_HDR_*, cTFRGB_HALF, cTFRGBA_HALF), 0 otherwise.
uint32_t fl_basis_format_is_hdr(uint32_t target_format);

// 1 if `target_format` can be transcoded from `basis_tex_format` source. The
// JS wrapper iterates a preference list and picks the first supported.
uint32_t fl_basis_is_format_supported(uint32_t target_format, uint32_t basis_tex_format);

// Error codes (negative).
#define FL_TRANSCODER_E_OK                 0
#define FL_TRANSCODER_E_BAD_INPUT         -1
#define FL_TRANSCODER_E_NO_INIT           -2
#define FL_TRANSCODER_E_INIT_FAIL         -3
#define FL_TRANSCODER_E_NOT_STARTED       -4
#define FL_TRANSCODER_E_START_FAIL        -5
#define FL_TRANSCODER_E_LEVEL_INFO_FAIL   -6
#define FL_TRANSCODER_E_TRANSCODE_FAIL    -7

#ifdef __cplusplus
}
#endif
#endif // BASIS_TRANSCODER_C_API_H
