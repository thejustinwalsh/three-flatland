//! Core Skia binding layer — implements the WIT exports by calling
//! the Skia C API wrapper (skia_c_api.h).

const std = @import("std");
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

// ── Growable handle table ──
//
// Maps integer handles (i32) to C pointers. Each resource type gets its own
// table with an independent ID space. Tables start small (INITIAL_CAP) and
// grow by 2x when exhausted. Growth triggers a console warning via env import
// so users know to dispose unused resources.

const INITIAL_CAP = 256;

// Env import for growth warnings — provided by JS via wasm-loader-shared.ts
extern "env" fn console_warn_handle_growth(table_id: i32, old_cap: i32, new_cap: i32) void;

const alloc = std.heap.wasm_allocator;

const HandleTable = struct {
    fn Table(comptime T: type, comptime table_id: i32) type {
        return struct {
            items: []T = &.{},
            free_list: []i32 = &.{},
            next: i32 = 1,
            free_head: i32 = 0,
            capacity: i32 = 0,

            const Self = @This();

            /// Lazy init — allocate on first use (can't allocate at comptime)
            fn ensureCapacity(self: *Self) void {
                if (self.capacity > 0) return;
                const items = alloc.alloc(T, INITIAL_CAP) catch @panic("HandleTable: OOM on init");
                const flist = alloc.alloc(i32, INITIAL_CAP) catch @panic("HandleTable: OOM on init");
                @memset(items, null);
                @memset(flist, 0);
                self.items = items;
                self.free_list = flist;
                self.capacity = INITIAL_CAP;
            }

            fn grow(self: *Self) void {
                const old_cap = self.capacity;
                const new_cap = old_cap * 2;
                console_warn_handle_growth(table_id, old_cap, new_cap);

                const new_items = alloc.alloc(T, @intCast(new_cap)) catch @panic("HandleTable: OOM on grow");
                const new_flist = alloc.alloc(i32, @intCast(new_cap)) catch @panic("HandleTable: OOM on grow");

                @memcpy(new_items[0..@intCast(old_cap)], self.items);
                @memcpy(new_flist[0..@intCast(old_cap)], self.free_list);
                @memset(new_items[@intCast(old_cap)..], null);
                @memset(new_flist[@intCast(old_cap)..], 0);

                alloc.free(self.items);
                alloc.free(self.free_list);

                self.items = new_items;
                self.free_list = new_flist;
                self.capacity = new_cap;
            }

            fn handleAlloc(self: *Self, ptr: T) i32 {
                self.ensureCapacity();
                // Try free list first (reuse freed handles)
                if (self.free_head > 0) {
                    const h = self.free_head;
                    self.free_head = self.free_list[@intCast(h)];
                    self.items[@intCast(h)] = ptr;
                    return h;
                }
                // Grow if at capacity
                if (self.next >= self.capacity) self.grow();
                const h = self.next;
                self.items[@intCast(h)] = ptr;
                self.next += 1;
                return h;
            }

            fn get(self: *const Self, h: i32) T {
                if (h <= 0 or h >= self.capacity) return null;
                return self.items[@intCast(h)];
            }

            fn handleFree(self: *Self, h: i32) void {
                if (h > 0 and h < self.capacity) {
                    self.items[@intCast(h)] = null;
                    self.free_list[@intCast(h)] = self.free_head;
                    self.free_head = h;
                }
            }

            fn liveCount(self: *const Self) i32 {
                if (self.capacity == 0) return 0;
                var free_count: i32 = 0;
                var node = self.free_head;
                while (node > 0) {
                    free_count += 1;
                    node = self.free_list[@intCast(node)];
                }
                return (self.next - 1) - free_count;
            }
        };
    }
};

// Table IDs — must match TABLE_NAMES order in wasm-loader-shared.ts
const TABLE_PAINTS: i32 = 0;
const TABLE_PATHS: i32 = 1;
const TABLE_FONTS: i32 = 2;
const TABLE_TYPEFACES: i32 = 3;
const TABLE_IMAGEFILTERS: i32 = 4;
const TABLE_COLORFILTERS: i32 = 5;
const TABLE_PATHEFFECTS: i32 = 6;
const TABLE_SHADERS: i32 = 7;
const TABLE_IMAGES: i32 = 8;
const TABLE_PATH_MEASURES: i32 = 9;
const TABLE_TEXT_BLOBS: i32 = 10;
const TABLE_PICTURE_RECORDERS: i32 = 11;
const TABLE_PICTURES: i32 = 12;

var paints = HandleTable.Table(c.sk_paint_t, TABLE_PAINTS){};
var paths = HandleTable.Table(c.sk_path_t, TABLE_PATHS){};
var fonts = HandleTable.Table(c.sk_font_t, TABLE_FONTS){};
var typefaces = HandleTable.Table(c.sk_typeface_t, TABLE_TYPEFACES){};

// ── Context & Surface lifecycle ──

export fn exports_skia_gl_init(config: *c.skia_gl_list_u8_t) void {
    // Config data layout: [arg1: u32, arg2: u32] (8 bytes LE)
    // GL: args unused. Dawn: arg1=device_handle, arg2=queue_handle.
    var arg1: u32 = 0;
    var arg2: u32 = 0;
    if (config.len >= 8) {
        const d: [*]const u8 = config.ptr;
        arg1 = @as(u32, d[0]) | (@as(u32, d[1]) << 8) | (@as(u32, d[2]) << 16) | (@as(u32, d[3]) << 24);
        arg2 = @as(u32, d[4]) | (@as(u32, d[5]) << 8) | (@as(u32, d[6]) << 16) | (@as(u32, d[7]) << 24);
    }
    g_ctx = c.sk_context_create(arg1, arg2);
}

export fn skia_debug_init_error() i32 {
    return c.sk_context_get_init_error();
}

export fn skia_debug_font() i32 {
    return c.sk_font_debug();
}

