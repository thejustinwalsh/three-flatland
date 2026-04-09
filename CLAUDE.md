# three-flatland

## Build & Test
- `pnpm build` — turbo-orchestrated across all packages
- `pnpm dev` — docs (port 4000) + examples MPA server (port 5174) via microfrontends proxy at http://localhost:5173
- `pnpm --filter=example-react-tilemap dev` — run a single example
- `pnpm typecheck` / `pnpm lint` / `pnpm test`
- `pnpm syncpack:examples` / `pnpm syncpack:minis` — sync versions after changing catalog in pnpm-workspace.yaml

## Code Style
- No semicolons, single quotes, trailing commas (Prettier)
- `type` keyword required for type-only imports (`consistent-type-imports` + `verbatimModuleSyntax`)
- Unused vars must be prefixed with `_`

## Architecture
- WebGPU + TSL (Three Shader Language) exclusively — no WebGL, no GLSL
- R3F examples import from `@react-three/fiber/webgpu`, not `@react-three/fiber`
- Three.js users: `import from 'three-flatland'` — R3F users: `import from 'three-flatland/react'`
- Shared versions in `pnpm-workspace.yaml` catalog; `pnpm.overrides` maps `@three-flatland/*` to `workspace:*`
- Examples use Tweakpane (`@three-flatland/tweakpane/react`) for UI controls

## Examples
- Examples always exist in **pairs** — Three.js + React. Create both or neither.
- `examples/three/` = plain Three.js, `examples/react/` = React Three Fiber
- R3F classes must be registered with `extend()` before use in JSX
- All Three.js objects used as R3F JSX elements need: optional constructor params, property setters, array-compatible setters

## Constraints
- Performance is critical — minimize draw calls, batch sprites via SpriteGroup, watch frame budgets
- All custom Three.js classes must work with R3F's no-arg construction + property-setting pattern

## Do NOT
- Use GLSL or `onBeforeCompile` — all shaders use TSL node materials
- Use `WebGLRenderTarget` — use renderer-agnostic `RenderTarget`
- Import from `@react-three/fiber` — always `@react-three/fiber/webgpu`
- Use Web Awesome (`@awesome.me/webawesome`) — examples use Tweakpane now
- Add `declare global { namespace JSX }` — use `ThreeElements` interface augmentation via `three-flatland/react`
