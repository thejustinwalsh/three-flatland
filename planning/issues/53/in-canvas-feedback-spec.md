# In-canvas player-feedback HUD — spec

Three coupled visual systems that give the player concrete feedback for
every interaction the action-skill reform introduced. All rendered as
`Sprite2D` instances inside the Flatland scene so they pixel-snap with
the tile renderer.

**Status:** spec, awaiting approval. Two open questions to resolve
before implementation (see end of doc).

---

## 1. Action commit info-popup (held tooltip)

A small floating panel that appears beside the pointer while the user
is mid-interaction. Shows a pixelated icon (action type) and a status
bar (timer / cost-rate / progress).

### Visibility rules

| Action | Visible | Bar represents |
|---|---|---|
| **drag** | Held | Held time × current cost-rate; bar fills as cost ramps |
| **paint** | Held | Gems remaining at current burn-rate (e.g. "12s left at 1 g/tick") |
| **brace** | ~1s after click | `bracedUntilTick - gs.tick`, drains to 0 |
| **pet** | While paused | `pausedUntilTick - gs.tick`, drains; over-pet flips to anger icon |
| **collect** | None (one-shot, handled by gem-spend popup) | — |
| **gem-fade** | When the gem is the current hover target AND its `expireAtTick` is armed | Time until expiry; bar drains |

### Visual layout

```
┌───────┐ pixel icon (8×8 logical, scales with tile)
│  [I]  │
│  ▓▓▓░░│ status bar (12×3 logical, fills L→R per metric)
└───────┘
```

Position: anchored to pointer cell + 1-cell offset in the direction
opposite the targeted cell (avoids covering the target). Pixel-snapped.

### Icons (sprite-sheet entries)

- `icon.drag` — open-hand emoji
- `icon.paint` — paintbrush emoji
- `icon.brace` — clamp / vise emoji
- `icon.pet.happy` — face-smiling emoji
- `icon.pet.neutral` — face-neutral emoji
- `icon.pet.angry` — face-angry emoji (over-pet)
- `icon.timer` — hourglass emoji
- `icon.gem` — gem emoji (reused below)

---

## 2. Gem-spend popup (-N)

Every gem decrement spawns a floating "-N [gem]" label that pops up,
floats a few pixels up, and fades out over ~600 ms.

### Trigger

Hook into the same call sites that mutate `GameState.gems`:
- `doPet` (-1)
- `doBrace` (-BRACE_COST)
- `doPaint` (-PAINT_COST_PER_TICK per tick)
- `dragSystem` cost-interval bill (-1 / -2 / -3 / …)

Cleanest implementation: a thin helper `spendGems(world, amount)` that
both deducts AND spawns a transient `GemSpendPopup` entity. Refactor
the existing call sites to use it.

### Animation

| Tick | Scale | Y offset (px) | Alpha |
|---|---|---|---|
| 0 | 0.6 | 0 | 1 |
| 8 | 1.2 (overshoot) | -3 | 1 |
| 20 | 1.0 (settle) | -8 | 1 |
| 36 | 0.9 | -14 | 0 |

Ease-in pop, linear rise, linear fade. ~600 ms total at 60 Hz.

### Trait

```ts
export const GemSpendPopup = trait({
  px: 0, py: 0,           // spawn position (cursor pixel at trigger time)
  startTick: 0,
  amount: 1,              // how many gems were spent
})
```

A new `gemSpendPopupSystem(world)` runs each render frame: advances
the animation curve, destroys the entity at end-of-life.

### Stacking rule

Multiple spends within 4 ticks at the same pixel position **stack**
into the existing popup (incrementing `amount`, resetting `startTick`).
Without this, a held paint drag would spawn a popup per tick → spam.

---

## 3. Hover-target outline

A 1-pixel border drawn around the cells the cursor would commit
against. Color encodes target type so the player learns the priority
order visually:

| Action | Color | Target cells |
|---|---|---|
| collect | `#fcd34d` (gold) | Gem's exact cell only (halo doesn't draw an oversized box) |
| pet | `#f472b6` (pink) | Driller's cell |
| drag | `#60a5fa` (sky) | All cluster cells with FLAG_SHAKING/FALLING |
| brace | `#fb923c` (orange) | All cells of the sagging chunk |
| paint | `#ef4444` (red) | Single cell under cursor |
| none | — | No outline |

