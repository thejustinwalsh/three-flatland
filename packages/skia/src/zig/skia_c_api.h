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
typedef void* sk_svg_dom_t;
typedef void* sk_image_filter_t;
typedef void* sk_color_filter_t;
typedef void* sk_image_t;
typedef void* sk_vertices_t;

// ── Context (GrDirectContext) ──

sk_context_t sk_context_create_gl(void);
int sk_context_get_init_error(void);  // 0=ok, 1=MakeWebGL failed, 2=MakeGL failed
int sk_font_debug(void);
void sk_context_destroy(sk_context_t ctx);
void sk_context_flush(sk_context_t ctx);
void sk_context_reset_gl_state(sk_context_t ctx);

// ── Surface ──

sk_surface_t sk_surface_create_from_fbo(sk_context_t ctx, uint32_t fbo_id, int32_t width, int32_t height);
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
void sk_paint_clear_blur(sk_paint_t paint);
void sk_paint_set_linear_gradient(sk_paint_t paint, float x0, float y0, float x1, float y1,
                                   const uint32_t* colors, const float* stops, int count);
void sk_paint_set_radial_gradient(sk_paint_t paint, float cx, float cy, float r,
                                   const uint32_t* colors, const float* stops, int count);
void sk_paint_set_sweep_gradient(sk_paint_t paint, float cx, float cy,
                                  const uint32_t* colors, const float* stops, int count);
void sk_paint_clear_shader(sk_paint_t paint);

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

// ── PathOps ──

// op: 0=difference, 1=intersect, 2=union, 3=xor, 4=reverse_difference
sk_path_t sk_path_op(sk_path_t a, sk_path_t b, int op);
sk_path_t sk_path_simplify(sk_path_t path);

// ── Font & Text ──

sk_typeface_t sk_typeface_from_data(const uint8_t* data, int len);
void sk_typeface_destroy(sk_typeface_t typeface);

sk_font_t sk_font_create(sk_typeface_t typeface, float size);
void sk_font_destroy(sk_font_t font);
void sk_font_set_size(sk_font_t font, float size);
float sk_font_measure_text(sk_font_t font, const char* text, int len);

// ── SVG ──

sk_svg_dom_t sk_svg_dom_from_string(const char* data, int len);
void sk_svg_dom_destroy(sk_svg_dom_t svg);
void sk_svg_dom_get_size(sk_svg_dom_t svg, float* w, float* h);
void sk_svg_dom_set_size(sk_svg_dom_t svg, float w, float h);
void sk_svg_dom_render(sk_svg_dom_t svg, sk_canvas_t canvas);

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

// ── Canvas drawing: points & vertices ──

// mode: 0=points, 1=lines, 2=polygon
void sk_canvas_draw_points(sk_canvas_t canvas, int mode, const float* pts, int count, sk_paint_t paint);

sk_vertices_t sk_vertices_create(int mode, const float* positions, const uint32_t* colors,
                                  const float* texCoords, int vertexCount,
                                  const uint16_t* indices, int indexCount);
void sk_vertices_destroy(sk_vertices_t verts);
void sk_canvas_draw_vertices(sk_canvas_t canvas, sk_vertices_t verts, uint8_t blendMode, sk_paint_t paint);

// ── Canvas drawing: images ──

sk_image_t sk_image_from_pixels(const uint8_t* pixels, int width, int height);
void sk_image_destroy(sk_image_t image);
int sk_image_width(sk_image_t image);
int sk_image_height(sk_image_t image);
void sk_canvas_draw_image(sk_canvas_t canvas, sk_image_t image, float x, float y, sk_paint_t paint);
void sk_canvas_draw_image_rect(sk_canvas_t canvas, sk_image_t image,
                                float sx, float sy, float sw, float sh,
                                float dx, float dy, float dw, float dh, sk_paint_t paint);

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
void sk_imagefilter_destroy(sk_image_filter_t filter);

// ── Color Filters ──

sk_color_filter_t sk_colorfilter_blend(uint32_t color, uint8_t blendMode);
sk_color_filter_t sk_colorfilter_matrix(const float matrix[20]);
sk_color_filter_t sk_colorfilter_compose(sk_color_filter_t outer, sk_color_filter_t inner);
sk_color_filter_t sk_colorfilter_linear_to_srgb(void);
sk_color_filter_t sk_colorfilter_srgb_to_linear(void);
void sk_colorfilter_destroy(sk_color_filter_t filter);

// ── Paint: filter setters ──

void sk_paint_set_image_filter(sk_paint_t paint, sk_image_filter_t filter);
void sk_paint_clear_image_filter(sk_paint_t paint);
void sk_paint_set_color_filter(sk_paint_t paint, sk_color_filter_t filter);
void sk_paint_clear_color_filter(sk_paint_t paint);

#ifdef __cplusplus
}
#endif
