// C API wrapper around Skia C++ classes for the WASM/Zig build.
// Full implementation: drawing, paint effects, path, text, SVG, PathOps.

#include "skia_c_api.h"

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
#include "include/gpu/ganesh/GrBackendSurface.h"
#include "include/gpu/ganesh/GrDirectContext.h"
#include "include/gpu/ganesh/SkSurfaceGanesh.h"
#include "include/gpu/ganesh/gl/GrGLBackendSurface.h"
#include "include/gpu/ganesh/gl/GrGLDirectContext.h"
#include "include/gpu/ganesh/gl/GrGLInterface.h"
#include "include/gpu/ganesh/gl/GrGLMakeWebGLInterface.h"
#include "include/gpu/ganesh/gl/GrGLTypes.h"
#include "include/pathops/SkPathOps.h"
#include "include/utils/SkParsePath.h"
#include "include/effects/SkLumaColorFilter.h"
#include "include/effects/Sk2DPathEffect.h"


// FreeType font manager — always included in our build
#include "include/ports/SkFontMgr_data.h"
#define HAS_FONTMGR_DATA 1

// ── Helpers ──

static inline SkPaint* as_paint(sk_paint_t p) { return reinterpret_cast<SkPaint*>(p); }
static inline SkPathBuilder* as_pathbuilder(sk_path_t p) { return reinterpret_cast<SkPathBuilder*>(p); }
static inline SkCanvas* as_canvas(sk_canvas_t c) { return reinterpret_cast<SkCanvas*>(c); }
static inline GrDirectContext* as_context(sk_context_t c) { return reinterpret_cast<GrDirectContext*>(c); }
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

// ════════════════════════════════════════════════════════
// Context
// ════════════════════════════════════════════════════════

// Debug: returns 0=ok, 1=MakeWebGL failed, 2=MakeGL failed
static int g_gl_init_error = 0;

sk_context_t sk_context_create_mock(void) {
    auto ctx = GrDirectContext::MakeMock(nullptr);
    if (!ctx) return nullptr;
    return reinterpret_cast<sk_context_t>(ctx.release());
}

sk_context_t sk_context_create_gl(void) {
    sk_sp<const GrGLInterface> interface = GrGLInterfaces::MakeWebGL();
    if (!interface) { g_gl_init_error = 1; return nullptr; }
    sk_sp<GrDirectContext> ctx = GrDirectContexts::MakeGL(interface);
    if (!ctx) { g_gl_init_error = 2; return nullptr; }
    g_gl_init_error = 0;
    return reinterpret_cast<sk_context_t>(ctx.release());
}

int sk_context_get_init_error(void) { return g_gl_init_error; }

void sk_context_destroy(sk_context_t ctx) {
    if (ctx) {
        as_context(ctx)->abandonContext();
        as_context(ctx)->unref();
    }
}

void sk_context_flush(sk_context_t ctx) {
    if (ctx) as_context(ctx)->flushAndSubmit(GrSyncCpu::kNo);
}

void sk_context_reset_gl_state(sk_context_t ctx) {
    if (ctx) as_context(ctx)->resetContext(kAll_GrBackendState);
}

// ════════════════════════════════════════════════════════
// Surface
// ════════════════════════════════════════════════════════

sk_surface_t sk_surface_create_from_fbo(sk_context_t ctx, uint32_t fbo_id, int32_t width, int32_t height) {
    if (!ctx || width <= 0 || height <= 0) return nullptr;

    GrGLFramebufferInfo fbo_info;
    fbo_info.fFBOID = fbo_id;
    fbo_info.fFormat = 0x8058; // GL_RGBA8

    auto backend_rt = GrBackendRenderTargets::MakeGL(width, height, 0, 8, fbo_info);

    sk_sp<SkSurface> surface = SkSurfaces::WrapBackendRenderTarget(
        as_context(ctx), backend_rt, kBottomLeft_GrSurfaceOrigin,
        kRGBA_8888_SkColorType, SkColorSpace::MakeSRGB(), nullptr);

    if (!surface) return nullptr;
    return reinterpret_cast<sk_surface_t>(surface.release());
}

sk_surface_t sk_surface_create_raster(int32_t width, int32_t height) {
    if (width <= 0 || height <= 0) return nullptr;
    auto surface = SkSurfaces::Raster(SkImageInfo::MakeN32Premul(width, height));
    if (!surface) return nullptr;
    return reinterpret_cast<sk_surface_t>(surface.release());
}

void sk_surface_destroy(sk_surface_t surface) {
    if (surface) as_surface(surface)->unref();
}

sk_canvas_t sk_surface_get_canvas(sk_surface_t surface) {
    if (!surface) return nullptr;
    return reinterpret_cast<sk_canvas_t>(as_surface(surface)->getCanvas());
}

void sk_surface_flush(sk_surface_t surface) {
    if (surface) skgpu::ganesh::FlushAndSubmit(as_surface(surface));
}

// ════════════════════════════════════════════════════════
// Paint
// ════════════════════════════════════════════════════════

sk_paint_t sk_paint_create(void) {
    auto* p = new SkPaint();
    p->setAntiAlias(true);
    return reinterpret_cast<sk_paint_t>(p);
}

void sk_paint_destroy(sk_paint_t paint) { delete as_paint(paint); }

void sk_paint_set_color(sk_paint_t paint, float r, float g, float b, float a) {
    as_paint(paint)->setColor4f({r, g, b, a});
}

void sk_paint_set_fill(sk_paint_t paint) {
    as_paint(paint)->setStyle(SkPaint::kFill_Style);
}

void sk_paint_set_stroke(sk_paint_t paint, float width) {
    as_paint(paint)->setStyle(SkPaint::kStroke_Style);
    as_paint(paint)->setStrokeWidth(width);
}

void sk_paint_set_stroke_cap(sk_paint_t paint, uint8_t cap) {
    as_paint(paint)->setStrokeCap(static_cast<SkPaint::Cap>(cap));
}

void sk_paint_set_stroke_join(sk_paint_t paint, uint8_t join) {
    as_paint(paint)->setStrokeJoin(static_cast<SkPaint::Join>(join));
}

void sk_paint_set_stroke_miter(sk_paint_t paint, float limit) {
    as_paint(paint)->setStrokeMiter(limit);
}

void sk_paint_set_anti_alias(sk_paint_t paint, int aa) {
    as_paint(paint)->setAntiAlias(aa != 0);
}

void sk_paint_set_blend_mode(sk_paint_t paint, uint8_t mode) {
    as_paint(paint)->setBlendMode(static_cast<SkBlendMode>(mode));
}

void sk_paint_set_alpha(sk_paint_t paint, float alpha) {
    as_paint(paint)->setAlphaf(alpha);
}

