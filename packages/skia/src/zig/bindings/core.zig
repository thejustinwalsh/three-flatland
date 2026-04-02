//! Core Skia binding layer — implements the WIT exports by calling
//! the Skia C API wrapper (skia_c_api.h).

const c = @cImport({
    @cInclude("skia_gl.h"); // WIT-generated types
    @cInclude("skia_c_api.h"); // Skia C wrapper
});

// WASI requires a main entry point.
pub fn main() void {}

// ── Global state ──

var g_ctx: c.sk_context_t = null;
var g_surface: c.sk_surface_t = null;
var g_canvas: c.sk_canvas_t = null;

// ── Handle table for WIT resources ──

const MAX_HANDLES = 4096;

const HandleTable = struct {
    fn Table(comptime T: type) type {
        return struct {
            items: [MAX_HANDLES]T = [_]T{null} ** MAX_HANDLES,
            next: i32 = 1,
            free_head: i32 = 0, // singly-linked free list (0 = empty)
            free_list: [MAX_HANDLES]i32 = [_]i32{0} ** MAX_HANDLES,

            fn alloc(self: *@This(), ptr: T) i32 {
                // Try free list first
                if (self.free_head > 0) {
                    const h = self.free_head;
                    self.free_head = self.free_list[@intCast(h)];
                    self.items[@intCast(h)] = ptr;
                    return h;
                }
                if (self.next >= MAX_HANDLES) return 0;
                const h = self.next;
                self.items[@intCast(h)] = ptr;
                self.next += 1;
                return h;
            }

            fn get(self: *const @This(), h: i32) T {
                if (h <= 0 or h >= MAX_HANDLES) return null;
                return self.items[@intCast(h)];
            }

            fn free(self: *@This(), h: i32) void {
                if (h > 0 and h < MAX_HANDLES) {
                    self.items[@intCast(h)] = null;
                    self.free_list[@intCast(h)] = self.free_head;
                    self.free_head = h;
                }
            }
        };
    }
};

var paints = HandleTable.Table(c.sk_paint_t){};
var paths = HandleTable.Table(c.sk_path_t){};
var fonts = HandleTable.Table(c.sk_font_t){};
var typefaces = HandleTable.Table(c.sk_typeface_t){};
var svgs = HandleTable.Table(c.sk_svg_dom_t){};

// ── Context & Surface lifecycle ──

export fn exports_skia_gl_init(_: *c.skia_gl_list_u8_t) void {
    g_ctx = c.sk_context_create_gl();
}

export fn sk_debug_init_error() i32 {
    return c.sk_context_get_init_error();
}

export fn sk_debug_font() i32 {
    return c.sk_font_debug();
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
    if (g_surface != null) c.sk_surface_destroy(g_surface);

    g_surface = c.sk_surface_create_from_fbo(g_ctx, fbo_id, width, height);
    if (g_surface == null) return false;

    g_canvas = c.sk_surface_get_canvas(g_surface);
    if (g_canvas == null) return false;

    ret.* = 1;
    return true;
}

export fn exports_skia_gl_end_drawing() void {
    if (g_surface != null) c.sk_surface_flush(g_surface);
}

export fn exports_skia_gl_flush() void {
    if (g_ctx != null) c.sk_context_flush(g_ctx);
}

// ── Path resource (WIT constructor/destructor called from skia_gl.c) ──
// The skia_gl.c import wrappers define skia_constructor_path etc.
// We only handle exports_skia_gl_* and skia_method_* that skia_gl.c
// declares as extern but does NOT define.

// WIT exports for path utilities
export fn exports_skia_gl_path_from_svg_string(d: *c.skia_gl_string_t, ret: *c.skia_gl_own_path_t) bool {
    if (d.ptr == null or d.len == 0) return false;
    const p = c.sk_path_from_svg_string(@ptrCast(d.ptr), @intCast(d.len));
    if (p == null) return false;
    ret.__handle = paths.alloc(p);
    return ret.__handle != 0;
}

export fn exports_skia_gl_path_to_svg_string(ph: c.skia_gl_borrow_path_t, ret: *c.skia_gl_string_t) void {
    const p = paths.get(ph.__handle);
    if (p == null) {
        ret.ptr = null;
        ret.len = 0;
        return;
    }
    // Get required size
    const needed = c.sk_path_to_svg_string(p, null, 0);
    if (needed <= 0) {
        ret.ptr = null;
        ret.len = 0;
        return;
    }
    // TODO: allocate from WASM memory properly
    ret.ptr = null;
    ret.len = 0;
}

