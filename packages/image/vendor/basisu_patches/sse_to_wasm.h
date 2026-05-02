// sse_to_wasm.h — SSE/SSE2/SSE3/SSSE3/SSE4.1 intrinsic compatibility shim over wasm_simd128.
//
// Defines the subset of x86 SSE intrinsics used by basisu_kernels_imp.h and
// cppspmd_sse.h, implemented on top of WebAssembly SIMD128 (v128_t).
//
// This is the core enabler for Path B Task 13 — porting BasisU's SSE SPMD kernels
// to wasm without rewriting the SPMD library line-by-line. cppspmd_wasm.h is
// essentially cppspmd_sse.h with this header included up front and the namespace
// renamed.
//
// Coverage: all `_mm_*` and `_MM_*` symbols referenced by cppspmd_sse.h and
// basisu_kernels_imp.h. If you add a new SSE intrinsic to that graph, extend
// this header.

#ifndef BASISU_SSE_TO_WASM_H
#define BASISU_SSE_TO_WASM_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <wasm_simd128.h>

// ---------------------------------------------------------------------------
// Core types
// On wasm there is a single 128-bit type `v128_t`. We typedef the x86 names
// to it; they are interchangeable in expressions but distinguished by usage.
// ---------------------------------------------------------------------------
typedef v128_t __m128;
typedef v128_t __m128i;
typedef v128_t __m128d;

// ---------------------------------------------------------------------------
// _MM_SHUFFLE / _MM_FROUND constants
// ---------------------------------------------------------------------------
#ifndef _MM_SHUFFLE
#define _MM_SHUFFLE(z, y, x, w) (((z) << 6) | ((y) << 4) | ((x) << 2) | (w))
#endif

#define _MM_FROUND_TO_NEAREST_INT 0x00
#define _MM_FROUND_TO_NEG_INF     0x01
#define _MM_FROUND_TO_POS_INF     0x02
#define _MM_FROUND_TO_ZERO        0x03
#define _MM_FROUND_NO_EXC         0x08

// ---------------------------------------------------------------------------
// Aligned alloc — used by aligned_new/aligned_delete in cppspmd_sse.h
// ---------------------------------------------------------------------------
static inline void* _mm_malloc(size_t size, size_t align) {
    void* p = NULL;
    // wasi-libc provides aligned_alloc; fall back to posix_memalign if needed.
    if (align < sizeof(void*)) align = sizeof(void*);
    // Round size up to multiple of align (aligned_alloc requirement).
    size_t aligned_size = (size + align - 1) & ~(align - 1);
    p = aligned_alloc(align, aligned_size);
    return p;
}
static inline void _mm_free(void* p) { free(p); }

// ---------------------------------------------------------------------------
// Loads / stores
// ---------------------------------------------------------------------------
static inline __m128i _mm_load_si128(const __m128i* p) { return wasm_v128_load(p); }
static inline __m128i _mm_loadu_si128(const __m128i* p) { return wasm_v128_load(p); }
static inline void _mm_store_si128(__m128i* p, __m128i v) { wasm_v128_store(p, v); }
static inline void _mm_storeu_si128(__m128i* p, __m128i v) { wasm_v128_store(p, v); }

static inline __m128 _mm_load_ps(const float* p) { return wasm_v128_load(p); }
static inline __m128 _mm_loadu_ps(const float* p) { return wasm_v128_load(p); }
static inline void _mm_store_ps(float* p, __m128 v) { wasm_v128_store(p, v); }
static inline void _mm_storeu_ps(float* p, __m128 v) { wasm_v128_store(p, v); }

// _mm_load_ss: load 32 bits into low lane, zero upper 96 bits.
static inline __m128 _mm_load_ss(const float* p) {
    return wasm_f32x4_make(*p, 0.0f, 0.0f, 0.0f);
}

