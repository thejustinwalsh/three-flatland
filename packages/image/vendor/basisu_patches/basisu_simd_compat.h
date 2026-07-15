// basisu_simd_compat.h — uniform wrapper over SSE / wasm_simd128 / scalar.
// Selected via -DBASISU_SUPPORT_SSE / -DBASISU_SUPPORT_WASM_SIMD build flags.
//
// Status: this header is provided as a translation reference for the SIMD port
// (Phase 3 of the Path B plan). The Task 4 audit determined that the only SSE
// intrinsic usage in non-kernel files is via cppspmd_sse.h, which is bundled
// with the kernels file. The macros below cover the common SSE→wasm cases the
// kernels use; extend as needed.

#ifndef BASISU_SIMD_COMPAT_H
#define BASISU_SIMD_COMPAT_H

#include <stdint.h>

#if BASISU_SUPPORT_SSE
  #include <emmintrin.h>
  #include <smmintrin.h>
  typedef __m128i bu_v128;
  #define BU_V128_LOAD(p)            _mm_loadu_si128((const __m128i*)(p))
  #define BU_V128_STORE(p, v)        _mm_storeu_si128((__m128i*)(p), (v))
  #define BU_V128_I8_SPLAT(x)        _mm_set1_epi8((char)(x))
  #define BU_V128_I16_SPLAT(x)       _mm_set1_epi16((int16_t)(x))
  #define BU_V128_I32_SPLAT(x)       _mm_set1_epi32((int32_t)(x))
  #define BU_V128_I8_ADD(a, b)       _mm_add_epi8((a), (b))
  #define BU_V128_I16_ADD(a, b)      _mm_add_epi16((a), (b))
  #define BU_V128_I32_ADD(a, b)      _mm_add_epi32((a), (b))
  #define BU_V128_I16_SUB(a, b)      _mm_sub_epi16((a), (b))
  #define BU_V128_I32_SUB(a, b)      _mm_sub_epi32((a), (b))
  #define BU_V128_I16_MUL(a, b)      _mm_mullo_epi16((a), (b))
  #define BU_V128_I32_MUL(a, b)      _mm_mullo_epi32((a), (b))
  #define BU_V128_U8_NARROW_I16(a,b) _mm_packus_epi16((a), (b))
  #define BU_V128_I8_BITMASK(a)      _mm_movemask_epi8((a))
  #define BU_V128_U8_MIN(a, b)       _mm_min_epu8((a), (b))
  #define BU_V128_U8_MAX(a, b)       _mm_max_epu8((a), (b))
  #define BU_V128_U16_MIN(a, b)      _mm_min_epu16((a), (b))
  #define BU_V128_I8_EQ(a, b)        _mm_cmpeq_epi8((a), (b))
  #define BU_V128_I16_EQ(a, b)       _mm_cmpeq_epi16((a), (b))
  #define BU_V128_SHUFFLE_I8(a, idx) _mm_shuffle_epi8((a), (idx))
  #define BU_V128_I16_MADD(a, b)     _mm_madd_epi16((a), (b))
#elif BASISU_SUPPORT_WASM_SIMD
  #include <wasm_simd128.h>
  typedef v128_t bu_v128;
  #define BU_V128_LOAD(p)            wasm_v128_load((p))
  #define BU_V128_STORE(p, v)        wasm_v128_store((p), (v))
  #define BU_V128_I8_SPLAT(x)        wasm_i8x16_splat((int8_t)(x))
  #define BU_V128_I16_SPLAT(x)       wasm_i16x8_splat((int16_t)(x))
  #define BU_V128_I32_SPLAT(x)       wasm_i32x4_splat((int32_t)(x))
  #define BU_V128_I8_ADD(a, b)       wasm_i8x16_add((a), (b))
  #define BU_V128_I16_ADD(a, b)      wasm_i16x8_add((a), (b))
  #define BU_V128_I32_ADD(a, b)      wasm_i32x4_add((a), (b))
  #define BU_V128_I16_SUB(a, b)      wasm_i16x8_sub((a), (b))
  #define BU_V128_I32_SUB(a, b)      wasm_i32x4_sub((a), (b))
  #define BU_V128_I16_MUL(a, b)      wasm_i16x8_mul((a), (b))
  #define BU_V128_I32_MUL(a, b)      wasm_i32x4_mul((a), (b))
  #define BU_V128_U8_NARROW_I16(a,b) wasm_u8x16_narrow_i16x8((a), (b))
  #define BU_V128_I8_BITMASK(a)      wasm_i8x16_bitmask((a))
  #define BU_V128_U8_MIN(a, b)       wasm_u8x16_min((a), (b))
  #define BU_V128_U8_MAX(a, b)       wasm_u8x16_max((a), (b))
  #define BU_V128_U16_MIN(a, b)      wasm_u16x8_min((a), (b))
  #define BU_V128_I8_EQ(a, b)        wasm_i8x16_eq((a), (b))
  #define BU_V128_I16_EQ(a, b)       wasm_i16x8_eq((a), (b))
  #define BU_V128_SHUFFLE_I8(a, idx) wasm_i8x16_swizzle((a), (idx))
  // _mm_madd_epi16 emulation: extend i16 -> i32, multiply pairs, add adjacent.
  static inline bu_v128 bu_v128_i16_madd(bu_v128 a, bu_v128 b) {
      v128_t lo_a = wasm_i32x4_extend_low_i16x8(a);
      v128_t hi_a = wasm_i32x4_extend_high_i16x8(a);
      v128_t lo_b = wasm_i32x4_extend_low_i16x8(b);
      v128_t hi_b = wasm_i32x4_extend_high_i16x8(b);
      v128_t lo = wasm_i32x4_mul(lo_a, lo_b);
      v128_t hi = wasm_i32x4_mul(hi_a, hi_b);
      // Horizontal add adjacent: shuffle and add.
      v128_t lo_shuf = wasm_i32x4_shuffle(lo, lo, 1, 0, 3, 2);
      v128_t hi_shuf = wasm_i32x4_shuffle(hi, hi, 1, 0, 3, 2);
      v128_t lo_sum = wasm_i32x4_add(lo, lo_shuf);
      v128_t hi_sum = wasm_i32x4_add(hi, hi_shuf);
      // Pack: take even lanes of lo_sum and hi_sum.
      return wasm_i32x4_shuffle(lo_sum, hi_sum, 0, 2, 4, 6);
  }
  #define BU_V128_I16_MADD(a, b)     bu_v128_i16_madd((a), (b))
#else
  #error "basisu_simd_compat.h included with neither BASISU_SUPPORT_SSE nor BASISU_SUPPORT_WASM_SIMD set"
#endif

#endif // BASISU_SIMD_COMPAT_H
