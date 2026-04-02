//! Core Skia binding layer — implements the exports_skia_* functions that
//! the wit-bindgen generated skia.c canonical ABI wrappers call into.
//!
//! Uses @cImport to match the exact C type signatures from generated/skia.h.

const c = @cImport(@cInclude("skia.h"));

// WASI requires a main entry point.
pub fn main() void {}

// ── Context & Surface lifecycle ──

export fn exports_skia_init(_: *c.skia_list_u8_t) void {}
export fn exports_skia_destroy() void {}
export fn exports_skia_begin_drawing(_: u32, _: i32, _: i32, ret: *u32) bool {
    ret.* = 1;
    return true;
}
export fn exports_skia_end_drawing() void {}
export fn exports_skia_flush() void {}

// ── Path exports ──

export fn exports_skia_path_from_svg_string(_: *c.skia_string_t, _: *c.skia_own_path_t) bool { return false; }
export fn exports_skia_path_to_svg_string(_: c.skia_borrow_path_t, ret: *c.skia_string_t) void { ret.ptr = null; ret.len = 0; }

// ── Canvas drawing ──

export fn exports_skia_canvas_clear(_: f32, _: f32, _: f32, _: f32) void {}
export fn exports_skia_canvas_draw_rect(_: f32, _: f32, _: f32, _: f32, _: c.skia_borrow_paint_t) void {}
export fn exports_skia_canvas_draw_round_rect(_: f32, _: f32, _: f32, _: f32, _: f32, _: f32, _: c.skia_borrow_paint_t) void {}
export fn exports_skia_canvas_draw_circle(_: f32, _: f32, _: f32, _: c.skia_borrow_paint_t) void {}
export fn exports_skia_canvas_draw_oval(_: f32, _: f32, _: f32, _: f32, _: c.skia_borrow_paint_t) void {}
export fn exports_skia_canvas_draw_line(_: f32, _: f32, _: f32, _: f32, _: c.skia_borrow_paint_t) void {}
export fn exports_skia_canvas_draw_path(_: c.skia_borrow_path_t, _: c.skia_borrow_paint_t) void {}
export fn exports_skia_canvas_draw_text(_: *c.skia_string_t, _: f32, _: f32, _: c.skia_borrow_font_t, _: c.skia_borrow_paint_t) void {}
export fn exports_skia_canvas_draw_svg(_: c.skia_borrow_svg_dom_t) void {}

// ── Transform stack ──

export fn exports_skia_canvas_save() void {}
export fn exports_skia_canvas_restore() void {}
export fn exports_skia_canvas_translate(_: f32, _: f32) void {}
export fn exports_skia_canvas_rotate(_: f32) void {}
export fn exports_skia_canvas_scale(_: f32, _: f32) void {}
export fn exports_skia_canvas_concat_matrix(_: *c.skia_list_f32_t) void {}

// ── Clipping ──

export fn exports_skia_canvas_clip_rect(_: f32, _: f32, _: f32, _: f32) void {}
export fn exports_skia_canvas_clip_round_rect(_: f32, _: f32, _: f32, _: f32, _: f32, _: f32) void {}
export fn exports_skia_canvas_clip_path(_: c.skia_borrow_path_t) void {}

// ── PathOps ──

export fn exports_skia_path_op_apply(_: c.skia_borrow_path_t, _: c.skia_borrow_path_t, _: c.skia_path_op_t, _: *c.skia_own_path_t) bool { return false; }
export fn exports_skia_path_simplify(_: c.skia_borrow_path_t, _: *c.skia_own_path_t) bool { return false; }
