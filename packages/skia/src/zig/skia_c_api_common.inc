// Common includes and helpers shared by GL and Dawn C API variants.
// This file is #included by skia_c_api_gl.cpp (GL) and skia_c_api_dawn.cpp (Dawn).
// It is NOT a standalone translation unit — do not compile directly.

#include "include/core/SkCanvas.h"
#include "include/core/SkColor.h"
#include "include/core/SkColorSpace.h"
#include "include/core/SkData.h"
#include "include/core/SkFont.h"
#include "include/core/SkFontMgr.h"
#include "include/core/SkM44.h"
#include "include/core/SkBlurTypes.h"
#include "include/core/SkMaskFilter.h"
#include "include/core/SkMatrix.h"
#include "include/core/SkPaint.h"
#include "include/core/SkPathBuilder.h"
#include "include/core/SkPathEffect.h"
#include "include/core/SkRect.h"
#include "include/core/SkRefCnt.h"
#include "include/core/SkStream.h"
#include "include/core/SkString.h"
#include "include/core/SkSurface.h"
#include "include/core/SkVertices.h"
#include "include/core/SkTextBlob.h"
#include "include/core/SkTypeface.h"
#include "include/effects/SkDashPathEffect.h"
#include "include/effects/SkGradient.h"
#include "include/pathops/SkPathOps.h"
#include "include/utils/SkParsePath.h"
#include "include/effects/SkLumaColorFilter.h"
#include "include/effects/Sk2DPathEffect.h"

// FreeType font manager — always included in our build
#include "include/ports/SkFontMgr_data.h"
#define HAS_FONTMGR_DATA 1

// ── Shared helpers ──

static inline SkPaint* as_paint(sk_paint_t p) { return reinterpret_cast<SkPaint*>(p); }
static inline SkPathBuilder* as_pathbuilder(sk_path_t p) { return reinterpret_cast<SkPathBuilder*>(p); }
static inline SkCanvas* as_canvas(sk_canvas_t c) { return reinterpret_cast<SkCanvas*>(c); }
static inline SkSurface* as_surface(sk_surface_t s) { return reinterpret_cast<SkSurface*>(s); }
static inline SkFont* as_font(sk_font_t f) { return reinterpret_cast<SkFont*>(f); }
static inline SkTypeface* as_typeface(sk_typeface_t t) { return reinterpret_cast<SkTypeface*>(t); }

// Convert uint32_t (0xAARRGGBB) to SkColor4f
static SkColor4f color_from_u32(uint32_t c) {
    return SkColor4f{
        ((c >> 16) & 0xFF) / 255.0f,  // R
        ((c >> 8) & 0xFF) / 255.0f,   // G
        (c & 0xFF) / 255.0f,          // B
        ((c >> 24) & 0xFF) / 255.0f,  // A
    };
}