/// Returns the number of live handles for a given table (by TABLE_* id).
export fn skia_handle_stats(table_id: i32) i32 {
    return switch (table_id) {
        TABLE_PAINTS => paints.liveCount(),
        TABLE_PATHS => paths.liveCount(),
        TABLE_FONTS => fonts.liveCount(),
        TABLE_TYPEFACES => typefaces.liveCount(),
        TABLE_IMAGEFILTERS => imagefilters.liveCount(),
        TABLE_COLORFILTERS => colorfilters.liveCount(),
        TABLE_PATHEFFECTS => patheffects.liveCount(),
        TABLE_SHADERS => shaders.liveCount(),
        TABLE_IMAGES => images.liveCount(),
        TABLE_PATH_MEASURES => path_measures.liveCount(),
        TABLE_TEXT_BLOBS => text_blobs.liveCount(),
        TABLE_PICTURE_RECORDERS => picture_recorders.liveCount(),
        TABLE_PICTURES => pictures.liveCount(),
        else => -1,
    };
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

    g_surface = c.sk_surface_create_for_target(g_ctx, fbo_id, width, height);
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
    ret.__handle = paths.handleAlloc(p);
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
    ret.__handle = paths.handleAlloc(result);
    return ret.__handle != 0;
}

export fn exports_skia_gl_path_simplify(ph: c.skia_gl_borrow_path_t, ret: *c.skia_gl_own_path_t) bool {
    const p = paths.get(ph.__handle);
    if (p == null) return false;
    const result = c.sk_path_simplify(p);
    if (result == null) return false;
    ret.__handle = paths.handleAlloc(result);
    return ret.__handle != 0;
}

// ── Direct paint/font API (bypasses WIT resource model) ──

export fn skia_paint_new() i32 {
    const p = c.sk_paint_create();
    if (p == null) return 0;
    return paints.handleAlloc(p);
}

export fn skia_paint_delete(h: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_destroy(p);
    paints.handleFree(h);
}

export fn skia_paint_color(h: i32, r: f32, g: f32, b: f32, a: f32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_color(p, r, g, b, a);
}

export fn skia_paint_set_fill_style(h: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_fill(p);
}

export fn skia_paint_set_stroke_style(h: i32, width: f32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_stroke(p, width);
}

export fn skia_typeface_load(data_ptr: [*]const u8, data_len: i32) i32 {
    const tf = c.sk_typeface_from_data(data_ptr, data_len);
    if (tf == null) return 0;
    return typefaces.handleAlloc(tf);
}

export fn skia_typeface_delete(h: i32) void {
    const tf = typefaces.get(h);
    if (tf != null) c.sk_typeface_destroy(tf);
    typefaces.handleFree(h);
}

export fn skia_font_new(typeface_h: i32, size: f32) i32 {
    const tf = typefaces.get(typeface_h);
    if (tf == null) return 0;
    const f = c.sk_font_create(tf, size);
    if (f == null) return 0;
    return fonts.handleAlloc(f);
}

export fn skia_font_delete(h: i32) void {
    const f = fonts.get(h);
    if (f != null) c.sk_font_destroy(f);
    fonts.handleFree(h);
}

export fn skia_measure_text(text_ptr: [*]const u8, text_len: i32, font_h: i32) f32 {
    const font = fonts.get(font_h);
    if (font == null) return 0;
    return c.sk_font_measure_text(font, @ptrCast(text_ptr), text_len);
}

export fn skia_draw_text(text_ptr: [*]const u8, text_len: i32, x: f32, y: f32, font_h: i32, paint_h: i32) void {
    const font = fonts.get(font_h);
    const paint = paints.get(paint_h);
    if (g_canvas != null and font != null and paint != null) {
        c.sk_canvas_draw_text(g_canvas, @ptrCast(text_ptr), text_len, x, y, font, paint);
    }
}

export fn skia_draw_rect(x: f32, y: f32, w: f32, h: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_rect(g_canvas, x, y, w, h, paint);
}

export fn skia_draw_circle(cx: f32, cy: f32, r: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_circle(g_canvas, cx, cy, r, paint);
}

export fn skia_draw_line(x0: f32, y0: f32, x1: f32, y1: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_line(g_canvas, x0, y0, x1, y1, paint);
}

// Multi-stop linear gradient: colors and stops are arrays in WASM memory
export fn skia_paint_set_linear_gradient_n(paint_h: i32, x0: f32, y0: f32, x1: f32, y1: f32, colors_ptr: [*]const u32, stops_ptr: [*]const f32, count: i32) void {
    const p = paints.get(paint_h);
    if (p != null and count > 0) {
        c.sk_paint_set_linear_gradient(p, x0, y0, x1, y1, colors_ptr, stops_ptr, count);
    }
}

export fn skia_paint_set_linear_gradient_2(paint_h: i32, x0: f32, y0: f32, x1: f32, y1: f32, c0: u32, c1: u32) void {
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
    return paths.handleAlloc(p);
}

export fn skia_path_delete(h: i32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_destroy(p);
    paths.handleFree(h);
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
    return paths.handleAlloc(result);
}

/// In-place boolean op — writes result into an existing path handle (no allocation).
export fn skia_path_op_into(a_h: i32, b_h: i32, op: i32, result_h: i32) i32 {
    const a = paths.get(a_h);
    const b = paths.get(b_h);
    const out = paths.get(result_h);
    if (a == null or b == null or out == null) return 0;
    return c.sk_path_op_into(a, b, op, out);
}

export fn skia_draw_round_rect(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_round_rect(g_canvas, x, y, w, h, rx, ry, paint);
}

export fn skia_draw_oval(x: f32, y: f32, w: f32, h: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_oval(g_canvas, x, y, w, h, paint);
}


// ── Missing paint properties ──

export fn skia_paint_set_stroke_cap(h: i32, cap: u8) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_stroke_cap(p, cap);
}

export fn skia_paint_set_stroke_join(h: i32, join: u8) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_stroke_join(p, join);
}

export fn skia_paint_set_stroke_miter(h: i32, limit: f32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_stroke_miter(p, limit);
}