void sk_paint_set_dash(sk_paint_t paint, const float* intervals, int count, float phase) {
    if (intervals && count >= 2) {
        as_paint(paint)->setPathEffect(
            SkDashPathEffect::Make({intervals, static_cast<size_t>(count)}, phase));
    }
}

void sk_paint_clear_dash(sk_paint_t paint) {
    as_paint(paint)->setPathEffect(nullptr);
}

void sk_paint_set_blur(sk_paint_t paint, float sigma) {
    if (sigma > 0) {
        as_paint(paint)->setMaskFilter(SkMaskFilter::MakeBlur(kNormal_SkBlurStyle, sigma));
    }
}

void sk_paint_set_blur_style(sk_paint_t paint, float sigma, int style) {
    if (sigma > 0) {
        as_paint(paint)->setMaskFilter(SkMaskFilter::MakeBlur(static_cast<SkBlurStyle>(style), sigma));
    }
}

void sk_paint_clear_blur(sk_paint_t paint) {
    as_paint(paint)->setMaskFilter(nullptr);
}

void sk_paint_set_linear_gradient(sk_paint_t paint, float x0, float y0, float x1, float y1,
                                   const uint32_t* colors, const float* stops, int count) {
    SkPoint pts[2] = {{x0, y0}, {x1, y1}};

    SkColor4f* sk_colors = reinterpret_cast<SkColor4f*>(alloca(count * sizeof(SkColor4f)));
    for (int i = 0; i < count; i++) {
        sk_colors[i] = color_from_u32(colors[i]);
    }

    SkGradient::Colors grad_colors(
        {sk_colors, static_cast<size_t>(count)},
        {stops, static_cast<size_t>(count)},
        SkTileMode::kClamp);
    SkGradient grad(grad_colors, {});

    as_paint(paint)->setShader(SkShaders::LinearGradient(pts, grad));
}

void sk_paint_set_radial_gradient(sk_paint_t paint, float cx, float cy, float r,
                                   const uint32_t* colors, const float* stops, int count) {
    SkColor4f* sk_colors = reinterpret_cast<SkColor4f*>(alloca(count * sizeof(SkColor4f)));
    for (int i = 0; i < count; i++) {
        sk_colors[i] = color_from_u32(colors[i]);
    }

    SkGradient::Colors grad_colors(
        {sk_colors, static_cast<size_t>(count)},
        {stops, static_cast<size_t>(count)},
        SkTileMode::kClamp);
    SkGradient grad(grad_colors, {});

    as_paint(paint)->setShader(SkShaders::RadialGradient({cx, cy}, r, grad));
}

void sk_paint_set_sweep_gradient(sk_paint_t paint, float cx, float cy,
                                  const uint32_t* colors, const float* stops, int count) {
    SkColor4f* sk_colors = reinterpret_cast<SkColor4f*>(alloca(count * sizeof(SkColor4f)));
    for (int i = 0; i < count; i++) {
        sk_colors[i] = color_from_u32(colors[i]);
    }

    SkGradient::Colors grad_colors(
        {sk_colors, static_cast<size_t>(count)},
        {stops, static_cast<size_t>(count)},
        SkTileMode::kClamp);
    SkGradient grad(grad_colors, {});

    as_paint(paint)->setShader(SkShaders::SweepGradient({cx, cy}, grad));
}

void sk_paint_clear_shader(sk_paint_t paint) {
    as_paint(paint)->setShader(nullptr);
}

// ════════════════════════════════════════════════════════
// Paint getters
// ════════════════════════════════════════════════════════

void sk_paint_get_color(sk_paint_t paint, float* r, float* g, float* b, float* a) {
    SkColor4f c = as_paint(paint)->getColor4f();
    *r = c.fR; *g = c.fG; *b = c.fB; *a = c.fA;
}

float sk_paint_get_alpha(sk_paint_t paint) {
    return as_paint(paint)->getAlphaf();
}

uint8_t sk_paint_get_blend_mode(sk_paint_t paint) {
    return static_cast<uint8_t>(as_paint(paint)->getBlendMode_or(SkBlendMode::kSrcOver));
}

uint8_t sk_paint_get_stroke_cap(sk_paint_t paint) {
    return static_cast<uint8_t>(as_paint(paint)->getStrokeCap());
}

uint8_t sk_paint_get_stroke_join(sk_paint_t paint) {
    return static_cast<uint8_t>(as_paint(paint)->getStrokeJoin());
}

float sk_paint_get_stroke_width(sk_paint_t paint) {
    return as_paint(paint)->getStrokeWidth();
}

float sk_paint_get_stroke_miter(sk_paint_t paint) {
    return as_paint(paint)->getStrokeMiter();
}

int sk_paint_get_style(sk_paint_t paint) {
    return static_cast<int>(as_paint(paint)->getStyle());
}

sk_paint_t sk_paint_copy(sk_paint_t paint) {
    return reinterpret_cast<sk_paint_t>(new SkPaint(*as_paint(paint)));
}

// ════════════════════════════════════════════════════════
// Path
// ════════════════════════════════════════════════════════

sk_path_t sk_path_create(void) {
    return reinterpret_cast<sk_path_t>(new SkPathBuilder());
}

void sk_path_destroy(sk_path_t path) { delete as_pathbuilder(path); }

void sk_path_move_to(sk_path_t path, float x, float y) {
    as_pathbuilder(path)->moveTo(x, y);
}

void sk_path_line_to(sk_path_t path, float x, float y) {
    as_pathbuilder(path)->lineTo(x, y);
}

void sk_path_quad_to(sk_path_t path, float cx, float cy, float x, float y) {
    as_pathbuilder(path)->quadTo(cx, cy, x, y);
}

void sk_path_cubic_to(sk_path_t path, float c1x, float c1y, float c2x, float c2y, float x, float y) {
    as_pathbuilder(path)->cubicTo(c1x, c1y, c2x, c2y, x, y);
}

void sk_path_arc_to(sk_path_t path, float rx, float ry, float rotation,
                     int large_arc, int sweep, float x, float y) {
    as_pathbuilder(path)->arcTo(
        {rx, ry}, rotation,
        large_arc ? SkPathBuilder::ArcSize::kLarge_ArcSize : SkPathBuilder::ArcSize::kSmall_ArcSize,
        sweep ? SkPathDirection::kCW : SkPathDirection::kCCW,
        {x, y});
}

void sk_path_close(sk_path_t path) { as_pathbuilder(path)->close(); }
void sk_path_reset(sk_path_t path) { as_pathbuilder(path)->reset(); }

sk_path_t sk_path_from_svg_string(const char* svg, int len) {
    SkString str(svg, len);
    auto result = SkParsePath::FromSVGString(str.c_str());
    if (!result) return nullptr;

    auto* builder = new SkPathBuilder();
    builder->addPath(*result);
    return reinterpret_cast<sk_path_t>(builder);
}

