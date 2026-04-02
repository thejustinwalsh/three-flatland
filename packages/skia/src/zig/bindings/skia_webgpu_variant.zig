//! WebGPU variant entry point.
//!
//! This is the root source file for the skia-webgpu.wasm build variant.
//! It imports the shared core bindings and adds WebGPU/Dawn-specific initialization.

const core = @import("core.zig");

// Re-export all core bindings so they appear as WASM exports
pub usingnamespace core;

// ── WebGPU-specific initialization ──

/// Initialize the WebGPU backend with a device handle from the JS host.
export fn skia_webgpu_init(device_handle: u32, queue_handle: u32) void {
    _ = device_handle;
    _ = queue_handle;
    // TODO: Phase 6 — Create Dawn backend context from shared device
}
