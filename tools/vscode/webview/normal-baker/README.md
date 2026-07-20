# FL Normal Baker — webview

Visual region editor for a `NormalSourceDescriptor` (issue #149). This
directory is the **webview only** — no file I/O, no `.normal.png` /
`.normal.json` writing, no schema validation. The host service (VSCode
command, custom-editor or ad-hoc registration, file reads/writes, ajv
validation via `@three-flatland/schemas/normal-descriptor`) is a separate
unit landing after this one; this doc is what it should build against.

## Bridge contract

Follows the same handshake convention as every other tool — see
`tools/bridge/AGENTS.md` and `tools/vscode/AGENTS.md` "Bridge handshake
convention" for the general shape.

```
Webview boots → bridge.request('normalBaker/ready')
Host responds  → bridge.emit('normalBaker/init', { uri, fileName, descriptor?, loadError? })
```

### `normalBaker/init` (host → webview, event)

```ts
type InitPayload = {
  /**
   * Image source for CanvasStage's `imageUri` prop. Either a
   * `vscode-webview://…` resource URI (the atlas tool's pattern —
   * `webview.asWebviewUri(document.uri)`, reusing `localResourceRoots`,
   * no serialization cost) OR a `data:image/png;base64,…` URL.
   *
   * Both work identically: `CanvasStage`'s decode pipeline
   * (tools/preview/src/CanvasStage.tsx) does `fetch(uri)` →
   * `createImageBitmap` → off-main-thread `drawImage`+`getImageData`,
   * and `fetch()` handles `data:` URLs natively in the VSCode webview's
   * Chromium runtime. This is why the contract has a single `uri` field
   * rather than the `imageBytes | imageDataUrl` alternative sketched in
   * the original spec — a data URL already IS an "imageDataUrl", and
   * collapsing it into the same field CanvasStage already consumes
   * avoids a second, webview-side decode path. Prefer the
   * `vscode-webview://` form when a resource root is available (no
   * payload-size cost); fall back to a `data:` URL when it isn't.
   */
  uri: string
  fileName: string
  /**
   * Existing sidecar, if one was found and passed ajv validation
   * (@three-flatland/schemas/normal-descriptor — host-side only, not
   * this webview's concern). `undefined`/`null` when no sidecar exists
   * yet — the editor starts from an empty region list and empty
   * defaults (see `descriptorToState(null)` in ./descriptorIO.ts).
   */
  descriptor?: NormalSourceDescriptor | null
  /** Set when a sidecar existed but failed to parse/validate. Non-fatal — surfaced as a banner, editor still usable. */
  loadError?: string | null
}
```

### `normalBaker/ready` (webview → host, request)

No params. Sent once on mount, listener for `normalBaker/init` registered
first (race-avoidance, per the bridge's handshake convention).

### `normalBaker/save` (webview → host, request)

```ts
type SavePayload = {
  descriptor: NormalSourceDescriptor
  /**
   * Reserved for bake-time flags OUTSIDE the descriptor schema (e.g. an
   * output-overwrite policy). Currently always `{}` — `strength` and
   * `bump` are genuinely descriptor fields, not a separate "bake
   * options" bag: `resolveRegion()` in
   * packages/normals/src/descriptor.ts reads
   * `region.strength ?? descriptor.strength ?? DEFAULT_STRENGTH` (same
   * for `bump`), and the CLI's `--strength`/`--bump` flags write
   * directly onto the descriptor object (packages/normals/src/cli.ts).
   * So both already live in `descriptor`, and this webview's Inspector
   * (defaults view) edits them there. Keeping `options` in the contract shape
   * anyway for stability/extensibility even though it's empty today.
   */
  options: Record<string, never>
}
// Expected host response: { ok: true, sidecarUri: string } (mirrors atlas/save's shape) — host's call to make.
```

The webview sends regions **exactly as the store holds them** (minus the
client-only `id`) — no default-comparison stripping. A field the user
explicitly set stays explicit even if it currently equals the descriptor
default, so it survives a later edit to that default unchanged (an
earlier version of this contract normalized on write; that was reversed
— see `fieldResolution.ts`'s module doc for why). A field only stays
omitted (inherited) when the user never wrote to it in the first place.
`version` is always stamped `1`.

The host is expected to:

1. Validate the incoming descriptor with `@three-flatland/schemas/normal-descriptor` (defense in depth — the webview already only ever produces well-formed shapes, but the host is the trust boundary).
2. Bake `<source>.normal.png` via `packages/bake`/`packages/normals` (Node-side — `@three-flatland/normals/node`) and write `<source>.normal.json`.

### `normalBaker/dirty` (webview → host, request)

```ts
type DirtyPayload = { isDirty: boolean }
```

Sent whenever the document content (regions/defaults) changes relative to
the last load or successful save. Best-effort from the webview side — the
request is fire-and-forget with a swallowed rejection, so it's safe for
the host handler to not exist yet. Intended use on the host side: tab
dirty-dot / "unsaved changes" prompt on panel close, mirroring VSCode's
native custom-editor dirty state if this becomes a `customEditors` entry
rather than an ad-hoc command (see `tools/vscode/AGENTS.md`'s "Two
patterns: custom editor vs ad-hoc command" for that decision).

## What's implemented in this directory

- **Canvas region editor** — `App.tsx` mounts the shared
  `CanvasStage`/`Viewport` (`@three-flatland/preview/canvas`, lazy-loaded)
  with two overlay layers: `RegionColorOverlay.tsx` (non-interactive SVG
  fill per region, tinted by resolved `direction` via `direction.ts`'s
  `directionColor()`, plus the region index labels — the baker passes
  `showLabels={false}` to `RectOverlay` and draws its own labels with the
  fit-ALWAYS policy in `regionLabelFit.ts`, not preview's fit-or-hide)
  underneath the shared `RectOverlay` (all pointer interaction — select /
  drag-move / resize-handles / draw-new-rect / grid-snap via `snapStep`).
  See "Reused as-is vs. composed locally" below for exactly what
  `RectOverlay` does and doesn't provide.
- **Sidebar layout** — Regions (list, top) / Info (inspector + previews,
  bottom) split with a draggable, persisted `Splitter` (encode's
  adjustable Compare|Info idiom). The Info height is clamped live against
  the sidebar's rendered bounds (not just the store's 160–640 backstop)
  and re-clamped on resize, so the stored height always equals the
  rendered height. The Info sub-areas — Inspector, Normal, Lit — are
  store-controlled `Collapsible`s (`InfoSection.tsx`, encode's
  InfoSection shape), each independently collapsible with persisted open
  state. While grid mode is active (toolbar "Grid Slice" toggle) the Info
  panel swaps to the Grid & Split tool panel (Atlas's mode-driven
  sub-tool idiom) and returns to the inspector on exit.
- **Region list** — `RegionListPanel.tsx`. Selection is bidirectional
  with the canvas (`selectedIds` lives in the Zustand store); reorder is
  ▲/▼ buttons per row (not drag-and-drop — see note below).
- **Inspector** — `Inspector.tsx`, one selection-aware panel. Exactly one
  region selected → edit THAT region: x/y/w/h (`NumberField`), direction
  (`DirectionCompass.tsx`, local 9-way + flat picker), pitch/elevation
  (`Slider.tsx`, local horizontal-track primitive), strength
  (`NumberField`), bump source (`CompactSelect`, full `NormalBump` enum —
  alpha/luminance/red/green/blue/none — not just the CLI's alpha/none
  subset, since the descriptor type and baker support all six), with a
  per-field reset-to-inherited button on every overridable field. Every
  field the user touches is written back explicitly, even if it currently
  equals the descriptor default — see `fieldResolution.ts`'s module doc.
  Nothing selected → edit the descriptor-level defaults every region
  inherits (direction, pitch, elevation, strength, bump — elevation
  wasn't explicitly named in the original spec's Defaults bullet, but
  `descriptor.elevation` is a real inheritable field per `descriptor.ts`,
  so it's included). Multi-selection edits neither (bulk region edit and
  defaults edit would look identical — a hint says how to disambiguate).
- **Live preview** — `LivePreviewPanel.tsx`. Two independently
  collapsible sections sharing ONE bake: the baked
  normal map (direct `bakeNormalMap()` call from `@three-flatland/normals`
  — see "Browser-safe bake math" below) and a lit composite driven by a
  continuous rAF loop with an orbiting light (`preview.ts`'s
  `orbitingLight()`/`computeLitComposite()`). Elevation-aware 2D Lambert
  `max(0, N·L)` — the light's Z is computed PER PIXEL as
  `lightHeight − elevation`, reading the baked map's B channel, matching
  `DefaultLightEffect`'s real-time formula
  (`packages/three-flatland/src/materials/channels.ts`) rather than
  applying one flat light vector across every elevation. Debounced 200ms
  on descriptor/pixel change so a fast drag doesn't re-bake every frame.
  `prefers-reduced-motion` pins the light instead of orbiting it
  (`usePrefersReducedMotion` local hook in `LivePreviewPanel.tsx`), and
  the loop pauses entirely while the Lit section is collapsed.
- **Standalone dev mode** — `main.tsx`/`App.tsx` detect a missing
  `acquireVsCodeApi()` and load `fixtures.ts` (the Dungeon_Tileset fixture
  from `examples/react/lighting/public/sprites/`, inlined as a base64
  `data:` URL + the descriptor JSON as a TS object literal) instead of
  waiting on the bridge handshake. Inlined rather than imported by
  relative path so it works identically whether `dist/webview/normal-baker/index.html`
  is opened via `file://`, a static server, or anything else — no runtime
  dependency on paths outside this webview's Vite root.

