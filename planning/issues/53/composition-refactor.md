# Composition refactor — RT-based fixed-mobile-portrait layout

**Goal:** Fix the playfield to a mobile-portrait shape, render the game scene to a texture, and composite a layered viewport with a blurred ambient background under the gameplay rect.

**Branch:** `mini-game-showcase` (no new PR).

---

## End-state composition

```
viewport (full host element, e.g. 1920×1080 desktop or actual mobile)
├── layer 0: biome-tinted color gradient (fullscreen, parallax layer placeholder)
├── layer 1: game RT.texture — nearest-neighbor upscaled (preserves blockiness) +
│            light DoF-style blur + mild desaturation + alpha blend
└── layer 2: game RT.texture — pixel-perfect scale, centered (the gameplay rect)
```

Future: layer 1 becomes 3-4 parallax tile-map layers (biome-themed art assets); the
ambient-blur layer stays as the deepest scene texture.

## Decisions

- **PLAY_ROWS = 40** (9:20 ratio, modern mobile portrait). Logical = 288×640.
- **Pixel-perfect scale**: largest integer `s` from SCALE_STEPS where
  `40 × 16 × s ≤ viewportH` AND `18 × 16 × s ≤ viewportW`. Height-first means
  we don't grow rows past 40 even if viewport could fit more — fixed shape.
- **Background blur**: pixelated upscale (nearest) THEN a 2-pass DoF-style
  blur (small kernel, doesn't destroy blockiness). Mild desat (~25%). Alpha
  (~0.85) to blend with host page bg, fallback to clear color if alpha blend
  costs too much.
- **Solid color behind gameplay rect** (visible through AIR cells): biome-
  tinted gradient (placeholder for future parallax tile layers).
- **HUD**: unchanged, DOM overlay over the composite.

## Phases

### Phase 0 — kill the custom cursor reticule (folded in)
- Reticule won't work on mobile and bloats the composite (it's a `fixed`-positioned `mixBlendMode: difference` DOM ring tracking the pointer trait).
- Delete `src/components/HoverCursor.tsx`, remove its import + JSX use in `Game.tsx`.
- Remove `cursor: 'none'` from the host `<div>` — restore the system cursor.
- The `Pointer` trait stays (input system still uses it for click resolution and `hoverAction`); only the DOM-side reticule rendering is removed.
- Tooltip system replacement is a separate workstream — out of scope here.

### Phase 1 — constants + scale
- `PLAY_ROWS = 40` (new, replaces `MIN_PLAY_ROWS` semantics)
- Keep `SCALE_STEPS = [1, 2, 4, 8]`
- `lib/scale.ts`: rewrite `computePlayCanvas` — fixed 40 rows, pick largest
  scale that fits, height-first then width. No more dynamic row growth.
- Update callers: `cam.rows` initial = 40, `TileRenderer.POOL_ROWS = 40 + 4`.

### Phase 2 — Flatland render-to-texture
- Create a `RenderTarget` sized to logical pixels (288 × 640).
- Pass it via `<flatland renderTarget={rt}>` — game now renders to RT, not canvas.
- `flatland.render(gl)` already handles RT bind/restore internally.

### Phase 3 — composite scene
- New `Compositor.tsx` component, sibling to `<flatland>` inside the Canvas.
- Three layers, each a `<sprite2D>` or custom mesh in a top-level R3F scene
  (not inside the game Flatland):
  - **layer 0 — gradient bg**: fullscreen quad with TSL gradient material
    (biome-tinted top/bottom stops). Sized to canvas.
  - **layer 1 — ambient blur**: fullscreen quad sampling `gameRt.texture`.
    Material does (a) nearest-neighbor upscale [via texture filter], (b)
    light DoF blur (5-tap), (c) mild desat (mix toward luminance), (d) alpha.
  - **layer 2 — gameplay rect**: quad sized to `288*scale × 640*scale`,
    centered, sampling `gameRt.texture` with nearest filter and full opacity.
- Render order: layer 0 → 1 → 2.
- Implementation: a second `<flatland>` won't fit cleanly (it's a batched
  sprite engine for game content). Use bare `<mesh>` or `<sprite>` with TSL
  node materials inside the main R3F scene, rendered AFTER the game RT.

### Phase 4 — Verify
- `pnpm test` and `pnpm test:integration` should still pass — no sim changes.
- Vitexec screenshot at multiple viewport sizes (desktop wide, mobile portrait,
  square). Verify:
  - Gameplay rect always 288×640 logical, centered
  - Pixel-perfect scale picks correctly (no half-pixel sprite seams)
  - Background blur visible, biome tint reads at edges
  - Cracking gradient still readable inside gameplay rect

### Phase 5 — Commit + push
Per-phase commits; one branch.

## Files touched

| File | Change |
|---|---|
| `src/constants.ts` | `PLAY_ROWS = 40`; remove/repurpose `MIN_PLAY_ROWS` |
| `src/lib/scale.ts` | Fixed-rows + height-first scale logic |
| `src/components/PlayCanvas.tsx` | Canvas sizes to full host viewport (not gameplay rect) |
| `src/components/Scene.tsx` | Flatland gets a `renderTarget` prop; expose RT to compositor |
| `src/components/Compositor.tsx` *(new)* | Three-layer composite |
| `src/materials/composite-materials.ts` *(new)* | TSL: gradient bg, blur-desat ambient, passthrough fg |
| `src/components/TileRenderer.tsx` | `POOL_ROWS = PLAY_ROWS + 4` |
| `src/world.ts` | `Camera({ rows: PLAY_ROWS, ... })` |

## Risk / unknowns

1. **TSL blur in flatland-r3f context.** Need to confirm the TSL nodes
   we'll use exist in the version we have. A simple gaussian-style 5-tap
   blur via `texture(uv).add(texture(uv + dx)).div(...)` should be cheap.
2. **Canvas alpha vs perf.** User said: if alpha-blended canvas is costly,
   fall back to opaque canvas with a clear color that the user can match to
   their site bg. Default to alpha:true, profile if needed.
3. **Pointer/click hit-testing.** Pointer events currently translate
   coords assuming the Canvas IS the gameplay rect. After this change,
   the Canvas covers the whole viewport but only the centered rect is
   gameplay. Need to subtract the rect offset in `pointerWorldCell`.
   *This is the one piece that could break input — single line to fix.*

## Out of scope (for this refactor)

- Parallax tile-map art layers (layer 0 enhancement) — future work.
- Per-biome blur kernel tuning.
- HUD repositioning if it conflicts with the new framing.
