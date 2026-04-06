// C API wrapper — Dawn/Graphite variant.
// Implements the unified context/surface API using Graphite + Dawn.
//
// Graphite lifecycle:
//   Context → makeRecorder → Surface::RenderTarget(recorder) → getCanvas
//   → recorder->snap() → ctx->insertRecording() → ctx->submit()

#include "skia_c_api.h"
#include "skia_c_api_common.inc"

// Dawn/Graphite-specific includes
#include "include/gpu/graphite/Context.h"
#include "include/gpu/graphite/ContextOptions.h"
#include "include/gpu/graphite/Recorder.h"
#include "include/gpu/graphite/Recording.h"
#include "include/gpu/graphite/Surface.h"
#include "include/gpu/graphite/dawn/DawnBackendContext.h"

#include "webgpu/webgpu_cpp.h"

// ── Graphite globals ──

static std::unique_ptr<skgpu::graphite::Context> g_graphite_ctx = nullptr;
static std::unique_ptr<skgpu::graphite::Recorder> g_recorder = nullptr;
static int g_init_error = 0;

// ════════════════════════════════════════════════════════
// Context (Dawn/Graphite)
// ════════════════════════════════════════════════════════

sk_context_t sk_context_create(uint32_t device_handle, uint32_t queue_handle) {
    // Dawn variant: args are WebGPU device/queue handles from JS
    wgpu::Device device = wgpu::Device::Acquire(
        reinterpret_cast<WGPUDevice>(static_cast<uintptr_t>(device_handle)));
    wgpu::Queue queue = wgpu::Queue::Acquire(
        reinterpret_cast<WGPUQueue>(static_cast<uintptr_t>(queue_handle)));

    if (!device || !queue) {
        g_init_error = 1;
        return nullptr;
    }

    skgpu::graphite::DawnBackendContext backendCtx;
    backendCtx.fDevice = device;
    backendCtx.fQueue = queue;
    backendCtx.fTick = nullptr; // non-yielding (no ASYNCIFY)

    skgpu::graphite::ContextOptions options;
    g_graphite_ctx = skgpu::graphite::ContextFactory::MakeDawn(backendCtx, options);
    if (!g_graphite_ctx) {
        g_init_error = 2;
        return nullptr;
    }

    g_init_error = 0;
    return reinterpret_cast<sk_context_t>(g_graphite_ctx.get());
}

sk_context_t sk_context_create_mock(void) {
    // Return a sentinel non-null pointer for mock/test mode.
    // Tests use raster surfaces (sk_surface_create_raster) so no real GPU context is needed.
    // The pointer value 0x1 is never dereferenced — it just satisfies null checks.
    return reinterpret_cast<sk_context_t>(static_cast<uintptr_t>(1));
}
int sk_context_get_init_error(void) { return g_init_error; }

void sk_context_destroy(sk_context_t ctx) {
    g_recorder.reset();
    g_graphite_ctx.reset();
}

void sk_context_flush(sk_context_t ctx) {
    if (g_graphite_ctx) {
        g_graphite_ctx->submit(skgpu::graphite::SyncToCpu::kNo);
    }
}

void sk_context_reset_state(sk_context_t ctx) {
    // No-op for Dawn — no external GPU state to reset
}

// ════════════════════════════════════════════════════════
// Surface (Graphite)
// ════════════════════════════════════════════════════════

sk_surface_t sk_surface_create_for_target(sk_context_t ctx, uint32_t target_handle, int32_t width, int32_t height) {
    // Dawn variant: target_handle = registered WebGPU texture handle
    if (!g_graphite_ctx || width <= 0 || height <= 0) return nullptr;

    if (!g_recorder) {
        g_recorder = g_graphite_ctx->makeRecorder();
        if (!g_recorder) return nullptr;
    }

    SkImageInfo imageInfo = SkImageInfo::Make(width, height, kRGBA_8888_SkColorType,
                                              kPremul_SkAlphaType, SkColorSpace::MakeSRGB());

    // TODO: wrap the WebGPU texture directly via BackendTexture::MakeDawn()
    sk_sp<SkSurface> surface = SkSurfaces::RenderTarget(g_recorder.get(), imageInfo);
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
    if (g_recorder && g_graphite_ctx) {
        std::unique_ptr<skgpu::graphite::Recording> recording = g_recorder->snap();
        if (recording) {
            skgpu::graphite::InsertRecordingInfo info;
            info.fRecording = recording.get();
            g_graphite_ctx->insertRecording(info);
            g_graphite_ctx->submit(skgpu::graphite::SyncToCpu::kNo);
        }
    }
}

// Shared code: Paint, Path, Font, Canvas, Image, Filters, PathOps, etc.
#include "skia_c_api_shared.inc"
