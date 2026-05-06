import { useEffect, useRef } from 'react'

/**
 * HeroShader — WebGL2 fragment-shader hero background. Pure animated
 * gem-palette ambient motion with mouse-driven dynamic light. No game,
 * no library overhead — just a fullscreen quad and a noise-driven
 * fragment shader that runs the gem taxonomy through layered domain
 * warps.
 *
 * Inputs: time + mouse + resolution + scene-angle (read from CSS var
 * each frame so the global day-cycle drives the shader's directional
 * light). Pointer leave releases the mouse light gracefully.
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
uniform float u_scene_angle; // radians

out vec4 fragColor;

// Gem palette — bearded-theme-inspired vibrancy.
const vec3 C_GOLD     = vec3(0.78, 0.57, 0.05);
const vec3 C_RUBY     = vec3(0.78, 0.18, 0.32);
const vec3 C_EMERALD  = vec3(0.00, 0.66, 0.52);
const vec3 C_DIAMOND  = vec3(0.07, 0.72, 0.83);
const vec3 C_AMETHYST = vec3(0.66, 0.37, 0.95);
const vec3 C_PINK     = vec3(0.83, 0.43, 0.75);
const vec3 C_SALMON   = vec3(0.89, 0.33, 0.21);
const vec3 C_BG       = vec3(0.067, 0.078, 0.094);

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
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_res.x / u_res.y;

  float t = u_time * 0.05;

  // Domain-warp layer — pushes the gem "flow" around the surface so
  // colors morph across each other smoothly.
  vec2 q = vec2(
    fbm(p + vec2(0.0, t)),
    fbm(p + vec2(5.2, t * 1.3 + 1.3))
  );
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2 + t * 0.6)),
    fbm(p + 4.0 * q + vec2(8.3, 2.8 - t * 0.4))
  );
  float n = fbm(p + 4.0 * r);

  // Layered gem masks — each gem has a different noise frequency offset
  // so they bleed in/out at different cadences.
  float m1 = smoothstep(0.20, 0.55, fbm(p * 1.2 + r * 0.5 + vec2(t,  t * 0.7)));
  float m2 = smoothstep(0.25, 0.60, fbm(p * 1.6 - r * 0.4 + vec2(-t, t * 0.4)));
  float m3 = smoothstep(0.30, 0.65, fbm(p * 0.9 + r * 0.7 + vec2(t * 0.6, -t)));
  float m4 = smoothstep(0.35, 0.70, fbm(p * 2.1 - r * 0.3 + vec2(-t * 1.2, t * 0.5)));

  // Composite gems on near-black background.
  vec3 col = C_BG;
  col = mix(col, C_AMETHYST, m1 * 0.55);
  col = mix(col, C_DIAMOND,  m2 * 0.50);
  col = mix(col, C_EMERALD,  m3 * 0.45);
  col = mix(col, C_PINK,     m4 * 0.42);

  // Scene-light directional sheen — gem accent shifts by the global
  // scene-angle so the surface reads as "lit from the same source as
  // the cards." Aligned to the scene-angle vector projected onto p.
  vec2 ldir = vec2(sin(u_scene_angle), cos(u_scene_angle));
  float dirShade = dot(p, ldir) * 0.18 + 0.5;
  col += C_GOLD * smoothstep(0.55, 0.95, dirShade) * 0.35;
  col -= 0.10 * smoothstep(0.0, 0.5, 1.0 - dirShade);

  // Mouse-driven hot light — radial in NDC space, gold/salmon glow.
  vec2 m = u_mouse * 2.0 - 1.0;
  m.x *= u_res.x / u_res.y;
  float md = length(p - m);
  float hot = smoothstep(0.85, 0.0, md) * u_mouse_active;
  col += mix(C_SALMON, C_GOLD, 0.5) * hot * 0.55;
  col += C_RUBY * smoothstep(0.45, 0.0, md) * u_mouse_active * 0.25;

  // Vignette so the edges fade into the page bg cleanly.
  float v = smoothstep(1.4, 0.55, length(p));
  col = mix(C_BG, col, v);

  // Sub-perceptual film grain — keeps the surface from reading "flat
  // gradient" on dark areas.
  float grain = (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.04;
  col += grain;

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
    const uSceneAngle = gl.getUniformLocation(prog, 'u_scene_angle')

    let mouse = { x: 0.5, y: 0.5 }
    let mouseActive = 0
    let mouseTarget = 0
    let last = performance.now()
    let raf = 0
    let alive = true
    const start = performance.now()

    const root = document.documentElement
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cvs.clientWidth | 0
      const h = cvs.clientHeight | 0
      const W = (w * dpr) | 0
      const H = (h * dpr) | 0
      if (cvs.width !== W || cvs.height !== H) {
        cvs.width = W
        cvs.height = H
      }
      gl.viewport(0, 0, W, H)
    }
    window.addEventListener('resize', resize, { passive: true })
    resize()

    function onMove(e: PointerEvent) {
      const r = cvs.getBoundingClientRect()
      mouse.x = (e.clientX - r.left) / r.width
      mouse.y = 1 - (e.clientY - r.top) / r.height // flip Y
      mouseTarget = 1
    }
    function onLeave() {
      mouseTarget = 0
    }
    cvs.addEventListener('pointermove', onMove, { passive: true })
    cvs.addEventListener('pointerenter', () => { mouseTarget = 1 })
    cvs.addEventListener('pointerleave', onLeave)

    gl.useProgram(prog)

    function frame() {
      if (!alive) return
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // Smooth mouse_active toward target with ~150ms half-life.
      const k = 1 - Math.pow(0.5, dt / 0.15)
      mouseActive += (mouseTarget - mouseActive) * k

      gl.uniform2f(uRes, cvs.width, cvs.height)
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.uniform1f(uMouseActive, mouseActive)
      gl.uniform1f(uSceneAngle, readSceneAngleRad())
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      cvs.removeEventListener('pointermove', onMove)
      cvs.removeEventListener('pointerleave', onLeave)
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
