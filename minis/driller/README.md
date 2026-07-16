# @three-flatland/mini-driller — Driller Homie

> Mr. Driller × tamagotchi — autonomous chibi miner with mood-driven AI and one-touch user interactions.

## What it is

A self-running mini-game for the three-flatland docs hero (and a standalone `/play` route). The driller digs continuously through procedurally-generated terrain. Visitors can intervene with single-tap actions:

- **Tap a gem** to magnetically collect it (free)
- **Tap a sagging chunk** to brace it (1 gem) — gives the AI time to escape
- **Tap intact ceiling** to trigger a sag (free, evil) — force a controlled collapse
- **Tap the driller** to pet them — but over-pet and they get annoyed!

The AI's mood (greed/fear/drive) drifts and reacts to events; it picks one of three planners (greedy descender / gem seeker / cautious miner) with hysteresis so behavior is _human-flawed_, not mechanically optimal.

## Modes

```tsx
<Driller mode="hero" zzfx={zzfxFn} />     // attract loop, infinite lives
<Driller mode="full" zzfx={zzfxFn} />     // title screen + 3 lives + leaderboard
```

| Mode   | Behavior                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero` | Embedded loop. No chrome. Driller never permanently dies. When the driller crosses ~250m the world rotates: new seed, depth resets, `worldNumber` ticks up.   |
| `full` | Title attract screen → tap to begin → 3 lives. Crush deaths decrement lives; on third death a leaderboard prompt collects a name and saves to `localStorage`. |

## Run it

```bash
# Standalone dev (port 5210, picks live port via Turbo)
pnpm --filter @three-flatland/mini-driller dev:app

# Library watch build (used by the docs site)
pnpm --filter @three-flatland/mini-driller dev

# Tests
pnpm --filter @three-flatland/mini-driller test
pnpm --filter @three-flatland/mini-driller typecheck
```

## Architecture

- **Renderer**: `Flatland` from `three-flatland/react` (sprite batching + orthographic camera). The driller is a Y-down cell grid; the camera flips Y once when applying to Three's Y-up scene.
- **ECS**: Koota traits split into `world-traits` (singletons), `grid-traits`, `driller-traits`, `chunk-traits`, `gem-traits`, `particle-traits`, `input-traits`. Static world creation in `src/world.ts` with HMR guard via `globalThis.__drillerWorld`.
- **Responsive scaling**: `src/lib/scale.ts` picks the largest integer step (1×/2×/4×/8×) that fits the host viewport while keeping at least `MIN_PLAY_ROWS=22` rows visible; `PLAY_COLS=18` is fixed.
- **Tile model**: 4 classes — AIR / SOIL / STONE / FIXTURE. SOIL and grass-cap are one physics material; stone and fixtures (bones, mushrooms, crystal clusters) are anchors.
- **Collapse physics** (`src/systems/collapse.ts`): 4-connected SOIL chunk detection → sag telegraph (~0.7s) → falling rigid body → land + autotile re-resolution. `MAX_CHUNK_HEIGHT=12` cap keeps drops fair. Crush detection feeds the death system.
- **Mood AI** (`src/systems/ai-mood.ts`, `ai-planner.ts`): three axes drift toward target with `MOOD_LERP`; dominant axis picks planner with `MOOD_SWITCH_THRESHOLD` hysteresis and `PLAN_COMMIT_TICKS` sunk-cost window.
- **Generation** (`src/systems/generation.ts`): five biome bands (topsoil → deep-dirt → stoneworks → crystal-caverns → core), 32-row streamed chunks, cellular-automata caves, biome-weighted gem palette (4 colors: emerald/topaz/ruby/amethyst), seedable.
- **Audio**: `systems/sounds.ts` exports ZzFX param presets (`dig`, `gemCollect`, `sagWarning`, `chunkImpact`, `brace`, `trigger`, `pet`, `overPetGrunt`, `crush`, `respawn`, `worldFall`); the App-level `zzfx` prop is the bridge.

## Art pipeline

`art/source/driller-concept-sheet.png` (1536×1024) is the single source of truth for the presentation art. `art/extract-manifest.json` defines nonuniform source cuts and the shared character anchor. The extraction and pixel-fixer tools turn those cuts into the aligned runtime atlases under `src/assets/driller/`; the full presentation sheet is never bundled with the game.

```bash
node tools/extract-concept-art.mjs --check-paths
node tools/extract-concept-art.mjs --stage-fixer-inputs
python3 tools/run-pixel-fixer.py \
  --pixel-fixer-root /absolute/path/to/pixel-art-fixer \
  --source-revision <pixel-fixer-commit>
node tools/extract-concept-art.mjs
```

The checked-in `art/pixel-fixer/input` and `art/pixel-fixer/output` files are deliberate pipeline stages, not independent source assets. Runtime code loads the packed character, world-tile, gem, and title atlases only.

## License

MIT
