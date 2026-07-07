# Overdraw Bench (Three.js)

Soft-particle overdraw stress test: hundreds to thousands of large,
heavily-overlapping alpha-blended particles drawn from one atlas in one
batch. A Tweakpane toggle switches the whole batch between the
tight-mesh envelope path (convex-hull geometry hugging each frame's alpha
silhouette) and the full synth-quad path, so you can see and measure the
fragment-shading cost tight-mesh removes.

Both atlas variants (`public/assets/particles.json` / `particles-quad.json`)
are pre-baked by `scripts/generate-overdraw-particles.ts` at the repo
root — pixel-identical pages, but only `particles.json` carries per-frame
polygon meshes. Loading the mesh-less variant gives its texture a
distinct identity that never resolves to tight-mesh, so switching "mode"
is just choosing which pre-loaded material to draw with.

Part of [three-flatland](https://github.com/thejustinwalsh/three-flatland) — a TSL-native 2D rendering library for Three.js.

> Also available as a [React example](../../react/overdraw-bench).
