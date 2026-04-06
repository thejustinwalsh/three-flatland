//! WebGPU variant entry point.
//! Root source file for skia-wgpu.wasm. Imports the shared core bindings.
//! Dawn-specific behavior comes from skia_c_api_dawn.cpp (linked by build.zig).

pub const core = @import("core.zig");
pub const main = core.main;
