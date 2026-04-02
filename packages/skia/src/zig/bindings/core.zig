//! Core Skia binding layer — implements WIT-exported functions against Skia's C/C++ API.
//!
//! This file is shared between the GL and WebGPU variants. Each variant root
//! (skia_gl_variant.zig, skia_webgpu_variant.zig) imports this module and adds
//! backend-specific initialization.

const std = @import("std");

// Phase 2: @cImport wit-bindgen generated headers
// const wit = @cImport(@cInclude("bindings/generated/skia.h"));

// ── Global state ──

var g_initialized: bool = false;

// ── Context & Surface lifecycle ──

/// Initialize Skia with backend-specific GPU context.
/// config_data contains GL proc table or WebGPU device reference as bytes.
export fn skia_init(config_ptr: [*]const u8, config_len: u32) void {
    _ = config_ptr;
    _ = config_len;
    g_initialized = true;
}

/// Tear down Skia context and free all resources.
export fn skia_destroy() void {
    g_initialized = false;
}

/// Begin a draw pass targeting a framebuffer/texture handle.
/// Returns an opaque canvas handle, or 0 on failure.
export fn skia_begin_drawing(target_handle: u32, width: i32, height: i32) u32 {
    _ = target_handle;
    _ = width;
    _ = height;
    if (!g_initialized) return 0;
    // TODO: Create SkSurface wrapping the target, return canvas handle
    return 1; // placeholder
}

/// End the current draw pass.
export fn skia_end_drawing() void {
    // TODO: Flush canvas, release surface reference
}

/// Flush pending GPU commands.
export fn skia_flush() void {
    // TODO: gr_context->flushAndSubmit()
}

// ── Path API ──

export fn path_new() u32 {
    // TODO: Allocate SkPath, return handle
    return 0;
}

export fn path_free(handle: u32) void {
    _ = handle;
    // TODO: Free SkPath by handle
}

export fn path_move_to(handle: u32, x: f32, y: f32) void {
    _ = handle;
    _ = x;
    _ = y;
}

export fn path_line_to(handle: u32, x: f32, y: f32) void {
    _ = handle;
    _ = x;
    _ = y;
}

export fn path_quad_to(handle: u32, cx: f32, cy: f32, x: f32, y: f32) void {
    _ = handle;
    _ = cx;
    _ = cy;
    _ = x;
    _ = y;
}

export fn path_cubic_to(handle: u32, c1x: f32, c1y: f32, c2x: f32, c2y: f32, x: f32, y: f32) void {
    _ = handle;
    _ = c1x;
    _ = c1y;
    _ = c2x;
    _ = c2y;
    _ = x;
    _ = y;
}

export fn path_arc_to(handle: u32, rx: f32, ry: f32, rotation: f32, large: u32, sweep: u32, x: f32, y: f32) void {
    _ = handle;
    _ = rx;
    _ = ry;
    _ = rotation;
    _ = large;
    _ = sweep;
    _ = x;
    _ = y;
}

export fn path_close(handle: u32) void {
    _ = handle;
}

export fn path_reset(handle: u32) void {
    _ = handle;
}

// ── Paint API ──

export fn paint_new() u32 {
    return 0;
}

export fn paint_free(handle: u32) void {
    _ = handle;
}

export fn paint_set_color(handle: u32, r: f32, g: f32, b: f32, a: f32) void {
    _ = handle;
    _ = r;
    _ = g;
    _ = b;
    _ = a;
}

export fn paint_set_fill(handle: u32) void {
    _ = handle;
}

export fn paint_set_stroke(handle: u32, width: f32) void {
    _ = handle;
    _ = width;
}

export fn paint_set_anti_alias(handle: u32, aa: u32) void {
    _ = handle;
    _ = aa;
}

export fn paint_set_blend_mode(handle: u32, mode: u8) void {
    _ = handle;
    _ = mode;
}

export fn paint_set_alpha(handle: u32, alpha: f32) void {
    _ = handle;
    _ = alpha;
}

// ── Canvas drawing ──

export fn canvas_clear(r: f32, g: f32, b: f32, a: f32) void {
    _ = r;
    _ = g;
    _ = b;
    _ = a;
}

export fn canvas_draw_rect(x: f32, y: f32, w: f32, h: f32, paint: u32) void {
    _ = x;
    _ = y;
    _ = w;
    _ = h;
    _ = paint;
}

export fn canvas_draw_round_rect(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32, paint: u32) void {
    _ = x;
    _ = y;
    _ = w;
    _ = h;
    _ = rx;
    _ = ry;
    _ = paint;
}

export fn canvas_draw_circle(cx: f32, cy: f32, r: f32, paint: u32) void {
    _ = cx;
    _ = cy;
    _ = r;
    _ = paint;
}

export fn canvas_draw_line(x0: f32, y0: f32, x1: f32, y1: f32, paint: u32) void {
    _ = x0;
    _ = y0;
    _ = x1;
    _ = y1;
    _ = paint;
}

export fn canvas_draw_path(path: u32, paint: u32) void {
    _ = path;
    _ = paint;
}

// ── Transform stack ──

export fn canvas_save() void {}
export fn canvas_restore() void {}
export fn canvas_translate(x: f32, y: f32) void {
    _ = x;
    _ = y;
}
export fn canvas_rotate(degrees: f32) void {
    _ = degrees;
}
export fn canvas_scale(sx: f32, sy: f32) void {
    _ = sx;
    _ = sy;
}

// ── Clipping ──

export fn canvas_clip_rect(x: f32, y: f32, w: f32, h: f32) void {
    _ = x;
    _ = y;
    _ = w;
    _ = h;
}

export fn canvas_clip_path(path: u32) void {
    _ = path;
}

// ── PathOps ──

export fn path_op_apply(a: u32, b: u32, op: u8) u32 {
    _ = a;
    _ = b;
    _ = op;
    return 0;
}

export fn path_simplify(p: u32) u32 {
    _ = p;
    return 0;
}