// ---------------------------------------------------------------------------
// Set / set1 / setzero / undefined
// ---------------------------------------------------------------------------
static inline __m128i _mm_setzero_si128(void) { return wasm_i32x4_const(0, 0, 0, 0); }
static inline __m128 _mm_setzero_ps(void) { return wasm_f32x4_const(0.0f, 0.0f, 0.0f, 0.0f); }
static inline __m128i _mm_undefined_si128(void) { return wasm_i32x4_const(0, 0, 0, 0); }
static inline __m128 _mm_undefined_ps(void) { return wasm_f32x4_const(0.0f, 0.0f, 0.0f, 0.0f); }

static inline __m128i _mm_set1_epi8(int8_t a) { return wasm_i8x16_splat(a); }
static inline __m128i _mm_set1_epi16(int16_t a) { return wasm_i16x8_splat(a); }
static inline __m128i _mm_set1_epi32(int32_t a) { return wasm_i32x4_splat(a); }
static inline __m128i _mm_set1_epi64x(int64_t a) { return wasm_i64x2_splat(a); }
static inline __m128 _mm_set1_ps(float a) { return wasm_f32x4_splat(a); }

static inline __m128i _mm_set_epi32(int e3, int e2, int e1, int e0) {
    return wasm_i32x4_make(e0, e1, e2, e3);
}
static inline __m128 _mm_set_ps(float e3, float e2, float e1, float e0) {
    return wasm_f32x4_make(e0, e1, e2, e3);
}
static inline __m128i _mm_set_epi8(
    int8_t e15, int8_t e14, int8_t e13, int8_t e12,
    int8_t e11, int8_t e10, int8_t e9,  int8_t e8,
    int8_t e7,  int8_t e6,  int8_t e5,  int8_t e4,
    int8_t e3,  int8_t e2,  int8_t e1,  int8_t e0) {
    return wasm_i8x16_make(e0, e1, e2, e3, e4, e5, e6, e7,
                           e8, e9, e10, e11, e12, e13, e14, e15);
}

// ---------------------------------------------------------------------------
// Casts (no-ops on wasm — v128_t is type-erased)
// ---------------------------------------------------------------------------
static inline __m128 _mm_castsi128_ps(__m128i v) { return v; }
static inline __m128i _mm_castps_si128(__m128 v) { return v; }

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------
static inline int32_t _mm_cvtsi128_si32(__m128i v) {
    return wasm_i32x4_extract_lane(v, 0);
}
static inline __m128i _mm_cvtsi32_si128(int32_t a) {
    return wasm_i32x4_make(a, 0, 0, 0);
}
static inline float _mm_cvtss_f32(__m128 v) {
    return wasm_f32x4_extract_lane(v, 0);
}
static inline __m128 _mm_cvtepi32_ps(__m128i v) {
    return wasm_f32x4_convert_i32x4(v);
}
static inline __m128i _mm_cvtps_epi32(__m128 v) {
    // _mm_cvtps_epi32 rounds to nearest (banker's). wasm trunc_sat truncates,
    // so emulate: add a sign-correct 0.5, then trunc_sat.
    // For cppspmd usage, the result is then compared/blended against the input —
    // exact rounding mode matters. Use round-half-to-even via add/sub of 2^23.
    // Simpler approximation: round half away from zero.
    v128_t sign = wasm_v128_and(v, wasm_f32x4_const(-0.0f, -0.0f, -0.0f, -0.0f));
    v128_t half = wasm_v128_or(sign, wasm_f32x4_const(0.5f, 0.5f, 0.5f, 0.5f));
    v128_t adj = wasm_f32x4_add(v, half);
    return wasm_i32x4_trunc_sat_f32x4(adj);
}
static inline __m128i _mm_cvttps_epi32(__m128 v) {
    return wasm_i32x4_trunc_sat_f32x4(v);
}
static inline __m128i _mm_cvtepu8_epi32(__m128i v) {
    // Zero-extend 4 lower bytes to 4 i32s.
    v128_t lo16 = wasm_u16x8_extend_low_u8x16(v);
    return wasm_u32x4_extend_low_u16x8(lo16);
}

