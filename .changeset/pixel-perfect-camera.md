---
'three-flatland': minor
---

**BREAKING CHANGES**

- Make the hierarchical `pixel-art` rendering preset the default for `Flatland`, `Sprite2D`, `AnimatedSprite2D`, and `TileMap2D`. Applications that require fractional presentation can set `FlatlandConfig.options = 'smooth'`, override `RenderingConfig`, or set `pixelPerfect: false` on an instance.
- Default unconfigured Flatland render targets to sRGB output. Explicit target color spaces, including linear and HDR targets, remain untouched.

Add `PixelPerfectCamera`, a no-argument-safe orthographic camera that maps world units to integer physical-pixel scales, fills the output by revealing additional world space when only `viewSize` is supplied, supports exact letterbox or pillarbox framing through `viewWidth`, preserves Three.js camera zoom through integer quantization, and exposes DPR-safe viewport and pointer helpers.

Flatland now owns this camera automatically when pixel-perfect rendering is enabled. Its direct canvas, render-target, and automatic post-processed canvas paths preserve the centered viewport in the destination's coordinate space. The React `usePixelPerfectCamera` integration synchronizes R3F camera state, viewport metrics, `getCurrentViewport`, renderer viewports, and letterbox-aware pointer events while restoring the previous root state on unmount.

Projected sprite snapping now works across standalone sprites, batched sprites, hierarchy transforms, animation, and tilemaps without mutating simulation transforms or duplicating moving matrix translations into the interleaved instance buffer. The TSL compiler gate covers both synthesized-quad and tight-mesh paths in WGSL and GLSL.

Introduce `FlatlandConfig` and `RenderingConfig` above the existing texture configuration so one hierarchical `pixel-art`, `smooth`, or `none` choice cascades through rendering and loading defaults while preserving class, subsystem, and instance overrides.
