# Fixture workspace — asset provenance

Everything under `workspace/` is a real repo asset, copied in (never a
symlink, never generated) so the e2e tools exercise real sprite/atlas/sound
data instead of synthetic stand-ins.

| Fixture path | Source | Notes |
|---|---|---|
| `workspace/src/sounds.ts` | `minis/breakout/src/systems/sounds.ts` | Trimmed to 3 of the real ZzFX presets (`PADDLE_HIT`, `WALL_HIT`, `BLOCK_BREAK`), kept verbatim. The original file never calls `zzfx(...)` with a literal — it always spreads a `params` variable inside `play()` — so three call-site variants were added for future ZzFX CodeLens tests: a literal spread-array call, a named-const (`LASER`) spread call, and a commented-out call (negative case). See the file header comment. |
| `workspace/sprites/Dungeon_Tileset.png` | `examples/react/lighting/public/sprites/Dungeon_Tileset.png` | Unmodified copy. |
| `workspace/sprites/Dungeon_Tileset.normal.png` | `examples/react/lighting/public/sprites/Dungeon_Tileset.normal.png` | Unmodified copy — pairs with the tileset for Normal Baker fixtures. |
| `workspace/sprites/Dungeon_Tileset.normal.json` | `examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json` | Unmodified copy. |
| `workspace/sprites/knight.png` | `examples/react/lighting/public/sprites/knight.png` | Unmodified copy — used by the FL Sprite Atlas smoke spec. |
| `workspace/sprites/knight.json` | `examples/react/lighting/public/sprites/knight.json` | Unmodified copy. This is the `examples/` runtime atlas JSON shape, **not** our `*.atlas.json` sidecar schema (see `extension/tools/atlas/sidecar.ts:sidecarUriForImage`) — it rides along as fixture data for future tools, not consumed by the atlas smoke spec. |
| `workspace/sprites/knight.atlas.json` | Hand-authored | Not copied from anywhere — the merge tool's command (`threeFlatland.merge.openMergeTool`) only accepts real `*.atlas.json` sidecars, and no such sidecar exists yet for `knight.png` anywhere in the repo. Built to the real `packages/schemas/src/atlas/schema.json` shape (single frame, `w`/`h` matching `knight.png`'s actual 256×256) so it passes `assertValidAtlas` for real, not just as inert test data. |
| `workspace/sprites/dungeon.atlas.json` | Hand-authored | Same reasoning as `knight.atlas.json`, sized to `Dungeon_Tileset.png`'s actual 160×160. Paired with it so the merge smoke spec can merge two real sources instead of a degenerate single-source case. |
| `workspace/.vscode/settings.json` | Hand-authored | Disables telemetry, updates, workspace-trust prompts, and autosave so a fresh VS Code window starts deterministically under automation. |

## Why copies, not symlinks or generated data

Fixture files must round-trip through `fs.cp()` into a fresh temp directory
before every test (see `e2e/fixtures.ts`), and must survive VS Code writing
sidecar/output files next to them without touching the real repo assets
they were copied from. Symlinks would defeat the copy-on-write isolation;
generated data wouldn't exercise the same edge cases as content real users
actually load (odd atlas rect counts, real PNG chunk layouts, etc).

## Adding fixtures for a new tool

Copy the smallest real asset that exercises the tool's happy path, add a
row to the table above naming its exact source path, and note anything
non-obvious about the shape (e.g. sidecar naming mismatches like the
`knight.json` note above). Keep the workspace small — it's copied fresh for
every test.