export fn skia_paint_set_anti_alias(h: i32, aa: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_anti_alias(p, aa);
}

export fn skia_paint_set_blend_mode(h: i32, mode: u8) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_blend_mode(p, mode);
}

export fn skia_paint_set_alpha(h: i32, alpha: f32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_alpha(p, alpha);
}

export fn skia_paint_set_dash(h: i32, intervals_ptr: [*]const f32, count: i32, phase: f32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_dash(p, intervals_ptr, count, phase);
}

export fn skia_paint_clear_dash(h: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_clear_dash(p);
}

export fn skia_paint_set_blur_style(h: i32, sigma: f32, style: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_blur_style(p, sigma, style);
}

export fn skia_paint_set_blur(h: i32, sigma: f32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_blur(p, sigma);
}

export fn skia_paint_clear_blur(h: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_clear_blur(p);
}

export fn skia_paint_set_radial_gradient(h: i32, cx: f32, cy: f32, r: f32, colors_ptr: [*]const u32, stops_ptr: [*]const f32, count: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_radial_gradient(p, cx, cy, r, colors_ptr, stops_ptr, count);
}

export fn skia_paint_set_sweep_gradient(h: i32, cx: f32, cy: f32, colors_ptr: [*]const u32, stops_ptr: [*]const f32, count: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_set_sweep_gradient(p, cx, cy, colors_ptr, stops_ptr, count);
}

export fn skia_paint_clear_shader(h: i32) void {
    const p = paints.get(h);
    if (p != null) c.sk_paint_clear_shader(p);
}

// ── Missing path operations ──

export fn skia_path_quad(h: i32, cx: f32, cy: f32, x: f32, y: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_quad_to(p, cx, cy, x, y);
}

export fn skia_path_arc(h: i32, rx: f32, ry: f32, rotation: f32, large: i32, sweep: i32, x: f32, y: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_arc_to(p, rx, ry, rotation, large, sweep, x, y);
}

export fn skia_path_reset(h: i32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_reset(p);
}

export fn skia_path_from_svg(svg_ptr: [*]const u8, svg_len: i32) i32 {
    const p = c.sk_path_from_svg_string(@ptrCast(svg_ptr), svg_len);
    return paths.handleAlloc(p);
}

export fn skia_path_to_svg(h: i32, buf_ptr: [*]u8, buf_len: i32) i32 {
    const p = paths.get(h);
    if (p == null) return 0;
    return c.sk_path_to_svg_string(p, @ptrCast(buf_ptr), buf_len);
}

export fn skia_path_simplify(h: i32) i32 {
    const p = paths.get(h);
    if (p == null) return 0;
    return paths.handleAlloc(c.sk_path_simplify(p));
}

/// In-place simplify — writes result into existing path handle.
export fn skia_path_simplify_into(src_h: i32, result_h: i32) i32 {
    const src = paths.get(src_h);
    const out = paths.get(result_h);
    if (src == null or out == null) return 0;
    return c.sk_path_simplify_into(src, out);
}

// ── Missing font operations ──

export fn skia_font_set_size(h: i32, size: f32) void {
    const f = fonts.get(h);
    if (f != null) c.sk_font_set_size(f, size);
}

// ── Canvas transform (direct exports) ──

export fn skia_canvas_save() void { if (g_canvas != null) c.sk_canvas_save(g_canvas); }
export fn skia_canvas_restore() void { if (g_canvas != null) c.sk_canvas_restore(g_canvas); }
export fn skia_canvas_translate(x: f32, y: f32) void { if (g_canvas != null) c.sk_canvas_translate(g_canvas, x, y); }
export fn skia_canvas_rotate(degrees: f32) void { if (g_canvas != null) c.sk_canvas_rotate(g_canvas, degrees); }
export fn skia_canvas_scale(sx: f32, sy: f32) void { if (g_canvas != null) c.sk_canvas_scale(g_canvas, sx, sy); }
export fn skia_canvas_concat_matrix(m_ptr: [*]const f32, count: i32) void { if (g_canvas != null) c.sk_canvas_concat_matrix(g_canvas, m_ptr, count); }

// ── Canvas clipping (direct exports) ──

export fn skia_canvas_clip_rect(x: f32, y: f32, w: f32, h: f32) void { if (g_canvas != null) c.sk_canvas_clip_rect(g_canvas, x, y, w, h); }
export fn skia_canvas_clip_round_rect(x: f32, y: f32, w: f32, h: f32, rx: f32, ry: f32) void { if (g_canvas != null) c.sk_canvas_clip_round_rect(g_canvas, x, y, w, h, rx, ry); }
export fn skia_canvas_clip_path(path_h: i32) void {
    const path = paths.get(path_h);
    if (g_canvas != null and path != null) c.sk_canvas_clip_path(g_canvas, path);
}

// ── Canvas clear (direct export) ──

export fn skia_canvas_clear(r: f32, g: f32, b: f32, a: f32) void { if (g_canvas != null) c.sk_canvas_clear(g_canvas, r, g, b, a); }

// ── Context init/destroy (direct exports matching WIT but simpler signatures) ──

export fn skia_init() void { g_ctx = c.sk_context_create(0, 0); }
export fn skia_init_with_handles(arg1: u32, arg2: u32) void { g_ctx = c.sk_context_create(arg1, arg2); }
export fn skia_init_mock() void {
    g_ctx = c.sk_context_create_mock();
    g_mock = true;
}

var g_mock: bool = false;
export fn skia_destroy() void { exports_skia_gl_destroy(); }
export fn skia_begin_drawing(fbo_id: u32, width: i32, height: i32) i32 {
    if (g_ctx == null) return 0;
    if (g_surface != null) c.sk_surface_destroy(g_surface);
    g_surface = if (g_mock) c.sk_surface_create_raster(width, height) else c.sk_surface_create_for_target(g_ctx, fbo_id, width, height);
    if (g_surface == null) return 0;
    g_canvas = c.sk_surface_get_canvas(g_surface);
    if (g_canvas == null) return 0;
    return 1;
}
export fn skia_end_drawing() void { if (g_surface != null) c.sk_surface_flush(g_surface); }
export fn skia_flush() void { if (g_ctx != null) c.sk_context_flush(g_ctx); }
export fn skia_reset_state() void { if (g_ctx != null) c.sk_context_reset_state(g_ctx); }

