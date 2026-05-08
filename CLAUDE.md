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

Two test surfaces. Both are evidence-of-completeness for changes that touch simulation pipelines, full-system invariants, or wall-clock-dependent behavior.

- **Unit tests** (`pnpm test` per package): fast deterministic invariants. Always run before committing.
- **Integration tests** (`pnpm test:integration` per package): live-browser observation via vitexec. Slow (60–180s each). Required after changes to a mini's simulation pipeline (collapse, hazard, scene loop, tick budgets, animation timing). Excluded from the default `pnpm test` so the inner loop stays fast.

### vitexec — live debugging + integration suite

`vitexec` boots a headless Chromium against the dev server, runs a code snippet inside the page, and pipes browser console output back. Two uses:

1. **Live debugging (inner loop).** When mid-implementation and you need to inspect runtime state, write a probe in `/tmp` and run `pnpm exec vitexec --gpu --path / --timeout <seconds> "$(cat /tmp/probe.js)"`. **`--gpu` is non-negotiable** — without it headless Chromium throttles `requestAnimationFrame` and timing assertions drift ~2× off the design target.
2. **Suite (regression layer).** Disposable probes get folded into `tests/integration/` once they surface a real bug. The probe is now the regression test.

### Suite contracts (driller is the canonical example)

- A *probe* is browser-runnable JS that ends with `console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))`. Probes emit `[progress] ...` markers every ~10s during long runs so a 90s test isn't indistinguishable from a hang.
- A *harness* (`*.integration.test.ts`) calls `runProbe(probePath, { timeoutSec })`, parses the sentinel, asserts on the structured result.
- **Failure messages are part of the contract**: every harness must throw a custom Error naming (a) what was expected, (b) likely root causes with file paths, (c) sample offending data, (d) vitexec stdout tail. See `minis/driller/tests/integration/shake-contract.integration.test.ts` for the canonical pattern.
- **Three layers of fail-fast** in `_runner.ts` so misconfiguration can't burn 4 minutes on silence: (1) pattern match on `vitexec failed:` / `EADDRINUSE` / config-resolve errors → SIGKILL in ~1–3s; (2) first-output deadline → if zero bytes within 30s of spawn, kill and surface; (3) hard timeout (`timeoutSec + 60s`) as final envelope. Silence is never green.
- **Free-port pre-pick + `strictPort:false`**: integration vite config (`vite.integration.config.ts`) reads its port from `$DRILLER_INTEGRATION_PORT`. Runner picks a free OS port via `net.createServer().listen(0)` before each spawn, retries up to 3 times on collision races. Don't reuse the dev `vite.config.ts` for integration runs — its `strictPort:true` will hang against a workspace `pnpm dev` holding 5173.
- **Game-side counters** exposed via `window.__<app>Stats` are the cleanest signal when grid-state scraping can't distinguish two scenarios that look identical externally (e.g., "rule violation" vs "legitimate similar-looking event"). Increment from inside the system; probe samples deltas.
- See `minis/driller/tests/integration/README.md` for full conventions; the user-level `implementing-github-issues` skill has the complete bootstrap guide at `references/vitexec-integration-suite.md`.

### Fold-back rule

Never accumulate one-off probes in `/tmp/`. If a debugging probe surfaced a real bug worth pinning, move it to `tests/integration/probes/`, write a vitest harness, ship the probe + harness + fix in the same commit. The diff reads like a coherent story: "I broke this; here's the regression test that catches it; here's the fix."

## Constraints
- Performance is critical — minimize draw calls, batch sprites via SpriteGroup, watch frame budgets
- All custom Three.js classes must work with R3F's no-arg construction + property-setting pattern

## Do NOT
- Use GLSL or `onBeforeCompile` — all shaders use TSL node materials
- Use `WebGLRenderTarget` — use renderer-agnostic `RenderTarget`
- Use Web Awesome (`@awesome.me/webawesome`) — examples use Tweakpane (`@three-flatland/tweakpane/react`) now
- Add `declare global { namespace JSX }` — use `ThreeElements` interface augmentation via `three-flatland/react`
