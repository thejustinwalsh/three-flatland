// C API wrapper around Skia C++ classes.
// This is the bridge between Zig (which calls C) and Skia (which is C++).
//
// All Skia objects are opaque pointers. Lifetime is managed by the caller.

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

// ── Opaque handles ──
typedef void* sk_context_t;
typedef void* sk_surface_t;
typedef void* sk_canvas_t;
typedef void* sk_paint_t;
typedef void* sk_path_t;
typedef void* sk_font_t;
typedef void* sk_typeface_t;
typedef void* sk_image_filter_t;
typedef void* sk_color_filter_t;
typedef void* sk_image_t;
typedef void* sk_path_effect_t;
typedef void* sk_shader_t;
typedef void* sk_path_measure_t;
typedef void* sk_text_blob_t;
typedef void* sk_picture_recorder_t;
typedef void* sk_picture_t;

// ── Context ──
// Unified API — same signatures for both GL and Dawn variants.
// Each variant's .cpp provides the implementation.

sk_context_t sk_context_create(uint32_t arg1, uint32_t arg2);
sk_context_t sk_context_create_mock(void);
int sk_context_get_init_error(void);
int sk_font_debug(void);
void sk_context_destroy(sk_context_t ctx);
void sk_context_flush(sk_context_t ctx);
void sk_context_reset_state(sk_context_t ctx);

// ── Surface ──

// target_handle = FBO ID (GL) or texture handle (wgpu)
sk_surface_t sk_surface_create_for_target(sk_context_t ctx, uint32_t target_handle, int32_t width, int32_t height);
sk_surface_t sk_surface_create_raster(int32_t width, int32_t height);
void sk_surface_destroy(sk_surface_t surface);
sk_canvas_t sk_surface_get_canvas(sk_surface_t surface);
void sk_surface_flush(sk_surface_t surface);

// ── Paint ──

sk_paint_t sk_paint_create(void);
void sk_paint_destroy(sk_paint_t paint);
void sk_paint_set_color(sk_paint_t paint, float r, float g, float b, float a);
void sk_paint_set_fill(sk_paint_t paint);
void sk_paint_set_stroke(sk_paint_t paint, float width);
void sk_paint_set_stroke_cap(sk_paint_t paint, uint8_t cap);
void sk_paint_set_stroke_join(sk_paint_t paint, uint8_t join);
void sk_paint_set_stroke_miter(sk_paint_t paint, float limit);
void sk_paint_set_anti_alias(sk_paint_t paint, int aa);
void sk_paint_set_blend_mode(sk_paint_t paint, uint8_t mode);
void sk_paint_set_alpha(sk_paint_t paint, float alpha);
void sk_paint_set_dash(sk_paint_t paint, const float* intervals, int count, float phase);
void sk_paint_clear_dash(sk_paint_t paint);
void sk_paint_set_blur(sk_paint_t paint, float sigma);
void sk_paint_set_blur_style(sk_paint_t paint, float sigma, int style);
void sk_paint_clear_blur(sk_paint_t paint);
void sk_paint_set_linear_gradient(sk_paint_t paint, float x0, float y0, float x1, float y1,
                                   const uint32_t* colors, const float* stops, int count);
void sk_paint_set_radial_gradient(sk_paint_t paint, float cx, float cy, float r,
                                   const uint32_t* colors, const float* stops, int count);
void sk_paint_set_sweep_gradient(sk_paint_t paint, float cx, float cy,
                                  const uint32_t* colors, const float* stops, int count);
void sk_paint_clear_shader(sk_paint_t paint);

// ── Paint getters ──

