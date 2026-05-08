# three-flatland

## Build & Test
- `pnpm dev` — docs (port 4000) + examples MPA (port 5174) behind microfrontends proxy at http://localhost:5173
- `pnpm --filter=example-react-tilemap dev` — run a single example
- `pnpm sync:pack` — sync example/mini package.json deps with the workspace catalog after editing `pnpm-workspace.yaml`
- `pnpm sync:react` — regenerate React subpath wrappers after touching `packages/three-flatland/src/*/index.ts`

## Code Style
- No semicolons, single quotes, trailing commas (Prettier)
- `type` keyword required for type-only imports (`consistent-type-imports` + `verbatimModuleSyntax`)
- Unused vars must be prefixed with `_`

## Architecture
- WebGPU + TSL (Three Shader Language) exclusively — no WebGL, no GLSL
- R3F examples import from `@react-three/fiber/webgpu`, not `@react-three/fiber`
- Three.js users: `import from 'three-flatland'` — R3F users: `import from 'three-flatland/react'` (all packages follow this `/react` subpath pattern, incl. `@three-flatland/tweakpane/react`)
- Shared versions in `pnpm-workspace.yaml` catalog; `pnpm.overrides` maps `@three-flatland/*` to `workspace:*`

## Examples
- Examples always exist in **pairs** — Three.js + React. Create both or neither.
- `examples/three/` = plain Three.js, `examples/react/` = React Three Fiber
- R3F classes must be registered with `extend()` before use in JSX
- All Three.js objects used as R3F JSX elements need: optional constructor params, property setters, array-compatible setters

## Planning
- All planning, PRDs, milestones, and specs live in /planning, ensure all planning docs live under this directory.
- Save superpowers specs to planning/superpowers/specs.
- Save superpowers plans to planning/superpowers/plans.

## Workflow
- Use Conventional Commits — releases are cut from changesets generated from the commit history

## Verification
- **Unit tests** (`pnpm test` per package): fast deterministic invariants. Always run before committing simulation/system code.
- **Integration tests** (`pnpm test:integration` per package): live-browser observation via vitexec. Slow (60–180s each). Run after changes to a mini's simulation pipeline (collapse, hazard, scene loop, tick budgets).
- **vitexec probes**: never accumulate one-off probes in `/tmp/`. If a probe surfaced a real bug, fold it into the integration suite under `tests/integration/`. Each probe is browser-runnable JS that ends with `console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))`; the matching `*.integration.test.ts` parses that and asserts.
- **Failure messages are part of the contract**: every integration test must throw a custom Error on failure that names (a) what was expected, (b) likely root causes with file paths, (c) sample offending data. See `minis/driller/tests/integration/shake-contract.integration.test.ts` for the canonical pattern.
- **Timeouts are failures**: the runner SIGKILLs vitexec at `timeoutSec + 60s` and surfaces a clear timeout error. Never let a hung browser show as green.
- See `minis/driller/tests/integration/README.md` for full conventions when adding new integration tests or probes.

## Constraints
- Performance is critical — minimize draw calls, batch sprites via SpriteGroup, watch frame budgets
- All custom Three.js classes must work with R3F's no-arg construction + property-setting pattern

## Do NOT
- Use GLSL or `onBeforeCompile` — all shaders use TSL node materials
- Use `WebGLRenderTarget` — use renderer-agnostic `RenderTarget`
- Use Web Awesome (`@awesome.me/webawesome`) — examples use Tweakpane (`@three-flatland/tweakpane/react`) now
- Add `declare global { namespace JSX }` — use `ThreeElements` interface augmentation via `three-flatland/react`