// ════════════════════════════════════════════════════════
// Canvas: layers, skew, image, text blob, picture, atlas
// ════════════════════════════════════════════════════════

export fn skia_canvas_save_layer(bounds_ptr: u32, paint_h: i32) void {
    if (g_canvas == null) return;
    const bounds: ?[*]const f32 = if (bounds_ptr != 0) @ptrFromInt(bounds_ptr) else null;
    c.sk_canvas_save_layer(g_canvas, bounds, paints.get(paint_h));
}
export fn skia_canvas_save_layer_alpha(bounds_ptr: u32, alpha: f32) void {
    if (g_canvas == null) return;
    const bounds: ?[*]const f32 = if (bounds_ptr != 0) @ptrFromInt(bounds_ptr) else null;
    c.sk_canvas_save_layer_alpha(g_canvas, bounds, alpha);
}
export fn skia_canvas_save_layer_with_backdrop(bounds_ptr: u32, paint_h: i32, backdrop_h: i32) void {
    if (g_canvas == null) return;
    const bounds: ?[*]const f32 = if (bounds_ptr != 0) @ptrFromInt(bounds_ptr) else null;
    c.sk_canvas_save_layer_with_backdrop(g_canvas, bounds, paints.get(paint_h), imagefilters.get(backdrop_h));
}
export fn skia_canvas_skew(sx: f32, sy: f32) void {
    if (g_canvas != null) c.sk_canvas_skew(g_canvas, sx, sy);
}
export fn skia_canvas_draw_image(image_h: i32, x: f32, y: f32, paint_h: i32) void {
    const img = images.get(image_h);
    if (g_canvas != null and img != null) c.sk_canvas_draw_image(g_canvas, img, x, y, paints.get(paint_h));
}
export fn skia_canvas_draw_image_rect(image_h: i32, sx: f32, sy: f32, sw: f32, sh: f32, dx: f32, dy: f32, dw: f32, dh: f32, paint_h: i32) void {
    const img = images.get(image_h);
    if (g_canvas != null and img != null) c.sk_canvas_draw_image_rect(g_canvas, img, sx, sy, sw, sh, dx, dy, dw, dh, paints.get(paint_h));
}
export fn skia_canvas_draw_text_blob(blob_h: i32, x: f32, y: f32, paint_h: i32) void {
    const blob = text_blobs.get(blob_h);
    const paint = paints.get(paint_h);
    if (g_canvas != null and blob != null and paint != null) c.sk_canvas_draw_text_blob(g_canvas, blob, x, y, paint);
}
export fn skia_canvas_draw_picture(pic_h: i32) void {
    const pic = pictures.get(pic_h);
    if (g_canvas != null and pic != null) c.sk_canvas_draw_picture(g_canvas, pic);
}

// ════════════════════════════════════════════════════════
// Image filter handle table + exports
// ════════════════════════════════════════════════════════

var imagefilters = HandleTable.Table(c.sk_image_filter_t, TABLE_IMAGEFILTERS){};

export fn skia_imagefilter_blur(sigma_x: f32, sigma_y: f32, input_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_blur(sigma_x, sigma_y, imagefilters.get(input_h)));
}
export fn skia_imagefilter_drop_shadow(dx: f32, dy: f32, sigma_x: f32, sigma_y: f32, color: u32, input_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_drop_shadow(dx, dy, sigma_x, sigma_y, color, imagefilters.get(input_h)));
}
export fn skia_imagefilter_drop_shadow_only(dx: f32, dy: f32, sigma_x: f32, sigma_y: f32, color: u32, input_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_drop_shadow_only(dx, dy, sigma_x, sigma_y, color, imagefilters.get(input_h)));
}
export fn skia_imagefilter_offset(dx: f32, dy: f32, input_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_offset(dx, dy, imagefilters.get(input_h)));
}
export fn skia_imagefilter_color_filter(cf_h: i32, input_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_color_filter(colorfilters.get(cf_h), imagefilters.get(input_h)));
}
export fn skia_imagefilter_compose(outer_h: i32, inner_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_compose(imagefilters.get(outer_h), imagefilters.get(inner_h)));
}
export fn skia_imagefilter_dilate(rx: f32, ry: f32, input_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_dilate(rx, ry, imagefilters.get(input_h)));
}
export fn skia_imagefilter_erode(rx: f32, ry: f32, input_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_erode(rx, ry, imagefilters.get(input_h)));
}
export fn skia_imagefilter_displacement_map(x_ch: i32, y_ch: i32, scale: f32, disp_h: i32, color_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_displacement_map(x_ch, y_ch, scale, imagefilters.get(disp_h), imagefilters.get(color_h)));
}
export fn skia_imagefilter_destroy(h: i32) void {
    const f = imagefilters.get(h);
    if (f != null) c.sk_imagefilter_destroy(f);
    imagefilters.handleFree(h);
}

// ════════════════════════════════════════════════════════
// Color filter handle table + exports
// ════════════════════════════════════════════════════════

var colorfilters = HandleTable.Table(c.sk_color_filter_t, TABLE_COLORFILTERS){};