int sk_path_to_svg_string(sk_path_t path, char* buf, int buf_len) {
    SkPath p = as_pathbuilder(path)->snapshot();
    SkString str = SkParsePath::ToSVGString(p);
    int needed = static_cast<int>(str.size());

    if (!buf || buf_len <= 0) return needed;

    int copy_len = needed < buf_len - 1 ? needed : buf_len - 1;
    memcpy(buf, str.c_str(), copy_len);
    buf[copy_len] = '\0';
    return copy_len;
}

// ════════════════════════════════════════════════════════
// Path: convenience shape additions
// ════════════════════════════════════════════════════════

void sk_path_add_rect(sk_path_t path, float x, float y, float w, float h) {
    as_pathbuilder(path)->addRect(SkRect::MakeXYWH(x, y, w, h));
}

void sk_path_add_circle(sk_path_t path, float cx, float cy, float r) {
    as_pathbuilder(path)->addOval(SkRect::MakeXYWH(cx - r, cy - r, r * 2, r * 2));
}

void sk_path_add_oval(sk_path_t path, float x, float y, float w, float h) {
    as_pathbuilder(path)->addOval(SkRect::MakeXYWH(x, y, w, h));
}

void sk_path_add_rrect(sk_path_t path, float x, float y, float w, float h, float rx, float ry) {
    SkRRect rrect;
    rrect.setRectXY(SkRect::MakeXYWH(x, y, w, h), rx, ry);
    as_pathbuilder(path)->addRRect(rrect);
}

void sk_path_add_arc(sk_path_t path, float x, float y, float w, float h, float startAngle, float sweepAngle) {
    as_pathbuilder(path)->addArc(SkRect::MakeXYWH(x, y, w, h), startAngle, sweepAngle);
}

void sk_path_add_path(sk_path_t dst, sk_path_t src) {
    SkPath srcPath = as_pathbuilder(src)->snapshot();
    as_pathbuilder(dst)->addPath(srcPath);
}

void sk_path_get_bounds(sk_path_t path, float* out4) {
    SkPath p = as_pathbuilder(path)->snapshot();
    SkRect r = p.getBounds();
    out4[0] = r.x(); out4[1] = r.y(); out4[2] = r.width(); out4[3] = r.height();
}

void sk_path_compute_tight_bounds(sk_path_t path, float* out4) {
    SkPath p = as_pathbuilder(path)->snapshot();
    SkRect r = p.computeTightBounds();
    out4[0] = r.x(); out4[1] = r.y(); out4[2] = r.width(); out4[3] = r.height();
}

int sk_path_contains(sk_path_t path, float x, float y) {
    SkPath p = as_pathbuilder(path)->snapshot();
    return p.contains(x, y) ? 1 : 0;
}

void sk_path_conic_to(sk_path_t path, float cx, float cy, float x, float y, float w) {
    as_pathbuilder(path)->conicTo(cx, cy, x, y, w);
}

sk_path_t sk_path_transform(sk_path_t path, const float* matrix9) {
    SkPath p = as_pathbuilder(path)->snapshot();
    SkMatrix m;
    m.set9(matrix9);
    SkPath result = p.makeTransform(m);
    return reinterpret_cast<sk_path_t>(new SkPathBuilder(result));
}

sk_path_t sk_path_copy(sk_path_t path) {
    SkPath p = as_pathbuilder(path)->snapshot();
    return reinterpret_cast<sk_path_t>(new SkPathBuilder(p));
}

int sk_path_is_empty(sk_path_t path) {
    return as_pathbuilder(path)->snapshot().isEmpty() ? 1 : 0;
}

void sk_path_r_move_to(sk_path_t path, float dx, float dy) {
    as_pathbuilder(path)->rMoveTo(dx, dy);
}

void sk_path_r_line_to(sk_path_t path, float dx, float dy) {
    as_pathbuilder(path)->rLineTo(dx, dy);
}

void sk_path_r_quad_to(sk_path_t path, float dcx, float dcy, float dx, float dy) {
    as_pathbuilder(path)->rQuadTo(dcx, dcy, dx, dy);
}

void sk_path_r_cubic_to(sk_path_t path, float dc1x, float dc1y, float dc2x, float dc2y, float dx, float dy) {
    as_pathbuilder(path)->rCubicTo(dc1x, dc1y, dc2x, dc2y, dx, dy);
}

void sk_path_r_conic_to(sk_path_t path, float dcx, float dcy, float dx, float dy, float w) {
    as_pathbuilder(path)->rConicTo(dcx, dcy, dx, dy, w);
}

void sk_path_offset(sk_path_t path, float dx, float dy) {
    SkPath p = as_pathbuilder(path)->snapshot();
    SkPath result = p.makeOffset(dx, dy);
    as_pathbuilder(path)->reset();
    as_pathbuilder(path)->addPath(result);
}

int sk_path_count_points(sk_path_t path) {
    return as_pathbuilder(path)->snapshot().countPoints();
}

void sk_path_get_point(sk_path_t path, int index, float* x, float* y) {
    SkPath p = as_pathbuilder(path)->snapshot();
    SkPoint pt = p.getPoint(index);
    *x = pt.x(); *y = pt.y();
}

// ════════════════════════════════════════════════════════
// PathOps
// ════════════════════════════════════════════════════════

sk_path_t sk_path_op(sk_path_t a, sk_path_t b, int op) {
    SkPath pa = as_pathbuilder(a)->snapshot();
    SkPath pb = as_pathbuilder(b)->snapshot();
    SkPath result;
    if (!Op(pa, pb, static_cast<SkPathOp>(op), &result)) return nullptr;
    return reinterpret_cast<sk_path_t>(new SkPathBuilder(result));
}

sk_path_t sk_path_simplify(sk_path_t path) {
    SkPath p = as_pathbuilder(path)->snapshot();
    SkPath result;
    if (!Simplify(p, &result)) return nullptr;
    return reinterpret_cast<sk_path_t>(new SkPathBuilder(result));
}

// ════════════════════════════════════════════════════════
// Font & Text
// ════════════════════════════════════════════════════════

// Global font manager — created on first use
static sk_sp<SkFontMgr> g_font_mgr;

static SkFontMgr* get_font_mgr() {
    if (!g_font_mgr) {
        // Custom data font manager — creates typefaces from raw font data (TTF/OTF)
        // No system font enumeration, suitable for WASM
        g_font_mgr = SkFontMgr_New_Custom_Data(SkSpan<sk_sp<SkData>>());
    }
    return g_font_mgr.get();
}

static int g_font_debug = 0;

