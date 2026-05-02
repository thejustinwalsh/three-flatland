// basis_c_api.h — flat C ABI for the BasisU encoder, exported from wasm.
// All functions are reentrancy-safe at the encoder-instance level. fl_basis_init
// is one-shot and idempotent.

#ifndef BASIS_C_API_H
#define BASIS_C_API_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Memory helpers (caller manages lifetimes).
void* fl_basis_alloc(size_t bytes);
void  fl_basis_free(void* ptr);

// Process-wide one-shot init. Idempotent. Returns 0 on success.
int fl_basis_init(void);

// Opaque encoder handle.
typedef struct fl_basis_encoder fl_basis_encoder;

fl_basis_encoder* fl_basis_encoder_create(void);
void              fl_basis_encoder_destroy(fl_basis_encoder* enc);

// Configuration. All fields are required; pass 0 for defaults that match
// the previous Embind-API behavior.
typedef struct {
    uint32_t uastc;            // 0 = ETC1S, 1 = UASTC
    uint32_t mipmaps;          // 0 / 1
    uint32_t quality;          // 1..255 (ETC1S)
    uint32_t uastc_level;      // 0..4
    uint32_t check_for_alpha;  // 0 / 1
} fl_basis_opts;

// One-shot encode. Caller passes raw RGBA8. On success the encoder
// writes ptr+len of an internal buffer into out_ptr/out_len; the caller
// must memcpy the bytes out before calling fl_basis_encoder_destroy.
// Returns 0 on success, negative error code on failure.
int fl_basis_encode(
    fl_basis_encoder* enc,
    const uint8_t* rgba, uint32_t width, uint32_t height,
    const fl_basis_opts* opts,
    uint8_t** out_ptr, uint32_t* out_len
);

// Error codes (negative).
#define FL_BASIS_E_OK             0
#define FL_BASIS_E_BAD_INPUT     -1
#define FL_BASIS_E_NO_INIT       -2
#define FL_BASIS_E_ENCODE_FAIL   -3

#ifdef __cplusplus
}
#endif
#endif // BASIS_C_API_H
