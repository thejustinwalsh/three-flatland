---
date: 2026-04-28
branch: feat-vscode-tools
worktree: /Users/tjw/.claude/worktrees/vscode-tools
last-commit: 2625942 feat(preview): snapStep prop on RectOverlay — pixel-grid snap on move/resize
---

# Session Handoff — vscode-tools

Snapshot of where the FL tools suite sits so a fresh session can pick up without re-reading the full conversation.

## TL;DR

Sprite Atlas tool is **feature-rich through T1–T17 (sidecar load/save) + StyleX adoption (T18) + Atlas polish (T19–T22 batch)**. The toolbar's previously-decorative buttons are now live: zoom in/out/fit, Grid Slice, Auto Detect Sprites, and rect move/resize. `*.atlas.json` files have a custom file icon (default theme only) and a context-menu entry that resolves them back to their image. Working tree clean on `feat-vscode-tools`. Next unclaimed work: animation timeline (F, the `run-all` toolbar icon — needs design pass) or polish on the new tools.

## What's landed

### Shared packages (tools/*)
All build + typecheck clean. All packages source-only (no tsup; StyleX compile happens once in the Vite pass).

- **`@three-flatland/design-system`** — VSCode Elements (Lit) wrappers + custom primitives (`Button`, `Panel`, `Toolbar`, `ToolbarButton`, `DevReloadToast`). All styled via StyleX. Token bridge via `*.stylex.ts` files. `Panel.body` owns scroll + `Panel.shell` clips so panels work inside CSS-grid splits without bleeding. `ToolbarButton` is a custom wrapper that accepts `disabled` (the bare Lit React binding strips it from the React type).
- **`@three-flatland/bridge`** — typed RPC over `postMessage`.
- **`@three-flatland/io`** — `decodeImageData`, `loadImage`.
- **`@three-flatland/preview`** — R3F WebGPU Canvas + overlays:
  - `<CanvasStage>` owns viewport state (size, fit, **zoom, pan**), cursor store (frozen during line drags), decoded ImageData, and the anchor SVG used for image-pixel coord conversion.
  - `<RectOverlay>` — draw-to-create rects, select, **drag-to-move**, **8 resize handles**, optional `snapStep` for grid snapping (Shift bypasses).
  - `<GridSliceOverlay>` — draggable grid lines + paint-style cell pick (click toggles, drag toggles every crossed cell using the start cell's state to determine pick-or-unpick).
  - `<AutoDetectOverlay>` — connected-component blob outlines from `connectedComponents(imageData, opts)` (CCL); click toggles pick.
  - `<InfoPanel>` — bottom-right of viewport; color swatch + cursor coords with click-to-cycle px → uv+ → uv-.
  - Hooks: `useViewport`, `useViewportController` (zoomIn/Out/fitToView/setZoom/setPan), `useCursorStore`, `useImageData`, `useCursor`.

### `@three-flatland/vscode` (the VSIX)
- esbuild for extension host (ESM, `external: ['vscode']`); Vite for webview.
- Explorer context menu + command palette: "Open in FL Sprite Atlas" matches `*.png` AND `*.atlas.json`. Sidecar inputs resolve via `meta.image` (with filename-pattern fallback for unreadable sidecars).
- `AtlasCustomEditorProvider` + bridge wiring as before.
- `contributes.languages` registers `fl-atlas` for `*.atlas.json` with a custom 4×4 grid icon (`tools/vscode/icons/atlas-{light,dark}.svg`). `contributes.grammars` keeps JSON syntax highlighting via passthrough (`source.json`). Caveat: third-party icon themes (Material, vscode-icons, Catppuccin) ignore extension-contributed icons — none of those themes ship an atlas/tilemap/sprite icon today.
- Ajv 2020-12 (`Ajv2020` from `ajv/dist/2020`) — required because the schema declares `"$schema": "https://json-schema.org/draft/2020-12/schema"`. The default `Ajv` class only ships draft-07's meta-schema and throws "no schema with key or ref" at activation.

### Atlas tool webview (`tools/vscode/webview/atlas/App.tsx`)
- React 19, Suspense at outer + inner boundaries.
- `EditorMode` discriminant: `normal | slicing | autodetect`. Future `animation` variant goes here.
- Toolbar wired end-to-end: Grid Slice (modal), Auto Detect (modal), Draw/Select/Move (just sets `tool`), Rename, Zoom in/out/fit (via `useViewportController()` + `<ViewportControllerSink>` to lift the controller out of CanvasStage), Delete Selected, Clear All Rects, Save (Cmd+S). Animations icon still decorative.
- Right sidebar splits into Frames + active-tool panel (Slice or Auto Detect) with a draggable horizontal `<Splitter>` between (15%–85% clamp). Pattern is reusable for future tool panels.
- Frames panel groups rects into `<Collapsible>` sections by `<prefix>_<index>` group key. Shift-click a section header → select that group's frames.
- Multi-commit workflow: Slice / Auto Detect commit creates rects but stays in the tool, clearing picks. Cancel/Esc exits.
- Cursor freezes on grid-line drag + viewport pan.
- Wheel = zoom-toward-cursor; middle-drag or Space+drag = pan.

### Schema + sidecar (T15–T17)
- Schema: `packages/three-flatland/src/sprites/atlas.schema.json`.
- `bridge.atlas/save` writes `<basename>.atlas.json`; `bridge.atlas/init` seeds from sidecar on open.
- Sidecar load fully validated; broken sidecar surfaces as a non-fatal toast.

## Bridge message inventory

| Channel | Direction | Purpose |
|---|---|---|
| `atlas/ready` | webview → host | Signals mount complete; host loads sidecar |
| `atlas/init` | host → webview | Initial payload: image URI, filename, existing rects, load error |
| `atlas/save` | webview → host | Snapshot of rects; host ajv-validates + writes sidecar |
| `client/log` | webview → host | Forwards browser console to OutputChannel |
| `dev/reload` | host → webview | Notifies the webview's DevReloadToast that a rebuild landed |
| `dev/reload-request` | webview → host | Toast Reload click → host re-renders panel.webview.html |

## Open threads / next steps

1. **Animation timeline (F)** — `run-all` toolbar icon. Schema needs `meta.animations` field. UI: timeline strip with frame-duplication for holds. Needs a brainstorm pass before implementation.
2. **Snap UI surface** — `snapStep` prop on RectOverlay exists but no toolbar control yet. Add a small "snap" toggle or numeric input.
3. **Schema test parity** — `packages/three-flatland/src/sprites/atlas.test.ts` with `__fixtures__/valid|invalid/`.
4. **Workspace-version resolver** — designed in `mvp-sprite-atlas.md`, not built. Bundled-only at runtime.
5. **Other tools** — ZzFX Studio, Normal Baker (waits on `lighting-stochastic-adoption` merge for `packages/normals`), Image Encoder.
6. **Auto-detect upstream PRs** — third-party icon themes don't ship an atlas icon; PRs would require designing in each theme's house style. Defer until we have multiple sidecar conventions to batch.

## Known gotchas (from commits)

- Cmd+A / Cmd+S must `preventDefault` unconditionally + capture phase — VSCode host eats them otherwise.
- Root div needs `tabIndex` + focus-on-mount + focus-on-empty-click for keyboard shortcuts.
- Live reload: don't use `location.reload()` — host reassigns `webview.html`. Watch `dist/webview/` root.
- Webview CSP must include `img/font/media/connect/worker/frame` directives.
- **SVG overlays must use `viewBoxFor(vp)` not `0 0 imageW imageH`** — otherwise SVG-local image-px are misaligned by `(fitMargin - 1)` of the visible area, plus the new pan/zoom transforms.
- **StyleX consumers MUST import tokens via the subpath exports** (`@three-flatland/design-system/tokens/<name>.stylex`), not via the barrel — StyleX's babel plugin can't follow `defineVars` re-exports through `index.ts`.
- **Cursor color sampling uses `loadImage()` not `fetch()`** — `vscode-webview://` URIs hit opaque CORS/CSP errors with fetch but work with `<img>`.
- **Ajv2020 required** — the schema declares draft 2020-12; default `Ajv` from `'ajv'` throws at module load.

## Key files to orient a new session

- Plan: `planning/vscode-tools/README.md`, `planning/vscode-tools/mvp-sprite-atlas.md`, `planning/vscode-tools/schemas/README.md`.
- Tool UI: `tools/vscode/webview/atlas/App.tsx`, `tools/vscode/extension/tools/atlas/{provider,sidecar,validateAtlas,register}.ts`.
- Schema: `packages/three-flatland/src/sprites/atlas.schema.json`.
- Shared packages: `tools/{design-system,bridge,io,preview}/src/`.
- Spec + plan + skill: `planning/superpowers/specs/2026-04-23-design-system-stylex-design.md`, `planning/superpowers/plans/2026-04-23-design-system-stylex.md`, `.claude/skills/stylex/`.

## Build / run

```
pnpm install
pnpm --filter @three-flatland/vscode build
# F5 in VSCode with this worktree opened → Extension Development Host
```