export fn skia_colorfilter_blend(color: u32, blend_mode: u8) i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_blend(color, blend_mode));
}
export fn skia_colorfilter_matrix(matrix_ptr: u32) i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_matrix(@ptrFromInt(matrix_ptr)));
}
export fn skia_colorfilter_compose(outer_h: i32, inner_h: i32) i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_compose(colorfilters.get(outer_h), colorfilters.get(inner_h)));
}
export fn skia_colorfilter_lerp(t: f32, dst_h: i32, src_h: i32) i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_lerp(t, colorfilters.get(dst_h), colorfilters.get(src_h)));
}
export fn skia_colorfilter_table(table_ptr: u32) i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_table(@ptrFromInt(table_ptr)));
}
export fn skia_colorfilter_table_argb(a_ptr: u32, r_ptr: u32, g_ptr: u32, b_ptr: u32) i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_table_argb(@ptrFromInt(a_ptr), @ptrFromInt(r_ptr), @ptrFromInt(g_ptr), @ptrFromInt(b_ptr)));
}
export fn skia_colorfilter_linear_to_srgb() i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_linear_to_srgb());
}
export fn skia_colorfilter_srgb_to_linear() i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_srgb_to_linear());
}
export fn skia_colorfilter_destroy(h: i32) void {
    const f = colorfilters.get(h);
    if (f != null) c.sk_colorfilter_destroy(f);
    colorfilters.handleFree(h);
}

// ════════════════════════════════════════════════════════
// Paint: filter/shader/effect setters
// ════════════════════════════════════════════════════════

export fn skia_paint_set_image_filter(paint_h: i32, filter_h: i32) void {
    const p = paints.get(paint_h);
    if (p != null) c.sk_paint_set_image_filter(p, imagefilters.get(filter_h));
}
export fn skia_paint_clear_image_filter(paint_h: i32) void {
    const p = paints.get(paint_h);
    if (p != null) c.sk_paint_clear_image_filter(p);
}
export fn skia_paint_set_color_filter(paint_h: i32, filter_h: i32) void {
    const p = paints.get(paint_h);
    if (p != null) c.sk_paint_set_color_filter(p, colorfilters.get(filter_h));
}
export fn skia_paint_clear_color_filter(paint_h: i32) void {
    const p = paints.get(paint_h);
    if (p != null) c.sk_paint_clear_color_filter(p);
}
export fn skia_paint_set_path_effect(paint_h: i32, effect_h: i32) void {
    const p = paints.get(paint_h);
    if (p != null) c.sk_paint_set_path_effect(p, patheffects.get(effect_h));
}
export fn skia_paint_clear_path_effect(paint_h: i32) void {
    const p = paints.get(paint_h);
    if (p != null) c.sk_paint_clear_path_effect(p);
}
export fn skia_paint_set_shader_obj(paint_h: i32, shader_h: i32) void {
    const p = paints.get(paint_h);
    if (p != null) c.sk_paint_set_shader_obj(p, shaders.get(shader_h));
}
export fn skia_paint_set_two_point_conical_gradient(paint_h: i32, sx: f32, sy: f32, sr: f32, ex: f32, ey: f32, er: f32, colors_ptr: [*]const u32, stops_ptr: [*]const f32, count: i32) void {
    const p = paints.get(paint_h);
    if (p != null) c.sk_paint_set_two_point_conical_gradient(p, sx, sy, sr, ex, ey, er, colors_ptr, stops_ptr, count);
}

// ════════════════════════════════════════════════════════
// Path effect handle table + exports
// ════════════════════════════════════════════════════════

var patheffects = HandleTable.Table(c.sk_path_effect_t, TABLE_PATHEFFECTS){};

export fn skia_patheffect_dash(intervals_ptr: u32, count: i32, phase: f32) i32 {
    return patheffects.handleAlloc(c.sk_patheffect_dash(@ptrFromInt(intervals_ptr), count, phase));
}
export fn skia_patheffect_corner(radius: f32) i32 {
    return patheffects.handleAlloc(c.sk_patheffect_corner(radius));
}
export fn skia_patheffect_discrete(seg_len: f32, dev: f32, seed: u32) i32 {
    return patheffects.handleAlloc(c.sk_patheffect_discrete(seg_len, dev, seed));
}
export fn skia_patheffect_trim(start: f32, stop: f32, inverted: i32) i32 {
    return patheffects.handleAlloc(c.sk_patheffect_trim(start, stop, inverted));
}
export fn skia_patheffect_path1d(path_h: i32, advance: f32, phase: f32, style: i32) i32 {
    return patheffects.handleAlloc(c.sk_patheffect_path1d(paths.get(path_h), advance, phase, style));
}
export fn skia_patheffect_compose(outer_h: i32, inner_h: i32) i32 {
    return patheffects.handleAlloc(c.sk_patheffect_compose(patheffects.get(outer_h), patheffects.get(inner_h)));
}
export fn skia_patheffect_sum(first_h: i32, second_h: i32) i32 {
    return patheffects.handleAlloc(c.sk_patheffect_sum(patheffects.get(first_h), patheffects.get(second_h)));
}
export fn skia_patheffect_destroy(h: i32) void {
    const f = patheffects.get(h);
    if (f != null) c.sk_patheffect_destroy(f);
    patheffects.handleFree(h);
}

// ════════════════════════════════════════════════════════
// Shader handle table + exports
// ════════════════════════════════════════════════════════

var shaders = HandleTable.Table(c.sk_shader_t, TABLE_SHADERS){};

export fn skia_shader_fractal_noise(freq_x: f32, freq_y: f32, octaves: i32, seed: f32) i32 {
    return shaders.handleAlloc(c.sk_shader_fractal_noise(freq_x, freq_y, octaves, seed));
}
export fn skia_shader_turbulence(freq_x: f32, freq_y: f32, octaves: i32, seed: f32) i32 {
    return shaders.handleAlloc(c.sk_shader_turbulence(freq_x, freq_y, octaves, seed));
}
export fn skia_shader_image(image_h: i32, tile_x: i32, tile_y: i32) i32 {
    return shaders.handleAlloc(c.sk_shader_image(images.get(image_h), tile_x, tile_y));
}
export fn skia_shader_destroy(h: i32) void {
    const s = shaders.get(h);
    if (s != null) c.sk_shader_destroy(s);
    shaders.handleFree(h);
}

// ════════════════════════════════════════════════════════
// Image handle table + exports
// ════════════════════════════════════════════════════════

var images = HandleTable.Table(c.sk_image_t, TABLE_IMAGES){};

