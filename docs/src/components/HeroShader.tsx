import { useEffect, useRef } from 'react'

/**
 * HeroShader — WebGL2 fragment-shader hero background. Animated
 * gem-palette ambient motion with mouse-driven dynamic light, the
 * whole composition snapped to a 4-CSS-pixel grid + Bayer-4x4
 * ordered dither so it reads as crafted pixel art instead of a
 * smooth gradient hero.
 *
 * The pixelate + bayer-dither math mirrors three-flatland's TSL
 * nodes (packages/nodes/src/sprite/pixelate.ts +
 * packages/nodes/src/retro/bayerDither.ts) — same algorithms, just
 * inlined in GLSL because this hero is a one-off fullscreen quad
 * with no Three.js renderer. If the hero ever ports to a TSL scene
 * the inline math swaps 1:1 with the node calls.
 *
 * Inputs: time + mouse + resolution + scene-angle (read from CSS var
 * each frame so the global day-cycle drives the shader's directional
 * light) + pixel size in device pixels (4 * DPR). Pointer leave
 * releases the mouse light gracefully.
 *
 * Falls back gracefully when WebGL2 is unavailable.
 */
export default function HeroShader() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false })
    if (!ctx) return
    /* Narrowed non-null aliases — TypeScript can't always carry narrowing
     * through closures defined later in this useEffect, so we capture
     * post-null-check references that the helpers and rAF loop close over. */
    const gl: WebGL2RenderingContext = ctx
    const cvs: HTMLCanvasElement = canvas

    const vertSrc = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

    const fragSrc = `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;       // 0..1
uniform float u_mouse_active; // 0..1
uniform float u_press;       // 0..1 (pointerdown / touchstart)
uniform float u_press_time;  // seconds since current press began (0 when not pressed)
uniform float u_scene_angle; // radians
uniform float u_pixel_size;  // device pixels per "big pixel" (4 * DPR)

// Gem palette — seeded from CSS tokens at runtime (and re-seeded on
// theme change) so the shader tracks the active mode's gem tuning.
// Light + dark modes use different OKLCH tokens (see theme.css); JS
// converts OKLab→linear sRGB→gamma-encoded sRGB and uploads as uniforms.
// The OVERLAY UI is dark-mode locked (see .hero-fullscreen overrides in
// index.mdx) but the canvas behind it shifts gem hue with the theme.
// u_bg is intentionally a separate uniform — kept dark always so the
// dark-mode overlay text remains readable. Override its source in JS
// if the shader is ever meant to fully theme-track.
uniform vec3 u_gold;
uniform vec3 u_ruby;
uniform vec3 u_emerald;
uniform vec3 u_diamond;
uniform vec3 u_amethyst;
uniform vec3 u_pink;
uniform vec3 u_salmon;
uniform vec3 u_bg;

out vec4 fragColor;

// Alias for readability — these were "const vec3 C_*" before.
#define C_GOLD     u_gold
#define C_RUBY     u_ruby
#define C_EMERALD  u_emerald
#define C_DIAMOND  u_diamond
#define C_AMETHYST u_amethyst
#define C_PINK     u_pink
#define C_SALMON   u_salmon
#define C_BG       u_bg

// IQ's classic 2D simplex-ish hash + value noise (cheap, smooth).
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
// Domain-warped fbm — gives the "gem flow" organic feel.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.0 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  // ────────────────────────────────────────────────────────────────
  // PIXELATE — snap fragment coord to a 1-CSS-pixel grid (i.e.
  // effectively no spatial quantization at DPR=1, 0.5 CSS at DPR=2).
  // Spatial chunkiness is off; the dither pattern alone carries the
  // "pixel art" character. Bumping u_pixel_size to 4/8/16 brings
  // back the chunky retro feel at whatever big-pixel size.
  //
  // Mirrors three-flatland's TSL pixelate node:
  //   pixelate(uv, resolution / u_pixel_size, [0.5, 0.5])
  // from packages/nodes/src/sprite/pixelate.ts. The +0.5*pixelSize
  // offset matches the node's halfPixel pivot recentering. Authored
  // in GLSL here only because the hero is a one-off WebGL2 fullscreen
  // quad with no Three.js renderer — same math, same visual.
  // ────────────────────────────────────────────────────────────────
  vec2 pixCoord = floor(gl_FragCoord.xy / u_pixel_size) * u_pixel_size + u_pixel_size * 0.5;
  vec2 uv = pixCoord / u_res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_res.x / u_res.y;

  float t = u_time * 0.05;

  // MOUSE-AS-FORCE-FIELD — cursor acts like a soft repulsive field.
  // Two-stage push:
  //   • HOVER (u_mouse_active) — subtle ambient breathing as the
  //     cursor passes through. Tight radius (0.7), low amplitude
  //     (0.10) — you feel it, you don't see-it-see-it.
  //   • PRESS (u_press) — a firm "punch" with much wider radius
  //     (1.1) and higher amplitude (0.38). Combined with the void
  //     mask near end-of-pipeline this clears the gems out from
  //     under the cursor, leaving a black hole.
  // We sample noise from a position INWARD of p (toward the mouse),
  // so the gem pattern that "would have been" near the cursor appears
  // pushed OUT to where p is — visually the gems flow away from the
  // cursor like particles fleeing a force field.
  vec2 m = u_mouse * 2.0 - 1.0;
  m.x *= u_res.x / u_res.y;
  vec2 mouseOffset = p - m;
  float md = length(mouseOffset);

  // Hover falloff — tight quadratic edge, peaks at cursor.
  float falloffHover = 1.0 - smoothstep(0.0, 0.7, md);
  falloffHover = falloffHover * falloffHover;
  float pushHover = falloffHover * u_mouse_active * 0.10;

  // Press falloff — wider, harder push out.
  float falloffPress = 1.0 - smoothstep(0.0, 1.1, md);
  falloffPress = falloffPress * falloffPress;
  float pushPress = falloffPress * u_press * 0.38;

  float push = pushHover + pushPress;
  // SAMPLE FROM CLOSER TO CURSOR than p — this is the inverse of
  // pushing pp away. Effect: noise that "lives" near the cursor gets
  // sampled at p (further out), so visually the gem pattern is
  // displaced away from the cursor.
  vec2 pp = p - (md > 0.0001 ? normalize(mouseOffset) : vec2(0.0)) * push;

  // ────────────────────────────────────────────────────────────────
  // BLACK-HOLE SWIRL — while pressed, rotate the sample position
  // around the cursor by an angle that grows with both proximity
  // (closer = more rotation, Kepler-style angular velocity) and
  // press-time (continuous spin while held). The radial push above
  // pulls the gem mass outward; this twist drags the edge tangentially
  // around the void — together they read as "fluid being sucked into
  // a spinning black hole."
  //
  // u_press_time resets to 0 on each press onset (JS side), so every
  // press starts the swirl from rest — no jarring jump when the
  // shader re-engages after a long idle.
  // ────────────────────────────────────────────────────────────────
  float swirlFalloff = 1.0 - smoothstep(0.0, 1.05, md);
  swirlFalloff = pow(swirlFalloff, 1.4);
  // Angular velocity: ~2.8 rad/s at the cursor, fading out by radius
  // 1.05. The +0.6 baseline gives a small instantaneous twist on
  // press onset (before pressTime accumulates) so the rotation
  // doesn't read as "delayed" right when you click.
  float swirlAngle = swirlFalloff * u_press * (u_press_time * 2.8 + 0.6);
  vec2 ofs = pp - m;
  float scs = cos(swirlAngle);
  float ssn = sin(swirlAngle);
  pp = m + vec2(scs * ofs.x - ssn * ofs.y, ssn * ofs.x + scs * ofs.y);

  // Domain-warp layer (sampled at PERTURBED pp) — gems flow around
  // the cursor naturally because subsequent fbm() calls sample from pp.
  vec2 q = vec2(
    fbm(pp + vec2(0.0, t)),
    fbm(pp + vec2(5.2, t * 1.3 + 1.3))
  );
  vec2 r = vec2(
    fbm(pp + 4.0 * q + vec2(1.7, 9.2 + t * 0.6)),
    fbm(pp + 4.0 * q + vec2(8.3, 2.8 - t * 0.4))
  );

  // Layered gem masks — each at different freq offset, all sampling pp
  // so the cursor disturbance propagates through every layer.
  float m1 = smoothstep(0.20, 0.55, fbm(pp * 1.2 + r * 0.5 + vec2(t,  t * 0.7)));
  float m2 = smoothstep(0.25, 0.60, fbm(pp * 1.6 - r * 0.4 + vec2(-t, t * 0.4)));
  float m3 = smoothstep(0.30, 0.65, fbm(pp * 0.9 + r * 0.7 + vec2(t * 0.6, -t)));
  float m4 = smoothstep(0.35, 0.70, fbm(pp * 2.1 - r * 0.3 + vec2(-t * 1.2, t * 0.5)));

  // Composite gems on near-black background.
  vec3 col = C_BG;
  col = mix(col, C_AMETHYST, m1 * 0.55);
  col = mix(col, C_DIAMOND,  m2 * 0.50);
  col = mix(col, C_EMERALD,  m3 * 0.45);
  col = mix(col, C_PINK,     m4 * 0.42);

  // Scene-light directional sheen — gem accent shifts by the global
  // scene-angle. Aligned to the scene-angle vector projected onto p.
  vec2 ldir = vec2(sin(u_scene_angle), cos(u_scene_angle));
  float dirShade = dot(p, ldir) * 0.18 + 0.5;
  col += C_GOLD * smoothstep(0.55, 0.95, dirShade) * 0.35;
  col -= 0.10 * smoothstep(0.0, 0.5, 1.0 - dirShade);

  // Side vignette removed — let the gem flow run to the canvas edges.
  // The bottom horizon is still handled by the .hero-overlay ::after
  // CSS linear-gradient alpha fade in index.mdx, which transitions
  // into the page background cleanly.

  // ────────────────────────────────────────────────────────────────
  // BAYER 4x4 ORDERED DITHER + POSTERIZE — quantize the smooth gem
  // gradients into a stepped palette with a classic 4x4 Bayer
  // threshold pattern breaking up the bands. Replaces the previous
  // hash-based film grain: ordered dither lands far cleaner inside
  // the chunky-pixel canvas (random noise per device pixel would
  // jitter inside each big-pixel block — Bayer is deterministic per
  // big-pixel, so the dither pattern is part of the pixel-art look).
  //
  // Mirrors three-flatland's TSL bayerDither4x4 node:
  //   bayerDither4x4(vec4(col, 1.0), 6.0, u_pixel_size)
  // from packages/nodes/src/retro/bayerDither.ts. The /u_pixel_size
  // anchors the 4x4 pattern to the big-pixel grid (one threshold
  // sample per big-pixel; full pattern tiles every 16 device pixels).
  // ────────────────────────────────────────────────────────────────
  float bayer4[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  int bx = int(mod(floor(gl_FragCoord.x / u_pixel_size), 4.0));
  int by = int(mod(floor(gl_FragCoord.y / u_pixel_size), 4.0));
  float threshold = bayer4[by * 4 + bx] / 16.0;

  // 6 levels per channel — enough fidelity that gem identities
  // (gold / ruby / emerald / amethyst / diamond / pink) read
  // distinctly, but coarse enough that the dither pattern is visibly
  // doing work in transition zones.
  //
  // The *maxBrightness* multiplier on the quantized result is load-
  // bearing for text legibility. Without it, posterize promotes
  // anything within 1/6 (~0.17) of full brightness UP to a pure 1.0
  // quantized level — hard white-ish big-pixels that compete with
  // the hero title for visual mass. By rescaling the quantized
  // 0..1 range down to 0..0.75, the brightest possible big-pixel
  // tops out at ~75% gray and the hero title's text-shadow halo
  // can carry the contrast. Gem identities stay intact because the
  // scale is uniform across channels.
  float levels = 6.0;
  float maxBrightness = 0.75;
  vec3 quantized = floor(col * (levels - 1.0) + threshold) / (levels - 1.0);
  col = clamp(quantized, 0.0, 1.0) * maxBrightness;

  // ────────────────────────────────────────────────────────────────
  // PRESS VOID — bg-colored hole at cursor when pressed. Applied
  // AFTER posterize so the hole is dither-free, not a dithered patch.
  // Mixes back to u_bg (theme-aware) rather than pure-black so the
  // hole reads as "back to the surface, no gems" in light mode too —
  // a pure-black void on the lifted charcoal bg would look like a
  // separate darker plane underneath instead of a clean punch.
  // Releases as the finger lifts (u_press eases to 0 over ~150ms).
  // ────────────────────────────────────────────────────────────────
  float voidRadius = 0.45;
  float voidMask = 1.0 - smoothstep(0.0, voidRadius, md);
  voidMask = pow(voidMask, 2.5) * u_press;
  col = mix(col, u_bg, voidMask);

  fragColor = vec4(col, 1.0);
}
`

    function compile(type: number, src: string): WebGLShader | null {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh)
        // eslint-disable-next-line no-console
        console.error('[HeroShader]', log)
        gl.deleteShader(sh)
        return null
      }
      return sh
    }

    const vs = compile(gl.VERTEX_SHADER, vertSrc)
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc)
    if (!vs || !fs) return

    const prog = gl.createProgram()
    if (!prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      // eslint-disable-next-line no-console
      console.error('[HeroShader]', gl.getProgramInfoLog(prog))
      return
    }

    // Fullscreen quad as a single triangle covering NDC.
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uMouse = gl.getUniformLocation(prog, 'u_mouse')
    const uMouseActive = gl.getUniformLocation(prog, 'u_mouse_active')
    const uPress = gl.getUniformLocation(prog, 'u_press')
    const uPressTime = gl.getUniformLocation(prog, 'u_press_time')
    const uSceneAngle = gl.getUniformLocation(prog, 'u_scene_angle')
    const uPixelSize = gl.getUniformLocation(prog, 'u_pixel_size')

    /* `root` — shared shorthand for the documentElement. Hosts both the
     * `--scene-angle` CSS var (driven by motion.ts) and the gem tokens
     * (--gold, --diamond, etc.) plus the `data-theme` attribute. Declared
     * here so the gem-uniform block below + readSceneAngleRad below + the
     * MutationObserver can all share one reference. */
    const root = document.documentElement

    // ────────────────────────────────────────────────────────────────
    // Gem palette uniforms — seeded from CSS gem tokens (OKLCH) at
    // init AND re-seeded whenever the active theme changes. The
    // OVERLAY UI is dark-mode locked, but the canvas gem flow tracks
    // whichever mode the page is in, since light + dark have
    // intentionally different OKLCH tunings (see theme.css).
    //
    // u_bg is a special case: kept on the dark-mode background ALWAYS
    // so the dark-mode-locked overlay text stays readable against the
    // canvas. If the shader is ever meant to fully theme-track, change
    // bgFallback below to read from --background instead.
    // ────────────────────────────────────────────────────────────────
    const gemUniforms = {
      gold:     gl.getUniformLocation(prog, 'u_gold'),
      ruby:     gl.getUniformLocation(prog, 'u_ruby'),
      emerald:  gl.getUniformLocation(prog, 'u_emerald'),
      diamond:  gl.getUniformLocation(prog, 'u_diamond'),
      amethyst: gl.getUniformLocation(prog, 'u_amethyst'),
      pink:     gl.getUniformLocation(prog, 'u_pink'),
      salmon:   gl.getUniformLocation(prog, 'u_salmon'),
      bg:       gl.getUniformLocation(prog, 'u_bg'),
    }

    /** Fallback sRGB triplets — match the dark-mode OKLCH tokens, so
     * if a `getComputedStyle` read fails (e.g., CSS variable not yet
     * resolved during the first paint) the shader still renders in a
     * sensible palette instead of showing a pure-black canvas. */
    const fallback: Record<string, [number, number, number]> = {
      gold:     [0.824, 0.605, 0.000],
      ruby:     [0.922, 0.237, 0.402],
      emerald:  [0.000, 0.765, 0.546],
      diamond:  [0.000, 0.770, 0.912],
      amethyst: [0.598, 0.358, 1.000],
      pink:     [0.911, 0.459, 0.775],
      salmon:   [0.954, 0.337, 0.182],
      bg:       [0.061, 0.070, 0.079],
    }

    /** Light-mode shader background — charcoal lifted clearly off pure
     * void so the hero surface reads as "dark plane, deliberately," not
     * "black hole." Hue matches the dark-mode bg family (250) but at
     * OKLCH L=42%, which leaves enough contrast headroom for the
     * dark-mode-locked overlay text (white-ish) to stay 4.5:1 readable
     * while the surface itself is obviously gray, not black. Computed
     * from oklch(42% 0.006 250). */
    const bgLight: [number, number, number] = [0.292, 0.302, 0.313]

    /** Parse `oklch(L% C H[ / A])` to [L%, C, H°]. Returns null on miss. */
    function parseOklch(value: string): [number, number, number] | null {
      const m = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/i.exec(value)
      if (!m) return null
      return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]
    }

    /** OKLCH → gamma-encoded sRGB (0..1 floats). Uses the standard
     * OKLab→linear-sRGB matrix and the sRGB transfer function. */
    function oklchToSrgb(Lpct: number, C: number, Hdeg: number): [number, number, number] {
      const L = Lpct / 100
      const H = (Hdeg * Math.PI) / 180
      const a = C * Math.cos(H)
      const b = C * Math.sin(H)
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b
      const s_ = L - 0.0894841775 * a - 1.291485548 * b
      const ll = l_ * l_ * l_
      const mm = m_ * m_ * m_
      const ss = s_ * s_ * s_
      const r  =  4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss
      const g  = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss
      const bl = -0.0041960863 * ll - 0.7034186147 * mm + 1.7076147010 * ss
      const comp = (x: number): number => {
        if (x <= 0) return 0
        if (x >= 1) return 1
        return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
      }
      return [comp(r), comp(g), comp(bl)]
    }

    /** Read a CSS gem token, convert to sRGB. */
    function readGemSrgb(name: string): [number, number, number] {
      const raw = getComputedStyle(root).getPropertyValue(`--${name}`).trim()
      const parsed = parseOklch(raw)
      if (!parsed) return fallback[name]
      return oklchToSrgb(parsed[0], parsed[1], parsed[2])
    }

    /** Seed all gem uniforms from CSS. u_bg switches between dark and
     * light variants based on the active theme — dark mode uses the
     * page's near-black bg, light mode uses a lifted charcoal so the
     * shader surface reads as a soft dark plane against the paper page
     * rather than a hard black void. */
    function updateGemUniforms() {
      gl.useProgram(prog)
      const set = (name: keyof typeof gemUniforms, rgb: [number, number, number]) => {
        gl.uniform3f(gemUniforms[name], rgb[0], rgb[1], rgb[2])
      }
      set('gold',     readGemSrgb('gold'))
      set('ruby',     readGemSrgb('ruby'))
      set('emerald',  readGemSrgb('emerald'))
      set('diamond',  readGemSrgb('diamond'))
      set('amethyst', readGemSrgb('amethyst'))
      set('pink',     readGemSrgb('pink'))
      set('salmon',   readGemSrgb('salmon'))
      const isLight = root.getAttribute('data-theme') === 'light'
      set('bg',       isLight ? bgLight : fallback.bg)
    }

    /** Re-seed gem uniforms when `data-theme` flips on documentElement.
     * Cheap — runs a few getComputedStyle reads + 8 uniform3f calls. */
    const themeObserver = new MutationObserver(() => updateGemUniforms())
    themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    /** Initial seed — without this, uniforms default to vec3(0,0,0) and
     * the shader composites a pure-black canvas. Must run before the
     * first draw call. */
    updateGemUniforms()

    /* Pixel size in device pixels — set on resize so it tracks DPR.
     * Experimenting with 1 CSS pixel: kills the chunky spatial
     * quantization entirely, leaves just the Bayer 4x4 ordered
     * dither + posterize doing the work. Result reads as a
     * fine-grained ordered-dither film over smooth gem flow — the
     * "tasteful retro" end of the spectrum rather than the
     * "deliberately chunky pixel-art" end. */
    let pixelSizeDev = 1

    let mouse = { x: 0.5, y: 0.5 }
    let mouseActive = 0
    let mouseTarget = 0
    let pressActive = 0
    let pressTarget = 0
    /* Press-time accumulator — ticks up only while pressed, resets
     * on each press onset. Drives the black-hole swirl rotation in
     * the shader so each tap starts the spin from rest (no "jump"
     * from a long-tail accumulated time value). */
    let pressTime = 0
    let last = performance.now()
    let raf = 0
    let alive = true
    let visible = true // toggled by IntersectionObserver below
    const start = performance.now()

    function readSceneAngleRad(): number {
      const raw = getComputedStyle(root).getPropertyValue('--scene-angle').trim()
      if (!raw) return Math.PI * 0.75
      const m = /(-?[\d.]+)(deg|rad)?/.exec(raw)
      if (!m) return Math.PI * 0.75
      const v = parseFloat(m[1])
      const unit = m[2] || 'deg'
      return unit === 'rad' ? v : (v * Math.PI) / 180
    }

    function resize() {
      // DPR pinned to 1 — the shader output is already chunky-pixelated
      // + dithered + posterized, so a higher-DPR backing store would
      // just multiply the pixel count for compositor work that Safari
      // pays per recompose. At DPR 1 on a 1527×CSS-px hero this is
      // ~781K → ~196K backing pixels on retina, ≈4× less compositor
      // work per frame for indistinguishable visual output.
      const dpr = 1
      const w = cvs.clientWidth | 0
      const h = cvs.clientHeight | 0
      const W = (w * dpr) | 0
      const H = (h * dpr) | 0
      if (cvs.width !== W || cvs.height !== H) {
        cvs.width = W
        cvs.height = H
      }
      pixelSizeDev = 1 * dpr
      gl.viewport(0, 0, W, H)
    }
    window.addEventListener('resize', resize, { passive: true })
    resize()

    /**
     * Hit-test against the canvas rect — the hero overlay (h1, CTAs,
     * scroll cue) sits ON TOP of the canvas in the DOM and intercepts
     * pointer events when registered on `cvs`. Window-level listeners
     * fix that: every pointer event is observed regardless of which
     * element the cursor is over, then we compute canvas-relative
     * coords and toggle "in hero region" via the rect bounds. Listeners
     * are always passive — never stop propagation, never block scroll.
     */
    function updateMouseFromEvent(e: PointerEvent): boolean {
      const r = cvs.getBoundingClientRect()
      // Inside the canvas's visual region?
      const inside =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom
      if (inside) {
        mouse.x = (e.clientX - r.left) / r.width
        mouse.y = 1 - (e.clientY - r.top) / r.height // flip Y
      }
      return inside
    }
    function onMove(e: PointerEvent) {
      mouseTarget = updateMouseFromEvent(e) ? 1 : 0
      // If user moves out of hero while pressed, release the press
      // so the void hole doesn't linger off-screen-anchored.
      if (!mouseTarget) pressTarget = 0
    }
    function onDown(e: PointerEvent) {
      // Press only registers if the click lands inside the hero region —
      // clicking on a search button or a doc page link shouldn't punch a
      // black hole into the hero from across the layout.
      if (!updateMouseFromEvent(e)) return
      mouseTarget = 1
      pressTarget = 1
      pressTime = 0 // restart the swirl from rest on each new press
    }
    function onUp() {
      pressTarget = 0
    }
    /* All listeners on window so overlay siblings (h1, CTAs, scroll
     * cue) don't intercept events before they reach the canvas. All
     * passive — we only read state, never block default behavior. */
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })

    gl.useProgram(prog)

    function frame() {
      // Visibility gate: when the hero scrolls off-screen we stop
      // rescheduling rAFs. Saves the full WebGL paint + JS work per
      // frame for the rest of the page scroll. WebKit benefits most —
      // off-screen canvas paint isn't free there. Restart in the IO
      // callback below.
      if (!alive || !visible) { raf = 0; return }
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // Smooth mouse_active toward target with ~150ms half-life.
      const k = 1 - Math.pow(0.5, dt / 0.15)
      mouseActive += (mouseTarget - mouseActive) * k
      /* Press eases faster (~80ms half-life) — feel pressure
       * register/release as soon as the finger goes down/up. Too
       * slow and the void hole "fades up" rather than "appears." */
      const kp = 1 - Math.pow(0.5, dt / 0.08)
      pressActive += (pressTarget - pressActive) * kp
      /* Press-time advances while the press is held; resets to 0
       * once both the target and the smoothed press value have
       * fully released. Keeping the counter running through the
       * release tail prevents the swirl angle from instantly
       * snapping to zero as soon as the finger lifts. */
      if (pressTarget > 0.5) {
        pressTime += dt
      } else if (pressActive < 0.01) {
        pressTime = 0
      } else {
        pressTime += dt
      }

      gl.uniform2f(uRes, cvs.width, cvs.height)
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.uniform1f(uMouseActive, mouseActive)
      gl.uniform1f(uPress, pressActive)
      gl.uniform1f(uPressTime, pressTime)
      gl.uniform1f(uSceneAngle, readSceneAngleRad())
      gl.uniform1f(uPixelSize, pixelSizeDev)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // Visibility gate via IntersectionObserver — does TWO things when
    // the hero scrolls off-screen:
    //   1. Pause the rAF loop (cheap; saves WebGL draw + JS work).
    //   2. Toggle `visibility: hidden` on the canvas element. This
    //      removes the canvas's composited LAYER from Safari's
    //      compositor entirely. WebGL canvases always get their own
    //      composited layer; on a real-Safari scroll trace that 1527×512
    //      layer was being re-composited on every scroll tick (~12ms
    //      per recompose × 100+ scroll ticks = bulk of the bottleneck).
    //      Pausing the rAF only stopped the draw — the layer still
    //      existed and still composited.
    //   `visibility: hidden` (vs `display: none`) keeps the WebGL
    //   context alive — only the layer is dropped from the compositor
    //   tree. Resume on scroll-back-up is instant; the canvas shows
    //   its last-drawn content for ~1 frame before the rAF tick.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const wasVisible = visible
        visible = e.isIntersecting
        cvs.style.visibility = visible ? '' : 'hidden'
        if (visible && !wasVisible && alive && raf === 0) {
          last = performance.now()
          raf = requestAnimationFrame(frame)
        }
      }
    }, { rootMargin: '100px' })
    io.observe(cvs)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      io.disconnect()
      themeObserver.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
      aria-hidden="true"
    />
  )
}