void sk_paint_get_color(sk_paint_t paint, float* r, float* g, float* b, float* a);
float sk_paint_get_alpha(sk_paint_t paint);
uint8_t sk_paint_get_blend_mode(sk_paint_t paint);
uint8_t sk_paint_get_stroke_cap(sk_paint_t paint);
uint8_t sk_paint_get_stroke_join(sk_paint_t paint);
float sk_paint_get_stroke_width(sk_paint_t paint);
float sk_paint_get_stroke_miter(sk_paint_t paint);
int sk_paint_get_style(sk_paint_t paint); // 0=fill, 1=stroke, 2=strokeAndFill
sk_paint_t sk_paint_copy(sk_paint_t paint);

// ── Path ──

sk_path_t sk_path_create(void);
void sk_path_destroy(sk_path_t path);
void sk_path_move_to(sk_path_t path, float x, float y);
void sk_path_line_to(sk_path_t path, float x, float y);
void sk_path_quad_to(sk_path_t path, float cx, float cy, float x, float y);
void sk_path_cubic_to(sk_path_t path, float c1x, float c1y, float c2x, float c2y, float x, float y);
void sk_path_arc_to(sk_path_t path, float rx, float ry, float rotation, int large_arc, int sweep, float x, float y);
void sk_path_close(sk_path_t path);
void sk_path_reset(sk_path_t path);
// Returns a new path from an SVG path string, or NULL on failure.
sk_path_t sk_path_from_svg_string(const char* svg, int len);
// Writes SVG path string to buf, returns bytes written (excluding null). If buf is NULL, returns required size.
int sk_path_to_svg_string(sk_path_t path, char* buf, int buf_len);

// ── Path: convenience shape additions ──

void sk_path_add_rect(sk_path_t path, float x, float y, float w, float h);
void sk_path_add_circle(sk_path_t path, float cx, float cy, float r);
void sk_path_add_oval(sk_path_t path, float x, float y, float w, float h);
void sk_path_add_rrect(sk_path_t path, float x, float y, float w, float h, float rx, float ry);
void sk_path_add_arc(sk_path_t path, float x, float y, float w, float h, float startAngle, float sweepAngle);
void sk_path_add_path(sk_path_t dst, sk_path_t src);
void sk_path_get_bounds(sk_path_t path, float* out4);
void sk_path_compute_tight_bounds(sk_path_t path, float* out4);
int sk_path_contains(sk_path_t path, float x, float y);
void sk_path_conic_to(sk_path_t path, float cx, float cy, float x, float y, float w);
sk_path_t sk_path_transform(sk_path_t path, const float* matrix9);
sk_path_t sk_path_copy(sk_path_t path);
int sk_path_is_empty(sk_path_t path);
void sk_path_r_move_to(sk_path_t path, float dx, float dy);
void sk_path_r_line_to(sk_path_t path, float dx, float dy);
void sk_path_r_quad_to(sk_path_t path, float dcx, float dcy, float dx, float dy);
void sk_path_r_cubic_to(sk_path_t path, float dc1x, float dc1y, float dc2x, float dc2y, float dx, float dy);
void sk_path_r_conic_to(sk_path_t path, float dcx, float dcy, float dx, float dy, float w);
void sk_path_offset(sk_path_t path, float dx, float dy);
int sk_path_count_points(sk_path_t path);
void sk_path_get_point(sk_path_t path, int index, float* x, float* y);

// ── PathOps ──

// op: 0=difference, 1=intersect, 2=union, 3=xor, 4=reverse_difference
sk_path_t sk_path_op(sk_path_t a, sk_path_t b, int op);
sk_path_t sk_path_simplify(sk_path_t path);

// In-place variants — write result into existing path (no allocation)
int sk_path_op_into(sk_path_t a, sk_path_t b, int op, sk_path_t result);
int sk_path_simplify_into(sk_path_t path, sk_path_t result);
int sk_path_transform_into(sk_path_t path, const float* matrix9, sk_path_t result);

// ── Font & Text ──

sk_typeface_t sk_typeface_from_data(const uint8_t* data, int len);
void sk_typeface_destroy(sk_typeface_t typeface);