export fn skia_image_from_pixels(pixels_ptr: [*]const u8, width: i32, height: i32) i32 {
    return images.handleAlloc(c.sk_image_from_pixels(pixels_ptr, width, height));
}
export fn skia_image_destroy(h: i32) void {
    const img = images.get(h);
    if (img != null) c.sk_image_destroy(img);
    images.handleFree(h);
}
export fn skia_image_width(h: i32) i32 { return c.sk_image_width(images.get(h)); }
export fn skia_image_height(h: i32) i32 { return c.sk_image_height(images.get(h)); }

// ════════════════════════════════════════════════════════
// Path fill type
// ════════════════════════════════════════════════════════

export fn skia_path_set_fill_type(h: i32, fill_type: i32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_set_fill_type(p, fill_type);
}
export fn skia_path_get_fill_type(h: i32) i32 {
    const p = paths.get(h);
    if (p == null) return 0;
    return c.sk_path_get_fill_type(p);
}

// ════════════════════════════════════════════════════════
// Path measure handle table + exports
// ════════════════════════════════════════════════════════

var path_measures = HandleTable.Table(c.sk_path_measure_t, TABLE_PATH_MEASURES){};

export fn skia_path_measure_create(path_h: i32, force_closed: i32) i32 {
    return path_measures.handleAlloc(c.sk_path_measure_create(paths.get(path_h), force_closed));
}
export fn skia_path_measure_destroy(h: i32) void {
    const pm = path_measures.get(h);
    if (pm != null) c.sk_path_measure_destroy(pm);
    path_measures.handleFree(h);
}
export fn skia_path_measure_length(h: i32) f32 {
    const pm = path_measures.get(h);
    if (pm == null) return 0;
    return c.sk_path_measure_length(pm);
}
export fn skia_path_measure_get_pos_tan(h: i32, distance: f32, pos_ptr: u32, tan_ptr: u32) i32 {
    const pm = path_measures.get(h);
    if (pm == null) return 0;
    return c.sk_path_measure_get_pos_tan(pm, distance, @ptrFromInt(pos_ptr), @ptrFromInt(tan_ptr));
}

// ════════════════════════════════════════════════════════
// Text blob handle table + exports
// ════════════════════════════════════════════════════════

var text_blobs = HandleTable.Table(c.sk_text_blob_t, TABLE_TEXT_BLOBS){};

export fn skia_text_blob_from_text(text_ptr: [*]const u8, text_len: i32, font_h: i32) i32 {
    return text_blobs.handleAlloc(c.sk_text_blob_from_text(@ptrCast(text_ptr), text_len, fonts.get(font_h)));
}
export fn skia_text_blob_from_pos_text(text_ptr: [*]const u8, text_len: i32, pos_ptr: u32, font_h: i32) i32 {
    return text_blobs.handleAlloc(c.sk_text_blob_from_pos_text(@ptrCast(text_ptr), text_len, @ptrFromInt(pos_ptr), fonts.get(font_h)));
}
export fn skia_text_blob_destroy(h: i32) void {
    const b = text_blobs.get(h);
    if (b != null) c.sk_text_blob_destroy(b);
    text_blobs.handleFree(h);
}

// ════════════════════════════════════════════════════════
// Picture + recorder handle tables + exports
// ════════════════════════════════════════════════════════

var picture_recorders = HandleTable.Table(c.sk_picture_recorder_t, TABLE_PICTURE_RECORDERS){};
var pictures = HandleTable.Table(c.sk_picture_t, TABLE_PICTURES){};

export fn skia_picture_recorder_create() i32 {
    return picture_recorders.handleAlloc(c.sk_picture_recorder_create());
}
export fn skia_picture_recorder_destroy(h: i32) void {
    const r = picture_recorders.get(h);
    if (r != null) c.sk_picture_recorder_destroy(r);
    picture_recorders.handleFree(h);
}
export fn skia_picture_recorder_begin(h: i32, x: f32, y: f32, w: f32, hh: f32) i32 {
    const r = picture_recorders.get(h);
    if (r == null) return 0;
    // Returns a canvas pointer — we don't track it, just return non-zero to indicate success
    const canvas = c.sk_picture_recorder_begin(r, x, y, w, hh);
    return if (canvas != null) 1 else 0;
}
export fn skia_picture_recorder_finish(h: i32) i32 {
    const r = picture_recorders.get(h);
    if (r == null) return 0;
    return pictures.handleAlloc(c.sk_picture_recorder_finish(r));
}
export fn skia_picture_destroy(h: i32) void {
    const p = pictures.get(h);
    if (p != null) c.sk_picture_destroy(p);
    pictures.handleFree(h);
}

// ════════════════════════════════════════════════════════
// Paint getters
// ════════════════════════════════════════════════════════

export fn skia_paint_get_color(h: i32, out_ptr: u32) void {
    const p = paints.get(h);
    if (p == null) return;
    const out: [*]f32 = @ptrFromInt(out_ptr);
    c.sk_paint_get_color(p, &out[0], &out[1], &out[2], &out[3]);
}
export fn skia_paint_get_alpha(h: i32) f32 {
    const p = paints.get(h);
    if (p == null) return 0;
    return c.sk_paint_get_alpha(p);
}
export fn skia_paint_get_blend_mode(h: i32) i32 {
    const p = paints.get(h);
    if (p == null) return 0;
    return @intCast(c.sk_paint_get_blend_mode(p));
}
export fn skia_paint_get_stroke_cap(h: i32) i32 {
    const p = paints.get(h);
    if (p == null) return 0;
    return @intCast(c.sk_paint_get_stroke_cap(p));
}
export fn skia_paint_get_stroke_join(h: i32) i32 {
    const p = paints.get(h);
    if (p == null) return 0;
    return @intCast(c.sk_paint_get_stroke_join(p));
}
export fn skia_paint_get_stroke_width(h: i32) f32 {
    const p = paints.get(h);
    if (p == null) return 0;
    return c.sk_paint_get_stroke_width(p);
}
export fn skia_paint_get_stroke_miter(h: i32) f32 {
    const p = paints.get(h);
    if (p == null) return 0;
    return c.sk_paint_get_stroke_miter(p);
}
export fn skia_paint_get_style(h: i32) i32 {
    const p = paints.get(h);
    if (p == null) return 0;
    return c.sk_paint_get_style(p);
}
export fn skia_paint_copy(h: i32) i32 {
    const p = paints.get(h);
    if (p == null) return 0;
    const copy = c.sk_paint_copy(p);
    if (copy == null) return 0;
    return paints.handleAlloc(copy);
}

