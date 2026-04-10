---
"@three-flatland/tweakpane": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## What's Changed

### New Package

`@three-flatland/tweakpane` is a new Tweakpane v4 integration for three-flatland — styled debug controls for both plain Three.js and React Three Fiber.

### API

- `createPane(options)` — creates a themed Tweakpane instance; returns `PaneBundle` with `pane` and `stats: StatsHandle`
- `createPane({ scene })` — pass a Three.js `Scene` to wire per-frame draw/triangle/GPU stats automatically via `scene.onAfterRender`; no manual `stats.update()` needed
- `createPane({ debug })` — optional one-time diagnostics log (default `true`); set `false` for production apps
- `wireSceneStats(scene, stats, options?)` — exported helper to manually wire a scene to a `StatsHandle`; used internally by both `createPane` and `useStatsMonitor`
- `StatsHandle` interface: `begin()`, `end()`, `update(info: StatsUpdate)`, `enableGpu()`, `gpuTime(ms)`
- `StatsUpdate` type exported from the main entry point
- Pane header now includes a pin button — locks the pane to full opacity regardless of idle-dimming

### Stats Graph

- Cycling FPS / MS / GPU / MEM graph at the top of every pane (click to switch mode)
- Single-row readout below the graph for draw calls, triangles, primitives, geometries, and textures
- GPU mode: auto-detects `trackTimestamp` on the WebGPU backend; correctly gates on the `EXT_disjoint_timer_query_webgl2` extension for WebGL (prevents enabling GPU mode with no data)
- GPU timestamp pool drained via microtask (`Promise.resolve().then(...)`) to avoid re-entering the renderer mid-frame
- GPU unit label corrected to `MS` (was incorrectly `GPU`)

### React Hooks (`@three-flatland/tweakpane/react`)

- `usePane(options?)` — creates and manages a `PaneBundle`; handles orphan cleanup for React Strict Mode aborted renders
- `usePaneInput(parent, key, initialValue, options)` — binds a Tweakpane input to React state; created synchronously on render (no first-frame pop-in)
- `usePaneFolder(parent, title, options?)` — creates a folder synchronously; deferred disposal survives Strict Mode cleanup/re-mount
- `usePaneButton(parent, title, onClick)` — adds a button; deferred disposal survives Strict Mode
- `useStatsMonitor(stats)` — wires a `StatsHandle` into R3F's frame loop (`useFrame`) for automatic FPS/MS/GPU tracking; delegates to `wireSceneStats` for identical behavior to the vanilla path
- `useFpsGraph(parent)` — add a standalone FPS graph blade (retained for backward compat)

### Bug Fixes

- Removed the independent `requestAnimationFrame` loop from `addStatsGraph` — it caused Safari to throttle the entire tab to ~20fps due to competing RAF callbacks and per-frame SVG layout thrashing
- SVG graph dimensions now cached via `ResizeObserver` instead of per-frame `getBoundingClientRect()` calls; graph updates driven from `end()` only
- `wireSceneStats`: `scene.onAfterRender` chaining now uses `.bind()` to avoid `this`-context issues when calling the previous hook
- `usePane` returns `bundleRef.current` without non-null assertion

### Testing

- Unit tests added for `createPane`, `usePane`, `usePaneInput`, `usePaneFolder`, and `usePaneButton`

## BREAKING CHANGES

- `createPane` `fps` option removed — use `stats: false` to disable the stats panel
- `PaneBundle.fpsGraph` deprecated and always returns `null`; replace with `stats.begin()` / `stats.end()` inside the render loop
- `StatsHandle.update()` signature changed from `{ drawCalls, triangles? }` to `StatsUpdate` (adds `lines`, `points`, `geometries`, `textures`)
- `addStatsGraph(parent, options)` no longer accepts a `label` option

`@three-flatland/tweakpane` launches as a full-featured debug controls package with automatic GPU timing, a cycling stats graph, and React hooks that survive Strict Mode — with a Safari performance fix that eliminates competing RAF callbacks.

<!-- original commit details below (auto-generated, do not edit) -->

### 48bf686ae2046edfc517cd9050c306082870c1e7
fix: remove independent RAF loop from stats graph
The stats graph had its own requestAnimationFrame loop running SVG
mutations (getBoundingClientRect + setAttribute) every frame in parallel
with the render loop. Safari throttled the entire tab to ~20fps due to
the competing RAF callbacks and per-frame layout thrashing.

