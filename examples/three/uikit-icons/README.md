# uikit icons (Three.js)

A grid of 26 [lucide](https://lucide.dev) icons — 24 resolved generically by
name (`new Svg({ icon: 'activity' })`) and 2 as literal
`@three-flatland/uikit-lucide` component instances (`Activity`, `Zap`) —
rendered against a baked icon atlas installed via `installIconAtlas`.

## What you should see

- A gem-tinted (ruby) backdrop behind a wrap grid of 26 rounded icon
  chips, centered in the viewport.
- The top-left HUD states the honest framing and a live draw-call count.
- The Tweakpane devtools panel (top-right by default) with its FPS/stats
  graph visible.

## The baked-atlas path

`bake-icons.mts` dogfoods the built `uikit-bake icons` CLI against the
checked-in `icons.manifest.json` to produce `public/icons.shapes.glb` — a
single `FL_slug_shapes` atlas covering all 26 icons. That `.glb` is committed
(a few KB) so `pnpm dev` works with no build step. Regenerate it after
touching the manifest or the source SVGs:

```sh
pnpm --filter=@three-flatland/uikit build
pnpm exec tsx bake-icons.mts
```

`main.ts` installs the atlas before constructing any UI:

```ts
await installIconAtlas('./icons.shapes.glb')
```

Every `Svg`/lucide instance afterward registers into the SAME shared
`SlugShapeSet` — the 24 generic `Svg({ icon })` lookups AND the 2 literal
`Activity`/`Zap` component instances all resolve against the installed atlas
with **zero SVG parsing**, and all 26 batch through `ShapeGroupManager` into
**one** `InstancedShapeMesh` draw call.

## The honest framing

Baking an icon atlas is a **draw-count / CPU / scalability win**, not a
GPU-ms win — the GPU stays fill-bound at these icon sizes either way. What
you're avoiding is 26 separate draw calls (and, without a shared
`SlugShapeSet`, 26 SVG parses) at startup, not shaving milliseconds off a
frame that was already fast. See
`planning/superpowers/plans/svg-bake-pipeline.md` for the full measurement.

Part of [three-flatland](https://github.com/thejustinwalsh/three-flatland) — a TSL-native 2D rendering library for Three.js.

> Also available as a [React example](../../react/uikit-icons).