// ── Canvas drawing ──

export fn exports_skia_gl_canvas_clear(r: f32, g: f32, b: f32, a: f32) void {
    if (g_canvas != null) c.sk_canvas_clear(g_canvas, r, g, b, a);
}

export fn exports_skia_gl_canvas_draw_rect(x: f32, y: f32, w: f32, h: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = paints.get(p.__handle);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_rect(g_canvas, x, y, w, h, paint);
}

export fn exports_skia_gl_canvas_draw_round_rect(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = paints.get(p.__handle);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_round_rect(g_canvas, x, y, w, h, rx, ry, paint);
}

export fn exports_skia_gl_canvas_draw_circle(cx: f32, cy: f32, r: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = paints.get(p.__handle);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_circle(g_canvas, cx, cy, r, paint);
}

export fn exports_skia_gl_canvas_draw_oval(x: f32, y: f32, w: f32, h: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = paints.get(p.__handle);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_oval(g_canvas, x, y, w, h, paint);
}

export fn exports_skia_gl_canvas_draw_line(x0: f32, y0: f32, x1: f32, y1: f32, p: c.skia_gl_borrow_paint_t) void {
    const paint = paints.get(p.__handle);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_line(g_canvas, x0, y0, x1, y1, paint);
}

export fn exports_skia_gl_canvas_draw_path(path_h: c.skia_gl_borrow_path_t, p: c.skia_gl_borrow_paint_t) void {
    const path = paths.get(path_h.__handle);
    const paint = paints.get(p.__handle);
    if (g_canvas != null and path != null and paint != null) c.sk_canvas_draw_path(g_canvas, path, paint);
}

export fn exports_skia_gl_canvas_draw_text(text: *c.skia_gl_string_t, x: f32, y: f32, fh: c.skia_gl_borrow_font_t, p: c.skia_gl_borrow_paint_t) void {
    const font = fonts.get(fh.__handle);
    const paint = paints.get(p.__handle);
    if (g_canvas != null and font != null and paint != null and text.ptr != null) {
        c.sk_canvas_draw_text(g_canvas, @ptrCast(text.ptr), @intCast(text.len), x, y, font, paint);
    }
}

