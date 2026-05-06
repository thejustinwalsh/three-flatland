---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## CLI

- New `flatland-bake` binary — extensible CLI that discovers and dispatches to bakers contributed by workspace or npm packages via a `flatland.bakers` manifest in `package.json`
- Discovery walks `node_modules` upward from CWD and also checks the CWD package itself (self-discovery), so package authors can iterate without symlinking into their own `node_modules`
- Duplicate-name registration reported as a conflict with first-wins policy

## Utilities

- `sidecar` read/write helpers for `.normal.json` (and future asset sidecar) files
- `devtimeWarn` helper: fires a warning at most once per key outside `NODE_ENV=production`
- `node` entry point for Node.js-specific runtime utilities

This release ships the bake CLI framework and sidecar utilities. Install `@three-flatland/normals` to add the `flatland-bake normal` subcommand.

### 5f850bdd862f6e277b8e830b992e1f4e16651747
feat: add normal descriptor loader and baking script; enhance material effects with elevation support
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json, examples/react/lighting/public/sprites/Dungeon_Tileset.normal.png, examples/react/lighting/public/sprites/slime.png, examples/three/lighting/main.ts, package.json, packages/bake/README.md, packages/bake/package.json, packages/bake/src/devtimeWarn.test.ts, packages/bake/src/devtimeWarn.ts, packages/bake/src/discovery.test.ts, packages/bake/src/discovery.ts, packages/bake/src/index.ts, packages/bake/src/node.ts, packages/bake/src/sidecar.test.ts, packages/bake/src/sidecar.ts, packages/bake/src/types.ts, packages/bake/src/writeSidecar.test.ts, packages/bake/src/writeSidecar.ts, packages/bake/tsup.config.ts, packages/nodes/src/lighting/normalFromSprite.ts, packages/normals/README.md, packages/normals/package.json, packages/normals/src/NormalMapLoader.test.ts, packages/normals/src/NormalMapLoader.ts, packages/normals/src/bake.node.ts, packages/normals/src/bake.test.ts, packages/normals/src/bake.ts, packages/normals/src/bakeRegions.test.ts, packages/normals/src/baker.ts, packages/normals/src/cli.test.ts, packages/normals/src/cli.ts, packages/normals/src/descriptor.test.ts, packages/normals/src/descriptor.ts, packages/normals/src/index.ts, packages/normals/src/node.ts, packages/normals/src/resolveNormalMap.ts, packages/normals/tsup.config.ts, packages/three-flatland/src/debug/bus-pool.test.ts, packages/three-flatland/src/loaders/LDtkLoader.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/loaders/TiledLoader.ts, packages/three-flatland/src/loaders/index.ts, packages/three-flatland/src/loaders/normalDescriptor.test.ts, packages/three-flatland/src/loaders/normalDescriptor.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/materials/channels.ts, packages/three-flatland/src/sprites/types.ts, pnpm-lock.yaml, scripts/bake-dungeon-normals.ts, turbo.json
Stats: 52 files changed, 5924 insertions(+), 404 deletions(-)

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

### 0813855462e544474415d2f803ed66a193955bd8
feat: unified flatland-bake CLI with package-contributed bakers
Adds @three-flatland/bake — a single binary entry point (flatland-bake)
that discovers and dispatches to bakers contributed by workspace or npm
packages via a package.json manifest:

  "flatland": {
    "bakers": [
      { "name": "font", "description": "...", "entry": "./dist/baker.js" }
    ]
  }

Bakers default-export a `Baker` ({ name, description, run(args), usage? })
and are picked up automatically — installing a package that provides one
makes its subcommand appear in `flatland-bake --list`.

Discovery walks node_modules upward from CWD, tolerating scoped packages,
missing dirs, and malformed package.json files. Duplicate-name
registrations are reported as conflicts with a first-wins policy so the
caller can escalate or ignore.

Ships with no concrete bakers on this branch; slug retrofit will land on
the feat-slug branch, normal-map baker is a follow-up. The canonical
loader pattern (try baked → runtime fallback + devtime warning) is left
duplicated per-consumer by design — the shape is ~15 lines per loader
and factoring it out adds more ceremony than it saves given each asset
has different unpack/cache semantics.

Refs #16.
Files: packages/bake/package.json, packages/bake/src/cli.ts, packages/bake/src/discovery.test.ts, packages/bake/src/discovery.ts, packages/bake/src/index.ts, packages/bake/src/types.ts, packages/bake/tsconfig.json, packages/bake/tsup.config.ts, pnpm-lock.yaml
Stats: 9 files changed, 489 insertions(+), 22 deletions(-)
