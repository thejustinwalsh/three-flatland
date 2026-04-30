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
- **Stage by exact path** — `git add tools/io/src/foo.ts`, never `git add -A` / `git add .` / `git commit -a`. This branch routinely has WIP modifications across many files; bundling them is a recoverable but disruptive mistake.

## Editor tools (`tools/`)
The VSCode extension and its supporting packages live under `tools/`. Each has its own agent-facing reference:

| Package | Doc | Read this when |
|---|---|---|
| `tools/vscode` | [`tools/vscode/CLAUDE.md`](tools/vscode/CLAUDE.md) | adding/modifying a VSCode tool (host + webview) |
| `tools/design-system` | [`tools/design-system/CLAUDE.md`](tools/design-system/CLAUDE.md) | building any tool UI — primitive inventory, StyleX token rules, Lit gotchas |
| `tools/preview` | [`tools/preview/CLAUDE.md`](tools/preview/CLAUDE.md) | reusing canvas / animation / drag primitives |
| `tools/bridge` | [`tools/bridge/CLAUDE.md`](tools/bridge/CLAUDE.md) | host ↔ webview messaging — `ClientBridge` vs `HostBridge` semantics |
| `tools/io` | [`tools/io/CLAUDE.md`](tools/io/CLAUDE.md) | adding pure data helpers (image decode, atlas types/builders/packing/merge) |

When dispatching a sub-agent for tool work, include the relevant `tools/<pkg>/CLAUDE.md` paths in the prompt — they encode hard-won API contracts (e.g. `ClientBridge.on()` returns an unsubscribe function, NOT a `dispose()` method) that aren't obvious from the source.

## Constraints
- Performance is critical — minimize draw calls, batch sprites via SpriteGroup, watch frame budgets
- All custom Three.js classes must work with R3F's no-arg construction + property-setting pattern

## Do NOT
- Use GLSL or `onBeforeCompile` — all shaders use TSL node materials
- Use `WebGLRenderTarget` — use renderer-agnostic `RenderTarget`
- Use Web Awesome (`@awesome.me/webawesome`) — examples use Tweakpane (`@three-flatland/tweakpane/react`) now
- Add `declare global { namespace JSX }` — use `ThreeElements` interface augmentation via `three-flatland/react`