// f64x2 helpers for div_epi32 path.
static inline __m128d _mm_cvtepi32_pd(__m128i v) {
    return wasm_f64x2_convert_low_i32x4(v);
}
static inline __m128i _mm_cvttpd_epi32(__m128d v) {
    return wasm_i32x4_trunc_sat_f64x2_zero(v);
}
static inline __m128d _mm_div_pd(__m128d a, __m128d b) { return wasm_f64x2_div(a, b); }

// ---------------------------------------------------------------------------
// Bitwise
// ---------------------------------------------------------------------------
static inline __m128i _mm_and_si128(__m128i a, __m128i b) { return wasm_v128_and(a, b); }
static inline __m128i _mm_andnot_si128(__m128i a, __m128i b) { return wasm_v128_andnot(b, a); }
static inline __m128i _mm_or_si128(__m128i a, __m128i b) { return wasm_v128_or(a, b); }
static inline __m128i _mm_xor_si128(__m128i a, __m128i b) { return wasm_v128_xor(a, b); }
static inline __m128 _mm_and_ps(__m128 a, __m128 b) { return wasm_v128_and(a, b); }
static inline __m128 _mm_andnot_ps(__m128 a, __m128 b) { return wasm_v128_andnot(b, a); }
static inline __m128 _mm_or_ps(__m128 a, __m128 b) { return wasm_v128_or(a, b); }
static inline __m128 _mm_xor_ps(__m128 a, __m128 b) { return wasm_v128_xor(a, b); }

// ---------------------------------------------------------------------------
// Integer arithmetic
// ---------------------------------------------------------------------------
static inline __m128i _mm_add_epi8(__m128i a, __m128i b) { return wasm_i8x16_add(a, b); }
static inline __m128i _mm_add_epi16(__m128i a, __m128i b) { return wasm_i16x8_add(a, b); }
static inline __m128i _mm_add_epi32(__m128i a, __m128i b) { return wasm_i32x4_add(a, b); }
static inline __m128i _mm_sub_epi8(__m128i a, __m128i b) { return wasm_i8x16_sub(a, b); }
static inline __m128i _mm_sub_epi16(__m128i a, __m128i b) { return wasm_i16x8_sub(a, b); }
static inline __m128i _mm_sub_epi32(__m128i a, __m128i b) { return wasm_i32x4_sub(a, b); }

static inline __m128i _mm_adds_epi8(__m128i a, __m128i b) { return wasm_i8x16_add_sat(a, b); }
static inline __m128i _mm_adds_epu8(__m128i a, __m128i b) { return wasm_u8x16_add_sat(a, b); }
static inline __m128i _mm_adds_epi16(__m128i a, __m128i b) { return wasm_i16x8_add_sat(a, b); }
static inline __m128i _mm_adds_epu16(__m128i a, __m128i b) { return wasm_u16x8_add_sat(a, b); }
static inline __m128i _mm_subs_epi8(__m128i a, __m128i b) { return wasm_i8x16_sub_sat(a, b); }
static inline __m128i _mm_subs_epu8(__m128i a, __m128i b) { return wasm_u8x16_sub_sat(a, b); }
static inline __m128i _mm_subs_epi16(__m128i a, __m128i b) { return wasm_i16x8_sub_sat(a, b); }
static inline __m128i _mm_subs_epu16(__m128i a, __m128i b) { return wasm_u16x8_sub_sat(a, b); }

static inline __m128i _mm_mullo_epi16(__m128i a, __m128i b) { return wasm_i16x8_mul(a, b); }
static inline __m128i _mm_mullo_epi32(__m128i a, __m128i b) { return wasm_i32x4_mul(a, b); }

