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
  skia_paint_set_blur(h: number, sigma: number): void
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
  skia_path_op_combine(a: number, b: number, op: number): number
  skia_path_simplify(h: number): number

  // Font
  skia_typeface_load(dataPtr: number, dataLen: number): number
  skia_typeface_delete(h: number): void
  skia_font_new(typefaceH: number, size: number): number
  skia_font_delete(h: number): void
  skia_font_set_size(h: number, size: number): void
  skia_measure_text(textPtr: number, textLen: number, fontH: number): number

  // SVG
  skia_svg_from_string(dataPtr: number, dataLen: number): number
  skia_svg_delete(h: number): void
  skia_svg_get_width(h: number): number
  skia_svg_get_height(h: number): number
  skia_svg_set_size(h: number, w: number, h2: number): void

  // Canvas drawing
  skia_canvas_clear(r: number, g: number, b: number, a: number): void
  skia_draw_rect(x: number, y: number, w: number, h: number, paintH: number): void
  skia_draw_round_rect(x: number, y: number, w: number, h: number, rx: number, ry: number, paintH: number): void
  skia_draw_circle(cx: number, cy: number, r: number, paintH: number): void
  skia_draw_oval(x: number, y: number, w: number, h: number, paintH: number): void
  skia_draw_line(x0: number, y0: number, x1: number, y1: number, paintH: number): void
  skia_draw_path(pathH: number, paintH: number): void
  skia_draw_text(textPtr: number, textLen: number, x: number, y: number, fontH: number, paintH: number): void
  skia_draw_svg(svgH: number): void

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

  // Canvas layers
  skia_canvas_save_layer(boundsPtr: number, paintH: number): void
  skia_canvas_save_layer_alpha(boundsPtr: number, alpha: number): void

  // Canvas drawing: points & vertices
  skia_canvas_draw_points(mode: number, ptsPtr: number, count: number, paintH: number): void
  skia_vertices_create(mode: number, posPtr: number, colorsPtr: number, texPtr: number, vertexCount: number, indicesPtr: number, indexCount: number): number
  skia_vertices_destroy(h: number): void
  skia_canvas_draw_vertices(verticesH: number, blendMode: number, paintH: number): void

  // Canvas drawing: images
  skia_image_from_pixels(pixelsPtr: number, width: number, height: number): number
  skia_image_destroy(h: number): void
  skia_image_width(h: number): number
  skia_image_height(h: number): number
  skia_canvas_draw_image(imageH: number, x: number, y: number, paintH: number): void
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
  skia_imagefilter_destroy(h: number): void

  // Color filters
  skia_colorfilter_blend(color: number, blendMode: number): number
  skia_colorfilter_matrix(matrixPtr: number): number
  skia_colorfilter_compose(outerH: number, innerH: number): number
  skia_colorfilter_linear_to_srgb(): number
  skia_colorfilter_srgb_to_linear(): number
  skia_colorfilter_destroy(h: number): void

  // Paint: filters
  skia_paint_set_image_filter(paintH: number, filterH: number): void
  skia_paint_clear_image_filter(paintH: number): void
  skia_paint_set_color_filter(paintH: number, filterH: number): void
  skia_paint_clear_color_filter(paintH: number): void
}