- Remove the independent RAF tick loop entirely
- Drive updateLabel/updateGraph from end() (already called once per
  frame via useFrame/useStatsMonitor or manual begin/end)
- Cache SVG dimensions via ResizeObserver instead of per-frame
  getBoundingClientRect calls
Files: packages/tweakpane/src/stats-graph.ts
Stats: 1 file changed, 30 insertions(+), 25 deletions(-)

### 26dbfa2bb87d4ffaeb82c95fbf7862de1d1894f1
fix: add React hooks tests and update pane wiring logic
Files: .github/workflows/ci.yml, packages/skia/package.json, packages/skia/src/ts/react/hooks.test.tsx, packages/skia/test/setup.ts, packages/skia/vitest.workspace.ts, packages/tweakpane/package.json, packages/tweakpane/src/create-pane.test.ts, packages/tweakpane/src/create-pane.ts, packages/tweakpane/src/react/use-pane-button.test.tsx, packages/tweakpane/src/react/use-pane-folder.test.tsx, packages/tweakpane/src/react/use-pane-input.test.tsx, packages/tweakpane/src/react/use-pane.test.tsx, packages/tweakpane/vitest.config.ts, pnpm-lock.yaml, vitest.config.ts, vitest.workspace.ts
Stats: 16 files changed, 1231 insertions(+), 13 deletions(-)

### 0cea3a2af48b9d6174244017501416435d23c51d
fix: add restruct verification and setup, cleanup lint and tests
Files: .gitignore, .restruct/links/11ae1f87.md, .restruct/links/8dd1c85f.md, .restruct/links/991fd87c.md, .restruct/links/index.json, .restruct/permissions.yaml, .restruct/verify.yaml, CLAUDE.md, eslint.config.js, examples/react/batch-demo/src/App.tsx, examples/react/knightmark/App.tsx, examples/react/tilemap/App.tsx, examples/react/tsl-nodes/App.tsx, package.json, packages/skia/src/ts/react/hooks.ts, packages/tweakpane/src/create-pane.ts, packages/tweakpane/src/react/use-fps-graph.ts, packages/tweakpane/src/react/use-pane-input.ts, packages/tweakpane/src/react/use-pane.ts, packages/tweakpane/src/react/use-stats-monitor.ts, packages/tweakpane/src/stats-graph.ts, vitest.workspace.ts
Stats: 22 files changed, 279 insertions(+), 73 deletions(-)

### 1f806ad5626f07cb593c4c37a55bae9508e81a29
feat: integrate wireSceneStats for automatic GPU stats tracking in Tweakpane
Files: examples/three/batch-demo/main.ts, examples/three/knightmark/main.ts, examples/three/tilemap/main.ts, packages/tweakpane/src/create-pane.ts, packages/tweakpane/src/index.ts, packages/tweakpane/src/react/use-stats-monitor.ts, packages/tweakpane/src/stats-graph.ts
Stats: 7 files changed, 192 insertions(+), 141 deletions(-)

### d61085421ae851f0c17564fc76ed2129c4a17a4f
feat: add useStatsMonitor hook and StatsRow component for enhanced performance monitoring
Files: .github/workflows/ci.yml, .gitignore, e2e/smoke-examples.spec.ts, examples/react/CLAUDE.md, examples/react/animation/App.tsx, examples/react/basic-sprite/App.tsx, examples/react/batch-demo/src/App.tsx, examples/react/knightmark/App.tsx, examples/react/pass-effects/App.tsx, examples/react/skia/App.tsx, examples/react/template/App.tsx, examples/react/tilemap/App.tsx, examples/react/tsl-nodes/App.tsx, examples/three/animation/main.ts, examples/three/basic-sprite/main.ts, examples/three/batch-demo/main.ts, examples/three/knightmark/main.ts, examples/three/pass-effects/main.ts, examples/three/skia/main.ts, examples/three/template/main.ts, examples/three/tilemap/main.ts, examples/three/tsl-nodes/main.ts, package.json, packages/tweakpane/package.json, packages/tweakpane/src/create-pane.ts, packages/tweakpane/src/react.ts, packages/tweakpane/src/react/use-pane.ts, packages/tweakpane/src/react/use-stats-monitor.ts, packages/tweakpane/src/stats-graph.ts, packages/tweakpane/src/stats-row.ts, packages/tweakpane/src/theme.ts, playwright.config.ts, pnpm-lock.yaml
Stats: 33 files changed, 1249 insertions(+), 254 deletions(-)

