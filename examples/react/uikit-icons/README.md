# uikit icons (React)

A grid of 26 [lucide](https://lucide.dev) icons rendered as
`@three-flatland/uikit-lucide/react` components, resolved against a baked
icon atlas installed via a suspense-wrapped `installIconAtlas`.

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

`IconGrid` suspends on the atlas install before rendering any icons:

```tsx
function useIconAtlas(url: string): void {
  suspend(() => installIconAtlas(url), [url, 'uikit-icons-atlas'])
}
```

— the R3F-idiomatic sibling of `useLoader(SlugShapeSetLoader, url)` (both
resolve the SAME baked `.glb`; this example uses the suspense-wrapped
`installIconAtlas` form because it also swaps in the shared `SlugShapeSet`
in one step). Every generated lucide component already carries its own
`icon` name, so once the atlas is installed all 26 resolve with **zero SVG
parsing** and batch through `ShapeGroupManager` into **one**
`InstancedShapeMesh` draw call.

## The honest framing

Baking an icon atlas is a **draw-count / CPU / scalability win**, not a
GPU-ms win — the GPU stays fill-bound at these icon sizes either way. What
you're avoiding is 26 separate draw calls (and, without a shared
`SlugShapeSet`, 26 SVG parses) at startup, not shaving milliseconds off a
frame that was already fast. See
`planning/superpowers/plans/svg-bake-pipeline.md` for the full measurement.

Part of [three-flatland](https://github.com/thejustinwalsh/three-flatland) — a TSL-native 2D rendering library for Three.js.

> Also available as a [Three.js example](../../three/uikit-icons).
