---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Package

- `@three-flatland/normals` — Node.js offline normal-map baker and runtime loader

## CLI (flatland-bake normal)

- `flatland-bake normal <input.png> [output.png] [--strength N]` — reads an RGBA PNG, computes 4-neighbor alpha gradient, normalizes to tangent-space normal, writes a sibling `.normal.png`
- Contributes to `@three-flatland/bake` discovery via `flatland.bakers` in `package.json`
- Per-region baking (`bakeRegions`) for sprite sheets with multiple named regions

## Runtime Loader

- `NormalMapLoader`: implements "try baked → fall back to runtime TSL" canonical pattern
  - Static API: `NormalMapLoader.load(url, { forceRuntime? })` with shared URL+forceRuntime-keyed cache
  - Instance API: extends `three.Loader` — compatible with R3F `useLoader`
  - Silent HEAD probe on `.normal.png`; 404 falls through to runtime path with no warning
  - Dev-time warning (fires once per URL, suppressed in `NODE_ENV=production`) when runtime path is taken

## Descriptor

- `descriptor.ts` — read/write `.normal.json` sidecar files describing per-sprite normal-map regions and metadata

`@three-flatland/normals` is the first package to use the `@three-flatland/bake` plugin API. Runtime consumers can opt into the baked path immediately; the TSL `normalFromSprite` runtime fallback is preserved.

### 5f850bdd862f6e277b8e830b992e1f4e16651747
feat: add normal descriptor loader and baking script; enhance material effects with elevation support
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json, examples/react/lighting/public/sprites/Dungeon_Tileset.normal.png, examples/react/lighting/public/sprites/slime.png, examples/three/lighting/main.ts, package.json, packages/bake/README.md, packages/bake/package.json, packages/bake/src/devtimeWarn.test.ts, packages/bake/src/devtimeWarn.ts, packages/bake/src/discovery.test.ts, packages/bake/src/discovery.ts, packages/bake/src/index.ts, packages/bake/src/node.ts, packages/bake/src/sidecar.test.ts, packages/bake/src/sidecar.ts, packages/bake/src/types.ts, packages/bake/src/writeSidecar.test.ts, packages/bake/src/writeSidecar.ts, packages/bake/tsup.config.ts, packages/nodes/src/lighting/normalFromSprite.ts, packages/normals/README.md, packages/normals/package.json, packages/normals/src/NormalMapLoader.test.ts, packages/normals/src/NormalMapLoader.ts, packages/normals/src/bake.node.ts, packages/normals/src/bake.test.ts, packages/normals/src/bake.ts, packages/normals/src/bakeRegions.test.ts, packages/normals/src/baker.ts, packages/normals/src/cli.test.ts, packages/normals/src/cli.ts, packages/normals/src/descriptor.test.ts, packages/normals/src/descriptor.ts, packages/normals/src/index.ts, packages/normals/src/node.ts, packages/normals/src/resolveNormalMap.ts, packages/normals/tsup.config.ts, packages/three-flatland/src/debug/bus-pool.test.ts, packages/three-flatland/src/loaders/LDtkLoader.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/loaders/TiledLoader.ts, packages/three-flatland/src/loaders/index.ts, packages/three-flatland/src/loaders/normalDescriptor.test.ts, packages/three-flatland/src/loaders/normalDescriptor.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/materials/channels.ts, packages/three-flatland/src/sprites/types.ts, pnpm-lock.yaml, scripts/bake-dungeon-normals.ts, turbo.json
Stats: 52 files changed, 5924 insertions(+), 404 deletions(-)

### 452381341aaa449f1eb72834966677dff8573d8e
feat: rebuild on tweakpane + current API (post-rebase)
Post-rebase rebuild of examples/react/lighting against the
post-restructure codebase. The old demo from PR #17 was dropped
during the rebase because its paths (examples/vanilla/lighting,
microfrontends.json) conflicted with the main-side restructure.

What the new example does:
- Dungeon floor via TileMap2D
- Room perimeter + interior walls as castsShadow Sprite2Ds
- 4 wandering knights + 10 green slimes (each a point light)
- 2 fixed flickering torches at sconce positions
- Keyboard-controlled hero knight (WASD / arrows)
- Ambient, DefaultLightEffect
- Tweakpane panel via @three-flatland/tweakpane/react hooks

