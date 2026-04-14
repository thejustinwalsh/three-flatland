# Dungeon Torchlight — the lighting demo we want to revive

## History

Two ancestor demos, merged into one vision:

1. **`examples/react/lighting/App.tsx` as of commit `8d6e135` ("feat(wip): 2D lighting system")** — the original "Dungeon Torchlight" demo. 346 lines. Draggable torches (orange `0xff6600`, amber `0xffaa00`), flickering via sin-wave intensity modulation, low ambient (`0x111122`), 3 idle knight sprites in a row. Hotkeys for toggles + ambient adjust. Title literally was "Dungeon Torchlight." Lives on the `feat-lighting-postprocess-flatland` branch.

2. **`examples/react/knightmark/App.tsx` as of commit `931458f` ("feat: ECS batching")** — the Vampire-Survivors-style knight swarm. Dungeon tileset floor (`Dungeon_Tileset.png`), knight spritesheet, random knights wandering + colliding via spatial hash, y-sort by `zIndex = -floor(y)`, spawn-100-more button. No lighting. Lives on `main`.

Assets that exist in repo history:
- `examples/react/knightmark/public/sprites/Dungeon_Tileset.png` (16px tiles, 8 cols × 6 rows) — current
- `examples/react/knightmark/public/sprites/knight.png` + `knight.json` (idle / run / roll / death animations) — current
- The existing `examples/react/lighting/` on the PR branch has a 560-line App.tsx with torches + flicker + draggable indicators but no tilemap, no animated knights, no shadow casters

## What the revived demo should show off

The lighting pipeline's capabilities, all at once, in a scene that looks good:

| Capability | How it shows up |
|---|---|
| Point lights with distance falloff | Torches + glowing slimes |
| Ambient | Low base illumination, tunable |
| Per-point flicker | Torches use the old sin-wave modulation; slimes do a subtle pulse |
| **Cel-shaded / quantized lighting** | `DefaultLightEffect.bands = 4` on by default, tunable via Tweakpane |
| Sprite-normal lighting | Knights + slimes get `AutoNormalProvider` so they pop volumetrically |
| **SDF-traced soft shadows** | Pillars / columns cast shadow on the floor as torches move past. T8's primary verification signal. |
| Forward+ tiling | 16 lights max per tile — demo can push toward that with slimes |
| Reservoir overflow | Dense slime cluster should degrade gracefully (strongest lights win in a tile) |

Torches stay at 2 (draggable). Slimes provide the density — **8-16 glowing slimes** wandering the dungeon, each a point light (green, `0x33ff66`, intensity ~0.5, distance ~60). Plus ambient. Gets us to 10-19 active lights.

## Scene composition

- **Dungeon floor**: `TileMap2D` with a 40×24-tile floor pattern from `Dungeon_Tileset.png`, random tile variation for texture. `castsShadow = false` on floor tiles.
- **Pillars / columns**: 6-8 `Sprite2D`s placed in a grid, `castsShadow = true`, use some existing dungeon-tileset column tile (or a simple rect sprite if no column tile exists — this demo is about lighting, not art polish). Opaque.
- **Knights**: 3-6 animated knights (idle or roll, animated), `castsShadow = true`, `AutoNormalProvider` attached. They move slowly between wander waypoints.
- **Slimes**: 8-16 sprites (green-tinted knight sprite re-use works — it's the demo, not a shipped game), `castsShadow = true`, wander like knights but smaller + faster + each one carries a `Light2D` (point, green, flicker). `AutoNormalProvider` attached.
- **Torches**: 2 `Light2D` point lights, draggable, orange/amber with flicker. No sprite attached (just a gizmo overlay indicator).
- **Ambient**: 1 `Light2D` ambient, dim blue-grey, tunable via UI.

## Controls (Tweakpane, the current convention)

- Torch 1 / Torch 2 — enable, color (color picker), intensity, distance, flicker-amplitude
- Ambient — color + intensity
- Slime count — slider 0..16
- Bands — slider 0 (smooth) to 8 (sharp cel-shading)
- Shadow strength / softness / bias — sliders
- Show shadow atlas — toggles a debug overlay of the SDF texture
- Spawn/reset knights — button

## Old → new API mapping

The old demo used an API surface that has evolved substantially:

| Old API | Current equivalent |
|---|---|
| `new Sprite2DMaterial({ map, lit: true })` | `new Sprite2DMaterial({ map })` — lit is a **sprite** flag now (`sprite.lit`), not a material flag. Default `true`. |
| `<flatland viewSize={300} clearColor={…}>` + `<light2D ...>` + `<sprite2D ...>` | Same shape, same R3F JSX names. `Flatland` extends Group. |
| `flatland.render(gl)` in `useFrame` | Unchanged — still the canonical render-hook pattern. |
| Auto-lighting when material `lit: true` | Now: `flatland.setLighting(new DefaultLightEffect())` attaches the LightEffect, per-sprite `lit` flag gates individual participation. Default on. |
| Shadow-free rendering (no SDF) | Now: `DefaultLightEffect` declares `needsShadows = true`, and `sprite.castsShadow = true` opts a sprite into the occlusion pre-pass. |
| Normal-agnostic shading | Now: `DefaultLightEffect.requires = ['normal']`, so lit sprites need either `AutoNormalProvider` (runtime) or `NormalMapProvider` (baked). |

## Implementation plan

Single PR, builds on `lighting-stochastic-adoption`:

1. Rebuild `examples/react/lighting/App.tsx` from scratch to match this spec. Keep the 560-line existing file around in the diff so side-by-side is easy.
2. Mirror to `examples/three/lighting/main.ts` for vanilla parity (project convention — examples always ship in pairs).
3. Add pillar sprite(s) (if no suitable tileset tile, draw a simple 16×32 dark-grey rect into a DataTexture on the fly — this is the demo, don't block on art).
4. Hook up `DefaultLightEffect` via `flatland.setLighting(new DefaultLightEffect())` with `needsShadows = true`. The Phase 1 SDF shadow pipeline landed in `658a4fb` will do the rest: occlusion pass every frame, SDF refresh, shader-side sphere-trace.
5. Tweakpane wiring to match the controls list above.
6. Verify visually:
   - Move a torch toward a pillar → shadow falls on the floor on the far side
   - Slimes glow + illuminate nearby knights as they wander
   - Reduce `bands` → smooth ramp; raise to 4 → cel-shaded posterized look
   - Disable `shadowStrength` → shadows vanish uniformly
   - Toggle torches off + ambient up → scene brightens evenly

## Acceptance criteria

- **Visually shows the core primitives** listed under "What the revived demo should show off."
- **Frame time at 1080p with 2 torches + 10 slimes + 6 knights + 8 pillars** measurable and logged — that's the baseline for the Phase 1 → Phase 2 transition gate (`planning/experiments/SDF-Shadow-Atlas.md`).
- **No regressions**: existing knightmark + other examples still render correctly.
- **Both react and three variants** exist and behave identically.

## Stretch / follow-on

After baseline lands, churn on it:
- Animated torch flames as sprites (not just lights)
- Slime trails (fading glow sprites behind them)
- A boss slime that's bigger + brighter + slower
- Player-controlled knight with WASD
- Door/tile-puzzle that shadows can solve

This spec captures the baseline — just enough to prove Phase 1 works and give us a demo that doesn't look embarrassing.
