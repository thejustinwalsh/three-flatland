//! WebGL variant entry point.
//! Root source file for skia-gl.wasm. Imports the shared core bindings.
//! GL-specific behavior comes from skia_c_api_gl.cpp (linked by build.zig).

pub const core = @import("core.zig");
pub const main = core.main;