### Implementation

A pool of border `Sprite2D` instances (size = PLAY_COLS × PLAY_ROWS
upper bound, but only the active ones are visible). The renderer reads
`Pointer.hoverAction` + cell-set each frame and updates the pool.

Single-cell targets (collect/pet/paint) use 1 sprite. Multi-cell
(drag/brace) need up to ~30 sprites for a typical chunk. Pool sized to
64 covers worst case.

---

## 4. Pet mood icon

When the user pets, a mood icon pops above the driller's head for the
pet-pause duration (~1 s). Icon picked from current `Mood`:

- `fear > 0.6` → `icon.pet.angry`
- `trust > 5 AND greed > 0.5` → `icon.pet.happy`
- otherwise → `icon.pet.neutral`

Over-pet (4th tap in window) forces `icon.pet.angry` and animates a
small horizontal shake (cursor-rejection feel).

---

## 5. Icon pipeline — `bake-icons` CLI

A standalone CLI script that takes a list of emojis (+ names) and
bakes a sprite-sheet PNG with padded cells. Decoupled from this game
— reusable for any pixel-art HUD work.

### Invocation

The CLI is glyph-agnostic — emojis, digits, letters, symbols all
follow the same pipeline. Run once per font/sheet:

```sh
# Emoji HUD sheet
pnpm bake-icons \
  --size 8 --padding 1 --font "Apple Color Emoji" \
  --out minis/driller/src/generated/icons \
  drag=🫳 paint=🖌️ brace=🗜️ \
  pet.happy=😊 pet.neutral=😐 pet.angry=😠 \
  timer=⏳ gem=💎

# Digit sheet (number rendering — no bitmap font yet, so we bake
# decimated glyphs from the system monospace font)
pnpm bake-icons \
  --size 6 --padding 1 --font "Menlo" \
  --out minis/driller/src/generated/digits \
  0=0 1=1 2=2 3=3 4=4 5=5 6=6 7=7 8=8 9=9 \
  minus=- plus=+ m=m
```

Flags:
- `--size N` — output sprite size in pixels (default 8). Each glyph
  decimates to N×N.
- `--padding N` — transparent pixel padding around each cell (default
  1) so sampling doesn't bleed adjacent sprites.
- `--out <basename>` — output basename. Writes `{basename}.png` +
  `{basename}.ts`.
- `--font <family>` — font to use for rasterization. Default "Apple
  Color Emoji" on macOS; override for digits/letters with a
  monospace font like "Menlo" or "Monaco".
- `--render-size N` — source canvas size before downsample (default
  64). Larger = better antialiasing input → cleaner decimation.
- Args: any number of `name=glyph` pairs. `glyph` can be any unicode
  string the chosen font can render. `name` becomes the key in the
  emitted regions table.

### Pipeline (per emoji)

1. Render emoji at `--render-size` (default 64×64) using node-canvas
   with the system color emoji font.
2. Decimate to `--size` via box-average downsample (each (renderSize
   / size)² source block → one output pixel).
3. Re-quantize to a 16-color palette (the game's biome-friendly
   palette baked into the CLI as a constant; overridable via
   `--palette path/to/palette.json` later if needed).
4. Append to the sheet at the next padded cell slot.

### Output

- **`{basename}.png`** — single sprite-sheet PNG. Cell stride = `size
  + padding * 2`. Cells laid out left-to-right, wrapping at a sheet
  width that's the next power-of-two of total-cells × cell-stride.
- **`{basename}.ts`** — generated TypeScript file:
  ```ts
  // GENERATED — do not edit by hand. Run `pnpm bake-icons` to update.
  export const ICON_SHEET_URL = new URL('./icons.png', import.meta.url).href
  export const ICON_SHEET_W = 64
  export const ICON_SHEET_H = 16
  export const ICON_REGIONS = {
    drag:        { x: 1, y: 1, w: 8, h: 8 },
    paint:       { x: 11, y: 1, w: 8, h: 8 },
    brace:       { x: 21, y: 1, w: 8, h: 8 },
    'pet.happy': { x: 31, y: 1, w: 8, h: 8 },
    // …
  } as const
  export type IconName = keyof typeof ICON_REGIONS
  ```

