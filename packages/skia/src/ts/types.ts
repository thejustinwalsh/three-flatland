/** Stroke line cap style */
export type StrokeCap = 'butt' | 'round' | 'square'

/** Stroke line join style */
export type StrokeJoin = 'miter' | 'round' | 'bevel'

/** Boolean path operation */
export type PathOp = 'difference' | 'intersect' | 'union' | 'xor' | 'reverse-difference'

/** Porter-Duff blend modes */
export type BlendMode =
  | 'clear' | 'src' | 'dst' | 'srcOver' | 'dstOver'
  | 'srcIn' | 'dstIn' | 'srcOut' | 'dstOut'
  | 'srcATop' | 'dstATop' | 'xor' | 'plus'
  | 'modulate' | 'screen' | 'overlay' | 'darken'
  | 'lighten' | 'colorDodge' | 'colorBurn' | 'hardLight'
  | 'softLight' | 'difference' | 'exclusion' | 'multiply'
  | 'hue' | 'saturation' | 'color' | 'luminosity'

/** Blur mask filter style */
export type BlurStyle = 'normal' | 'solid' | 'outer' | 'inner'

/** @internal */
export const BLUR_STYLE: Record<BlurStyle, number> = { normal: 0, solid: 1, outer: 2, inner: 3 }

/** @internal Map string enum to Skia u8 value */
export const STROKE_CAP: Record<StrokeCap, number> = { butt: 0, round: 1, square: 2 }

/** @internal */
export const STROKE_JOIN: Record<StrokeJoin, number> = { miter: 0, round: 1, bevel: 2 }

/** @internal */
export const PATH_OP: Record<PathOp, number> = {
  'difference': 0, 'intersect': 1, 'union': 2, 'xor': 3, 'reverse-difference': 4,
}

/** @internal */
export const BLEND_MODE: Record<BlendMode, number> = {
  clear: 0, src: 1, dst: 2, srcOver: 3, dstOver: 4,
  srcIn: 5, dstIn: 6, srcOut: 7, dstOut: 8,
  srcATop: 9, dstATop: 10, xor: 11, plus: 12,
  modulate: 13, screen: 14, overlay: 15, darken: 16,
  lighten: 17, colorDodge: 18, colorBurn: 19, hardLight: 20,
  softLight: 21, difference: 22, exclusion: 23, multiply: 24,
  hue: 25, saturation: 26, color: 27, luminosity: 28,
}

/** @internal Reverse lookup: numeric value → BlendMode string */
export const BLEND_MODE_REVERSE: Record<number, BlendMode> = Object.fromEntries(Object.entries(BLEND_MODE).map(([k, v]) => [v, k as BlendMode]))

/** @internal Reverse lookup: numeric value → StrokeCap string */
export const STROKE_CAP_REVERSE: Record<number, StrokeCap> = Object.fromEntries(Object.entries(STROKE_CAP).map(([k, v]) => [v, k as StrokeCap]))

/** @internal Reverse lookup: numeric value → StrokeJoin string */
export const STROKE_JOIN_REVERSE: Record<number, StrokeJoin> = Object.fromEntries(Object.entries(STROKE_JOIN).map(([k, v]) => [v, k as StrokeJoin]))

/**
 * Raw WASM export functions used by the wrapper classes.
 * Names match the direct exports from core.zig.
 * @internal
 */
export interface SkiaExports {
  memory: WebAssembly.Memory
  cabi_realloc(oldPtr: number, oldSize: number, align: number, newSize: number): number

  // Context lifecycle
  skia_init(): void
  skia_destroy(): void
  skia_begin_drawing(fboId: number, width: number, height: number): number
  skia_end_drawing(): void
  skia_flush(): void
  skia_reset_gl_state(): void
  skia_debug_init_error(): number