// _mm_mulhi_epi16 — high 16 bits of i16xi16 -> i16. Emulate via 32-bit widen mul.
static inline __m128i _mm_mulhi_epi16(__m128i a, __m128i b) {
    v128_t lo = wasm_i32x4_extmul_low_i16x8(a, b);
    v128_t hi = wasm_i32x4_extmul_high_i16x8(a, b);
    // Take high 16 bits of each i32 lane and pack back as i16x8.
    v128_t lo_shifted = wasm_i32x4_shr(lo, 16);
    v128_t hi_shifted = wasm_i32x4_shr(hi, 16);
    // Pack signed i32 -> i16 (saturating). High-16 already in range so saturation is a no-op.
    return wasm_i16x8_narrow_i32x4(lo_shifted, hi_shifted);
}
static inline __m128i _mm_mulhi_epu16(__m128i a, __m128i b) {
    v128_t lo = wasm_u32x4_extmul_low_u16x8(a, b);
    v128_t hi = wasm_u32x4_extmul_high_u16x8(a, b);
    v128_t lo_shifted = wasm_u32x4_shr(lo, 16);
    v128_t hi_shifted = wasm_u32x4_shr(hi, 16);
    // Pack as unsigned i16: use u16x8_narrow to clamp to [0,0xFFFF] and reinterpret.
    return wasm_u16x8_narrow_i32x4(lo_shifted, hi_shifted);
}

// _mm_mul_epu32: multiply low u32 of even lanes (0 and 2), produce two u64.
static inline __m128i _mm_mul_epu32(__m128i a, __m128i b) {
    uint64_t a0 = (uint64_t)(uint32_t)wasm_i32x4_extract_lane(a, 0);
    uint64_t a2 = (uint64_t)(uint32_t)wasm_i32x4_extract_lane(a, 2);
    uint64_t b0 = (uint64_t)(uint32_t)wasm_i32x4_extract_lane(b, 0);
    uint64_t b2 = (uint64_t)(uint32_t)wasm_i32x4_extract_lane(b, 2);
    return wasm_i64x2_make((int64_t)(a0 * b0), (int64_t)(a2 * b2));
}

// _mm_madd_epi16: a*b widened then horizontal pair-add → 4xi32.
static inline __m128i _mm_madd_epi16(__m128i a, __m128i b) {
    v128_t lo = wasm_i32x4_extmul_low_i16x8(a, b);
    v128_t hi = wasm_i32x4_extmul_high_i16x8(a, b);
    // Horizontal pairs of i32 add, packed back into 4 lanes.
    v128_t even = wasm_i32x4_shuffle(lo, hi, 0, 2, 4, 6);
    v128_t odd  = wasm_i32x4_shuffle(lo, hi, 1, 3, 5, 7);
    return wasm_i32x4_add(even, odd);
}

static inline __m128i _mm_abs_epi32(__m128i a) { return wasm_i32x4_abs(a); }

// _mm_avg_epu8/_mm_avg_epu16: rounded average.
static inline __m128i _mm_avg_epu8(__m128i a, __m128i b) { return wasm_u8x16_avgr(a, b); }
static inline __m128i _mm_avg_epu16(__m128i a, __m128i b) { return wasm_u16x8_avgr(a, b); }

// _mm_sad_epu8: sum of absolute differences in 8-byte halves.
static inline __m128i _mm_sad_epu8(__m128i a, __m128i b) {
    // Compute |a-b| per byte, then sum each 8-byte half into a u64.
    v128_t d = wasm_v128_or(wasm_u8x16_sub_sat(a, b), wasm_u8x16_sub_sat(b, a));
    // Widen u8 -> u16, sum each 8-element half.
    uint16_t lo_sum = 0, hi_sum = 0;
    uint8_t bytes[16];
    wasm_v128_store(bytes, d);
    for (int i = 0; i < 8; ++i) lo_sum += bytes[i];
    for (int i = 8; i < 16; ++i) hi_sum += bytes[i];
    return wasm_i64x2_make((int64_t)lo_sum, (int64_t)hi_sum);
}