sk_font_t sk_font_create(sk_typeface_t typeface, float size);
void sk_font_destroy(sk_font_t font);
void sk_font_set_size(sk_font_t font, float size);
float sk_font_measure_text(sk_font_t font, const char* text, int len);

// ── Font: metrics and glyph info ──

void sk_font_get_metrics(sk_font_t font, float* ascent, float* descent, float* leading);
float sk_font_get_size(sk_font_t font);
int sk_font_get_glyph_ids(sk_font_t font, const char* text, int len, uint16_t* glyphs, int maxGlyphs);
void sk_font_get_glyph_widths(sk_font_t font, const uint16_t* glyphs, int count, float* widths);

// ── Canvas drawing ──

void sk_canvas_clear(sk_canvas_t canvas, float r, float g, float b, float a);
void sk_canvas_draw_rect(sk_canvas_t canvas, float x, float y, float w, float h, sk_paint_t paint);
void sk_canvas_draw_round_rect(sk_canvas_t canvas, float x, float y, float w, float h, float rx, float ry, sk_paint_t paint);
void sk_canvas_draw_circle(sk_canvas_t canvas, float cx, float cy, float r, sk_paint_t paint);
void sk_canvas_draw_oval(sk_canvas_t canvas, float x, float y, float w, float h, sk_paint_t paint);
void sk_canvas_draw_line(sk_canvas_t canvas, float x0, float y0, float x1, float y1, sk_paint_t paint);
void sk_canvas_draw_path(sk_canvas_t canvas, sk_path_t path, sk_paint_t paint);
void sk_canvas_draw_text(sk_canvas_t canvas, const char* text, int len, float x, float y, sk_font_t font, sk_paint_t paint);

// ── Canvas transform ──

void sk_canvas_save(sk_canvas_t canvas);
void sk_canvas_restore(sk_canvas_t canvas);
void sk_canvas_translate(sk_canvas_t canvas, float x, float y);
void sk_canvas_rotate(sk_canvas_t canvas, float degrees);
void sk_canvas_scale(sk_canvas_t canvas, float sx, float sy);
void sk_canvas_concat_matrix(sk_canvas_t canvas, const float* m, int count);

// ── Canvas clipping ──

void sk_canvas_clip_rect(sk_canvas_t canvas, float x, float y, float w, float h);
void sk_canvas_clip_round_rect(sk_canvas_t canvas, float x, float y, float w, float h, float rx, float ry);
void sk_canvas_clip_path(sk_canvas_t canvas, sk_path_t path);

// ── Canvas layers (for group-level effects) ──

void sk_canvas_save_layer(sk_canvas_t canvas, const float* bounds, sk_paint_t paint);
void sk_canvas_save_layer_alpha(sk_canvas_t canvas, const float* bounds, float alpha);

// ── Canvas drawing: images ──

sk_image_t sk_image_from_pixels(const uint8_t* pixels, int width, int height);
void sk_image_destroy(sk_image_t image);
int sk_image_width(sk_image_t image);
int sk_image_height(sk_image_t image);
void sk_canvas_draw_image(sk_canvas_t canvas, sk_image_t image, float x, float y, sk_paint_t paint);
void sk_canvas_draw_image_rect(sk_canvas_t canvas, sk_image_t image,
                                float sx, float sy, float sw, float sh,
                                float dx, float dy, float dw, float dh, sk_paint_t paint);

// ── Canvas: additional drawing ──

void sk_canvas_draw_arc(sk_canvas_t canvas, float x, float y, float w, float h, float startAngle, float sweepAngle, int useCenter, sk_paint_t paint);
void sk_canvas_draw_drrect(sk_canvas_t canvas, float ox, float oy, float ow, float oh, float orx, float ory, float ix, float iy, float iw, float ih, float irx, float iry, sk_paint_t paint);
void sk_canvas_draw_paint(sk_canvas_t canvas, sk_paint_t paint);
void sk_canvas_draw_color(sk_canvas_t canvas, float r, float g, float b, float a);
int sk_canvas_get_save_count(sk_canvas_t canvas);
void sk_canvas_restore_to_count(sk_canvas_t canvas, int count);
void sk_canvas_get_total_matrix(sk_canvas_t canvas, float* out9);
int sk_canvas_read_pixels(sk_canvas_t canvas, int x, int y, int width, int height, uint8_t* pixels);