  // Paint
  skia_paint_new(): number
  skia_paint_delete(h: number): void
  skia_paint_color(h: number, r: number, g: number, b: number, a: number): void
  skia_paint_set_fill_style(h: number): void
  skia_paint_set_stroke_style(h: number, width: number): void
  skia_paint_set_stroke_cap(h: number, cap: number): void
  skia_paint_set_stroke_join(h: number, join: number): void
  skia_paint_set_stroke_miter(h: number, limit: number): void
  skia_paint_set_anti_alias(h: number, aa: number): void
  skia_paint_set_blend_mode(h: number, mode: number): void
  skia_paint_set_alpha(h: number, alpha: number): void
  skia_paint_set_dash(h: number, intervalsPtr: number, count: number, phase: number): void
  skia_paint_clear_dash(h: number): void
  skia_paint_get_color(h: number, outPtr: number): void
  skia_paint_get_alpha(h: number): number
  skia_paint_get_blend_mode(h: number): number
  skia_paint_get_stroke_cap(h: number): number
  skia_paint_get_stroke_join(h: number): number
  skia_paint_get_stroke_width(h: number): number
  skia_paint_get_stroke_miter(h: number): number
  skia_paint_get_style(h: number): number
  skia_paint_copy(h: number): number
  skia_paint_set_blur(h: number, sigma: number): void
  skia_paint_set_blur_style(h: number, sigma: number, style: number): void
  skia_paint_clear_blur(h: number): void
  skia_paint_set_linear_gradient_n(h: number, x0: number, y0: number, x1: number, y1: number, colorsPtr: number, stopsPtr: number, count: number): void
  skia_paint_set_radial_gradient(h: number, cx: number, cy: number, r: number, colorsPtr: number, stopsPtr: number, count: number): void
  skia_paint_set_sweep_gradient(h: number, cx: number, cy: number, colorsPtr: number, stopsPtr: number, count: number): void
  skia_paint_clear_shader(h: number): void