sk_typeface_t sk_typeface_from_data(const uint8_t* data, int len) {
    g_font_debug = 1; // entered
    if (!data || len <= 0) { g_font_debug = 2; return nullptr; }
    auto* mgr = get_font_mgr();
    if (!mgr) { g_font_debug = 3; return nullptr; } // font mgr null
    g_font_debug = 4; // mgr ok
    auto skdata = SkData::MakeWithCopy(data, len);
    if (!skdata) { g_font_debug = 5; return nullptr; }
    g_font_debug = 6; // data copied
    sk_sp<SkTypeface> tf = mgr->makeFromData(skdata);
    if (!tf) { g_font_debug = 7; return nullptr; } // makeFromData failed
    g_font_debug = 8; // success
    return reinterpret_cast<sk_typeface_t>(tf.release());
}

int sk_font_debug(void) { return g_font_debug; }

void sk_typeface_destroy(sk_typeface_t typeface) {
    if (typeface) as_typeface(typeface)->unref();
}

sk_font_t sk_font_create(sk_typeface_t typeface, float size) {
    sk_sp<SkTypeface> tf(as_typeface(typeface));
    tf->ref(); // We're borrowing, not transferring ownership
    auto* font = new SkFont(tf, size);
    font->setSubpixel(true);
    font->setEdging(SkFont::Edging::kAntiAlias);
    return reinterpret_cast<sk_font_t>(font);
}

void sk_font_destroy(sk_font_t font) { delete as_font(font); }

void sk_font_set_size(sk_font_t font, float size) {
    as_font(font)->setSize(size);
}

float sk_font_measure_text(sk_font_t font, const char* text, int len) {
    return as_font(font)->measureText(text, len, SkTextEncoding::kUTF8);
}

// ════════════════════════════════════════════════════════
// Font: metrics and glyph info
// ════════════════════════════════════════════════════════

#include "include/core/SkFontMetrics.h"

void sk_font_get_metrics(sk_font_t font, float* ascent, float* descent, float* leading) {
    SkFontMetrics metrics;
    as_font(font)->getMetrics(&metrics);
    *ascent = metrics.fAscent;
    *descent = metrics.fDescent;
    *leading = metrics.fLeading;
}

float sk_font_get_size(sk_font_t font) {
    return as_font(font)->getSize();
}

int sk_font_get_glyph_ids(sk_font_t font, const char* text, int len, uint16_t* glyphs, int maxGlyphs) {
    return as_font(font)->textToGlyphs(text, len, SkTextEncoding::kUTF8, {glyphs, static_cast<size_t>(maxGlyphs)});
}

void sk_font_get_glyph_widths(sk_font_t font, const uint16_t* glyphs, int count, float* widths) {
    as_font(font)->getWidths({glyphs, static_cast<size_t>(count)}, {widths, static_cast<size_t>(count)});
}

// ════════════════════════════════════════════════════════
// Canvas drawing
// ════════════════════════════════════════════════════════

void sk_canvas_clear(sk_canvas_t canvas, float r, float g, float b, float a) {
    as_canvas(canvas)->clear(SkColor4f{r, g, b, a});
}

void sk_canvas_draw_rect(sk_canvas_t canvas, float x, float y, float w, float h, sk_paint_t paint) {
    as_canvas(canvas)->drawRect(SkRect::MakeXYWH(x, y, w, h), *as_paint(paint));
}

void sk_canvas_draw_round_rect(sk_canvas_t canvas, float x, float y, float w, float h, float rx, float ry, sk_paint_t paint) {
    as_canvas(canvas)->drawRoundRect(SkRect::MakeXYWH(x, y, w, h), rx, ry, *as_paint(paint));
}

void sk_canvas_draw_circle(sk_canvas_t canvas, float cx, float cy, float r, sk_paint_t paint) {
    as_canvas(canvas)->drawCircle(cx, cy, r, *as_paint(paint));
}

void sk_canvas_draw_oval(sk_canvas_t canvas, float x, float y, float w, float h, sk_paint_t paint) {
    as_canvas(canvas)->drawOval(SkRect::MakeXYWH(x, y, w, h), *as_paint(paint));
}

void sk_canvas_draw_line(sk_canvas_t canvas, float x0, float y0, float x1, float y1, sk_paint_t paint) {
    as_canvas(canvas)->drawLine(x0, y0, x1, y1, *as_paint(paint));
}

void sk_canvas_draw_path(sk_canvas_t canvas, sk_path_t path, sk_paint_t paint) {
    as_canvas(canvas)->drawPath(as_pathbuilder(path)->snapshot(), *as_paint(paint));
}

void sk_canvas_draw_text(sk_canvas_t canvas, const char* text, int len, float x, float y,
                          sk_font_t font, sk_paint_t paint) {
    if (!text || len <= 0 || !font) return;
    as_canvas(canvas)->drawSimpleText(text, len, SkTextEncoding::kUTF8, x, y,
                                       *as_font(font), *as_paint(paint));
}

// ════════════════════════════════════════════════════════
// Canvas transform
// ════════════════════════════════════════════════════════

void sk_canvas_save(sk_canvas_t canvas) { as_canvas(canvas)->save(); }
void sk_canvas_restore(sk_canvas_t canvas) { as_canvas(canvas)->restore(); }
void sk_canvas_translate(sk_canvas_t canvas, float x, float y) { as_canvas(canvas)->translate(x, y); }
void sk_canvas_rotate(sk_canvas_t canvas, float degrees) { as_canvas(canvas)->rotate(degrees); }
void sk_canvas_scale(sk_canvas_t canvas, float sx, float sy) { as_canvas(canvas)->scale(sx, sy); }

void sk_canvas_concat_matrix(sk_canvas_t canvas, const float* m, int count) {
    if (count == 9) {
        // 3x3 matrix
        SkMatrix mat;
        mat.set9(m);
        as_canvas(canvas)->concat(mat);
    } else if (count == 16) {
        // 4x4 matrix
        SkM44 mat(m[0], m[1], m[2], m[3],
                  m[4], m[5], m[6], m[7],
                  m[8], m[9], m[10], m[11],
                  m[12], m[13], m[14], m[15]);
        as_canvas(canvas)->concat(mat);
    }
}

// ════════════════════════════════════════════════════════
// Canvas clipping
// ════════════════════════════════════════════════════════

void sk_canvas_clip_rect(sk_canvas_t canvas, float x, float y, float w, float h) {
    as_canvas(canvas)->clipRect(SkRect::MakeXYWH(x, y, w, h));
}

void sk_canvas_clip_round_rect(sk_canvas_t canvas, float x, float y, float w, float h, float rx, float ry) {
    SkRRect rrect;
    rrect.setRectXY(SkRect::MakeXYWH(x, y, w, h), rx, ry);
    as_canvas(canvas)->clipRRect(rrect);
}

void sk_canvas_clip_path(sk_canvas_t canvas, sk_path_t path) {
    as_canvas(canvas)->clipPath(as_pathbuilder(path)->snapshot());
}

// ════════════════════════════════════════════════════════
// Canvas layers
// ════════════════════════════════════════════════════════

