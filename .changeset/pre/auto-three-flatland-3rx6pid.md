---
"three-flatland": minor
---

> Branch: feat/oklch-color-main
> PR: https://github.com/thejustinwalsh/three-flatland/pull/123

### e1167303647acd572b4cfdd6ea435f6410bdbe90
fix: correct Color color-space semantics, exact sRGB transfer, TSL dedup
Review-cycle fixes for the ported suite (this is its first review):

CPU (three-flatland/src/color):
- colorToOklab / oklabToColor / relativeLuminance now treat Color
  components as working-space Linear-sRGB (the three.js default since
  r152) instead of double-applying the sRGB transfer; srgbToLinear /
  linearToSrgb remain for explicit gamma-encoded values
- tests hardened with absolute Ottosson/CSS Color 4 reference values,
  exact mid-gray luminance, exact 21:1 black/white contrast, and a
  non-cancelling round-trip through the Color type

TSL (@three-flatland/nodes/color):
- exact IEC 61966-2-1 transfer via three/tsl sRGBTransferEOTF/OETF
  (replaces the pow-2.2 approximation; GPU now matches CPU)
- gamma entry points clamp input to [0,1] (kills pow-on-negative NaN)
- reuse three/tsl cbrt and TWO_PI; drop local re-implementations
- oklchLerp reuses the shared OKLAB<->OKLCH polar helpers from oklch.ts
- conversion cores wrapped in Fn() so composed calls emit shader
  function invocations instead of re-inlined subgraphs; typed through a
  narrow adapter (array-inputs Fn overload is runtime-supported but
  missing from some @types/three resolutions)
Files: packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/interpolation.test.ts
Stats: 11 files changed, 208 insertions(+), 85 deletions(-)

### 3ba7af85461c0ba7bc153aaf28c47155075b7cd5
feat: port OKLAB/OKLCH color suite onto the current layout
Re-homes the orphaned worktree-oklch-color work (39086a1f, based on a
pre-alpha-6 tree) onto main:

- @three-flatland/nodes: oklab/oklch/oklchLerp TSL nodes alongside the
  existing color nodes, exported from the color index
- three-flatland: new src/color/ CPU-side suite (conversions, distance,
  gamut, harmony, interpolation, palette) with ./color package exports
  and a generated react subpath wrapper (pnpm sync:react)

Adapted to current conventions: import type for type-only imports,
dropped an unused import, prettier formatting.
Files: packages/nodes/src/color/contrast.ts, packages/nodes/src/color/hueShift.ts, packages/nodes/src/color/index.ts, packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/package.json, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/gamut.test.ts, packages/three-flatland/src/color/gamut.ts, packages/three-flatland/src/color/harmony.test.ts, packages/three-flatland/src/color/harmony.ts, packages/three-flatland/src/color/index.ts, packages/three-flatland/src/color/interpolation.test.ts, packages/three-flatland/src/color/interpolation.ts, packages/three-flatland/src/color/palette.test.ts, packages/three-flatland/src/color/palette.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/color/index.ts
Stats: 25 files changed, 1497 insertions(+), 6 deletions(-)