### 5ee9dbc98e0804b2221ea4836c120ba024f15ac1
refactor: move all three.js examples to three folder, update skills, update docs, update llms.txt
Files: .changeset/config.json, .changeset/pre.json, .claude/settings.json, .claude/skills/docs-audit/SKILL.md, .claude/skills/example/SKILL.md, .claude/skills/example/design-tokens.md, .claude/skills/example/ui-patterns.md, .claude/skills/flatland-r3f/SKILL.md, .library/react-three-fiber/common-patterns-and-helpers.md, .library/react-three-fiber/custom-threejs-classes.md, .library/react-three-fiber/idiomatic-r3f-patterns.md, .restruct/links/a6a5aabb.md, .restruct/links/index.json, CLAUDE.md, README.md, docs/astro.config.mjs, docs/package.json, docs/public/llms-full.txt, docs/public/llms.txt, docs/src/components/ExamplePreview.tsx, docs/src/components/Head.astro, docs/src/content/docs/examples/animation.mdx, docs/src/content/docs/examples/basic-sprite.mdx, docs/src/content/docs/examples/batch-demo.mdx, docs/src/content/docs/examples/knightmark.mdx, docs/src/content/docs/examples/pass-effects.mdx, docs/src/content/docs/examples/skia.mdx, docs/src/content/docs/examples/test.mdx, docs/src/content/docs/examples/tilemap.mdx, docs/src/content/docs/examples/tsl-nodes.mdx, docs/src/content/docs/getting-started/installation.mdx, docs/src/content/docs/getting-started/quick-start.mdx, docs/src/content/docs/guides/animation.mdx, docs/src/content/docs/guides/batch-rendering.mdx, docs/src/content/docs/guides/flatland.mdx, docs/src/content/docs/guides/loaders.mdx, docs/src/content/docs/guides/pass-effects.mdx, docs/src/content/docs/guides/skia.mdx, docs/src/content/docs/guides/sprites.mdx, docs/src/content/docs/guides/tilemaps.mdx, docs/src/content/docs/guides/tsl-nodes.mdx, docs/src/content/docs/index.mdx, docs/src/content/docs/llm-prompts.md, docs/src/content/docs/llm-prompts.mdx, docs/src/content/docs/showcases/breakout.mdx, docs/src/styles/custom.css, docs/src/styles/global.css, docs/src/utils/loadExample.ts, examples/package.json, examples/react/CLAUDE.md, examples/react/animation/App.tsx, examples/react/animation/README.md, examples/react/basic-sprite/App.tsx, examples/react/basic-sprite/README.md, examples/react/basic-sprite/index.html, examples/react/batch-demo/README.md, examples/react/batch-demo/src/App.tsx, examples/react/knightmark/App.tsx, examples/react/pass-effects/App.tsx, examples/react/pass-effects/index.html, examples/react/skia/index.html, examples/react/template/App.tsx, examples/react/template/README.md, examples/react/template/index.html, examples/react/tilemap/App.tsx, examples/react/tilemap/README.md, examples/react/tsl-nodes/App.tsx, examples/react/tsl-nodes/README.md, examples/three/animation/README.md, examples/three/animation/index.html, examples/three/animation/main.ts, examples/three/animation/package.json, examples/three/animation/public/sprites/coin.json, examples/three/animation/public/sprites/coin.png, examples/three/animation/public/sprites/knight.json, examples/three/animation/public/sprites/knight.png, examples/three/animation/tsconfig.json, examples/three/animation/vite.config.ts, examples/three/basic-sprite/README.md, examples/three/basic-sprite/index.html, examples/three/basic-sprite/main.ts, examples/three/basic-sprite/package.json, examples/three/basic-sprite/public/icon.svg, examples/three/basic-sprite/tsconfig.json, examples/three/basic-sprite/vite.config.ts, examples/three/batch-demo/README.md, examples/three/batch-demo/index.html, examples/three/batch-demo/main.ts, examples/three/batch-demo/package.json, examples/three/batch-demo/public/assets/buildings/Castle_Blue.png, examples/three/batch-demo/public/assets/buildings/House_Blue.png, examples/three/batch-demo/public/assets/buildings/Tower_Blue.png, examples/three/batch-demo/public/assets/deco/Tree.png, examples/three/batch-demo/public/assets/deco/rock1.png, examples/three/batch-demo/public/assets/deco/rock2.png, examples/three/batch-demo/public/assets/terrain/Shadows.png, examples/three/batch-demo/public/assets/terrain/Tilemap_Flat.png, examples/three/batch-demo/tsconfig.json, examples/three/batch-demo/vite.config.ts, examples/three/knightmark/index.html, examples/three/knightmark/main.ts, examples/three/knightmark/package.json, examples/three/knightmark/public/sprites/Dungeon_Tileset.png, examples/three/knightmark/public/sprites/knight.json, examples/three/knightmark/public/sprites/knight.png, examples/three/knightmark/tsconfig.json, examples/three/knightmark/vite.config.ts, examples/three/pass-effects/README.md, examples/three/pass-effects/index.html, examples/three/pass-effects/main.ts, examples/three/pass-effects/package.json, examples/three/pass-effects/public/icon.svg, examples/three/pass-effects/tsconfig.json, examples/three/pass-effects/vite.config.ts, examples/three/skia/index.html, examples/three/skia/main.ts, examples/three/skia/package.json, examples/three/skia/tsconfig.json, examples/three/skia/vite.config.ts, examples/three/template/README.md, examples/three/template/index.html, examples/three/template/main.ts, examples/three/template/package.json, examples/three/template/public/icon.svg, examples/three/template/tsconfig.json, examples/three/template/vite.config.ts, examples/three/tilemap/README.md, examples/three/tilemap/index.html, examples/three/tilemap/main.ts, examples/three/tilemap/package.json, examples/three/tilemap/tsconfig.json, examples/three/tilemap/vite.config.ts, examples/three/tsl-nodes/README.md, examples/three/tsl-nodes/index.html, examples/three/tsl-nodes/main.ts, examples/three/tsl-nodes/package.json, examples/three/tsl-nodes/public/sprites/knight.json, examples/three/tsl-nodes/public/sprites/knight.png, examples/three/tsl-nodes/tsconfig.json, examples/three/tsl-nodes/vite.config.ts, examples/vanilla/animation/README.md, examples/vanilla/animation/index.html, examples/vanilla/animation/main.ts, examples/vanilla/animation/package.json, examples/vanilla/animation/public/sprites/coin.json, examples/vanilla/animation/public/sprites/coin.png, examples/vanilla/animation/public/sprites/knight.json, examples/vanilla/animation/public/sprites/knight.png, examples/vanilla/animation/tsconfig.json, examples/vanilla/animation/vite.config.ts, examples/vanilla/basic-sprite/README.md, examples/vanilla/basic-sprite/index.html, examples/vanilla/basic-sprite/main.ts, examples/vanilla/basic-sprite/package.json, examples/vanilla/basic-sprite/public/icon.svg, examples/vanilla/basic-sprite/tsconfig.json, examples/vanilla/basic-sprite/vite.config.ts, examples/vanilla/batch-demo/README.md, examples/vanilla/batch-demo/index.html, examples/vanilla/batch-demo/main.ts, examples/vanilla/batch-demo/package.json, examples/vanilla/batch-demo/public/assets/buildings/Castle_Blue.png, examples/vanilla/batch-demo/public/assets/buildings/House_Blue.png, examples/vanilla/batch-demo/public/assets/buildings/Tower_Blue.png, examples/vanilla/batch-demo/public/assets/deco/Tree.png, examples/vanilla/batch-demo/public/assets/deco/rock1.png, examples/vanilla/batch-demo/public/assets/deco/rock2.png, examples/vanilla/batch-demo/public/assets/terrain/Shadows.png, examples/vanilla/batch-demo/public/assets/terrain/Tilemap_Flat.png, examples/vanilla/batch-demo/tsconfig.json, examples/vanilla/batch-demo/vite.config.ts, examples/vanilla/knightmark/index.html, examples/vanilla/knightmark/main.ts, examples/vanilla/knightmark/package.json, examples/vanilla/knightmark/public/sprites/Dungeon_Tileset.png, examples/vanilla/knightmark/public/sprites/knight.json, examples/vanilla/knightmark/public/sprites/knight.png, examples/vanilla/knightmark/tsconfig.json, examples/vanilla/knightmark/vite.config.ts, examples/vanilla/pass-effects/README.md, examples/vanilla/pass-effects/index.html, examples/vanilla/pass-effects/main.ts, examples/vanilla/pass-effects/package.json, examples/vanilla/pass-effects/public/icon.svg, examples/vanilla/pass-effects/tsconfig.json, examples/vanilla/pass-effects/vite.config.ts, examples/vanilla/skia/index.html, examples/vanilla/skia/main.ts, examples/vanilla/skia/package.json, examples/vanilla/skia/tsconfig.json, examples/vanilla/skia/vite.config.ts, examples/vanilla/template/README.md, examples/vanilla/template/index.html, examples/vanilla/template/main.ts, examples/vanilla/template/package.json, examples/vanilla/template/public/icon.svg, examples/vanilla/template/tsconfig.json, examples/vanilla/template/vite.config.ts, examples/vanilla/tilemap/README.md, examples/vanilla/tilemap/index.html, examples/vanilla/tilemap/main.ts, examples/vanilla/tilemap/package.json, examples/vanilla/tilemap/tsconfig.json, examples/vanilla/tilemap/vite.config.ts, examples/vanilla/tsl-nodes/README.md, examples/vanilla/tsl-nodes/index.html, examples/vanilla/tsl-nodes/main.ts, examples/vanilla/tsl-nodes/package.json, examples/vanilla/tsl-nodes/public/sprites/knight.json, examples/vanilla/tsl-nodes/public/sprites/knight.png, examples/vanilla/tsl-nodes/tsconfig.json, examples/vanilla/tsl-nodes/vite.config.ts, examples/vite.config.ts, microfrontends.json, package.json, packages/skia/src/ts/three/SkiaCanvas.ts, packages/skia/src/ts/three/SkiaFontLoader.ts, packages/skia/src/ts/three/index.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/loaders/TextureLoader.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TileMap2D.ts, packages/three-flatland/src/tilemap/TiledLoader.ts, packages/tweakpane/package.json, pnpm-lock.yaml, turbo.json
Stats: 226 files changed, 13743 insertions(+), 12005 deletions(-)