void sk_canvas_save_layer(sk_canvas_t canvas, const float* bounds, sk_paint_t paint) {
    SkRect* boundsRect = nullptr;
    SkRect rect;
    if (bounds) {
        rect = SkRect::MakeXYWH(bounds[0], bounds[1], bounds[2], bounds[3]);
        boundsRect = &rect;
    }
    as_canvas(canvas)->saveLayer(boundsRect, paint ? as_paint(paint) : nullptr);
}

void sk_canvas_save_layer_alpha(sk_canvas_t canvas, const float* bounds, float alpha) {
    SkRect* boundsRect = nullptr;
    SkRect rect;
    if (bounds) {
        rect = SkRect::MakeXYWH(bounds[0], bounds[1], bounds[2], bounds[3]);
        boundsRect = &rect;
    }
    as_canvas(canvas)->saveLayerAlphaf(boundsRect, alpha);
}

// ════════════════════════════════════════════════════════
// Canvas drawing: images
// ════════════════════════════════════════════════════════

#include "include/core/SkImage.h"
#include "include/core/SkPixmap.h"

sk_image_t sk_image_from_pixels(const uint8_t* pixels, int width, int height) {
    SkImageInfo info = SkImageInfo::MakeN32Premul(width, height);
    sk_sp<SkData> data = SkData::MakeWithCopy(pixels, width * height * 4);
    sk_sp<SkImage> image = SkImages::RasterFromData(info, data, width * 4);
    if (!image) return nullptr;
    return reinterpret_cast<sk_image_t>(image.release());
}

void sk_image_destroy(sk_image_t image) {
    if (image) reinterpret_cast<SkImage*>(image)->unref();
}

int sk_image_width(sk_image_t image) {
    return image ? reinterpret_cast<SkImage*>(image)->width() : 0;
}

int sk_image_height(sk_image_t image) {
    return image ? reinterpret_cast<SkImage*>(image)->height() : 0;
}

void sk_canvas_draw_image(sk_canvas_t canvas, sk_image_t image, float x, float y, sk_paint_t paint) {
    auto* img = reinterpret_cast<SkImage*>(image);
    as_canvas(canvas)->drawImage(img, x, y, SkSamplingOptions(), paint ? as_paint(paint) : nullptr);
}

void sk_canvas_draw_image_rect(sk_canvas_t canvas, sk_image_t image,
                                float sx, float sy, float sw, float sh,
                                float dx, float dy, float dw, float dh, sk_paint_t paint) {
    auto* img = reinterpret_cast<SkImage*>(image);
    SkRect src = SkRect::MakeXYWH(sx, sy, sw, sh);
    SkRect dst = SkRect::MakeXYWH(dx, dy, dw, dh);
    as_canvas(canvas)->drawImageRect(img, src, dst, SkSamplingOptions(),
                                      paint ? as_paint(paint) : nullptr,
                                      SkCanvas::kStrict_SrcRectConstraint);
}

// ════════════════════════════════════════════════════════
// Canvas: additional drawing
// ════════════════════════════════════════════════════════

void sk_canvas_draw_arc(sk_canvas_t canvas, float x, float y, float w, float h,
                         float startAngle, float sweepAngle, int useCenter, sk_paint_t paint) {
    as_canvas(canvas)->drawArc(SkRect::MakeXYWH(x, y, w, h), startAngle, sweepAngle,
                                useCenter != 0, *as_paint(paint));
}

void sk_canvas_draw_drrect(sk_canvas_t canvas,
                            float ox, float oy, float ow, float oh, float orx, float ory,
                            float ix, float iy, float iw, float ih, float irx, float iry,
                            sk_paint_t paint) {
    SkRRect outer, inner;
    outer.setRectXY(SkRect::MakeXYWH(ox, oy, ow, oh), orx, ory);
    inner.setRectXY(SkRect::MakeXYWH(ix, iy, iw, ih), irx, iry);
    as_canvas(canvas)->drawDRRect(outer, inner, *as_paint(paint));
}

void sk_canvas_draw_paint(sk_canvas_t canvas, sk_paint_t paint) {
    as_canvas(canvas)->drawPaint(*as_paint(paint));
}

void sk_canvas_draw_color(sk_canvas_t canvas, float r, float g, float b, float a) {
    as_canvas(canvas)->drawColor(SkColor4f{r, g, b, a});
}

int sk_canvas_get_save_count(sk_canvas_t canvas) {
    return as_canvas(canvas)->getSaveCount();
}

void sk_canvas_restore_to_count(sk_canvas_t canvas, int count) {
    as_canvas(canvas)->restoreToCount(count);
}

void sk_canvas_get_total_matrix(sk_canvas_t canvas, float* out9) {
    SkMatrix m = as_canvas(canvas)->getTotalMatrix();
    m.get9(out9);
}

int sk_canvas_read_pixels(sk_canvas_t canvas, int x, int y, int width, int height, uint8_t* pixels) {
    SkImageInfo info = SkImageInfo::MakeN32Premul(width, height);
    return as_canvas(canvas)->readPixels(info, pixels, width * 4, x, y) ? 1 : 0;
}

// ════════════════════════════════════════════════════════
// Image: read pixels
// ════════════════════════════════════════════════════════

int sk_image_read_pixels(sk_image_t image, uint8_t* pixels, int width, int height) {
    if (!image) return 0;
    SkImageInfo info = SkImageInfo::MakeN32Premul(width, height);
    return reinterpret_cast<SkImage*>(image)->readPixels(
        nullptr, info, pixels, width * 4, 0, 0) ? 1 : 0;
}

// ════════════════════════════════════════════════════════
// Image Filters
// ════════════════════════════════════════════════════════

#include "include/effects/SkImageFilters.h"

static inline sk_sp<SkImageFilter> to_filter(sk_image_filter_t f) {
    return f ? sk_ref_sp(reinterpret_cast<SkImageFilter*>(f)) : nullptr;
}