## Browser-safe bake math

`bakeNormalMap()` from `@three-flatland/normals`'s **root** export (not
`/node`) is pure RGBA-buffer math — no `fs`, no `pngjs`; those live behind
the separate `@three-flatland/normals/node` entry point. The exact same
function the CLI and runtime loader call also drives this webview's live
preview (`preview.ts`'s `bakePreviewNormalMap()` is a one-line wrapper for
a `Uint8ClampedArray`→`Uint8Array` view conversion, nothing more) — no
duplicate bake implementation exists in this directory. The only math
that had to be written locally is the **lit-composite** render
(`computeLitComposite()`/`orbitingLight()` in `preview.ts`), because that's
presentation (a rotating-light preview), not part of the bake contract —
there's no browser-safe counterpart for it in `packages/normals` because
there's nothing for it to be a counterpart of.

## Reused as-is vs. composed locally

Per the brief: reuse `tools/preview`'s rect widget as-is, don't fork it.
What that actually gets you, precisely (see `tools/preview/AGENTS.md`):

- **`RectOverlay` is single-color for every rect** — "No per-rect color or
  stroke prop." Region-by-direction coloring is therefore a second,
  non-interactive SVG layer (`RegionColorOverlay.tsx`) rendered
  _underneath_ `RectOverlay`, not a fork of it. `RectOverlay` still owns
  100% of the pointer interaction; its selection chrome draws on top of
  the color fills.