Every caster correctly uses `castsShadow` (our per-sprite bit) not
`castShadow` (Object3D's unused-by-us built-in three shadow-map flag).

Rebase fix-ups bundled:
- Flatland._validateLightingChannels uses globalThis.process so
  packages without @types/node (mini-breakout) typecheck clean.
- @three-flatland/presets declares @react-three/fiber as optional peer
  dep so the ThreeElements module augmentation resolves.
- @three-flatland/presets package.json gains ./react subpath export.
- Lint cleanup on unused imports in SpriteGroup, systems, traits.
- Hoisted inline import() type annotations to named import type in
  Flatland.ts + LightEffect.ts.

Refs #11 #14 #16.
Files: examples/react/lighting/App.tsx, examples/react/lighting/index.html, examples/react/lighting/main.tsx, examples/react/lighting/package.json, examples/react/lighting/public/sprites/Dungeon_Tileset.png, examples/react/lighting/public/sprites/knight.json, examples/react/lighting/public/sprites/knight.png, examples/react/lighting/tsconfig.json, examples/react/lighting/vite.config.ts, examples/react/pass-effects/App.tsx, packages/nodes/src/lighting/shadows.ts, packages/normals/src/NormalMapLoader.ts, packages/normals/src/baker.ts, packages/presets/package.json, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/systems/effectTraitsSystem.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/materials/MaterialEffect.type-test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, pnpm-lock.yaml
Stats: 23 files changed, 2554 insertions(+), 674 deletions(-)

### 290169abc44931035cb2735e35b4b0b36cd24430
feat: NormalMapLoader + canonical loader-pattern doc
Adds NormalMapLoader — the runtime side of the normal-map pipeline,
implementing the canonical "try baked → fall back to runtime" shape.

The loader returns either a Texture (loaded from the sibling
`.normal.png` that `flatland-bake normal` produces) or null, signalling
the caller to switch to the runtime TSL `normalFromSprite` path. A HEAD
probe keeps a 404 silent; a successful HEAD followed by a TextureLoader
failure warns and falls through to the runtime path. Dev-time warnings
fire at most once per URL when the runtime path is taken, only outside
NODE_ENV=production.

The loader exposes both APIs:
  - Instance API (R3F useLoader compatible) — extends three.Loader
  - Static API (vanilla) — NormalMapLoader.load(url, { forceRuntime? })
    with a shared URL+forceRuntime-keyed cache

Also adds planning/bake/loader-pattern.md documenting the shape as the
repo-wide convention: URL derivation, forceRuntime semantics, warn-text
format, version gating, silent-404 rule, the decision not to factor a
shared loader-kit package, and a checklist for future loaders.

Refs #16.
Files: packages/normals/package.json, packages/normals/src/NormalMapLoader.test.ts, packages/normals/src/NormalMapLoader.ts, packages/normals/src/index.ts, packages/normals/tsup.config.ts, planning/bake/loader-pattern.md, pnpm-lock.yaml
Stats: 7 files changed, 465 insertions(+), 2 deletions(-)

### a0bfde293563c23ccd8c25087b015c3865840925
feat: offline normal-map baker via flatland-bake normal
Adds @three-flatland/normals — a Node-runnable port of the
normalFromSprite TSL helper. Reads an RGBA PNG, computes the
4-neighbor alpha gradient, normalizes to a tangent-space normal, and
writes a sibling .normal.png. Runtime consumers can load the baked PNG
directly instead of paying four alpha samples + gradient per fragment.

The package contributes a `flatland.bakers` manifest, so installing it
makes `flatland-bake normal <input.png>` appear in `--list` with no
further wiring:

  flatland-bake normal sprite.png
  flatland-bake normal sprite.png sprite.normal.png --strength 2

Also adds CWD-self-discovery to @three-flatland/bake: when the CLI runs
inside a package whose own package.json declares bakers, those are
registered ahead of node_modules scans. Lets the package author
iterate without symlinking their own package into its own
node_modules. Node_modules discovery still takes over for end users.

No runtime loader on this commit — consumers read `.normal.png`
directly as a texture until the Flatland lighting pipeline binds
sprite normals, at which point a thin loader can try the baked URL
and fall back to the existing runtime TSL path with a dev-time
warning per the canonical pattern.

Refs #16.
Files: packages/bake/src/discovery.test.ts, packages/bake/src/discovery.ts, packages/normals/package.json, packages/normals/src/bake.test.ts, packages/normals/src/bake.ts, packages/normals/src/baker.ts, packages/normals/src/index.ts, packages/normals/tsconfig.json, packages/normals/tsup.config.ts, pnpm-lock.yaml
Stats: 10 files changed, 472 insertions(+)
