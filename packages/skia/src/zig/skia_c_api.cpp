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

// Conditionally include SVG if available
#if __has_include("modules/svg/include/SkSVGDOM.h")
#include "modules/svg/include/SkSVGDOM.h"
#define HAS_SVG 1
#else
#define HAS_SVG 0
#endif

// Conditionally include FreeType font manager
#if __has_include("include/ports/SkFontMgr_data.h")
#include "include/ports/SkFontMgr_data.h"
#define HAS_FONTMGR_DATA 1
#else
#define HAS_FONTMGR_DATA 0
#endif

// ── Helpers ──

static inline SkPaint* as_paint(sk_paint_t p) { return reinterpret_cast<SkPaint*>(p); }
static inline SkPathBuilder* as_pathbuilder(sk_path_t p) { return reinterpret_cast<SkPathBuilder*>(p); }
static inline SkCanvas* as_canvas(sk_canvas_t c) { return reinterpret_cast<SkCanvas*>(c); }
static inline GrDirectContext* as_context(sk_context_t c) { return reinterpret_cast<GrDirectContext*>(c); }
static inline SkSurface* as_surface(sk_surface_t s) { return reinterpret_cast<SkSurface*>(s); }
static inline SkFont* as_font(sk_font_t f) { return reinterpret_cast<SkFont*>(f); }
static inline SkTypeface* as_typeface(sk_typeface_t t) { return reinterpret_cast<SkTypeface*>(t); }
#if HAS_SVG
static inline SkSVGDOM* as_svgdom(sk_svg_dom_t s) { return reinterpret_cast<SkSVGDOM*>(s); }
#endif

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

sk_context_t sk_context_create_gl(void) {
    sk_sp<const GrGLInterface> interface = GrGLInterfaces::MakeWebGL();
    if (!interface) return nullptr;
    sk_sp<GrDirectContext> ctx = GrDirectContexts::MakeGL(interface);
    if (!ctx) return nullptr;
    return reinterpret_cast<sk_context_t>(ctx.release());
}

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
#if HAS_FONTMGR_DATA
        g_font_mgr = SkFontMgr_New_Custom_Data(SkSpan<sk_sp<SkData>>());
#else
        g_font_mgr = SkFontMgr::RefEmpty();
#endif
    }
    return g_font_mgr.get();
}

sk_typeface_t sk_typeface_from_data(const uint8_t* data, int len) {
    auto skdata = SkData::MakeWithCopy(data, len);
    sk_sp<SkTypeface> tf = get_font_mgr()->makeFromData(skdata);
    if (!tf) return nullptr;
    return reinterpret_cast<sk_typeface_t>(tf.release());
}

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
// SVG
// ════════════════════════════════════════════════════════

sk_svg_dom_t sk_svg_dom_from_string(const char* data, int len) {
#if HAS_SVG
    SkMemoryStream stream(data, len);
    auto dom = SkSVGDOM::MakeFromStream(stream);
    if (!dom) return nullptr;
    return reinterpret_cast<sk_svg_dom_t>(dom.release());
#else
    (void)data; (void)len;
    return nullptr;
#endif
}

void sk_svg_dom_destroy(sk_svg_dom_t svg) {
#if HAS_SVG
    if (svg) as_svgdom(svg)->unref();
#else
    (void)svg;
#endif
}

void sk_svg_dom_get_size(sk_svg_dom_t svg, float* w, float* h) {
#if HAS_SVG
    if (svg) {
        SkSize size = as_svgdom(svg)->containerSize();
        *w = size.width();
        *h = size.height();
    } else {
        *w = 0; *h = 0;
    }
#else
    *w = 0; *h = 0;
    (void)svg;
#endif
}

void sk_svg_dom_set_size(sk_svg_dom_t svg, float w, float h) {
#if HAS_SVG
    if (svg) as_svgdom(svg)->setContainerSize(SkSize::Make(w, h));
#else
    (void)svg; (void)w; (void)h;
#endif
}

void sk_svg_dom_render(sk_svg_dom_t svg, sk_canvas_t canvas) {
#if HAS_SVG
    if (svg && canvas) as_svgdom(svg)->render(as_canvas(canvas));
#else
    (void)svg; (void)canvas;
#endif
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