// ════════════════════════════════════════════════════════
// Canvas additions
// ════════════════════════════════════════════════════════

export fn skia_canvas_draw_arc(x: f32, y: f32, w: f32, h: f32, start: f32, sweep: f32, use_center: i32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_arc(g_canvas, x, y, w, h, start, sweep, use_center, paint);
}
export fn skia_canvas_draw_drrect(ox: f32, oy: f32, ow: f32, oh: f32, orx: f32, ory: f32, ix: f32, iy: f32, iw: f32, ih: f32, irx: f32, iry: f32, paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_drrect(g_canvas, ox, oy, ow, oh, orx, ory, ix, iy, iw, ih, irx, iry, paint);
}
export fn skia_canvas_draw_paint(paint_h: i32) void {
    const paint = paints.get(paint_h);
    if (g_canvas != null and paint != null) c.sk_canvas_draw_paint(g_canvas, paint);
}
export fn skia_canvas_draw_color(r: f32, g: f32, b: f32, a: f32) void {
    if (g_canvas != null) c.sk_canvas_draw_color(g_canvas, r, g, b, a);
}
export fn skia_canvas_get_save_count() i32 {
    if (g_canvas == null) return 0;
    return c.sk_canvas_get_save_count(g_canvas);
}
export fn skia_canvas_restore_to_count(count: i32) void {
    if (g_canvas != null) c.sk_canvas_restore_to_count(g_canvas, count);
}
export fn skia_canvas_get_total_matrix(out_ptr: u32) void {
    if (g_canvas == null) return;
    const out: [*]f32 = @ptrFromInt(out_ptr);
    c.sk_canvas_get_total_matrix(g_canvas, out);
}
export fn skia_canvas_read_pixels(x: i32, y: i32, w: i32, h: i32, out_ptr: u32) i32 {
    if (g_canvas == null) return 0;
    return c.sk_canvas_read_pixels(g_canvas, x, y, w, h, @ptrFromInt(out_ptr));
}

// ════════════════════════════════════════════════════════
// Path additions
// ════════════════════════════════════════════════════════

export fn skia_path_add_rect(h: i32, x: f32, y: f32, w: f32, hh: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_add_rect(p, x, y, w, hh);
}
export fn skia_path_add_circle(h: i32, cx: f32, cy: f32, r: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_add_circle(p, cx, cy, r);
}
export fn skia_path_add_oval(h: i32, x: f32, y: f32, w: f32, hh: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_add_oval(p, x, y, w, hh);
}
export fn skia_path_add_rrect(h: i32, x: f32, y: f32, w: f32, hh: f32, rx: f32, ry: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_add_rrect(p, x, y, w, hh, rx, ry);
}
export fn skia_path_add_arc(h: i32, x: f32, y: f32, w: f32, hh: f32, start: f32, sweep: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_add_arc(p, x, y, w, hh, start, sweep);
}
export fn skia_path_add_path(dst_h: i32, src_h: i32) void {
    const dst = paths.get(dst_h);
    const src = paths.get(src_h);
    if (dst != null and src != null) c.sk_path_add_path(dst, src);
}
export fn skia_path_get_bounds(h: i32, out_ptr: u32) void {
    const p = paths.get(h);
    if (p == null) return;
    const out: [*]f32 = @ptrFromInt(out_ptr);
    c.sk_path_get_bounds(p, out);
}
export fn skia_path_compute_tight_bounds(h: i32, out_ptr: u32) void {
    const p = paths.get(h);
    if (p == null) return;
    const out: [*]f32 = @ptrFromInt(out_ptr);
    c.sk_path_compute_tight_bounds(p, out);
}
export fn skia_path_contains(h: i32, x: f32, y: f32) i32 {
    const p = paths.get(h);
    if (p == null) return 0;
    return c.sk_path_contains(p, x, y);
}
export fn skia_path_conic(h: i32, cx: f32, cy: f32, x: f32, y: f32, w: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_conic_to(p, cx, cy, x, y, w);
}
export fn skia_path_transform(h: i32, matrix_ptr: u32) i32 {
    const p = paths.get(h);
    if (p == null) return 0;
    const result = c.sk_path_transform(p, @as([*]const f32, @ptrFromInt(matrix_ptr)));
    if (result == null) return 0;
    return paths.handleAlloc(result);
}

