# Examples

Agent-facing reference for the examples workspace.

## Structure

Examples live in **pairs** — a plain Three.js version and a React Three Fiber version must
both exist or neither should. The MPA discovers them automatically:

| Directory                | Workspace package name |
| ------------------------ | ---------------------- |
| `examples/three/{name}/` | `example-three-{name}` |
| `examples/react/{name}/` | `example-react-{name}` |

Each example has its own `package.json` with `dev` and `typecheck` scripts and a
`vite.config.ts` that sets `base: '/three/{name}/'` (or `react/`) when serving.

## Running the MPA (all examples together)

```sh
pnpm --filter=examples dev        # starts at http://localhost:5174 (default)
EXAMPLES_PORT=3000 pnpm --filter=examples dev   # override port
```

The Vite config auto-discovers every `three/*/index.html` and `react/*/index.html`
and routes `/{three,react}/{name}/` to the right entry. Per-example `public/`
directories are served by a custom middleware — the MPA server must be running for
static assets (sprites, audio, fonts) to resolve.

## Running a single example

```sh
pnpm --filter=example-react-hit-test dev
pnpm --filter=example-three-hit-test typecheck
```

Individual examples run on `TURBO_MFE_PORT` (default 5179).

## Renderer: WebGPU

All examples use WebGPU:

- Plain Three.js: `new WebGPURenderer(…)` from `three/webgpu`
- R3F: `<Canvas>` from `@react-three/fiber/webgpu`

Headless Chromium launched without GPU flags will not expose WebGPU and examples
will fail to initialize or render a black canvas. You must pass `--gpu` to vitexec
(see below) to get Chromium's hardware-accelerated headless mode.

---

## End-to-end / runtime verification with vitexec

**Rule: use `vitexec` for any "does this example actually work in the browser"
check.** `typecheck` catches type errors; it cannot tell you whether WebGPU
initialized, whether pointer events reach the right objects, or whether a sprite
tint changed. vitexec answers those questions without touching the source files.

vitexec runs a JavaScript snippet inside a real Playwright/Chromium page, prints
browser logs, and can take screenshots, recordings, and heap snapshots. The skill
description is at `/skills/vitexec/SKILL.md`.

### When to use vitexec

- Verifying an example renders (canvas present, no console errors)
- Checking pointer/click event behavior (hover highlights, click removes, hit-test
  passthrough)
- Asserting Three.js / R3F state after interaction (tint color, scene child count,
  animation name)
- Capturing a screenshot or recording as evidence
- Debugging WebGPU errors that only appear at runtime

### The WebGPU caveat

Always pass `--gpu`. Without it Chromium's new headless mode is not requested and
WebGPU is unavailable — the renderer either falls back silently (if it has a WebGL
fallback) or throws at `renderer.init()`. If the local machine has no usable GPU,
use `--gpu --browser-ws-endpoint <ws-url>` to delegate to a remote Playwright server
that was started with the appropriate GPU flags.

### Which vite config to pass

vitexec starts its own Vite dev server on port 5173. The MPA vite config
(`examples/vite.config.ts`) requires `@three-flatland/devtools` to be built first
and serves the MPA from the workspace root — it works but is heavier. The
per-example `vite.config.ts` is lighter and handles `BASE_URL` and asset paths
correctly for that one example. Choose based on what you are testing:

| Scenario                           | Recommended config                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Testing one example                | `--config examples/{three,react}/{name}/vite.config.ts` from cwd `examples/{three,react}/{name}/` |
| Testing multiple examples together | `--config examples/vite.config.ts` after building packages                                        |
| React examples                     | Run from `examples/` cwd without `--config`; the MPA config picks it up                           |

### Port: vitexec vs the running MPA server

vitexec always starts its **own** server (port 5173 by default). If you have the MPA
server already running on 5174 and want vitexec to use it, there is no `--url` flag —
start vitexec from the per-example directory using that example's `vite.config.ts`
instead. For React examples the MPA config is needed because R3F dedupe and the
devtools plugin are only configured there; for plain Three.js examples the per-example
config is self-contained.

### Basic smoke pattern

```sh
# From examples/ cwd (React example — MPA config, no --config needed)
vitexec --path /react/hit-test/ --gpu --screenshot /tmp/snap.png --timeout 20 '
  await new Promise(r => setTimeout(r, 4000))  // wait for WebGPU + asset load
  const canvas = document.querySelector("canvas")
  console.log("canvas:", !!canvas, canvas?.width + "x" + canvas?.height)
'

# From the per-example dir (Three.js example)
cd examples/three/hit-test
vitexec --path /three/hit-test/ --config vite.config.ts --gpu --timeout 20 '
  await new Promise(r => setTimeout(r, 4000))
  console.log("canvas:", !!document.querySelector("canvas"))
  console.log("status:", document.getElementById("status")?.textContent)
'
```

### Pointer / click interaction pattern

R3F and plain Three.js both use pointer events on the canvas. A bare `MouseEvent`
click is not enough — dispatch the full `pointerdown → pointerup → click` sequence:

```js
function pointerClick(canvas, x, y) {
  canvas.dispatchEvent(
    new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' })
  )
  canvas.dispatchEvent(
    new PointerEvent('pointerdown', {
      clientX: x,
      clientY: y,
      bubbles: true,
      button: 0,
      buttons: 1,
      pointerType: 'mouse',
    })
  )
  canvas.dispatchEvent(
    new PointerEvent('pointerup', {
      clientX: x,
      clientY: y,
      bubbles: true,
      button: 0,
      buttons: 0,
      pointerType: 'mouse',
    })
  )
  canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))
}
```

For hover-only (no click):

```js
canvas.dispatchEvent(
  new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' })
)
```

Translating world coordinates to screen coordinates (orthographic camera, frustumSize=400):

```js
const rect = canvas.getBoundingClientRect()
const cx = rect.left + rect.width / 2
const cy = rect.top + rect.height / 2
const sx = cx + worldX * (rect.height / 400) // scaleY == scaleX for a square pixel
const sy = cy - worldY * (rect.height / 400) // Y is flipped
```

### Reading cursor state as a hit-test proxy

`document.body.style.cursor` (R3F examples) or `canvas.style.cursor` (plain Three.js)
change to `'pointer'` when a pointer-interactive sprite is hovered. This is the
quickest non-visual assertion for hit-test behavior.

### Three.js example: asset paths and BASE_URL

Plain Three.js examples use `import.meta.env.BASE_URL + 'sprites/...'`. When run
via vitexec with the per-example `vite.config.ts`, BASE_URL resolves to
`/three/{name}/` and assets are found under the example's own `public/` directory.
Without the per-example config, BASE_URL defaults to `/` and sprite loads 404.

### React example: MPA config and module deduplication

React examples must use the MPA `vite.config.ts` (or at minimum a config that
deduplicates `react`, `react-dom`, and `three`). Running them standalone with a
minimal config causes "Invalid hook call" errors from duplicate React instances.
When running from the `examples/` cwd without `--config`, vitexec picks up
`examples/vite.config.ts` automatically — that is the recommended workflow.
