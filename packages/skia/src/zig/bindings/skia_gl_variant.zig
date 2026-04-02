//! WebGL variant entry point.
//!
//! This is the root source file for the skia-gl.wasm build variant.
//! It imports the shared core bindings and adds GL-specific initialization
//! (GrGLInterface population, GL function pointer table from JS host).

pub const core = @import("core.zig");

// Re-export main for WASI entry point (required since usingnamespace
// was removed in Zig 0.15 — the root module must provide main directly)
pub const main = core.main;

// ── GL-specific initialization ──

/// Initialize the GL backend with a function pointer table from the JS host.
/// The proc_table contains GL function pointers as a flat array of addresses.
export fn skia_gl_init(proc_table_ptr: [*]const u8, proc_table_len: u32) void {
    _ = proc_table_ptr;
    _ = proc_table_len;
    // TODO: Phase 3 — Populate GrGLInterface from the proc table
    // TODO: Create GrDirectContext wrapping the shared WebGL context
}