### 9f2167316eb943c984efb495c5af5ecab86d7665
feat: enhance tilemap zoom controls, improve stats monitoring, and update theme styles
Files: docs/src/components/ExamplePreview.tsx, docs/src/styles/retro-theme.css, examples/react/animation/App.tsx, examples/react/basic-sprite/App.tsx, examples/react/batch-demo/src/App.tsx, examples/react/knightmark/App.tsx, examples/react/pass-effects/App.tsx, examples/react/skia/App.tsx, examples/react/template/App.tsx, examples/react/tilemap/App.tsx, examples/react/tsl-nodes/App.tsx, examples/vanilla/animation/main.ts, examples/vanilla/basic-sprite/main.ts, examples/vanilla/batch-demo/main.ts, examples/vanilla/knightmark/main.ts, examples/vanilla/pass-effects/main.ts, examples/vanilla/skia/main.ts, examples/vanilla/template/main.ts, examples/vanilla/tilemap/main.ts, examples/vanilla/tsl-nodes/main.ts, packages/tweakpane/src/create-pane.ts, packages/tweakpane/src/index.ts, packages/tweakpane/src/react.ts, packages/tweakpane/src/react/use-pane-button.ts, packages/tweakpane/src/react/use-pane-folder.ts, packages/tweakpane/src/react/use-pane-input.ts, packages/tweakpane/src/react/use-pane.ts, packages/tweakpane/src/stats-graph.ts, packages/tweakpane/src/theme.ts
Stats: 29 files changed, 1181 insertions(+), 823 deletions(-)

### 8d3c36fbd71404688267de1bcb3502f7b36b4ad5
feat: add tsup config and update dependencies in pnpm-lock.yaml
Files: package.json, packages/tweakpane/package.json, packages/tweakpane/src/create-pane.ts, packages/tweakpane/src/index.ts, packages/tweakpane/src/plugins.ts, packages/tweakpane/src/react.ts, packages/tweakpane/src/react/use-fps-graph.ts, packages/tweakpane/src/react/use-pane-button.ts, packages/tweakpane/src/react/use-pane-folder.ts, packages/tweakpane/src/react/use-pane-input.ts, packages/tweakpane/src/react/use-pane.ts, packages/tweakpane/src/theme.ts, packages/tweakpane/tsconfig.json, packages/tweakpane/tsup.config.ts, pnpm-lock.yaml, pnpm-workspace.yaml
Stats: 16 files changed, 612 insertions(+), 164 deletions(-)
