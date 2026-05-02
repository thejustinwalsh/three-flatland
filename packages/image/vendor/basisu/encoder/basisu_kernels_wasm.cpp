// basisu_kernels_wasm.cpp — wasm_simd128 mirror of basisu_kernels_sse.cpp.
// Path B Task 13. Gated by BASISU_SUPPORT_WASM_SIMD.
//
// On wasm builds basisu_kernels_sse.cpp is dropped from the source list
// (see encoder_files.zig) and this file provides the `*_sse41`-suffixed
// kernels that the call sites in basisu_etc.cpp / basisu_frontend.cpp /
// basisu_backend.cpp / basisu_enc.h reference under BASISU_SUPPORT_SSE.
//
// The kernel SPMD body is reused unchanged from basisu_kernels_imp.h via
// cppspmd_wasm.h — a port of cppspmd_sse.h sitting on top of sse_to_wasm.h
// (which translates `_mm_*` intrinsics to `wasm_simd128` ops).

#include "basisu_enc.h"

#if BASISU_SUPPORT_WASM_SIMD

#include <wasm_simd128.h>

#include "cppspmd_wasm.h"
#include "cppspmd_type_aliases.h"

using namespace basisu;

#include "basisu_kernels_declares.h"
#include "basisu_kernels_imp.h"

namespace basisu
{

// Wasm has no runtime CPU detection — SIMD128 is unconditionally available
// when the module was built with -msimd128. Set the kernel-gating flag the
// SSE call sites consult so they take the SIMD path.
void detect_sse41()
{
    g_cpu_supports_sse41 = true;
}

} // namespace basisu

#endif // BASISU_SUPPORT_WASM_SIMD
