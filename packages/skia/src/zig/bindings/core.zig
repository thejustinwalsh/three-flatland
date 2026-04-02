//! Core Skia binding layer — implements the WIT exports by calling
//! the Skia C API wrapper (skia_c_api.h).

const c = @cImport({
    @cInclude("skia_gl.h");   // WIT-generated types
    @cInclude("skia_c_api.h"); // Skia C wrapper
});

// WASI requires a main entry point.
pub fn main() void {}

// ── Global state ──

var g_ctx: c.sk_context_t = null;
var g_surface: c.sk_surface_t = null;
var g_canvas: c.sk_canvas_t = null;

// ── Handle table for WIT resources ──
// WIT resources use i32 handles. We map them to Skia object pointers.

const MAX_HANDLES = 4096;

var paint_table: [MAX_HANDLES]c.sk_paint_t = [_]c.sk_paint_t{null} ** MAX_HANDLES;
var path_table: [MAX_HANDLES]c.sk_path_t = [_]c.sk_path_t{null} ** MAX_HANDLES;
var next_paint: i32 = 1;
var next_path: i32 = 1;

fn alloc_paint(p: c.sk_paint_t) i32 {
    const h = next_paint;
    if (h >= MAX_HANDLES) return 0;
    paint_table[@intCast(h)] = p;
    next_paint += 1;
    return h;
}

fn alloc_path(p: c.sk_path_t) i32 {
    const h = next_path;
    if (h >= MAX_HANDLES) return 0;
    path_table[@intCast(h)] = p;
    next_path += 1;
    return h;
}

fn get_paint(h: c.skia_gl_borrow_paint_t) c.sk_paint_t {
    const idx: usize = @intCast(h.__handle);
    if (idx >= MAX_HANDLES) return null;
    return paint_table[idx];
}

fn get_path(h: c.skia_gl_borrow_path_t) c.sk_path_t {
    const idx: usize = @intCast(h.__handle);
    if (idx >= MAX_HANDLES) return null;
    return path_table[idx];
}

// ── Context & Surface lifecycle ──

export fn exports_skia_gl_init(_: *c.skia_gl_list_u8_t) void {
    g_ctx = c.sk_context_create_gl();
}

export fn exports_skia_gl_destroy() void {
    if (g_surface != null) {
        c.sk_surface_destroy(g_surface);
        g_surface = null;
        g_canvas = null;
    }
    if (g_ctx != null) {
        c.sk_context_destroy(g_ctx);
        g_ctx = null;
    }
}

export fn exports_skia_gl_begin_drawing(fbo_id: u32, width: i32, height: i32, ret: *u32) bool {
    if (g_ctx == null) return false;

    // Destroy previous surface if dimensions changed
    if (g_surface != null) {
        c.sk_surface_destroy(g_surface);
    }

    g_surface = c.sk_surface_create_from_fbo(g_ctx, fbo_id, width, height);
    if (g_surface == null) return false;

    g_canvas = c.sk_surface_get_canvas(g_surface);
    if (g_canvas == null) return false;

    ret.* = 1; // canvas handle (opaque, we use global state)
    return true;
}

export fn exports_skia_gl_end_drawing() void {
    if (g_surface != null) {
        c.sk_surface_flush(g_surface);
    }
}

export fn exports_skia_gl_flush() void {
    if (g_ctx != null) {
        c.sk_context_flush(g_ctx);
    }
}

// ── Path resource (WIT handles → Skia objects) ──

export fn exports_skia_gl_path_from_svg_string(_: *c.skia_gl_string_t, _: *c.skia_gl_own_path_t) bool {
    // TODO: Phase 4 — SkParsePath::FromSVGString
    return false;
}

export fn exports_skia_gl_path_to_svg_string(_: c.skia_gl_borrow_path_t, ret: *c.skia_gl_string_t) void {
    // TODO: Phase 4
    ret.ptr = null;
    ret.len = 0;
}

// ── Canvas drawing ──

