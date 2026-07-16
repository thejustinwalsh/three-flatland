# Driller Mini — Design Spec

**Date:** 2026-05-07
**Branch:** mini-game-showcase
**Package:** `minis/driller/`
**Status:** Design — awaiting plan

---

## 1. Overview

A Mr. Driller-meets-Tamagotchi mini-game for the three-flatland docs hero element. An autonomous chibi character continuously digs downward through procedurally-generated terrain. The world reacts: dirt collapses with sag-then-fall physics, fixtures anchor what stays put, and a gem-currency lets visitors help (or sabotage) with single taps.

Two modes ship from one engine:

- **Hero mode** — embedded on the docs landing page. No chrome. Infinite lives. When the driller reaches the bottom of one world, they fall through into a new one. The visitor is never required to interact; the loop is self-sustaining.
- **Full mode** — standalone `/play` route with a title attract screen, three lives, depth + gems leaderboard, and run termination on third death.

The simulation, rendering, AI, and input model are identical across modes — only the shell wrapping the canvas differs.

## 2. Goals

- **Showcase three-flatland's APIs.** Renderer2D batching, Sprite2D, the lighting system (polish pass), and (sparingly) TileMap2D for parallax. The mini is a living demo.
- **Self-running attract loop.** Compelling to *watch* without input. The character has personality and visible mood-driven decision-making.
- **One-touch agency.** Visitors can intervene meaningfully with a single tap; no instructions, no cooldown UI, no chord inputs.
- **Roguelike recovery.** Death is a setback, not a stop — except in the full-mode 3-life run.

## 3. Non-goals

- Not a tutorial. No on-screen instructions beyond a single ghosted "tap anywhere to help" hint that fades after first interaction or 4s.
- Not a sound-on game. Audio is opt-in; visual storytelling carries the loop. (ZzFX SFX exist but are muted by default.)
- No persistence beyond a per-browser leaderboard (`localStorage`). No accounts, no server.
- No multiplayer, no shared state across visitors.

---

## 4. World model

### 4.1 Tile classes

Four tile classes occupy the dig grid:

| Class       | Diggable | Falls    | Anchors soil | Notes                                                                                          |
|-------------|----------|----------|--------------|------------------------------------------------------------------------------------------------|
| **AIR**     | n/a      | no       | no           | Empty space. Result of digging or pre-cut caves.                                               |
| **SOIL**    | yes      | yes      | no           | Grass-cap and dirt are *one* material for physics. The grass cap is an autotile edge (top-of-dirt facing AIR with sun above). |
| **STONE**   | no       | no       | yes          | Indestructible. Naturally forms the floor anchor at biome bottoms; also placed as pillars.     |
| **FIXTURE** | no       | no       | yes          | Themed variants of stone for variety: dino-bone fossils, mushroom shelves, crystal clusters. Same physics as stone, different sprites. |

**Invariant:** SOIL chunks are 4-connected components of SOIL cells. STONE and FIXTURE are anchors; touching them counts as supported.

### 4.2 Grid representation

- Two arrays drive everything:
  - `tiles: Uint8Array` — class per cell (AIR=0, SOIL=1, STONE=2, FIXTURE=3+variant).
  - `flags: Uint8Array` — per-cell state (e.g. SAGGING bit, FALLING bit, JUST_LANDED bit, AUTOTILE_DIRTY bit).
- World is theoretically infinite vertically. Memory is bounded by streaming: only the recent ~3 chunks above and ~5 chunks below the camera live in the simulation. Chunks are 32 rows tall × world-width wide.
- Horizontal width is a fixed render-time constant (e.g. 24 cells); the camera never pans horizontally — only follows depth.

### 4.3 Coordinate model

- Cell `(col, row)` integer grid; `row` increases downward; `row=0` is surface.
- World-space tile size: 16 px **source** (1×). Rendered at integer-multiple pixel scale (see §4.4).
- Sprite positions are *floating-point* world coordinates so falling chunks animate sub-tile smoothly. The cell grid and sprite positions decouple during a fall and re-snap on landing.

### 4.4 Sizing & scale-to-fit (responsive, integer-pixel only)

The gameplay area is a **fixed-column, minimum-row** play field that scales to the host viewport in integer steps. This guarantees pixel-perfect sprites at every breakpoint and a consistent gameplay window across desktop hero embeds and mobile devices.

**Constants:**

| Constant         | Value     | Notes                                                              |
|------------------|-----------|--------------------------------------------------------------------|
| `TILE_PX`        | 16        | Source tile size; never changes.                                   |
| `PLAY_COLS`      | 18        | Fixed gameplay column count. Independent of viewport width.        |
| `MIN_PLAY_ROWS`  | 22        | Minimum visible rows; taller viewports show more.                  |
| `SCALE_STEPS`    | [1, 2, 4, 8] | Allowed integer scales.                                          |

**Pick algorithm (run on mount + on resize, debounced):**