export fn exports_skia_gl_canvas_draw_svg(sh: c.skia_gl_borrow_svg_dom_t) void {
    const svg = svgs.get(sh.__handle);
    if (g_canvas != null and svg != null) c.sk_svg_dom_render(svg, g_canvas);
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

export fn exports_skia_gl_canvas_concat_matrix(m: *c.skia_gl_list_f32_t) void {
    if (g_canvas != null and m.ptr != null) {
        c.sk_canvas_concat_matrix(g_canvas, m.ptr, @intCast(m.len));
    }
}

// ── Clipping ──

export fn exports_skia_gl_canvas_clip_rect(x: f32, y: f32, w: f32, h: f32) void {
    if (g_canvas != null) c.sk_canvas_clip_rect(g_canvas, x, y, w, h);
}

export fn exports_skia_gl_canvas_clip_round_rect(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32) void {
    if (g_canvas != null) c.sk_canvas_clip_round_rect(g_canvas, x, y, w, h, rx, ry);
}

export fn exports_skia_gl_canvas_clip_path(path_h: c.skia_gl_borrow_path_t) void {
    const path = paths.get(path_h.__handle);
    if (g_canvas != null and path != null) c.sk_canvas_clip_path(g_canvas, path);
}

// ── PathOps ──

export fn exports_skia_gl_path_op_apply(ah: c.skia_gl_borrow_path_t, bh: c.skia_gl_borrow_path_t, op: c.skia_gl_path_op_t, ret: *c.skia_gl_own_path_t) bool {
    const a = paths.get(ah.__handle);
    const b = paths.get(bh.__handle);
    if (a == null or b == null) return false;
    const result = c.sk_path_op(a, b, @intCast(op));
    if (result == null) return false;
    ret.__handle = paths.alloc(result);
    return ret.__handle != 0;
}

export fn exports_skia_gl_path_simplify(ph: c.skia_gl_borrow_path_t, ret: *c.skia_gl_own_path_t) bool {
    const p = paths.get(ph.__handle);
    if (p == null) return false;
    const result = c.sk_path_simplify(p);
    if (result == null) return false;
    ret.__handle = paths.alloc(result);
    return ret.__handle != 0;
}

// ── Direct paint/font API (bypasses WIT resource model) ──

export fn sk_paint_new() i32 {
    const p = c.sk_paint_create();
    if (p == null) return 0;
    return paints.alloc(p);
}

export fn sk_paint_delete(h: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_destroy(p);
    paints.free(h);
}

export fn sk_paint_color(h: i32, r: f32, g: f32, b: f32, a: f32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_color(p, r, g, b, a);
}

export fn sk_paint_set_fill_style(h: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_fill(p);
}

export fn sk_paint_set_stroke_style(h: i32, width: f32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_stroke(p, width);
}

export fn sk_typeface_load(data_ptr: [*]const u8, data_len: i32) i32 {
    const tf = c.sk_typeface_from_data(data_ptr, data_len);
    if (tf == null) return 0;
    return typefaces.alloc(tf);
}

export fn sk_typeface_delete(h: i32) void {
    const tf = typefaces.get(h);
    if (tf != null) c.sk_typeface_destroy(tf);
    typefaces.free(h);
}

export fn sk_font_new(typeface_h: i32, size: f32) i32 {
    const tf = typefaces.get(typeface_h);
    if (tf == null) return 0;
    const f = c.sk_font_create(tf, size);
    if (f == null) return 0;
    return fonts.alloc(f);
}

export fn sk_font_delete(h: i32) void {
    const f = fonts.get(h);
    if (f != null) c.sk_font_destroy(f);
    fonts.free(h);
}

export fn sk_measure_text(text_ptr: [*]const u8, text_len: i32, font_h: i32) f32 {
    const font = fonts.get(font_h);
    if (font == null) return 0;
    return c.sk_font_measure_text(font, @ptrCast(text_ptr), text_len);
}

export fn sk_draw_text(text_ptr: [*]const u8, text_len: i32, x: f32, y: f32, font_h: i32, paint_h: i32) void {
    const font = fonts.get(font_h);
    const paint = paints.get(paint_h);
    if (g_canvas != null and font != null and paint != null) {
        c.sk_canvas_draw_text(g_canvas, @ptrCast(text_ptr), text_len, x, y, font, paint);
    }
}

export fn sk_draw_rect(x: f32, y: f32, w: f32, h: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_rect(g_canvas, x, y, w, h, paint);
}

export fn sk_draw_circle(cx: f32, cy: f32, r: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_circle(g_canvas, cx, cy, r, paint);
}

export fn sk_draw_line(x0: f32, y0: f32, x1: f32, y1: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_line(g_canvas, x0, y0, x1, y1, paint);
}

export fn sk_paint_set_linear_gradient_2(paint_h: i32, x0: f32, y0: f32, x1: f32, y1: f32, c0: u32, c1: u32) void {
    const p = paints.get(paint_h);
    if (p != null) {
        const colors = [2]u32{ c0, c1 };
        const stops = [2]f32{ 0.0, 1.0 };
        c.sk_paint_set_linear_gradient(p, x0, y0, x1, y1, &colors, &stops, 2);
    }
}

// ── Path API ──

export fn skia_path_new() i32 {
    const p = c.sk_path_create();
    if (p == null) return 0;
    return paths.alloc(p);
}

export fn skia_path_delete(h: i32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_destroy(p);
    paths.free(h);
}

export fn skia_path_move(h: i32, x: f32, y: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_move_to(p, x, y);
}

export fn skia_path_line(h: i32, x: f32, y: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_line_to(p, x, y);
}

export fn skia_path_cubic(h: i32, c1x: f32, c1y: f32, c2x: f32, c2y: f32, x: f32, y: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_cubic_to(p, c1x, c1y, c2x, c2y, x, y);
}

export fn skia_path_close(h: i32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_close(p);
}

export fn skia_draw_path(path_h: i32, paint_h: i32) void {
    const path = paths.get(path_h);
    const paint = paints.get(paint_h);
    if (g_canvas != null and path != null and paint != null) c.sk_canvas_draw_path(g_canvas, path, paint);
}

// PathOps — boolean operations (union, intersect, difference, xor)
// op: 0=difference, 1=intersect, 2=union, 3=xor, 4=reverse_difference
export fn skia_path_op_combine(a_h: i32, b_h: i32, op: i32) i32 {
    const a = paths.get(a_h);
    const b = paths.get(b_h);
    if (a == null or b == null) return 0;
    const result = c.sk_path_op(a, b, op);
    if (result == null) return 0;
    return paths.alloc(result);
}

export fn sk_draw_round_rect(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_round_rect(g_canvas, x, y, w, h, rx, ry, paint);
}