  // Path
  skia_path_new(): number
  skia_path_delete(h: number): void
  skia_path_move(h: number, x: number, y: number): void
  skia_path_line(h: number, x: number, y: number): void
  skia_path_quad(h: number, cx: number, cy: number, x: number, y: number): void
  skia_path_cubic(h: number, c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  skia_path_arc(h: number, rx: number, ry: number, rotation: number, large: number, sweep: number, x: number, y: number): void
  skia_path_close(h: number): void
  skia_path_reset(h: number): void
  skia_path_from_svg(svgPtr: number, svgLen: number): number
  skia_path_to_svg(h: number, bufPtr: number, bufLen: number): number
  skia_path_add_rect(h: number, x: number, y: number, w: number, hh: number): void
  skia_path_add_circle(h: number, cx: number, cy: number, r: number): void
  skia_path_add_oval(h: number, x: number, y: number, w: number, hh: number): void
  skia_path_add_rrect(h: number, x: number, y: number, w: number, hh: number, rx: number, ry: number): void
  skia_path_add_arc(h: number, x: number, y: number, w: number, hh: number, start: number, sweep: number): void
  skia_path_add_path(dstH: number, srcH: number): void
  skia_path_get_bounds(h: number, outPtr: number): void
  skia_path_compute_tight_bounds(h: number, outPtr: number): void
  skia_path_contains(h: number, x: number, y: number): number
  skia_path_conic(h: number, cx: number, cy: number, x: number, y: number, w: number): void
  skia_path_transform(h: number, matrixPtr: number): number
  skia_path_copy(h: number): number
  skia_path_is_empty(h: number): number
  skia_path_r_move(h: number, dx: number, dy: number): void
  skia_path_r_line(h: number, dx: number, dy: number): void
  skia_path_r_quad(h: number, dcx: number, dcy: number, dx: number, dy: number): void
  skia_path_r_cubic(h: number, dc1x: number, dc1y: number, dc2x: number, dc2y: number, dx: number, dy: number): void
  skia_path_r_conic(h: number, dcx: number, dcy: number, dx: number, dy: number, w: number): void
  skia_path_offset(h: number, dx: number, dy: number): void
  skia_path_count_points(h: number): number
  skia_path_get_point(h: number, index: number, outPtr: number): void
  skia_path_op_combine(a: number, b: number, op: number): number
  skia_path_simplify(h: number): number

  // Font
  skia_typeface_load(dataPtr: number, dataLen: number): number
  skia_typeface_delete(h: number): void
  skia_font_new(typefaceH: number, size: number): number
  skia_font_delete(h: number): void
  skia_font_set_size(h: number, size: number): void
  skia_measure_text(textPtr: number, textLen: number, fontH: number): number
  skia_font_get_metrics(h: number, outPtr: number): void
  skia_font_get_size(h: number): number
  skia_font_get_glyph_ids(h: number, textPtr: number, textLen: number, outPtr: number, max: number): number
  skia_font_get_glyph_widths(h: number, glyphsPtr: number, count: number, outPtr: number): void

  // Canvas drawing
  skia_canvas_clear(r: number, g: number, b: number, a: number): void
  skia_draw_rect(x: number, y: number, w: number, h: number, paintH: number): void
  skia_draw_round_rect(x: number, y: number, w: number, h: number, rx: number, ry: number, paintH: number): void
  skia_draw_circle(cx: number, cy: number, r: number, paintH: number): void
  skia_draw_oval(x: number, y: number, w: number, h: number, paintH: number): void
  skia_draw_line(x0: number, y0: number, x1: number, y1: number, paintH: number): void
  skia_draw_path(pathH: number, paintH: number): void
  skia_draw_text(textPtr: number, textLen: number, x: number, y: number, fontH: number, paintH: number): void
  skia_canvas_draw_arc(x: number, y: number, w: number, h: number, startAngle: number, sweepAngle: number, useCenter: number, paintH: number): void
  skia_canvas_draw_drrect(ox: number, oy: number, ow: number, oh: number, orx: number, ory: number, ix: number, iy: number, iw: number, ih: number, irx: number, iry: number, paintH: number): void
  skia_canvas_draw_paint(paintH: number): void
  skia_canvas_draw_color(r: number, g: number, b: number, a: number): void

  // Canvas transform
  skia_canvas_save(): void
  skia_canvas_restore(): void
  skia_canvas_translate(x: number, y: number): void
  skia_canvas_rotate(degrees: number): void
  skia_canvas_scale(sx: number, sy: number): void
  skia_canvas_concat_matrix(mPtr: number, count: number): void

  // Canvas clipping
  skia_canvas_clip_rect(x: number, y: number, w: number, h: number): void
  skia_canvas_clip_round_rect(x: number, y: number, w: number, h: number, rx: number, ry: number): void
  skia_canvas_clip_path(pathH: number): void

  // Canvas state
  skia_canvas_get_save_count(): number
  skia_canvas_restore_to_count(count: number): void
  skia_canvas_get_total_matrix(outPtr: number): void
  skia_canvas_read_pixels(x: number, y: number, w: number, h: number, outPtr: number): number

  // Canvas layers
  skia_canvas_save_layer(boundsPtr: number, paintH: number): void
  skia_canvas_save_layer_alpha(boundsPtr: number, alpha: number): void

  // Canvas drawing: points & vertices

  // Canvas drawing: images
  skia_image_from_pixels(pixelsPtr: number, width: number, height: number): number
  skia_image_destroy(h: number): void
  skia_image_width(h: number): number
  skia_image_height(h: number): number
  skia_canvas_draw_image(imageH: number, x: number, y: number, paintH: number): void
  skia_image_read_pixels(h: number, outPtr: number, w: number, hh: number): number
  skia_canvas_draw_image_rect(imageH: number, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number, paintH: number): void

  // Image filters
  skia_imagefilter_blur(sigmaX: number, sigmaY: number, inputH: number): number
  skia_imagefilter_drop_shadow(dx: number, dy: number, sigmaX: number, sigmaY: number, color: number, inputH: number): number
  skia_imagefilter_drop_shadow_only(dx: number, dy: number, sigmaX: number, sigmaY: number, color: number, inputH: number): number
  skia_imagefilter_offset(dx: number, dy: number, inputH: number): number
  skia_imagefilter_color_filter(cfH: number, inputH: number): number
  skia_imagefilter_compose(outerH: number, innerH: number): number
  skia_imagefilter_dilate(radiusX: number, radiusY: number, inputH: number): number
  skia_imagefilter_erode(radiusX: number, radiusY: number, inputH: number): number
  skia_imagefilter_blend(blendMode: number, bgH: number, fgH: number): number
  skia_imagefilter_matrix_transform(matrixPtr: number, sampling: number, inputH: number): number
  skia_imagefilter_destroy(h: number): void

  // Color filters
  skia_colorfilter_blend(color: number, blendMode: number): number
  skia_colorfilter_matrix(matrixPtr: number): number
  skia_colorfilter_compose(outerH: number, innerH: number): number
  skia_colorfilter_lerp(t: number, dstH: number, srcH: number): number
  skia_colorfilter_table(tablePtr: number): number
  skia_colorfilter_table_argb(aPtr: number, rPtr: number, gPtr: number, bPtr: number): number
  skia_colorfilter_linear_to_srgb(): number
  skia_colorfilter_srgb_to_linear(): number
  skia_colorfilter_luma(): number
  skia_colorfilter_destroy(h: number): void

  // Paint: filters
  skia_paint_set_image_filter(paintH: number, filterH: number): void
  skia_paint_clear_image_filter(paintH: number): void
  skia_paint_set_color_filter(paintH: number, filterH: number): void
  skia_paint_clear_color_filter(paintH: number): void

  // Path effects
  skia_patheffect_dash(intervalsPtr: number, count: number, phase: number): number
  skia_patheffect_corner(radius: number): number
  skia_patheffect_discrete(segLength: number, deviation: number, seed: number): number
  skia_patheffect_trim(start: number, stop: number, inverted: number): number
  skia_patheffect_path1d(pathH: number, advance: number, phase: number, style: number): number
  skia_patheffect_path2d(matrixPtr: number, pathH: number): number
  skia_patheffect_compose(outerH: number, innerH: number): number
  skia_patheffect_sum(firstH: number, secondH: number): number
  skia_patheffect_destroy(h: number): void
  skia_paint_set_path_effect(paintH: number, effectH: number): void
  skia_paint_clear_path_effect(paintH: number): void

  // Shaders (general)
  skia_shader_fractal_noise(freqX: number, freqY: number, octaves: number, seed: number): number
  skia_shader_turbulence(freqX: number, freqY: number, octaves: number, seed: number): number
  skia_shader_color(r: number, g: number, b: number, a: number): number
  skia_shader_blend(blendMode: number, dstH: number, srcH: number): number
  skia_shader_linear_gradient(x0: number, y0: number, x1: number, y1: number, colorsPtr: number, stopsPtr: number, count: number): number
  skia_shader_radial_gradient(cx: number, cy: number, r: number, colorsPtr: number, stopsPtr: number, count: number): number
  skia_shader_sweep_gradient(cx: number, cy: number, colorsPtr: number, stopsPtr: number, count: number): number
  skia_shader_two_point_conical_gradient(sx: number, sy: number, sr: number, ex: number, ey: number, er: number, colorsPtr: number, stopsPtr: number, count: number): number
  skia_shader_image(imageH: number, tileX: number, tileY: number): number
  skia_shader_destroy(h: number): void
  skia_paint_set_shader_obj(paintH: number, shaderH: number): void

  // TwoPointConical gradient
  skia_paint_set_two_point_conical_gradient(paintH: number, startX: number, startY: number, startR: number, endX: number, endY: number, endR: number, colorsPtr: number, stopsPtr: number, count: number): void

  // Canvas: skew
  skia_canvas_skew(sx: number, sy: number): void

  // Path: fill type
  skia_path_set_fill_type(pathH: number, fillType: number): void
  skia_path_get_fill_type(pathH: number): number

  // Displacement map filter
  skia_imagefilter_displacement_map(xChannel: number, yChannel: number, scale: number, displacementH: number, colorH: number): number

  // Backdrop layer
  skia_canvas_save_layer_with_backdrop(boundsPtr: number, paintH: number, backdropH: number): void

  // Path measure
  skia_path_measure_create(pathH: number, forceClosed: number): number
  skia_path_measure_destroy(h: number): void
  skia_path_measure_length(h: number): number
  skia_path_measure_get_pos_tan(h: number, distance: number, posPtr: number, tanPtr: number): number

  // Text blob
  skia_text_blob_from_text(textPtr: number, textLen: number, fontH: number): number
  skia_text_blob_from_pos_text(textPtr: number, textLen: number, posPtr: number, fontH: number): number
  skia_text_blob_destroy(h: number): void
  skia_canvas_draw_text_blob(blobH: number, x: number, y: number, paintH: number): void

  // Picture recording
  skia_picture_recorder_create(): number
  skia_picture_recorder_destroy(h: number): void
  skia_picture_recorder_begin(h: number, x: number, y: number, w: number, h2: number): number
  skia_picture_recorder_finish(h: number): number
  skia_picture_destroy(h: number): void
  skia_canvas_draw_picture(picH: number): void

  // Atlas
}