1. Measure host viewport `(vw, vh)` in CSS pixels (DPR-aware via `devicePixelRatio`).
2. Compute the **largest integer scale `S` from `SCALE_STEPS`** such that `PLAY_COLS × TILE_PX × S ≤ vw` AND `MIN_PLAY_ROWS × TILE_PX × S ≤ vh`. If even `S=1` doesn't fit, clamp to `S=1` and let the play field be cropped (mobile portrait edge case).
3. Compute the visible row count: `playRows = floor(vh / (TILE_PX × S))`. Always `≥ MIN_PLAY_ROWS` if the algorithm picked a fitting scale.
4. The play canvas pixel size is `(PLAY_COLS × TILE_PX × S, playRows × TILE_PX × S)`.
5. Center horizontally; anchor vertically to top of host element.

**Examples:**

| Host viewport       | Scale | Play canvas        | Play rows |
|---------------------|-------|--------------------|-----------|
| 1920×1080 (desktop) | 4×    | 1152×1024 px       | 16 → 22 (clamps) |
| 1280×720 (laptop)   | 2×    | 576×704 px         | 22 |
| 414×896 (mobile)    | 1×    | 288×880 px → cropped to fit width; rows = `floor(896/16) = 56` |
| 768×1024 (tablet)   | 2×    | 576×1024 px        | 32 |

**Implications:**

- Visible row count is variable, but `PLAY_COLS` is fixed — generation, AI, and physics treat the world as 18 columns wide always.
- The streaming window adapts: more rows visible → more chunks live in the simulation. The cap (e.g. 8 chunks) is enforced regardless.
- The depth bar and gem counter UI are sized in CSS pixels independent of game scale; they scale with the host page typography.
- All sprite art is authored at 1× and never resampled — the scale step is applied at the canvas level (`canvas.style.imageRendering = 'pixelated'`), not in the GPU pipeline.

### 4.5 Decorative background

A non-interactive background fills the host element behind the play canvas. It exists outside the game simulation entirely.

- **Wide viewports** (host width > play canvas width): a horizontally-tiled or anchor-extended background covers the gap. Two strategies, mode-pick by host config:
  - **Tiled fill** — repeating soil/sky pattern that scrolls vertically with the camera (slower than gameplay for parallax).
  - **Anchor extension** — left and right "frame" elements (decorative rock walls, or themed dividers) anchored to the play canvas edges; the area beyond fades to a solid color or gradient.
- **Tall viewports** (host taller than `playRows × TILE_PX × S`): vertical filler above and/or below; default is a sky-fade above and a deep-earth gradient below.
- The background does **not** use the dynamic Renderer2D — it's a separate, lighter-weight TileMap2D layer (or plain CSS for non-tiled fills). It does not collapse, glow, or react to gameplay events.
- Background scrolls with depth at parallax factors (e.g. far layer 0.2, near layer 0.5) so descent feels meaningful even outside the play canvas.

### 4.6 Target hosts

Two primary embedding contexts; the engine is identical in both:

| Host                            | Mode     | Typical scale | Notes                                                  |
|---------------------------------|----------|---------------|--------------------------------------------------------|
| `apps/docs` landing hero        | hero     | 4× / 8×       | Full-bleed background, ghosted hint on first visit.    |
| `/play` standalone route        | full     | 4×            | Centered play canvas with title attract & leaderboard. |
| Mobile (portrait)               | hero or full | 1× / 2×   | Play canvas fills width; background frames top/bottom. |
| Mobile (landscape)              | hero or full | 2× / 4×   | Play canvas centers; background fills sides.           |

---

## 5. Rendering

### 5.1 Dynamic terrain — Renderer2D-batched sprites

Dynamic terrain (SOIL, falling chunks) is **not** TileMap2D. Each cell is a Sprite2D in a `Renderer2D` batch. This is required so falling chunks can move pixel-by-pixel sub-tile during the fall.

- One sprite-per-cell within the live window. Off-window cells are despawned.
- Sprite frame is selected by an **autotile bitmask** computed from the 8 (or 4) neighbors: which neighbors are AIR vs. SOIL determines the edge variant (grass cap, dirt edge, dirt corner, interior).
- Bitmask result indexes into a tileset atlas (one row per material, columns per neighbor pattern). Standard 47-tile or simplified 16-tile autotile mapping.
- After any cell change, mark `AUTOTILE_DIRTY` on the cell and its 8 neighbors; the autotile pass next frame recomputes only dirty cells.

### 5.2 Static terrain — TileMap2D for parallax

Background visual layers (sky, far rocks, midground silhouettes, clouds) use TileMap2D — they don't change at runtime, only scroll with parallax tied to the camera Y. Two or three layers are sufficient.

### 5.3 Renderer2D usage rules

Per the mini-game skill: `invalidateAll()` then `update()` on the Renderer2D ref every frame. Single Renderer2D instance for terrain; gems and the driller can be a separate batch (or the same).

### 5.4 Camera

- Orthographic, no horizontal pan. Y-position smoothly tracks the driller with a deadzone: the camera only moves when the driller leaves the central 60% vertical band, then eases toward target with `lerp(currentY, targetY, 0.1)` per frame.
- Vertical view height is fixed (~16 tiles); horizontal view spans the world width (~24 tiles).
- World-fall transition (hero mode at biome floor): camera tracks the driller down past the floor for ~0.5s, then snaps to surface as the new world streams in.
- Pixel-aligned: rendered scale is integer-multiple of source resolution; camera rounds to nearest world-pixel to avoid sub-pixel sprite shimmer.