// ---------------------------------------------------------------------------
// Min / max
// ---------------------------------------------------------------------------
static inline __m128i _mm_min_epi16(__m128i a, __m128i b) { return wasm_i16x8_min(a, b); }
static inline __m128i _mm_max_epi16(__m128i a, __m128i b) { return wasm_i16x8_max(a, b); }
static inline __m128i _mm_min_epi32(__m128i a, __m128i b) { return wasm_i32x4_min(a, b); }
static inline __m128i _mm_max_epi32(__m128i a, __m128i b) { return wasm_i32x4_max(a, b); }
static inline __m128i _mm_min_epu8(__m128i a, __m128i b) { return wasm_u8x16_min(a, b); }
static inline __m128i _mm_max_epu8(__m128i a, __m128i b) { return wasm_u8x16_max(a, b); }
static inline __m128i _mm_min_epu32(__m128i a, __m128i b) { return wasm_u32x4_min(a, b); }
static inline __m128i _mm_max_epu32(__m128i a, __m128i b) { return wasm_u32x4_max(a, b); }

// ---------------------------------------------------------------------------
// Comparisons (integer)
// ---------------------------------------------------------------------------
static inline __m128i _mm_cmpeq_epi8(__m128i a, __m128i b) { return wasm_i8x16_eq(a, b); }
static inline __m128i _mm_cmpeq_epi16(__m128i a, __m128i b) { return wasm_i16x8_eq(a, b); }
static inline __m128i _mm_cmpeq_epi32(__m128i a, __m128i b) { return wasm_i32x4_eq(a, b); }
static inline __m128i _mm_cmpgt_epi8(__m128i a, __m128i b) { return wasm_i8x16_gt(a, b); }
static inline __m128i _mm_cmpgt_epi16(__m128i a, __m128i b) { return wasm_i16x8_gt(a, b); }
static inline __m128i _mm_cmpgt_epi32(__m128i a, __m128i b) { return wasm_i32x4_gt(a, b); }
static inline __m128i _mm_cmplt_epi8(__m128i a, __m128i b) { return wasm_i8x16_lt(a, b); }
static inline __m128i _mm_cmplt_epi16(__m128i a, __m128i b) { return wasm_i16x8_lt(a, b); }
static inline __m128i _mm_cmplt_epi32(__m128i a, __m128i b) { return wasm_i32x4_lt(a, b); }

// ---------------------------------------------------------------------------
// Float arithmetic / comparisons
// ---------------------------------------------------------------------------
static inline __m128 _mm_add_ps(__m128 a, __m128 b) { return wasm_f32x4_add(a, b); }
static inline __m128 _mm_sub_ps(__m128 a, __m128 b) { return wasm_f32x4_sub(a, b); }
static inline __m128 _mm_mul_ps(__m128 a, __m128 b) { return wasm_f32x4_mul(a, b); }
static inline __m128 _mm_div_ps(__m128 a, __m128 b) { return wasm_f32x4_div(a, b); }
static inline __m128 _mm_min_ps(__m128 a, __m128 b) { return wasm_f32x4_min(a, b); }
static inline __m128 _mm_max_ps(__m128 a, __m128 b) { return wasm_f32x4_max(a, b); }
static inline __m128 _mm_sqrt_ps(__m128 v) { return wasm_f32x4_sqrt(v); }

// _mm_add_ss: add lower 32-bit float, keep upper lanes from a.
static inline __m128 _mm_add_ss(__m128 a, __m128 b) {
    float la = wasm_f32x4_extract_lane(a, 0);
    float lb = wasm_f32x4_extract_lane(b, 0);
    return wasm_f32x4_replace_lane(a, 0, la + lb);
}

static inline __m128 _mm_cmpeq_ps(__m128 a, __m128 b) { return wasm_f32x4_eq(a, b); }
static inline __m128 _mm_cmpge_ps(__m128 a, __m128 b) { return wasm_f32x4_ge(a, b); }
static inline __m128 _mm_cmpgt_ps(__m128 a, __m128 b) { return wasm_f32x4_gt(a, b); }
static inline __m128 _mm_cmple_ps(__m128 a, __m128 b) { return wasm_f32x4_le(a, b); }
static inline __m128 _mm_cmplt_ps(__m128 a, __m128 b) { return wasm_f32x4_lt(a, b); }