/// In-place transform — writes result into existing path handle.
export fn skia_path_transform_into(src_h: i32, matrix_ptr: u32, result_h: i32) i32 {
    const src = paths.get(src_h);
    const out = paths.get(result_h);
    if (src == null or out == null) return 0;
    return c.sk_path_transform_into(src, @as([*]const f32, @ptrFromInt(matrix_ptr)), out);
}
export fn skia_path_copy(h: i32) i32 {
    const p = paths.get(h);
    if (p == null) return 0;
    const copy = c.sk_path_copy(p);
    if (copy == null) return 0;
    return paths.handleAlloc(copy);
}
export fn skia_path_is_empty(h: i32) i32 {
    const p = paths.get(h);
    if (p == null) return 1;
    return c.sk_path_is_empty(p);
}
export fn skia_path_r_move(h: i32, dx: f32, dy: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_r_move_to(p, dx, dy);
}
export fn skia_path_r_line(h: i32, dx: f32, dy: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_r_line_to(p, dx, dy);
}
export fn skia_path_r_quad(h: i32, dcx: f32, dcy: f32, dx: f32, dy: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_r_quad_to(p, dcx, dcy, dx, dy);
}
export fn skia_path_r_cubic(h: i32, dc1x: f32, dc1y: f32, dc2x: f32, dc2y: f32, dx: f32, dy: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_r_cubic_to(p, dc1x, dc1y, dc2x, dc2y, dx, dy);
}
export fn skia_path_r_conic(h: i32, dcx: f32, dcy: f32, dx: f32, dy: f32, w: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_r_conic_to(p, dcx, dcy, dx, dy, w);
}
export fn skia_path_offset(h: i32, dx: f32, dy: f32) void {
    const p = paths.get(h);
    if (p != null) c.sk_path_offset(p, dx, dy);
}
export fn skia_path_count_points(h: i32) i32 {
    const p = paths.get(h);
    if (p == null) return 0;
    return c.sk_path_count_points(p);
}
export fn skia_path_get_point(h: i32, index: i32, out_ptr: u32) void {
    const p = paths.get(h);
    if (p == null) return;
    const out: [*]f32 = @ptrFromInt(out_ptr);
    c.sk_path_get_point(p, index, &out[0], &out[1]);
}

// ════════════════════════════════════════════════════════
// Font additions
// ════════════════════════════════════════════════════════

export fn skia_font_get_metrics(h: i32, out_ptr: u32) void {
    const f = fonts.get(h);
    if (f == null) return;
    const out: [*]f32 = @ptrFromInt(out_ptr);
    c.sk_font_get_metrics(f, &out[0], &out[1], &out[2]);
}
export fn skia_font_get_size(h: i32) f32 {
    const f = fonts.get(h);
    if (f == null) return 0;
    return c.sk_font_get_size(f);
}
export fn skia_font_get_glyph_ids(h: i32, text_ptr: [*]const u8, text_len: i32, out_ptr: u32, max: i32) i32 {
    const f = fonts.get(h);
    if (f == null) return 0;
    return c.sk_font_get_glyph_ids(f, @ptrCast(text_ptr), text_len, @ptrFromInt(out_ptr), max);
}
export fn skia_font_get_glyph_widths(h: i32, glyphs_ptr: u32, count: i32, out_ptr: u32) void {
    const f = fonts.get(h);
    if (f == null) return;
    c.sk_font_get_glyph_widths(f, @ptrFromInt(glyphs_ptr), count, @ptrFromInt(out_ptr));
}

// ════════════════════════════════════════════════════════
// Image additions
// ════════════════════════════════════════════════════════

export fn skia_image_read_pixels(h: i32, out_ptr: u32, w: i32, ih: i32) i32 {
    const img = images.get(h);
    if (img == null) return 0;
    return c.sk_image_read_pixels(img, @ptrFromInt(out_ptr), w, ih);
}

// ════════════════════════════════════════════════════════
// ColorFilter addition
// ════════════════════════════════════════════════════════

export fn skia_colorfilter_luma() i32 {
    return colorfilters.handleAlloc(c.sk_colorfilter_luma());
}

// ════════════════════════════════════════════════════════
// Shader additions
// ════════════════════════════════════════════════════════

export fn skia_shader_color(r: f32, g: f32, b: f32, a: f32) i32 {
    return shaders.handleAlloc(c.sk_shader_color(r, g, b, a));
}
export fn skia_shader_blend(blend_mode: u8, dst_h: i32, src_h: i32) i32 {
    return shaders.handleAlloc(c.sk_shader_blend(blend_mode, shaders.get(dst_h), shaders.get(src_h)));
}
export fn skia_shader_linear_gradient(x0: f32, y0: f32, x1: f32, y1: f32, colors_ptr: u32, stops_ptr: u32, count: i32) i32 {
    return shaders.handleAlloc(c.sk_shader_linear_gradient(x0, y0, x1, y1, @ptrFromInt(colors_ptr), @ptrFromInt(stops_ptr), count));
}
export fn skia_shader_radial_gradient(cx: f32, cy: f32, r: f32, colors_ptr: u32, stops_ptr: u32, count: i32) i32 {
    return shaders.handleAlloc(c.sk_shader_radial_gradient(cx, cy, r, @ptrFromInt(colors_ptr), @ptrFromInt(stops_ptr), count));
}
export fn skia_shader_sweep_gradient(cx: f32, cy: f32, colors_ptr: u32, stops_ptr: u32, count: i32) i32 {
    return shaders.handleAlloc(c.sk_shader_sweep_gradient(cx, cy, @ptrFromInt(colors_ptr), @ptrFromInt(stops_ptr), count));
}
export fn skia_shader_two_point_conical_gradient(sx: f32, sy: f32, sr: f32, ex: f32, ey: f32, er: f32, colors_ptr: u32, stops_ptr: u32, count: i32) i32 {
    return shaders.handleAlloc(c.sk_shader_two_point_conical_gradient(sx, sy, sr, ex, ey, er, @ptrFromInt(colors_ptr), @ptrFromInt(stops_ptr), count));
}

// ════════════════════════════════════════════════════════
// ImageFilter additions
// ════════════════════════════════════════════════════════

export fn skia_imagefilter_blend(blend_mode: u8, bg_h: i32, fg_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_blend(blend_mode, imagefilters.get(bg_h), imagefilters.get(fg_h)));
}
export fn skia_imagefilter_matrix_transform(matrix_ptr: u32, sampling: i32, input_h: i32) i32 {
    return imagefilters.handleAlloc(c.sk_imagefilter_matrix_transform(@ptrFromInt(matrix_ptr), sampling, imagefilters.get(input_h)));
}

// ════════════════════════════════════════════════════════
// PathEffect addition
// ════════════════════════════════════════════════════════

export fn skia_patheffect_path2d(matrix_ptr: u32, path_h: i32) i32 {
    return patheffects.handleAlloc(c.sk_patheffect_path2d(@ptrFromInt(matrix_ptr), paths.get(path_h)));
}
