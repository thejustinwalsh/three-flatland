// C API wrapper around Skia C++ classes for the WASM/Zig build.

#include "skia_c_api.h"

#include "include/core/SkCanvas.h"
#include "include/core/SkColor.h"
#include "include/core/SkColorSpace.h"
#include "include/core/SkPaint.h"
#include "include/core/SkPathBuilder.h"
#include "include/core/SkRect.h"
#include "include/core/SkRRect.h"
#include "include/core/SkSurface.h"
#include "include/gpu/ganesh/GrBackendSurface.h"
#include "include/gpu/ganesh/GrDirectContext.h"
#include "include/gpu/ganesh/SkSurfaceGanesh.h"
#include "include/gpu/ganesh/gl/GrGLBackendSurface.h"
#include "include/gpu/ganesh/gl/GrGLDirectContext.h"
#include "include/gpu/ganesh/gl/GrGLInterface.h"
#include "include/gpu/ganesh/gl/GrGLMakeWebGLInterface.h"
#include "include/gpu/ganesh/gl/GrGLTypes.h"

// ── Helpers ──

static inline SkPaint* as_paint(sk_paint_t p) { return reinterpret_cast<SkPaint*>(p); }
static inline SkPathBuilder* as_path(sk_path_t p) { return reinterpret_cast<SkPathBuilder*>(p); }
static inline SkCanvas* as_canvas(sk_canvas_t c) { return reinterpret_cast<SkCanvas*>(c); }
static inline GrDirectContext* as_context(sk_context_t c) { return reinterpret_cast<GrDirectContext*>(c); }
static inline SkSurface* as_surface(sk_surface_t s) { return reinterpret_cast<SkSurface*>(s); }

// ── Context ──

sk_context_t sk_context_create_gl(void) {
    // Create the WebGL GrGLInterface — this uses the emscripten_gl* imports
    // which are provided by the JS host via WASM imports.
    sk_sp<const GrGLInterface> interface = GrGLInterfaces::MakeWebGL();
    if (!interface) {
        return nullptr;
    }

    sk_sp<GrDirectContext> ctx = GrDirectContexts::MakeGL(interface);
    if (!ctx) {
        return nullptr;
    }

    // Release ownership — caller manages lifetime
    return reinterpret_cast<sk_context_t>(ctx.release());
}

void sk_context_destroy(sk_context_t ctx) {
    if (ctx) {
        as_context(ctx)->abandonContext();
        as_context(ctx)->unref();
    }
}

void sk_context_flush(sk_context_t ctx) {
    if (ctx) {
        as_context(ctx)->flushAndSubmit(GrSyncCpu::kNo);
    }
}

void sk_context_reset_gl_state(sk_context_t ctx) {
    if (ctx) {
        as_context(ctx)->resetContext(kAll_GrBackendState);
    }
}

// ── Surface ──

sk_surface_t sk_surface_create_from_fbo(sk_context_t ctx, uint32_t fbo_id, int32_t width, int32_t height) {
    if (!ctx || width <= 0 || height <= 0) return nullptr;

    GrGLFramebufferInfo fbo_info;
    fbo_info.fFBOID = fbo_id;
    fbo_info.fFormat = 0x8058; // GL_RGBA8

    auto backend_rt = GrBackendRenderTargets::MakeGL(width, height, /*sampleCnt=*/0, /*stencilBits=*/8, fbo_info);

    sk_sp<SkSurface> surface = SkSurfaces::WrapBackendRenderTarget(
        as_context(ctx),
        backend_rt,
        kBottomLeft_GrSurfaceOrigin,
        kRGBA_8888_SkColorType,
        SkColorSpace::MakeSRGB(),
        nullptr // surface props
    );

    if (!surface) return nullptr;
    return reinterpret_cast<sk_surface_t>(surface.release());
}

void sk_surface_destroy(sk_surface_t surface) {
    if (surface) {
        as_surface(surface)->unref();
    }
}

sk_canvas_t sk_surface_get_canvas(sk_surface_t surface) {
    if (!surface) return nullptr;
    // Canvas is owned by the surface — don't free it separately
    return reinterpret_cast<sk_canvas_t>(as_surface(surface)->getCanvas());
}

void sk_surface_flush(sk_surface_t surface) {
    if (surface) {
        skgpu::ganesh::FlushAndSubmit(as_surface(surface));
    }
}

// ── Paint ──

sk_paint_t sk_paint_create(void) {
    return reinterpret_cast<sk_paint_t>(new SkPaint());
}

void sk_paint_destroy(sk_paint_t paint) {
    delete as_paint(paint);
}

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

// ── Path ──

sk_path_t sk_path_create(void) {
    return reinterpret_cast<sk_path_t>(new SkPathBuilder());
}

void sk_path_destroy(sk_path_t path) {
    delete as_path(path);
}

void sk_path_move_to(sk_path_t path, float x, float y) {
    as_path(path)->moveTo(x, y);
}

void sk_path_line_to(sk_path_t path, float x, float y) {
    as_path(path)->lineTo(x, y);
}

void sk_path_quad_to(sk_path_t path, float cx, float cy, float x, float y) {
    as_path(path)->quadTo(cx, cy, x, y);
}

void sk_path_cubic_to(sk_path_t path, float c1x, float c1y, float c2x, float c2y, float x, float y) {
    as_path(path)->cubicTo(c1x, c1y, c2x, c2y, x, y);
}

void sk_path_close(sk_path_t path) {
    as_path(path)->close();
}

void sk_path_reset(sk_path_t path) {
    as_path(path)->reset();
}

// ── Canvas drawing ──

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
    as_canvas(canvas)->drawPath(as_path(path)->snapshot(), *as_paint(paint));
}

// ── Canvas transform ──

void sk_canvas_save(sk_canvas_t canvas) {
    as_canvas(canvas)->save();
}

void sk_canvas_restore(sk_canvas_t canvas) {
    as_canvas(canvas)->restore();
}

void sk_canvas_translate(sk_canvas_t canvas, float x, float y) {
    as_canvas(canvas)->translate(x, y);
}

void sk_canvas_rotate(sk_canvas_t canvas, float degrees) {
    as_canvas(canvas)->rotate(degrees);
}

void sk_canvas_scale(sk_canvas_t canvas, float sx, float sy) {
    as_canvas(canvas)->scale(sx, sy);
}

// ── Canvas clipping ──

void sk_canvas_clip_rect(sk_canvas_t canvas, float x, float y, float w, float h) {
    as_canvas(canvas)->clipRect(SkRect::MakeXYWH(x, y, w, h));
}

void sk_canvas_clip_path(sk_canvas_t canvas, sk_path_t path) {
    as_canvas(canvas)->clipPath(as_path(path)->snapshot());
}