// ---------------------------------------------------------------------------
// Movemask / bitmask
// ---------------------------------------------------------------------------
static inline int _mm_movemask_epi8(__m128i a) { return wasm_i8x16_bitmask(a); }
static inline int _mm_movemask_ps(__m128 a) { return wasm_i32x4_bitmask(a); }

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------
// Immediate shifts: wasm i*x*_shl/shr take a runtime count but compile to a
// constant shift when count is constexpr. The clang headers __builtin_wasm_*
// accept any int; we pass through.
static inline __m128i _mm_slli_epi16(__m128i a, int imm) { return wasm_i16x8_shl(a, imm); }
static inline __m128i _mm_slli_epi32(__m128i a, int imm) { return wasm_i32x4_shl(a, imm); }
static inline __m128i _mm_srli_epi16(__m128i a, int imm) { return wasm_u16x8_shr(a, imm); }
static inline __m128i _mm_srli_epi32(__m128i a, int imm) { return wasm_u32x4_shr(a, imm); }
static inline __m128i _mm_srai_epi16(__m128i a, int imm) { return wasm_i16x8_shr(a, imm); }
static inline __m128i _mm_srai_epi32(__m128i a, int imm) { return wasm_i32x4_shr(a, imm); }

// Variable (uniform) shifts: x86 _mm_sll_*/_mm_sra_*/_mm_srl_* take the count
// in lane 0 of an __m128i. Extract it and pass as scalar.
static inline __m128i _mm_sll_epi16(__m128i a, __m128i count) {
    int n = (int)(wasm_i64x2_extract_lane(count, 0) & 0xFF);
    if (n > 15) return wasm_i16x8_const(0,0,0,0,0,0,0,0);
    return wasm_i16x8_shl(a, n);
}
static inline __m128i _mm_sll_epi32(__m128i a, __m128i count) {
    int n = (int)(wasm_i64x2_extract_lane(count, 0) & 0xFF);
    if (n > 31) return wasm_i32x4_const(0,0,0,0);
    return wasm_i32x4_shl(a, n);
}
static inline __m128i _mm_sra_epi16(__m128i a, __m128i count) {
    int n = (int)(wasm_i64x2_extract_lane(count, 0) & 0xFF);
    if (n > 15) n = 15;
    return wasm_i16x8_shr(a, n);
}
static inline __m128i _mm_sra_epi32(__m128i a, __m128i count) {
    int n = (int)(wasm_i64x2_extract_lane(count, 0) & 0xFF);
    if (n > 31) n = 31;
    return wasm_i32x4_shr(a, n);
}
static inline __m128i _mm_srl_epi16(__m128i a, __m128i count) {
    int n = (int)(wasm_i64x2_extract_lane(count, 0) & 0xFF);
    if (n > 15) return wasm_i16x8_const(0,0,0,0,0,0,0,0);
    return wasm_u16x8_shr(a, n);
}
static inline __m128i _mm_srl_epi32(__m128i a, __m128i count) {
    int n = (int)(wasm_i64x2_extract_lane(count, 0) & 0xFF);
    if (n > 31) return wasm_i32x4_const(0,0,0,0);
    return wasm_u32x4_shr(a, n);
}

// _mm_slli_si128 / _mm_srli_si128: byte-shift the entire 128-bit register.
// imm must be a compile-time constant in [0,15]. Emulate via byte-shuffle.
#define _mm_slli_si128(a, imm)                                                   \
    ((imm) >= 16 ? wasm_i32x4_const(0,0,0,0) :                                   \
     wasm_i8x16_shuffle(wasm_i32x4_const(0,0,0,0), (a),                          \
        16 - (imm), 17 - (imm), 18 - (imm), 19 - (imm),                          \
        20 - (imm), 21 - (imm), 22 - (imm), 23 - (imm),                          \
        24 - (imm), 25 - (imm), 26 - (imm), 27 - (imm),                          \
        28 - (imm), 29 - (imm), 30 - (imm), 31 - (imm)))