### Why CLI over runtime decimation

- Deterministic — emoji rendering varies by OS/font.
- Zero runtime cost.
- Asset diff is reviewable (PNG + regions checked in).
- Reusable for any other in-game pixel HUD (gem counter, depth bar
  badges, leaderboard medals, etc.) without touching game code.
- Trivial to re-run when the icon list grows.

### Implementation notes

- Use `canvas` (node-canvas) for emoji rasterization. The system
  emoji font on macOS is Apple Color Emoji; on Linux CI install
  `fonts-noto-color-emoji`. Document in the script's README.
- Box-average downsample, not nearest-neighbor: produces noticeably
  cleaner small-pixel emoji art (averages anti-aliased edges).
- Script lives at `scripts/bake-icons.ts` and is exposed as a
  `pnpm bake-icons` task at the workspace root.

---

## 6. Three.js integration

### HUD scene layer

A new `HudRenderer` component in Scene.tsx, peer of `TileRenderer`.
Sized as a single SpriteGroup containing pools for:
- 8 info-popup sprites (icon + bar = 2 sprites per popup, ×4 instances)
- 16 gem-spend popups
- 64 hover-outline sprites
- 1 pet mood sprite

Materials:
- `iconMaterial` — sprite-sheet texture from `icons.png`, atlas-mapped.
- `barMaterial` — single white pixel scaled to bar geometry, tinted
  per metric (green=safe, yellow=warning, red=critical).
- `outlineMaterial` — 1-pixel border via a small custom Sprite2D
  shape or a 16×16 tinted hollow-square texture.

### Render order

HUD renders **after** tiles but **before** the compositor's final
pass. Lives inside Flatland's scene so it picks up the scale/pixel-
snap behavior automatically. `renderOrder = 100` to draw on top of
tiles within the same scene.

---

## 7. Wiring (where the data comes from)

| System | New trait/state | Read by |
|---|---|---|
| `spendGems(world, n)` helper | (none — calls `world.set(GameState)` + `world.spawn(GemSpendPopup)`) | `GemSpendPopup` system + HUD renderer |
| `dragSystem` | already mutates `Drag.intervalsCharged` | Info-popup reads `Drag` for bar metric |
| `doPaint` | (uses `spendGems`) | Info-popup reads `Pointer.hoverAction === 'paint'` for icon |
| `doPet` | already sets `Driller.pausedUntilTick` | Info-popup + pet mood icon |
| `Gem.expireAtTick` | already exists | Hover info-popup when hovering an armed gem |
| `Pointer.hoverAction` | already exists | Hover-outline color picker |
| `Drag.clusterId` | already exists | Outline target cells (cluster cells) |

No new constants except `GEM_SPEND_POPUP_TTL_TICKS = 36` and
`POPUP_STACK_WINDOW_TICKS = 4`.

---

## 8. Implementation phases

1. **Icon pipeline** (build script + first sheet committed).
2. **Hover outline** (read-only; quick visual win; no state changes).
3. **Gem-spend popup** (refactor spend call sites through `spendGems`;
   add system + renderer pool).
4. **Action commit info-popup** (held tooltip; bars + icons).
5. **Pet mood icon** (smallest scope; specifically time-gated on
   pet pause).

Each phase commits independently, mirrors the user-action reform
phasing pattern. Each phase ships with its own visual regression test
(probe captures a screenshot through `agent-browser` if available, or
asserts trait state).

---

## Open questions — resolved

1. **Icon pipeline** → CLI-driven `bake-icons` script (§5). Reusable
   beyond this HUD work; explicit emoji list per invocation; PNG +
   regions.ts committed.
2. **HUD layer** → in-Flatland `Sprite2D` pipeline (§6). Pixel-snaps
   with the tile renderer, scales with the game.

Phasing in §8 ships as five small commits under the existing
`mini-game-showcase` branch.