// ── Image: read pixels ──

int sk_image_read_pixels(sk_image_t image, uint8_t* pixels, int width, int height);

// ── Image Filters ──

sk_image_filter_t sk_imagefilter_blur(float sigmaX, float sigmaY, sk_image_filter_t input);
sk_image_filter_t sk_imagefilter_drop_shadow(float dx, float dy, float sigmaX, float sigmaY,
                                              uint32_t color, sk_image_filter_t input);
sk_image_filter_t sk_imagefilter_drop_shadow_only(float dx, float dy, float sigmaX, float sigmaY,
                                                   uint32_t color, sk_image_filter_t input);
sk_image_filter_t sk_imagefilter_offset(float dx, float dy, sk_image_filter_t input);
sk_image_filter_t sk_imagefilter_color_filter(sk_color_filter_t cf, sk_image_filter_t input);
sk_image_filter_t sk_imagefilter_compose(sk_image_filter_t outer, sk_image_filter_t inner);
sk_image_filter_t sk_imagefilter_dilate(float radiusX, float radiusY, sk_image_filter_t input);
sk_image_filter_t sk_imagefilter_erode(float radiusX, float radiusY, sk_image_filter_t input);
sk_image_filter_t sk_imagefilter_blend(uint8_t blendMode, sk_image_filter_t bg, sk_image_filter_t fg);
sk_image_filter_t sk_imagefilter_matrix_transform(const float* matrix9, int sampling, sk_image_filter_t input);
void sk_imagefilter_destroy(sk_image_filter_t filter);

// ── Color Filters ──

sk_color_filter_t sk_colorfilter_blend(uint32_t color, uint8_t blendMode);
sk_color_filter_t sk_colorfilter_matrix(const float matrix[20]);
sk_color_filter_t sk_colorfilter_compose(sk_color_filter_t outer, sk_color_filter_t inner);
sk_color_filter_t sk_colorfilter_lerp(float t, sk_color_filter_t dst, sk_color_filter_t src);
sk_color_filter_t sk_colorfilter_table(const uint8_t table[256]);
sk_color_filter_t sk_colorfilter_table_argb(const uint8_t a[256], const uint8_t r[256], const uint8_t g[256], const uint8_t b[256]);
sk_color_filter_t sk_colorfilter_linear_to_srgb(void);
sk_color_filter_t sk_colorfilter_srgb_to_linear(void);
sk_color_filter_t sk_colorfilter_luma(void);
void sk_colorfilter_destroy(sk_color_filter_t filter);

// ── Paint: filter setters ──

void sk_paint_set_image_filter(sk_paint_t paint, sk_image_filter_t filter);
void sk_paint_clear_image_filter(sk_paint_t paint);
void sk_paint_set_color_filter(sk_paint_t paint, sk_color_filter_t filter);
void sk_paint_clear_color_filter(sk_paint_t paint);

// ── Path Effects ──

sk_path_effect_t sk_patheffect_dash(const float* intervals, int count, float phase);
sk_path_effect_t sk_patheffect_corner(float radius);
sk_path_effect_t sk_patheffect_discrete(float segLength, float deviation, uint32_t seed);
sk_path_effect_t sk_patheffect_trim(float start, float stop, int inverted);
sk_path_effect_t sk_patheffect_path1d(sk_path_t stampPath, float advance, float phase, int style);
sk_path_effect_t sk_patheffect_compose(sk_path_effect_t outer, sk_path_effect_t inner);
sk_path_effect_t sk_patheffect_sum(sk_path_effect_t first, sk_path_effect_t second);
sk_path_effect_t sk_patheffect_path2d(const float* matrix9, sk_path_t path);
void sk_patheffect_destroy(sk_path_effect_t effect);
void sk_paint_set_path_effect(sk_paint_t paint, sk_path_effect_t effect);
void sk_paint_clear_path_effect(sk_paint_t paint);