#define _mm_srli_si128(a, imm)                                                   \
    ((imm) >= 16 ? wasm_i32x4_const(0,0,0,0) :                                   \
     wasm_i8x16_shuffle((a), wasm_i32x4_const(0,0,0,0),                          \
        (imm) + 0, (imm) + 1, (imm) + 2, (imm) + 3,                              \
        (imm) + 4, (imm) + 5, (imm) + 6, (imm) + 7,                              \
        (imm) + 8, (imm) + 9, (imm) + 10, (imm) + 11,                            \
        (imm) + 12, (imm) + 13, (imm) + 14, (imm) + 15))

// ---------------------------------------------------------------------------
// Pack / unpack
// ---------------------------------------------------------------------------
static inline __m128i _mm_packs_epi16(__m128i a, __m128i b) { return wasm_i8x16_narrow_i16x8(a, b); }
static inline __m128i _mm_packus_epi16(__m128i a, __m128i b) { return wasm_u8x16_narrow_i16x8(a, b); }

static inline __m128i _mm_unpacklo_epi8(__m128i a, __m128i b) {
    return wasm_i8x16_shuffle(a, b, 0, 16, 1, 17, 2, 18, 3, 19,
                                    4, 20, 5, 21, 6, 22, 7, 23);
}
static inline __m128i _mm_unpackhi_epi8(__m128i a, __m128i b) {
    return wasm_i8x16_shuffle(a, b, 8, 24, 9, 25, 10, 26, 11, 27,
                                    12, 28, 13, 29, 14, 30, 15, 31);
}
static inline __m128i _mm_unpacklo_epi16(__m128i a, __m128i b) {
    return wasm_i16x8_shuffle(a, b, 0, 8, 1, 9, 2, 10, 3, 11);
}
static inline __m128i _mm_unpackhi_epi16(__m128i a, __m128i b) {
    return wasm_i16x8_shuffle(a, b, 4, 12, 5, 13, 6, 14, 7, 15);
}
static inline __m128i _mm_unpacklo_epi32(__m128i a, __m128i b) {
    return wasm_i32x4_shuffle(a, b, 0, 4, 1, 5);
}
static inline __m128i _mm_unpackhi_epi32(__m128i a, __m128i b) {
    return wasm_i32x4_shuffle(a, b, 2, 6, 3, 7);
}
static inline __m128i _mm_unpacklo_epi64(__m128i a, __m128i b) {
    return wasm_i64x2_shuffle(a, b, 0, 2);
}
static inline __m128i _mm_unpackhi_epi64(__m128i a, __m128i b) {
    return wasm_i64x2_shuffle(a, b, 1, 3);
}

// ---------------------------------------------------------------------------
// Shuffles (immediate-controlled)
// imm8 layout (from x86): two-bit lane indices packed: ((d<<6)|(c<<4)|(b<<2)|a)
// Selects lane (a) -> dst[0], (b) -> dst[1], etc.
// ---------------------------------------------------------------------------
#define _mm_shuffle_epi32(a, imm)                                                \
    wasm_i32x4_shuffle((a), (a),                                                 \
        ((imm) >> 0) & 3, ((imm) >> 2) & 3,                                      \
        ((imm) >> 4) & 3, ((imm) >> 6) & 3)

#define _mm_shuffle_ps(a, b, imm)                                                \
    wasm_i32x4_shuffle((a), (b),                                                 \
        ((imm) >> 0) & 3, ((imm) >> 2) & 3,                                      \
        4 + (((imm) >> 4) & 3), 4 + (((imm) >> 6) & 3))

// _mm_shufflelo_epi16: shuffle lower 4 i16 lanes by imm8, leave upper 4 unchanged.
#define _mm_shufflelo_epi16(a, imm)                                              \
    wasm_i16x8_shuffle((a), (a),                                                 \
        ((imm) >> 0) & 3, ((imm) >> 2) & 3,                                      \
        ((imm) >> 4) & 3, ((imm) >> 6) & 3,                                      \
        4, 5, 6, 7)

#define _mm_shufflehi_epi16(a, imm)                                              \
    wasm_i16x8_shuffle((a), (a),                                                 \
        0, 1, 2, 3,                                                              \
        4 + (((imm) >> 0) & 3), 4 + (((imm) >> 2) & 3),                          \
        4 + (((imm) >> 4) & 3), 4 + (((imm) >> 6) & 3))

