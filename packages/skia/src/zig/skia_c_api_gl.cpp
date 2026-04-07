// C API wrapper — GL/Ganesh variant.
// Implements the unified context/surface API using Ganesh + WebGL.

#include "skia_c_api.h"
#include "skia_c_api_common.inc"

// GL/Ganesh-specific includes
#include "include/gpu/ganesh/GrBackendSurface.h"
#include "include/gpu/ganesh/GrDirectContext.h"
#include "include/gpu/ganesh/SkSurfaceGanesh.h"
#include "include/gpu/ganesh/gl/GrGLBackendSurface.h"
#include "include/gpu/ganesh/gl/GrGLDirectContext.h"
#include "include/gpu/ganesh/gl/GrGLInterface.h"
#include "include/gpu/ganesh/gl/GrGLMakeWebGLInterface.h"
#include "include/gpu/ganesh/gl/GrGLTypes.h"

static inline GrDirectContext* as_context(sk_context_t c) { return reinterpret_cast<GrDirectContext*>(c); }

// ════════════════════════════════════════════════════════
// Context (GL/Ganesh)
// ════════════════════════════════════════════════════════

static int g_init_error = 0;

sk_context_t sk_context_create(uint32_t /*arg1*/, uint32_t /*arg2*/) {
    // GL variant: args unused — context comes from the shared WebGL context
    sk_sp<const GrGLInterface> interface = GrGLInterfaces::MakeWebGL();
    if (!interface) { g_init_error = 1; return nullptr; }
    sk_sp<GrDirectContext> ctx = GrDirectContexts::MakeGL(interface);
    if (!ctx) { g_init_error = 2; return nullptr; }
    g_init_error = 0;
    return reinterpret_cast<sk_context_t>(ctx.release());
}

sk_context_t sk_context_create_mock(void) {
    auto ctx = GrDirectContext::MakeMock(nullptr);
    if (!ctx) return nullptr;
    return reinterpret_cast<sk_context_t>(ctx.release());
}

int sk_context_get_init_error(void) { return g_init_error; }

void sk_context_destroy(sk_context_t ctx) {
    if (ctx) {
        as_context(ctx)->abandonContext();
        as_context(ctx)->unref();
    }
}

void sk_context_flush(sk_context_t ctx) {
    if (ctx) as_context(ctx)->flushAndSubmit(GrSyncCpu::kNo);
}

void sk_context_reset_state(sk_context_t ctx) {
    if (ctx) as_context(ctx)->resetContext(kAll_GrBackendState);
}

// ════════════════════════════════════════════════════════
// Surface (GL/Ganesh)
// ════════════════════════════════════════════════════════

sk_surface_t sk_surface_create_for_target(sk_context_t ctx, uint32_t target_handle, int32_t width, int32_t height) {
    if (!ctx || width <= 0 || height <= 0) return nullptr;

    // GL variant: target_handle = FBO ID (0 = default framebuffer / screen)
    GrGLFramebufferInfo fbo_info;
    fbo_info.fFBOID = target_handle;
    fbo_info.fFormat = 0x8058; // GL_RGBA8

    auto backend_rt = GrBackendRenderTargets::MakeGL(width, height, 0, 8, fbo_info);

    sk_sp<SkSurface> surface = SkSurfaces::WrapBackendRenderTarget(
        as_context(ctx), backend_rt, kBottomLeft_GrSurfaceOrigin,
        kRGBA_8888_SkColorType, SkColorSpace::MakeSRGB(), nullptr);

    if (!surface) return nullptr;
    return reinterpret_cast<sk_surface_t>(surface.release());
}

sk_surface_t sk_surface_create_for_gl_texture(sk_context_t ctx, uint32_t texture_id, int32_t width, int32_t height) {
    // Wrap an existing GL texture as a Skia render target surface.
    // texture_id is the GL texture name (from Skia's GL handle table).
    if (!ctx || width <= 0 || height <= 0 || texture_id == 0) return nullptr;

    GrGLTextureInfo texInfo;
    texInfo.fID = texture_id;
    texInfo.fTarget = 0x0DE1; // GL_TEXTURE_2D
    texInfo.fFormat = 0x8058; // GL_RGBA8

    auto backendTex = GrBackendTextures::MakeGL(width, height, skgpu::Mipmapped::kNo, texInfo);

    sk_sp<SkSurface> surface = SkSurfaces::WrapBackendTexture(
        as_context(ctx), backendTex, kTopLeft_GrSurfaceOrigin,
        0, kRGBA_8888_SkColorType, SkColorSpace::MakeSRGB(), nullptr);

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

// Shared code: Paint, Path, Font, Canvas, Image, Filters, PathOps, etc.
#include "skia_c_api_shared.inc"
