---
'three-flatland': minor
'create-three-flatland': patch
'@three-flatland/skills': patch
'@three-flatland/presets': patch
---

Make the render surface the default source of truth for `Flatland` camera and
lighting dimensions. `render()` now derives its size from the active render
target or renderer, skips unchanged dimensions, and safely waits through an
initial `0×0` canvas measurement. React Three Fiber and vanilla Three.js users no
longer need a manual resize bridge for the usual responsive-canvas case.
Surface-dependent lighting and shadow buffers use physical drawing-buffer pixels,
so HiDPI canvases and equivalent render targets share the same sizing contract.
Each `LightEffect` also exposes `resolutionScale` for an explicit per-effect
quality/performance tradeoff without changing camera framing, canvas DPR, or
logical viewport uniforms.

`aspect` is now a settable property for fixed camera framing, including R3F JSX
property assignment. A fixed aspect still lets surface-dependent lighting buffers
follow the real target size. Assigning `aspect = 'auto'` restores automatic sizing,
including after `resize(width, height)`, which remains the escape hatch for full
manual control of both camera and effect dimensions.

Once a valid surface size exists, light effects receive a deterministic
`init → resize → update` lifecycle.
Effects attached after the first frame, re-enabled after a resize, or mounted
before the canvas is measurable receive the latest valid dimensions before their
next update. Replacing an active effect disposes its owned GPU resources before
detachment, making later reattachment safe.

Render targets without authored color-space metadata now default to sRGB, while
explicit linear/HDR targets remain untouched. Flatland applies the final output
color transform only when presenting to the screen, avoiding an sRGB encode in
intermediate render targets.

## BREAKING CHANGES

`Flatland` no longer keeps a square `aspect = 1` frustum by default. It follows
the render surface unless configured otherwise. If a square frustum was
intentional, pass `aspect: 1` (or set `flatland.aspect = 1`). Otherwise, remove
manual per-frame and `useThree(state => state.size)` resize bridges and let
`render()` synchronize the surface. Use `'auto'` rather than removing a conditional
R3F `aspect` prop: `aspect={locked ? 1 : 'auto'}`.

The React starter template, packaged R3F skill, and Breakout mini now use the
automatic sizing path so generated and maintained examples teach the new
canonical integration. Paired React and Three examples, plus both starter
templates, also select sRGB output with no tone mapping explicitly. This avoids
R3F alpha 3's ACES default producing a different palette from plain Three.js.