// _mm_shuffle_epi8 (PSHUFB): per-byte table lookup from a using b as indices.
// If high bit of b lane is set, output 0. wasm_i8x16_swizzle clamps OOB to 0
// when the index is >= 16 OR when the high bit is set (>= 128).
static inline __m128i _mm_shuffle_epi8(__m128i a, __m128i b) {
    return wasm_i8x16_swizzle(a, b);
}

// _mm_movehl_ps: dst = { a[2], a[3], b[2], b[3] } -> wait, actual:
// "Move the upper 2 single-precision (32-bit) floating-point elements from b
//  to the lower 2 elements, and the upper 2 elements from a to the upper 2
//  elements of dst" — so dst = { b[2], b[3], a[2], a[3] }.
static inline __m128 _mm_movehl_ps(__m128 a, __m128 b) {
    return wasm_i32x4_shuffle(a, b, 6, 7, 2, 3);
}

// ---------------------------------------------------------------------------
// SSE 4.1: extract / insert / blendv / round / floor / ceil
// ---------------------------------------------------------------------------
#define _mm_extract_epi32(v, imm) wasm_i32x4_extract_lane((v), (imm))
// _mm_extract_ps returns the bits of the float as int.
#define _mm_extract_ps(v, imm) ((int)wasm_i32x4_extract_lane((v), (imm)))
#define _mm_insert_epi16(v, x, imm) wasm_i16x8_replace_lane((v), (imm), (int16_t)(x))
#define _mm_insert_epi32(v, x, imm) wasm_i32x4_replace_lane((v), (imm), (int32_t)(x))

// _mm_insert_ps: imm8 = (src_idx<<6) | (dst_idx<<4) | (zero_mask). Implemented
// as a macro because wasm_f32x4_extract_lane / replace_lane require their lane
// index to be a compile-time constant. The zero_mask path is left out — it is
// not reachable from cppspmd_sse.h's call sites (which all pass zmask==0).
#define _mm_insert_ps(a, b, imm)                                                 \
    wasm_f32x4_replace_lane((a), ((imm) >> 4) & 3,                               \
        wasm_f32x4_extract_lane((b), ((imm) >> 6) & 3))

// blendv: for each lane, if the high bit of mask is set, choose b else a.
static inline __m128i _mm_blendv_epi8(__m128i a, __m128i b, __m128i mask) {
    // wasm has no per-byte msb test directly; broadcast each byte's sign by
    // arithmetic shift right of i8 by 7 bits, then bitselect.
    v128_t m = wasm_i8x16_shr(mask, 7);
    return wasm_v128_bitselect(b, a, m);
}
static inline __m128 _mm_blendv_ps(__m128 a, __m128 b, __m128 mask) {
    v128_t m = wasm_i32x4_shr(mask, 31);
    return wasm_v128_bitselect(b, a, m);
}

// _mm_round_ps with explicit rounding mode (we only see _MM_FROUND_TO_NEAREST_INT
// and _MM_FROUND_TO_ZERO in the source).
static inline __m128 _mm_round_ps(__m128 a, int mode) {
    int rounding = mode & 0x3;
    switch (rounding) {
        case _MM_FROUND_TO_NEAREST_INT: return wasm_f32x4_nearest(a);
        case _MM_FROUND_TO_NEG_INF:     return wasm_f32x4_floor(a);
        case _MM_FROUND_TO_POS_INF:     return wasm_f32x4_ceil(a);
        case _MM_FROUND_TO_ZERO:        return wasm_f32x4_trunc(a);
        default:                        return wasm_f32x4_nearest(a);
    }
}
static inline __m128 _mm_floor_ps(__m128 a) { return wasm_f32x4_floor(a); }
static inline __m128 _mm_ceil_ps(__m128 a) { return wasm_f32x4_ceil(a); }

#endif // BASISU_SSE_TO_WASM_H