// ── Shaders (general) ──

sk_shader_t sk_shader_fractal_noise(float freqX, float freqY, int octaves, float seed);
sk_shader_t sk_shader_turbulence(float freqX, float freqY, int octaves, float seed);
sk_shader_t sk_shader_image(sk_image_t image, int tileX, int tileY);
sk_shader_t sk_shader_color(float r, float g, float b, float a);
sk_shader_t sk_shader_blend(uint8_t blendMode, sk_shader_t dst, sk_shader_t src);
sk_shader_t sk_shader_linear_gradient(float x0, float y0, float x1, float y1, const uint32_t* colors, const float* stops, int count);
sk_shader_t sk_shader_radial_gradient(float cx, float cy, float r, const uint32_t* colors, const float* stops, int count);
sk_shader_t sk_shader_sweep_gradient(float cx, float cy, const uint32_t* colors, const float* stops, int count);
sk_shader_t sk_shader_two_point_conical_gradient(float startX, float startY, float startR, float endX, float endY, float endR, const uint32_t* colors, const float* stops, int count);
void sk_shader_destroy(sk_shader_t shader);
void sk_paint_set_shader_obj(sk_paint_t paint, sk_shader_t shader);

// ── Gradients (additional) ──

void sk_paint_set_two_point_conical_gradient(sk_paint_t paint,
    float startX, float startY, float startR,
    float endX, float endY, float endR,
    const uint32_t* colors, const float* stops, int count);

// ── Canvas: skew ──

void sk_canvas_skew(sk_canvas_t canvas, float sx, float sy);

// ── Path: fill type ──

void sk_path_set_fill_type(sk_path_t path, int fillType);
int sk_path_get_fill_type(sk_path_t path);

// ── Image Filters (additional) ──

sk_image_filter_t sk_imagefilter_displacement_map(int xChannel, int yChannel, float scale,
    sk_image_filter_t displacement, sk_image_filter_t color);

// ── Canvas: backdrop layer ──

void sk_canvas_save_layer_with_backdrop(sk_canvas_t canvas, const float* bounds,
    sk_paint_t paint, sk_image_filter_t backdrop);

// ── Path Measure ──

sk_path_measure_t sk_path_measure_create(sk_path_t path, int forceClosed);
void sk_path_measure_destroy(sk_path_measure_t pm);
float sk_path_measure_length(sk_path_measure_t pm);
int sk_path_measure_get_pos_tan(sk_path_measure_t pm, float distance, float* posOut, float* tanOut);

// ── Text Blob ──

sk_text_blob_t sk_text_blob_from_text(const char* text, int len, sk_font_t font);
sk_text_blob_t sk_text_blob_from_pos_text(const char* text, int len, const float* positions, sk_font_t font);
void sk_text_blob_destroy(sk_text_blob_t blob);
void sk_canvas_draw_text_blob(sk_canvas_t canvas, sk_text_blob_t blob, float x, float y, sk_paint_t paint);

// ── Picture Recording ──

sk_picture_recorder_t sk_picture_recorder_create(void);
void sk_picture_recorder_destroy(sk_picture_recorder_t rec);
sk_canvas_t sk_picture_recorder_begin(sk_picture_recorder_t rec, float x, float y, float w, float h);
sk_picture_t sk_picture_recorder_finish(sk_picture_recorder_t rec);
void sk_picture_destroy(sk_picture_t pic);
void sk_canvas_draw_picture(sk_canvas_t canvas, sk_picture_t pic);

#ifdef __cplusplus
}
#endif