sk_image_filter_t sk_imagefilter_blur(float sigmaX, float sigmaY, sk_image_filter_t input) {
    auto filter = SkImageFilters::Blur(sigmaX, sigmaY, to_filter(input));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_drop_shadow(float dx, float dy, float sigmaX, float sigmaY,
                                              uint32_t color, sk_image_filter_t input) {
    auto filter = SkImageFilters::DropShadow(dx, dy, sigmaX, sigmaY,
                                              static_cast<SkColor>(color), to_filter(input));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_drop_shadow_only(float dx, float dy, float sigmaX, float sigmaY,
                                                   uint32_t color, sk_image_filter_t input) {
    auto filter = SkImageFilters::DropShadowOnly(dx, dy, sigmaX, sigmaY,
                                                   static_cast<SkColor>(color), to_filter(input));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_offset(float dx, float dy, sk_image_filter_t input) {
    auto filter = SkImageFilters::Offset(dx, dy, to_filter(input));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_color_filter(sk_color_filter_t cf, sk_image_filter_t input) {
    auto filter = SkImageFilters::ColorFilter(
        sk_ref_sp(reinterpret_cast<SkColorFilter*>(cf)), to_filter(input));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_compose(sk_image_filter_t outer, sk_image_filter_t inner) {
    auto filter = SkImageFilters::Compose(to_filter(outer), to_filter(inner));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_dilate(float radiusX, float radiusY, sk_image_filter_t input) {
    auto filter = SkImageFilters::Dilate(radiusX, radiusY, to_filter(input));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_erode(float radiusX, float radiusY, sk_image_filter_t input) {
    auto filter = SkImageFilters::Erode(radiusX, radiusY, to_filter(input));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_blend(uint8_t blendMode, sk_image_filter_t bg, sk_image_filter_t fg) {
    auto filter = SkImageFilters::Blend(static_cast<SkBlendMode>(blendMode),
                                         to_filter(bg), to_filter(fg));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

sk_image_filter_t sk_imagefilter_matrix_transform(const float* matrix9, int sampling, sk_image_filter_t input) {
    SkMatrix m;
    m.set9(matrix9);
    SkSamplingOptions samp;
    if (sampling == 1) {
        samp = SkSamplingOptions(SkFilterMode::kLinear);
    } else if (sampling == 2) {
        samp = SkSamplingOptions(SkFilterMode::kLinear, SkMipmapMode::kLinear);
    }
    // sampling == 0 is nearest (default)
    auto filter = SkImageFilters::MatrixTransform(m, samp, to_filter(input));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

void sk_imagefilter_destroy(sk_image_filter_t filter) {
    if (filter) reinterpret_cast<SkImageFilter*>(filter)->unref();
}

// ════════════════════════════════════════════════════════
// Color Filters
// ════════════════════════════════════════════════════════

#include "include/effects/SkColorMatrixFilter.h"

sk_color_filter_t sk_colorfilter_blend(uint32_t color, uint8_t blendMode) {
    auto filter = SkColorFilters::Blend(static_cast<SkColor>(color),
                                         static_cast<SkBlendMode>(blendMode));
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

sk_color_filter_t sk_colorfilter_matrix(const float matrix[20]) {
    auto filter = SkColorFilters::Matrix(matrix);
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

sk_color_filter_t sk_colorfilter_compose(sk_color_filter_t outer, sk_color_filter_t inner) {
    auto filter = SkColorFilters::Compose(
        sk_ref_sp(reinterpret_cast<SkColorFilter*>(outer)),
        sk_ref_sp(reinterpret_cast<SkColorFilter*>(inner)));
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

sk_color_filter_t sk_colorfilter_lerp(float t, sk_color_filter_t dst, sk_color_filter_t src) {
    auto filter = SkColorFilters::Lerp(t,
        sk_ref_sp(reinterpret_cast<SkColorFilter*>(dst)),
        sk_ref_sp(reinterpret_cast<SkColorFilter*>(src)));
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

sk_color_filter_t sk_colorfilter_table(const uint8_t table[256]) {
    auto filter = SkColorFilters::Table(table);
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

sk_color_filter_t sk_colorfilter_table_argb(const uint8_t a[256], const uint8_t r[256], const uint8_t g[256], const uint8_t b[256]) {
    auto filter = SkColorFilters::TableARGB(a, r, g, b);
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

sk_color_filter_t sk_colorfilter_linear_to_srgb(void) {
    auto filter = SkColorFilters::LinearToSRGBGamma();
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

sk_color_filter_t sk_colorfilter_srgb_to_linear(void) {
    auto filter = SkColorFilters::SRGBToLinearGamma();
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

sk_color_filter_t sk_colorfilter_luma(void) {
    auto filter = SkLumaColorFilter::Make();
    return filter ? reinterpret_cast<sk_color_filter_t>(filter.release()) : nullptr;
}

void sk_colorfilter_destroy(sk_color_filter_t filter) {
    if (filter) reinterpret_cast<SkColorFilter*>(filter)->unref();
}

// ════════════════════════════════════════════════════════
// Paint: filter setters
// ════════════════════════════════════════════════════════

void sk_paint_set_image_filter(sk_paint_t paint, sk_image_filter_t filter) {
    as_paint(paint)->setImageFilter(
        filter ? sk_ref_sp(reinterpret_cast<SkImageFilter*>(filter)) : nullptr);
}

void sk_paint_clear_image_filter(sk_paint_t paint) {
    as_paint(paint)->setImageFilter(nullptr);
}

void sk_paint_set_color_filter(sk_paint_t paint, sk_color_filter_t filter) {
    as_paint(paint)->setColorFilter(
        filter ? sk_ref_sp(reinterpret_cast<SkColorFilter*>(filter)) : nullptr);
}

void sk_paint_clear_color_filter(sk_paint_t paint) {
    as_paint(paint)->setColorFilter(nullptr);
}

// ════════════════════════════════════════════════════════
// Path Effects
// ════════════════════════════════════════════════════════

#include "include/effects/SkCornerPathEffect.h"
#include "include/effects/SkDiscretePathEffect.h"
#include "include/effects/Sk1DPathEffect.h"
#include "include/effects/SkTrimPathEffect.h"

sk_path_effect_t sk_patheffect_dash(const float* intervals, int count, float phase) {
    auto pe = SkDashPathEffect::Make(SkSpan<const SkScalar>(intervals, count), phase);
    return pe ? reinterpret_cast<sk_path_effect_t>(pe.release()) : nullptr;
}

sk_path_effect_t sk_patheffect_corner(float radius) {
    auto pe = SkCornerPathEffect::Make(radius);
    return pe ? reinterpret_cast<sk_path_effect_t>(pe.release()) : nullptr;
}

sk_path_effect_t sk_patheffect_discrete(float segLength, float deviation, uint32_t seed) {
    auto pe = SkDiscretePathEffect::Make(segLength, deviation, seed);
    return pe ? reinterpret_cast<sk_path_effect_t>(pe.release()) : nullptr;
}

sk_path_effect_t sk_patheffect_trim(float start, float stop, int inverted) {
    auto pe = SkTrimPathEffect::Make(start, stop,
        inverted ? SkTrimPathEffect::Mode::kInverted : SkTrimPathEffect::Mode::kNormal);
    return pe ? reinterpret_cast<sk_path_effect_t>(pe.release()) : nullptr;
}

sk_path_effect_t sk_patheffect_path1d(sk_path_t stampPath, float advance, float phase, int style) {
    auto pe = SkPath1DPathEffect::Make(
        as_pathbuilder(stampPath)->snapshot(), advance, phase,
        static_cast<SkPath1DPathEffect::Style>(style));
    return pe ? reinterpret_cast<sk_path_effect_t>(pe.release()) : nullptr;
}

sk_path_effect_t sk_patheffect_compose(sk_path_effect_t outer, sk_path_effect_t inner) {
    auto pe = SkPathEffect::MakeCompose(
        sk_ref_sp(reinterpret_cast<SkPathEffect*>(outer)),
        sk_ref_sp(reinterpret_cast<SkPathEffect*>(inner)));
    return pe ? reinterpret_cast<sk_path_effect_t>(pe.release()) : nullptr;
}

sk_path_effect_t sk_patheffect_sum(sk_path_effect_t first, sk_path_effect_t second) {
    auto pe = SkPathEffect::MakeSum(
        sk_ref_sp(reinterpret_cast<SkPathEffect*>(first)),
        sk_ref_sp(reinterpret_cast<SkPathEffect*>(second)));
    return pe ? reinterpret_cast<sk_path_effect_t>(pe.release()) : nullptr;
}

sk_path_effect_t sk_patheffect_path2d(const float* matrix9, sk_path_t path) {
    SkMatrix m;
    m.set9(matrix9);
    SkPath p = as_pathbuilder(path)->snapshot();
    auto pe = SkPath2DPathEffect::Make(m, p);
    return pe ? reinterpret_cast<sk_path_effect_t>(pe.release()) : nullptr;
}

void sk_patheffect_destroy(sk_path_effect_t effect) {
    if (effect) reinterpret_cast<SkPathEffect*>(effect)->unref();
}

void sk_paint_set_path_effect(sk_paint_t paint, sk_path_effect_t effect) {
    as_paint(paint)->setPathEffect(
        effect ? sk_ref_sp(reinterpret_cast<SkPathEffect*>(effect)) : nullptr);
}

void sk_paint_clear_path_effect(sk_paint_t paint) {
    as_paint(paint)->setPathEffect(nullptr);
}

// ════════════════════════════════════════════════════════
// Shaders (general)
// ════════════════════════════════════════════════════════

#include "include/effects/SkPerlinNoiseShader.h"

sk_shader_t sk_shader_fractal_noise(float freqX, float freqY, int octaves, float seed) {
    auto shader = SkShaders::MakeFractalNoise(freqX, freqY, octaves, seed);
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

sk_shader_t sk_shader_turbulence(float freqX, float freqY, int octaves, float seed) {
    auto shader = SkShaders::MakeTurbulence(freqX, freqY, octaves, seed);
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

sk_shader_t sk_shader_image(sk_image_t image, int tileX, int tileY) {
    auto* img = reinterpret_cast<SkImage*>(image);
    auto shader = img->makeShader(
        static_cast<SkTileMode>(tileX), static_cast<SkTileMode>(tileY), SkSamplingOptions());
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

sk_shader_t sk_shader_color(float r, float g, float b, float a) {
    auto shader = SkShaders::Color(SkColor4f{r, g, b, a}, nullptr);
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

sk_shader_t sk_shader_blend(uint8_t blendMode, sk_shader_t dst, sk_shader_t src) {
    auto shader = SkShaders::Blend(
        static_cast<SkBlendMode>(blendMode),
        sk_ref_sp(reinterpret_cast<SkShader*>(dst)),
        sk_ref_sp(reinterpret_cast<SkShader*>(src)));
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

sk_shader_t sk_shader_linear_gradient(float x0, float y0, float x1, float y1,
                                       const uint32_t* colors, const float* stops, int count) {
    SkPoint pts[2] = {{x0, y0}, {x1, y1}};
    SkColor4f* sk_colors = reinterpret_cast<SkColor4f*>(alloca(count * sizeof(SkColor4f)));
    for (int i = 0; i < count; i++) sk_colors[i] = color_from_u32(colors[i]);

    SkGradient::Colors grad_colors(
        {sk_colors, static_cast<size_t>(count)},
        {stops, static_cast<size_t>(count)},
        SkTileMode::kClamp);
    SkGradient grad(grad_colors, {});

    auto shader = SkShaders::LinearGradient(pts, grad);
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

sk_shader_t sk_shader_radial_gradient(float cx, float cy, float r,
                                       const uint32_t* colors, const float* stops, int count) {
    SkColor4f* sk_colors = reinterpret_cast<SkColor4f*>(alloca(count * sizeof(SkColor4f)));
    for (int i = 0; i < count; i++) sk_colors[i] = color_from_u32(colors[i]);

    SkGradient::Colors grad_colors(
        {sk_colors, static_cast<size_t>(count)},
        {stops, static_cast<size_t>(count)},
        SkTileMode::kClamp);
    SkGradient grad(grad_colors, {});

    auto shader = SkShaders::RadialGradient({cx, cy}, r, grad);
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

sk_shader_t sk_shader_sweep_gradient(float cx, float cy,
                                      const uint32_t* colors, const float* stops, int count) {
    SkColor4f* sk_colors = reinterpret_cast<SkColor4f*>(alloca(count * sizeof(SkColor4f)));
    for (int i = 0; i < count; i++) sk_colors[i] = color_from_u32(colors[i]);

    SkGradient::Colors grad_colors(
        {sk_colors, static_cast<size_t>(count)},
        {stops, static_cast<size_t>(count)},
        SkTileMode::kClamp);
    SkGradient grad(grad_colors, {});

    auto shader = SkShaders::SweepGradient({cx, cy}, grad);
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

sk_shader_t sk_shader_two_point_conical_gradient(float startX, float startY, float startR,
                                                  float endX, float endY, float endR,
                                                  const uint32_t* colors, const float* stops, int count) {
    SkColor4f* sk_colors = reinterpret_cast<SkColor4f*>(alloca(count * sizeof(SkColor4f)));
    for (int i = 0; i < count; i++) sk_colors[i] = color_from_u32(colors[i]);

    SkGradient::Colors grad_colors(
        {sk_colors, static_cast<size_t>(count)},
        {stops, static_cast<size_t>(count)},
        SkTileMode::kClamp);
    SkGradient grad(grad_colors, {});

    auto shader = SkShaders::TwoPointConicalGradient(
        {startX, startY}, startR, {endX, endY}, endR, grad);
    return shader ? reinterpret_cast<sk_shader_t>(shader.release()) : nullptr;
}

void sk_shader_destroy(sk_shader_t shader) {
    if (shader) reinterpret_cast<SkShader*>(shader)->unref();
}

void sk_paint_set_shader_obj(sk_paint_t paint, sk_shader_t shader) {
    as_paint(paint)->setShader(
        shader ? sk_ref_sp(reinterpret_cast<SkShader*>(shader)) : nullptr);
}

// ════════════════════════════════════════════════════════
// TwoPointConical Gradient
// ════════════════════════════════════════════════════════

void sk_paint_set_two_point_conical_gradient(sk_paint_t paint,
    float startX, float startY, float startR,
    float endX, float endY, float endR,
    const uint32_t* colors, const float* stops, int count) {
    SkColor4f* sk_colors = reinterpret_cast<SkColor4f*>(alloca(count * sizeof(SkColor4f)));
    for (int i = 0; i < count; i++) sk_colors[i] = color_from_u32(colors[i]);

    SkGradient::Colors grad_colors(
        {sk_colors, static_cast<size_t>(count)},
        {stops, static_cast<size_t>(count)},
        SkTileMode::kClamp);
    SkGradient grad(grad_colors, {});

    as_paint(paint)->setShader(SkShaders::TwoPointConicalGradient(
        {startX, startY}, startR, {endX, endY}, endR, grad));
}

// ════════════════════════════════════════════════════════
// Canvas: skew + path fill type
// ════════════════════════════════════════════════════════

void sk_canvas_skew(sk_canvas_t canvas, float sx, float sy) {
    as_canvas(canvas)->skew(sx, sy);
}

void sk_path_set_fill_type(sk_path_t path, int fillType) {
    as_pathbuilder(path)->setFillType(static_cast<SkPathFillType>(fillType));
}

int sk_path_get_fill_type(sk_path_t path) {
    return static_cast<int>(as_pathbuilder(path)->fillType());
}

// ════════════════════════════════════════════════════════
// DisplacementMap + Backdrop filters
// ════════════════════════════════════════════════════════

sk_image_filter_t sk_imagefilter_displacement_map(int xChannel, int yChannel, float scale,
    sk_image_filter_t displacement, sk_image_filter_t color) {
    auto filter = SkImageFilters::DisplacementMap(
        static_cast<SkColorChannel>(xChannel), static_cast<SkColorChannel>(yChannel),
        scale, to_filter(displacement), to_filter(color));
    return filter ? reinterpret_cast<sk_image_filter_t>(filter.release()) : nullptr;
}

void sk_canvas_save_layer_with_backdrop(sk_canvas_t canvas, const float* bounds,
    sk_paint_t paint, sk_image_filter_t backdrop) {
    SkRect* boundsRect = nullptr;
    SkRect rect;
    if (bounds) {
        rect = SkRect::MakeXYWH(bounds[0], bounds[1], bounds[2], bounds[3]);
        boundsRect = &rect;
    }
    SkCanvas::SaveLayerRec rec(
        boundsRect,
        paint ? as_paint(paint) : nullptr,
        backdrop ? reinterpret_cast<SkImageFilter*>(backdrop) : nullptr,
        0);
    as_canvas(canvas)->saveLayer(rec);
}

// ════════════════════════════════════════════════════════
// Path Measure
// ════════════════════════════════════════════════════════

#include "include/core/SkPathMeasure.h"

sk_path_measure_t sk_path_measure_create(sk_path_t path, int forceClosed) {
    auto* pm = new SkPathMeasure(as_pathbuilder(path)->snapshot(), forceClosed != 0);
    return reinterpret_cast<sk_path_measure_t>(pm);
}

void sk_path_measure_destroy(sk_path_measure_t pm) {
    delete reinterpret_cast<SkPathMeasure*>(pm);
}

float sk_path_measure_length(sk_path_measure_t pm) {
    return reinterpret_cast<SkPathMeasure*>(pm)->getLength();
}

int sk_path_measure_get_pos_tan(sk_path_measure_t pm, float distance, float* posOut, float* tanOut) {
    SkPoint pos;
    SkVector tan;
    bool ok = reinterpret_cast<SkPathMeasure*>(pm)->getPosTan(distance, &pos, &tan);
    if (ok) {
        posOut[0] = pos.x(); posOut[1] = pos.y();
        tanOut[0] = tan.x(); tanOut[1] = tan.y();
    }
    return ok ? 1 : 0;
}

// ════════════════════════════════════════════════════════
// Text Blob
// ════════════════════════════════════════════════════════

sk_text_blob_t sk_text_blob_from_text(const char* text, int len, sk_font_t font) {
    auto blob = SkTextBlob::MakeFromText(text, len, *as_font(font), SkTextEncoding::kUTF8);
    return blob ? reinterpret_cast<sk_text_blob_t>(blob.release()) : nullptr;
}

sk_text_blob_t sk_text_blob_from_pos_text(const char* text, int len, const float* positions, sk_font_t font) {
    int glyphCount = len; // UTF-8 approximation — each byte may be a glyph
    auto blob = SkTextBlob::MakeFromPosText(text, len,
        SkSpan<const SkPoint>(reinterpret_cast<const SkPoint*>(positions), glyphCount),
        *as_font(font), SkTextEncoding::kUTF8);
    return blob ? reinterpret_cast<sk_text_blob_t>(blob.release()) : nullptr;
}

void sk_text_blob_destroy(sk_text_blob_t blob) {
    if (blob) reinterpret_cast<SkTextBlob*>(blob)->unref();
}

void sk_canvas_draw_text_blob(sk_canvas_t canvas, sk_text_blob_t blob, float x, float y, sk_paint_t paint) {
    as_canvas(canvas)->drawTextBlob(
        sk_ref_sp(reinterpret_cast<SkTextBlob*>(blob)), x, y, *as_paint(paint));
}

// ════════════════════════════════════════════════════════
// Picture Recording
// ════════════════════════════════════════════════════════

#include "include/core/SkPictureRecorder.h"

sk_picture_recorder_t sk_picture_recorder_create(void) {
    return reinterpret_cast<sk_picture_recorder_t>(new SkPictureRecorder());
}

void sk_picture_recorder_destroy(sk_picture_recorder_t rec) {
    delete reinterpret_cast<SkPictureRecorder*>(rec);
}

sk_canvas_t sk_picture_recorder_begin(sk_picture_recorder_t rec, float x, float y, float w, float h) {
    auto* canvas = reinterpret_cast<SkPictureRecorder*>(rec)->beginRecording(
        SkRect::MakeXYWH(x, y, w, h));
    return reinterpret_cast<sk_canvas_t>(canvas);
}

sk_picture_t sk_picture_recorder_finish(sk_picture_recorder_t rec) {
    auto pic = reinterpret_cast<SkPictureRecorder*>(rec)->finishRecordingAsPicture();
    return pic ? reinterpret_cast<sk_picture_t>(pic.release()) : nullptr;
}

void sk_picture_destroy(sk_picture_t pic) {
    if (pic) reinterpret_cast<SkPicture*>(pic)->unref();
}

void sk_canvas_draw_picture(sk_canvas_t canvas, sk_picture_t pic) {
    as_canvas(canvas)->drawPicture(
        sk_ref_sp(reinterpret_cast<SkPicture*>(pic)));
}

// ════════════════════════════════════════════════════════
// Atlas (sprite batch)
// ════════════════════════════════════════════════════════