- **"Marquee-select" in the brief's wording ≈ `RectOverlay`'s actual
  multi-select model**: shift-click to add/remove from `selectedIds`,
  then drag any selected rect to move the whole selection together (the
  component's own source comment calls this "marquee-move a
  multi-selection"). There is **no rubber-band drag-select-over-empty-
  space** in `RectOverlay` today — grepped for `marquee` in
  `tools/preview/src`; the only hit is that one comment. If true
  rubber-band marquee selection is wanted later, that's a
  `tools/preview` feature addition (shared-widget territory), not
  something to fork into this directory.
- **Grid-snap** is `RectOverlay`'s `snapStep` prop, not
  `GridSliceOverlay` (that's the atlas tool's whole-grid frame-extraction
  UI — a different feature, listed as atlas-specific in
  `tools/preview/AGENTS.md`'s "What is atlas-tool-specific" section, not
  wired into this tool).
- **`DirectionCompass.tsx` and `Slider.tsx` are new local primitives.**
  Neither has a design-system or `tools/preview` equivalent — `Slider`'s
  closest cousin is `NumberField`'s vertical drag-decorator, which is a
  bounded numeric input, not a horizontal track widget. Both are promotion
  candidates for `tools/design-system` if a second tool ends up needing a
  direction picker or a slider; not promoted preemptively since this tool
  is the only current consumer (matches this repo's `tools/design-system`
  "add a primitive" guidance — promote on second use, not first).

## Files

| File                                                                                    | What                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `App.tsx`                                                                               | Root component — bridge handshake, layout, CanvasStage wiring                                    |
| `main.tsx` / `index.html`                                                               | Boot shell (copied from atlas/merge's pattern)                                                   |
| `normalBakerStore.ts`                                                                   | Zustand + zundo store — regions, defaults, selection, undo                                       |
| `regionOps.ts` / `regionOps.test.ts`                                                    | Region add/remove/reorder/replace reducers (pure)                                                |
| `direction.ts` / `direction.test.ts`                                                    | Direction → hue/color mapping, compass-cell resolution (pure)                                    |
| `fieldResolution.ts` / `fieldResolution.test.ts`                                        | Region-vs-descriptor field resolve for display (pure)                                            |
| `descriptorIO.ts` / `descriptorIO.test.ts`                                              | Descriptor ⇄ store-state conversion, incl. round-trip tests (pure)                               |
| `preview.ts` / `preview.test.ts`                                                        | Bake wrapper + lit-composite Lambert math + light rig (pure)                                     |
| `sliderMath.ts` / `sliderMath.test.ts`                                                  | Slider drag/click/step math (pure — split out so importing it doesn't need the StyleX transform) |
| `DirectionCompass.tsx`                                                                  | 9-way + flat direction picker                                                                    |
| `Slider.tsx`                                                                            | Horizontal drag-track numeric input                                                              |
| `RegionColorOverlay.tsx`                                                                | Non-interactive direction-tinted region fills + fit-ALWAYS index labels                          |
| `regionLabelFit.ts` / `regionLabelFit.test.ts`                                          | Label fit math — fit-ALWAYS policy vs preview's fit-or-hide (pure)                               |
| `RegionListPanel.tsx` / `Inspector.tsx` / `LivePreviewPanel.tsx` / `GridSlicePanel.tsx` | Sidebar panels — Regions list, selection-aware inspector, live preview, grid-mode tool panel     |
| `InfoSection.tsx`                                                                       | Store-controlled `Collapsible` wrapper for the Info sub-areas                                    |
| `fixtures.ts`                                                                           | Standalone dev-mode fixture (embedded, not imported by path)                                     |