---

## 6. Collapse physics

### 6.1 Chunk detection

- A "chunk" = a 4-connected component of SOIL cells.
- Chunks are computed lazily: only after a cell change does the connected-components solver re-evaluate the affected region. A union-find structure keyed by cell index keeps amortized cost low.
- A chunk is **supported** if any cell in it is 4-adjacent to a STONE or FIXTURE cell, or to the screen-side anchor (left/right edges of the world also count as anchors — prevents pathological side-cuts).

### 6.2 Sag telegraph

When a chunk loses support:

1. Enter `SAGGING` state. Duration ≈ 0.7s (configurable).
2. Visual: chunk sprites apply a vertical offset that grows from 0 to ~3 px over the duration, accompanied by dust particles drifting from the bottom edge and a low-rumble SFX (when audio is enabled).
3. Dashed amber outline pulses on cells at the shear boundary.
4. During the sag window, the player can `BRACE` the chunk (1 gem) to reset the timer.

### 6.3 Release & fall

After the sag window expires:

1. The chunk's sprites are detached from the cell grid into a **falling rigid body** that retains its shape and per-cell tile types.
2. The body falls under simple gravity (constant accel, capped terminal velocity ≈ 24 px/frame at 60fps).
3. Sparks emit during fall (small, short-lived emissive particles).

### 6.4 Land & reattach

When the falling body's lowest cell collides with anchored geometry:

1. Snap the body's cells back into the grid at their integer-rounded positions.
2. Re-run the autotile pass on the merge boundary.
3. Crucially: any newly-buried grass cap (a SOIL cell whose top neighbor is now SOIL too) **converts to dirt** in the autotile pass — buried grass doesn't see sun. This is purely visual; the cell stays SOIL.
4. Re-evaluate support for the new merged chunk. If the body has no anchor at the merge cell, it is a "loose" chunk and will sag-and-fall again next tick, but only if its floor was hollowed out.
5. Driller-collision check (see §8.1): if a cell of the falling body intersects the driller's cell at landing, the driller is crushed.

### 6.5 Tuning safeguards

To keep the rule fair:

- **Maximum chunk height cap.** A SOIL chunk taller than `MAX_CHUNK_H` (e.g. 12 cells) at sag-time is split: only the bottom `MAX_CHUNK_H` rows enter the falling body. The cells above the cut are removed from that body and re-evaluated for support next tick — if they have any remaining lateral anchor (side wall, stone, or fixture neighbor), they stay; if not, they form a new sag-then-fall sequence. This caps the visible drop per event without breaking the connectivity rule.
- **Mercy frame:** if the driller is currently in the AI's `panic shelter` plan and is mid-tile-move toward a fixture, the impact is delayed by one extra frame. Tunes the survivability of last-second saves.
- **Generation-time impassability check.** Per §10.4: gems and chunks whose collapse would seal an entire row (no path past on either side) are filtered out at generation. Caves remain passable in the worst case.

---

## 7. AI behavior

### 7.1 Mood model

Three mood axes, each `0..1`, evolving each tick with smoothing:

| Axis  | Rises with                                                                                   | Decays                       |
|-------|----------------------------------------------------------------------------------------------|------------------------------|
| **Greed** | Visible gems within scan radius; recent failed gem detour                                | After collect; over time     |
| **Fear**  | Sag detected overhead; near-miss survived; user evil-tap; over-pet annoyance                | Slowly when safe             |
| **Drive** | Time-since-last-action; long boring stretches; depth target progress; user no-touch period | After major action committed |

- Smoothing: `mood += (target − mood) * α` where α ~ 0.05 per tick (60Hz). No instantaneous mood snaps.
- Hysteresis: dominant axis is chosen each tick, but switching planners requires the new dominant axis to exceed the current by `0.1`. Prevents flicker.

### 7.2 Three planners

Each planner produces a target cell to dig toward each tick. The dominant mood selects which runs. **All planners treat STONE and FIXTURE as impassable** — the AI cannot dig through them, only around. Pathfinding uses the AI's known map (cells inside the active streaming window).

| Planner   | Behavior                                                                                                             |
|-----------|----------------------------------------------------------------------------------------------------------------------|
| **Drive → greedy descender**   | Dig straight down; pick left/right only when blocked by anchored tiles. Score = depth gain.       |
| **Greed → gem seeker**         | BFS within ~6 cells for nearest gem; path through cheapest cells; ignores overhang.               |
| **Fear → cautious miner**      | BFS for nearest STONE/FIXTURE adjacency; idle when reached. Active during sag-overhead detection. |

### 7.3 Human-flaw emergence

Flaws emerge from the math, not scripted behavior:

- **Tunnel vision** — under high Drive, a small overhead sag may not be enough to flip mood until escalation; one extra dig happens.
- **Sunk cost** — once a planner commits a path toward a target, the path is held for ≥ 0.5s before re-eval. Halfway-to-a-gem detours are completed even when sub-optimal.
- **Confidence bias** — Fear decays faster after a successful brace/shelter event. Just-survived → next decision is bolder.
- **Hesitation** — a fresh Fear spike causes one tick of "no action" before re-planning.
- **Over-pet annoyance** — a sliding window of pet events (>3 in 4s) flips pet polarity to Fear ↑. AI scoots one tile, planner pauses 200ms.

### 7.4 Mood inputs from user

- **Helpful taps** (Brace, Pet, Collect) → Fear ↓ small; Trust nudge (an internal counter, no axis); gratitude bob animation.
- **Evil tap** (Trigger) → Fear ↑↑ for several seconds; planner biased toward Fear-dominant for that window.

### 7.5 Death handling

When crushed:

1. Driller entity despawns; impact dust + screen shake (≤ 8px peak, ~0.3s).
2. Any gems collected on this life scatter into a small radius around impact (5–8 cell radius, randomized). Gems are recoverable for ~3s before they vanish.
3. The dead driller's "ghost" rises to the top, leaving a vertical chute: every SOIL cell in the columns directly above the death point is converted to AIR. Visually the ghost rises with a soft trail; the chute opens behind them in a wave.
4. A new driller drops in from the top of the visible viewport.
5. **Hero mode:** depth carries forward; lives are infinite; loop continues.
6. **Full mode:** lives counter decrements; on third death, run ends; leaderboard prompt.

---

## 8. One-touch interactions

Single tap or click. No drag, no hold, no chord. Mouse hover (on desktop) shows a preview of what the tap will do at that location. Touch users get instant commit.

### 8.1 Action zones

Hover-target priority resolves overlapping zones in this order:

1. **Driller pixel** → **Pet**. Free. Heart particle, AI hop. Fear ↓ small. Over-pet (>3 in 4s) flips to annoyance: Fear ↑, AI scoots and pauses.
2. **Any gem on screen** → **Collect**. Free. Gem flies on a magnetic arc to the driller, plays a chime SFX, increments gem pouch.
3. **Sagging chunk** → **Brace**. Costs 1 gem. Resets the sag timer with reinforced sparkle effect for 2s. Insufficient gems → action denied (cursor flashes red, no SFX).
4. **Any other intact ceiling cell** (above driller's row) → **Trigger**. Free. Forces the chunk containing that cell into SAGGING state. The normal sag telegraph still plays — Trigger isn't an instant kill, it's a forced *start* of the regular collapse sequence.
5. **Floor / outside ceiling** → no-op. Cursor shows neutral state.

### 8.2 Cost model: gems-as-currency

- Gems collected (by AI auto-pickup or user tap) add to a shared pouch.
- Brace consumes 1 gem.
- Trigger, Pet, Collect are free.
- The gem counter is the only resource UI element on screen.

### 8.3 Hover preview

- Cursor color matches action: lavender (Collect), green (Brace), red (Trigger), gold (Pet).
- Affected cells outline in the cursor color while hovered.
- For Collect, a faint arc-line previews the magnet path.

---

## 9. UI

### 9.1 Always on (both modes)

- **Depth bar.** Vertical bar on the right edge of the canvas. Top = surface (0m), bottom = current visible viewport's deepest point. A small marker shows the driller's current depth and a tick at the deepest point reached this run. ~12 px wide, full canvas height.
- **Gem counter.** Top-left corner. A small gem icon + count, e.g. `◆ 7`. Subtle blur-backdrop pill, ~24 px tall. Pulses on collect.

### 9.2 Hero mode shell

- No additional UI.
- Optional ghosted "tap anywhere to help" hint near bottom-center, fades after 4s or first interaction.
- Pause on `document.visibilityState === 'hidden'`.

### 9.3 Full mode shell

- **Title attract screen** before run starts: animated logo, "tap to begin" prompt, leaderboard preview.
- **Lives indicator** (3 driller-icon dots near top-right, dimming as lives are spent).
- **End-of-run leaderboard** modal on third death: depth reached, gems banked, name input (autosaved), local high-score list.
- Single-tap restart.

### 9.4 No HUD elements for

- Mood (read through behavior)
- Air (mechanic does not exist)
- Cooldowns (no action has a cooldown — gems-as-currency is the gate)

---

## 10. Level generation

### 10.1 Streaming model

- World streams in 32-row chunks aligned to global `chunkY = floor(row / 32)`.
- Active set: ~3 chunks above the camera + ~5 below. Older chunks are despawned.
- Generation runs once per chunk on first appearance; result is deterministic per `(seed, chunkY)`.
- Seed: 32-bit integer. Hero mode picks `(timestamp ^ visitor-noise)` at page load. Full mode lets the user replay a seed via URL `?seed=...`.

### 10.2 Per-chunk pipeline

For each new chunk `(seed, chunkY)`:

1. **Biome lookup.** `chunkY` → biome by depth band (see §10.3).
2. **Base fill.** All cells set to SOIL (or AIR for the surface band 0–4m).
3. **Cave carve.** 1–4 cellular-automata cave pockets per chunk, biome-weighted size. CA with B5/S45 over 4 iterations on a noise seed.
4. **Stone scatter.** Per-biome stone column placement: deeper biomes have more stone. Pillars are 1–2 tiles wide, 3–6 tall.
5. **Fixture placement.** 1–3 fixtures per chunk, preferring cave-roof edges and sheltered positions ~5–8 tiles apart at biome-typical depths. Fixture variant chosen by biome.
6. **Gem placement.** 3–6 gems per chunk; colors weighted by biome. Avoid placement inside chunks that would collapse on first exposure (a quick lookahead: don't place gems where the supporting chunk has support count = 1).

### 10.3 Biome bands

| Biome             | Depth (m) | Soil density | Caves           | Fixtures               | Gem palette                  | Notes                                  |
|-------------------|-----------|--------------|-----------------|------------------------|------------------------------|----------------------------------------|
| **Topsoil**       | 0–20      | High         | None            | None                   | Emerald (rare)               | Onboarding band; small chunks only.    |
| **Deep dirt**     | 20–50     | High         | Small           | Dino bones (rare)      | Emerald, Topaz, Ruby         | First risk band; larger chunks.        |
| **Stoneworks**    | 50–100    | Medium       | Larger          | Stone pillars (common) | All four (peak density)      | Sweet-spot risk/reward band.           |
| **Crystal caverns** | 100–200 | Low          | Network of caves| Crystal clusters (lit) | Amethyst (huge clusters), Topaz | Lighting showcase. Sparse soil.    |
| **Core**          | 200+      | Very low     | Vast voids      | Massive crystals       | Amethyst (rare, large)       | Endgame. Hero mode falls through into a new world here. |

### 10.4 Generation safeguards

- Driller's entry column at `(chunkY × 32, 0)` is guaranteed to have a 3-cell vertical clearance to bootstrap the loop.
- After a full restart, the surface row is regenerated to ensure the driller spawns on intact grass.
- Gems generated inside a chunk that ends up entirely within a cave are kept; gems inside soil that immediately collapses on first exposure are deleted in a post-pass.

---

## 11. Visual style

**Direction A — Cozy Chibi (Mr. Driller-true).** Bright, warm pixel-art at 16×16 source tile size, rendered at integer-pixel scale per §4.4. Character is a chibi miner with a red helmet and yellow lamp. Earthy browns for soil, warm green grass cap, gem tones tied to the brand palette.

### 11.0 Source asset (canonical)

The hand-authored visual reference for the entire mini lives at:

**`planning/superpowers/specs/2026-05-07-driller-mini-tileset.png`** (1536 × 1024, 8-bit RGB)

This is the source of truth for all sprite content. The implementation slices regions out of this PNG into a runtime atlas; do not re-author. Contents (regions tagged in the asset itself):

- **Driller sprite sheet** (16×16 frames): Idle, Walk cycle (right; flip H for left), Drill down, Drill up, Drill left, Drill right, Trip/stumble, Dodge/narrow miss, Fall/death, Ghost float-up.
- **Tileset (16×16)**: SOIL (top cap + inner soil with autotile edges), STONE (anchor variants), FIXTURES (dino bones, mushroom shelf, crystal cluster), AIR (sentinel empty cell).
- **Themed props** (decor / background): small accent props per biome.
- **Gem pickups**: 4 colors × 4 sizes — Emerald (green), Topaz (yellow), Ruby (red), Amethyst (violet).
- **Biome tile variants** (autotile examples for each band): Topsoil 0–20m, Deep dirt 20–50m, Stoneworks 50–100m, Crystal caverns 100–200m, Core 200m+. Implementation references these regions for biome-specific tile recoloring/swap.
- **Example in-game moments**: dig→collect, sag-then-fall, anchor-holds, narrow-miss, fall-into-the-core. Reference for visual-feel verification during QA.
- **Title art**: "Driller Homie — Dig Deep. Get Gems. Help (or Harm)." Used as the Title Attract screen art (full mode).

> **Open question** — the asset titles the mini "Driller Homie." Spec §16 lists `driller` as the working package name. Implementation can either rename the package or keep `driller` and use "Driller Homie" as the display title in title-attract art only. Default: keep package as `driller`, display title from asset.

### 11.1 Palette (4-color gem palette — corrected from asset)

| Role       | Hex        | Notes                                                  |
|------------|------------|--------------------------------------------------------|
| Sky        | `#5a8fc7` → `#87b3df` (gradient) | Background fill at surface           |
| Grass      | `#5fa847`  | Autotile cap on top SOIL cells                         |
| Dirt       | `#6b4a2b` (top), `#5d3f24` (deep) | Source values; biome variants in asset |
| Stone      | `#71717a` → `#4a4a55` (gradient) | Anchor                                  |
| Driller    | Red helmet + `#fcd34d` lamp on chibi body                       |
| Emerald    | `#34d399`  |                                                        |
| Topaz      | `#fcd34d`  |                                                        |
| Ruby       | `#f43f5e`  |                                                        |
| Amethyst   | `#a78bfa`  |                                                        |

> Sapphire (`#38bdf8`) is **removed** from the gem palette — the source asset has only 4 gem colors. Biome `gemPalette` definitions in §10.3 must be revised: emerald/topaz/ruby/amethyst only.

### 11.2 Atlas slicing & texture pipeline

- The source PNG is sliced at build/runtime into named regions (one canvas atlas per logical group: `soil`, `stone`, `fixtures`, `gems-by-color-by-size`, `props`, `driller`).
- Strategy: a single inlined data URL of the source PNG (or a small build step that emits a stripped/optimized version) feeds `TextureLoader`. A region map (`atlas-regions.ts`, JSON-shaped) records the `(x, y, w, h)` of each named slice; sprites set their `Sprite2DMaterial` UV ranges from the map.
- `NearestFilter` for both min/mag, `SRGBColorSpace`.
- All sprite art is authored at 1× (16×16 source). The integer scale step from §4.4 applies at the canvas level (`imageRendering: pixelated`); never resample in the GPU.

### 11.3 Biome-specific tile variants

The source asset includes pre-rendered tile variants per biome band. For each biome (topsoil / deep-dirt / stoneworks / crystal-caverns / core), the autotile resolver picks frames from that biome's region of the atlas — same bitmask, different art row. This avoids runtime tinting and preserves authored detail per biome.

### 11.4 Animation frame plan (driller)

Frame counts and timings per asset state. Refresh rate: 12 fps unless noted.

| State          | Frames | Loop | Notes                                       |
|----------------|--------|------|---------------------------------------------|
| `idle`         | 3–4    | yes  | Subtle bob; pull from "Idle" row.           |
| `walk`         | 4      | yes  | "Walk cycle (right)" — flip H for left.     |
| `drill-down`   | 4      | yes  | Plays during dig action, downward.          |
| `drill-up/left/right` | 4 each | yes | Used by panic-shelter pathing animations. |
| `trip`         | 2      | one-shot | Used on small impacts (over-pet annoyance scoot). |
| `dodge`        | 2      | one-shot | Used on near-miss survival ("phew" bob).  |
| `fall`         | 4      | one-shot | Used on death; transitions to `ghost`.    |
| `ghost`        | 3      | yes  | Float-up animation for the ghost-chute respawn. |

### 11.3 Animations

- Driller: idle bob (2 frames, 8fps). Dig action (4 frames, 12fps). Hop on pet (2 frames). Gratitude bob (1.5x scale pulse over 200ms).
- Gem collect arc: spline tween from gem position to driller, 280ms, ease-out.
- Sag: vertical droop tween on chunk sprites 0→3px over 0.7s.
- Falling chunk: linear fall + sparks (lightweight emitters).
- Dust on impact: 2-second alpha fade + radial drift.

---

## 12. Lighting integration (polish pass)

The lighting system from `feat-lighting-postprocess-flatland` lands first as part of the broader merge. The driller mini consumes it as a **polish pass after gameplay is shipped**. Until then, sprites use the default un-lit material.

### 12.1 Light sources

| Source            | Type        | Radius   | Color                  | Notes                                                        |
|-------------------|-------------|----------|------------------------|--------------------------------------------------------------|
| Driller headlamp  | Point       | ~6 tiles | Topaz (`#fcd34d`)      | Follows driller; bobs subtly with dig.                       |
| Gems              | Point       | ~3 tiles | Match gem color        | Many small lights; aggregate lights up gem pockets dramatically. |
| Crystal fixtures  | Point       | ~3–4 tiles | Biome violet/blue   | Ambient; deeper biomes only.                                 |
| Surface sun       | Directional | global   | Warm white             | Top 0–4m only; dims abruptly underground.                    |
| Falling sparks    | Point       | ~1 tile  | Dust orange            | Short-lived (~200ms), lots of them.                          |

### 12.2 Performance constraints

- Forward+ tiled lighting (DefaultLightEffect preset) handles many small lights efficiently. Target: hundreds of gem lights on screen possible.
- Aggressive culling: lights more than 1.5 tiles outside the camera frustum are disabled.
- Fixtures and gems off-screen contribute zero lights.

---

## 13. Sound (ZzFX, opt-in)

Per the mini-game skill, audio is plumbed via the `zzfx` prop and passes raw ZzFX param arrays. Defaults to muted.

| Event              | Tone direction           |
|--------------------|--------------------------|
| Dig step           | Short percussive thud, varied per material |
| Gem collect        | Bright chime, biome-tinted pitch        |
| Sag warning        | Low rumble, rising pitch                |
| Chunk impact       | Heavy boom + dust hiss                  |
| Brace              | Crystal-glass shimmer                   |
| Trigger            | Cracking stone shear                    |
| Pet                | Tiny "boop"; over-pet adds annoyed grunt |
| Driller crushed    | Muted thud, long fade                   |
| Driller respawn    | Whoosh + soft chime                     |
| World fall (hero)  | Long descending tone                    |

Exact ZzFX arrays defined in `systems/sounds.ts` per breakout precedent.

---

## 14. Architecture

### 14.1 Package layout

```
minis/driller/
├── package.json          # Dual lib + app exports per mini-game skill
├── tsconfig.json
├── vite.config.ts
├── index.html            # Standalone dev entry
├── README.md
├── src/
│   ├── index.ts          # Library export: Game component + types
│   ├── main.tsx          # Standalone dev app entry
│   ├── App.tsx           # Dev wrapper (mock zzfx, Canvas setup)
│   ├── Game.tsx          # Main game component (canvas, scene, mode-aware shell)
│   ├── types.ts          # Public props (MiniGameProps + DrillerProps)
│   ├── world.ts          # Static Koota world creation (HMR-safe)
│   ├── shallow.ts        # Helper from breakout
│   ├── traits/           # Koota traits
│   │   ├── index.ts
│   │   ├── world-traits.ts        # Singleton: GameMode, GameState, Camera, Score, Lives, Seed
│   │   ├── grid-traits.ts         # Tile arrays, dirty bitsets, biome cache
│   │   ├── driller-traits.ts      # Position, Velocity, MoodAxes, PlannerState, Animation
│   │   ├── chunk-traits.ts        # Falling chunks: cells, body position, velocity
│   │   ├── gem-traits.ts          # Gem entity: cell, color, drawn-flag
│   │   ├── particle-traits.ts     # Dust, sparks
│   │   └── input-traits.ts        # Pointer position, hover target
│   ├── systems/
│   │   ├── input.ts               # Pointer → action zone resolution → action commit
│   │   ├── generation.ts          # Streaming chunk generation, seed RNG
│   │   ├── collapse.ts            # Chunk component detection, sag, fall, land, reattach
│   │   ├── autotile.ts            # Bitmask resolver; dirty-cell sweep
│   │   ├── ai-mood.ts             # Mood drift + event response
│   │   ├── ai-planner.ts          # Three planners + selector
│   │   ├── driller.ts             # Driller motion + dig action
│   │   ├── camera.ts              # Smooth follow + bottom-of-world transition
│   │   ├── death.ts               # Crush detection, ghost chute, respawn
│   │   ├── particles.ts           # Particle update + cull
│   │   └── sounds.ts              # ZzFX dispatch on game events
│   ├── components/
│   │   ├── Scene.tsx              # Renderer2D batches, camera, lights
│   │   ├── PlayCanvas.tsx         # Sized canvas with integer-scale picker (§4.4)
│   │   ├── Background.tsx         # Decorative parallax background layer (§4.5)
│   │   ├── DepthBar.tsx           # Right-edge UI
│   │   ├── GemCounter.tsx         # Top-left UI
│   │   ├── HeroHint.tsx           # Ghosted "tap to help" hint
│   │   ├── TitleAttract.tsx       # Full-mode title screen
│   │   ├── Leaderboard.tsx        # Full-mode end-of-run modal
│   │   └── HoverCursor.tsx        # Custom cursor with action-color preview
│   ├── materials.ts               # Sprite2DMaterials with inlined data-URL textures
│   ├── textures.ts                # Inline tileset SVGs / PNGs as data URLs
│   ├── autotile-table.ts          # Bitmask → atlas-index lookup
│   ├── biomes.ts                  # Biome definitions + depth → biome lookup
│   └── rng.ts                     # Seeded mulberry32 RNG
```

### 14.2 Public component API

```typescript
interface DrillerProps extends MiniGameProps {
  /** 'hero' (no chrome, infinite lives) | 'full' (title + 3 lives + leaderboard) */
  mode?: 'hero' | 'full'
  /** Optional fixed seed; default: time + visitor noise */
  seed?: number
}
```

`MiniGameProps` (`zzfx`, `isVisible`, `className`) inherited from the mini-game-skill convention.

### 14.3 Render flow per frame

1. **Input system** — read pointer state, resolve hover zone, commit action if click.
2. **AI mood + planner** — update moods, select dominant planner, pick target cell.
3. **Driller motion** — move toward target, commit dig at end of step.
4. **Generation** — ensure chunks around camera are populated.
5. **Collapse** — detect newly-unsupported chunks, advance sag/fall states, handle landings.
6. **Autotile** — resolve dirty cells, update sprite frames.
7. **Particles** — update + cull.
8. **Camera** — smooth follow.
9. **Renderer2D** — `invalidateAll()` then `update()` (per the mini-game skill rule).
10. **UI** — depth bar + gem counter re-render reactively from world traits via `useTrait`.

---

## 15. Acceptance criteria

Per `feedback_acceptance_criteria_gate`, every item below must be met or carry stakeholder-authorized deferral before PR ready.

### 15.1 Core engine (must)

1. Tile grid with AIR / SOIL / STONE / FIXTURE; chunk streaming bounded to 8 active chunks max.
2. Autotile resolver produces correct edge sprites for all 4-neighbor configurations on SOIL.
3. Renderer2D batched terrain renders 100+ visible cells at 60fps on M1-class hardware.
4. Collapse: chunk component detection, sag telegraph (~0.7s), full-chunk fall with shape preservation, reattach on landing, max-chunk-height cap enforced.
5. Driller AI with three planners; mood model with hysteresis; visible behavior changes between planners.
6. One-touch system with 4 actions, gems-as-currency, hover preview on desktop.
7. Death loop: scattered gems, ghost chute, top-of-screen respawn.
8. Hero mode: infinite lives, world-fall transition at biome floor.
9. Full mode: title attract, 3-life run, leaderboard with `localStorage` persistence.
10. Generation: 5 biomes, 32-row chunks, seedable, URL-param replay.
11. Depth bar + gem counter UI, no other HUD.
12. Responsive scale-to-fit: integer pixel scaling (1×/2×/4×/8×), fixed `PLAY_COLS=18`, `MIN_PLAY_ROWS=22`. Scale chosen on mount + resize; sprites pixel-perfect at every step.
13. Decorative background layer (parallax-scrolling, separate from play canvas) with anchor-extension or tiled-fill strategies for wide viewports.
14. Verified rendering on desktop (1920×1080, 1280×720), tablet (768×1024), and mobile portrait (414×896) viewports.

### 15.2 Polish (must, after core lands)

12. Sound effects via ZzFX, opt-in, all events from §13 wired.
13. Particles: dust, sparks, hearts, gem-collect arcs.
14. Driller animations: idle, dig, hop, gratitude bob, scoot.

### 15.3 Lighting polish pass (deferred but required for "done")

15. Driller headlamp point light following character.
16. Per-gem point lights, biome-colored.
17. Crystal fixture ambient lights in deep biomes.
18. Surface directional sun.
19. 100+ active lights at 60fps via Forward+ tiled lighting (DefaultLightEffect).

### 15.4 Out of scope (explicit non-goals)

- Multiplayer / shared state.
- Server-side leaderboard.
- Touch-multitouch gestures.
- Tutorial overlays.
- Music tracks (SFX only).
- Configurable controls.

---

## 16. Open questions

1. **Hero mode embedding location.** Is this on the docs landing page (`apps/docs`) only, or also exported as a standalone npm package per the mini-game skill's lib export pattern? Default assumption: both — package is `minis/driller`, docs imports it.
2. **Mini name.** Package is `driller` (direct). Source asset titles the mini **"Driller Homie"** with tagline "Dig Deep. Get Gems. Help (or Harm)." — used as title-attract art in full mode. Package name remains `driller`.
3. **Audio prop wiring.** The mini-game skill expects `zzfx` from props. Does the docs hero get a real ZzFX bridge, or is it muted-by-default-only at launch? Default: muted-by-default; standalone full mode wires real audio.
4. **Lighting pass timing.** Lighting integration is gated by `feat-lighting-postprocess-flatland` merging. If that merge slips, ship the mini with the un-lit material and add lighting in a follow-up PR.
5. **Action labels reconcile.** The source asset legend lists one-tap actions as "Add Support / Boost Speed? / Drop Rocks / Chase Gems," which diverges from spec §8.1's "Collect / Brace / Trigger / Pet." Mapping:
   - "Add Support" ≈ **Brace** (gives a sagging chunk a temporary anchor)
   - "Drop Rocks" ≈ **Trigger** (force-sag a chunk)
   - "Chase Gems" — *new mechanic candidate*: nudge the AI's Greed mood directly so they detour toward a tapped gem region, rather than the user collecting it themselves. Replaces or complements **Collect**?
   - "Boost Speed?" — *new mechanic candidate*: the trailing `?` in the asset suggests this was tentative. Could speed up dig cooldown for a few seconds.

   **Default for v1:** ship the spec's four actions (Collect / Brace / Trigger / Pet). The asset's "Chase Gems" and "Boost Speed?" are deferred to a follow-up if proven worthwhile. The asset's labels are visual placeholders only.

---

## 17. Risks & mitigations

| Risk                                                                                       | Mitigation                                                                                                       |
|--------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Collapse rule tuning produces unsurvivable scenarios                                       | Max-chunk-height cap, mercy-frame, generation-time check that no chunk's collapse seals an entire row.           |
| Mood + planner switching too jittery                                                       | Hysteresis threshold, mood smoothing, minimum-commit time on planner targets.                                    |
| Renderer2D performance with autotile-dirty sweeps every cell change                        | Batch dirty-bit accumulation; one autotile pass per frame max; cap visible cells via streaming.                  |
| Pre-cut caves yielding gems that the AI can't reach                                        | Generation-time reachability check (BFS from chunk top); orphaned gems are deleted.                              |
| Lighting pass introduces frame-rate cliff at high gem density                              | Aggressive culling; gem-light count cap (e.g. 64 active); LOD for distant gems.                                  |
| Visitors don't notice the interactive layer                                                | Ghosted "tap anywhere to help" hint on first visit; cursor changes color on hover over actionable zones.         |
| Mobile viewports too narrow for `PLAY_COLS=18` at 1× scale                                 | Fallback: at 1× crop the canvas to the available width; gameplay continues with reduced visible columns; all systems still treat the world as 18-wide internally (rare edge case on very small devices). |
| HiDPI screens render fuzzy due to canvas resampling                                        | Use `imageRendering: pixelated` on the canvas element; render at `S × playPixelDimensions`, never resample.      |