export fn exports_skia_gl_canvas_clear(r: f32, g: f32, b: f32, a: f32) void {
    if (g_canvas != null) c.sk_canvas_clear(g_canvas, r, g, b, a);
}

export fn exports_skia_gl_canvas_draw_rect(x: f32, y: f32, w: f32, h: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = get_paint(p);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_rect(g_canvas, x, y, w, h, paint);
}

export fn exports_skia_gl_canvas_draw_round_rect(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = get_paint(p);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_round_rect(g_canvas, x, y, w, h, rx, ry, paint);
}

export fn exports_skia_gl_canvas_draw_circle(cx: f32, cy: f32, r: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = get_paint(p);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_circle(g_canvas, cx, cy, r, paint);
}

export fn exports_skia_gl_canvas_draw_oval(x: f32, y: f32, w: f32, h: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = get_paint(p);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_oval(g_canvas, x, y, w, h, paint);
}

export fn exports_skia_gl_canvas_draw_line(x0: f32, y0: f32, x1: f32, y1: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = get_paint(p);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_line(g_canvas, x0, y0, x1, y1, paint);
}

export fn exports_skia_gl_canvas_draw_path(path_h: c.skia_gl_borrow_path_t, p: c.skia_gl_borrow_paint_t) void {
    const path = get_path(path_h);
    const paint = get_paint(p);
    if (g_canvas != null and path != null and paint != null) c.sk_canvas_draw_path(g_canvas, path, paint);
}

export fn exports_skia_gl_canvas_draw_text(_: *c.skia_gl_string_t, _: f32, _: f32, _: c.skia_gl_borrow_font_t, _: c.skia_gl_borrow_paint_t) void {
    // TODO: Phase 4 — SkCanvas::drawSimpleText or drawTextBlob
}

export fn exports_skia_gl_canvas_draw_svg(_: c.skia_gl_borrow_svg_dom_t) void {
    // TODO: Phase 4 — SkSVGDOM::render
}

// ── Transform stack ──

export fn exports_skia_gl_canvas_save() void {
    if (g_canvas != null) c.sk_canvas_save(g_canvas);
}

export fn exports_skia_gl_canvas_restore() void {
    if (g_canvas != null) c.sk_canvas_restore(g_canvas);
}

export fn exports_skia_gl_canvas_translate(x: f32, y: f32) void {
    if (g_canvas != null) c.sk_canvas_translate(g_canvas, x, y);
}

export fn exports_skia_gl_canvas_rotate(degrees: f32) void {
    if (g_canvas != null) c.sk_canvas_rotate(g_canvas, degrees);
}

export fn exports_skia_gl_canvas_scale(sx: f32, sy: f32) void {
    if (g_canvas != null) c.sk_canvas_scale(g_canvas, sx, sy);
}

export fn exports_skia_gl_canvas_concat_matrix(_: *c.skia_gl_list_f32_t) void {
    // TODO: Phase 4
}

// ── Clipping ──

export fn exports_skia_gl_canvas_clip_rect(x: f32, y: f32, w: f32, h: f32) void {
    if (g_canvas != null) c.sk_canvas_clip_rect(g_canvas, x, y, w, h);
}

export fn exports_skia_gl_canvas_clip_round_rect(_: f32, _: f32, _: f32, _: f32, _: f32, _: f32) void {
    // TODO: Phase 4
}

export fn exports_skia_gl_canvas_clip_path(path_h: c.skia_gl_borrow_path_t) void {
    const path = get_path(path_h);
    if (g_canvas != null and path != null) c.sk_canvas_clip_path(g_canvas, path);
}

// ── PathOps ──

export fn exports_skia_gl_path_op_apply(_: c.skia_gl_borrow_path_t, _: c.skia_gl_borrow_path_t, _: c.skia_gl_path_op_t, _: *c.skia_gl_own_path_t) bool {
    // TODO: Phase 4
    return false;
}

export fn exports_skia_gl_path_simplify(_: c.skia_gl_borrow_path_t, _: *c.skia_gl_own_path_t) bool {
    // TODO: Phase 4
    return false;
}
