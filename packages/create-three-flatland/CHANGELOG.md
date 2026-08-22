# create-three-flatland

## 0.1.0-alpha.2

### Patch Changes

- f3c3de8: Make the render surface the default source of truth for `Flatland` camera and
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

- 2224926: **BREAKING CHANGES**
  - Raise the supported Three.js runtime to `^0.185.1` and align development types on `@types/three ^0.185.4`.
  - Raise the React Three Fiber integration to the exact `10.0.0-alpha.3` release. React integrations now require React `~19.2.0`, matching R3F alpha.3's `<19.3` peer window.

  Migrate Flatland's TSL, clipping, disposal, and instanced-buffer compatibility paths to Three.js r185. The r185 instancing event regression is handled before geometry upload, matching the upstream fix, so newly visible batched instances do not flash for one frame. Standalone `@three-flatland/slug` installs the same guarded timing fix for its instanced glyph meshes.

  The temporary r185 timing shim targets Three's bundled WebGPU `EventNode` and recognizes the internal buffer-sync callback by its buffer API fingerprint. A custom frame callback that duplicates that exact internal pattern will also run before frame while the shim is active.

  Normalize 2xSai vector branches for r185's stricter TSL inference, preserve `SlugText.dispose()` fluent chaining after Three changed `InstancedMesh.dispose()` to return `void`, and ship Skia declarations with resolvable WebGPU and Node ambient types.

  Examples, benchmarks, minis, starter templates, package guidance, and installation docs now use the same dependency stack. `create-three-flatland` is included so the updated starter templates publish with this release.

## 0.1.0-alpha.1

### Patch Changes

- 7617e28: docs: add package README (banner, usage, template matrix, create-vite-compatible flags) and LICENSE

## 0.1.0-alpha.0

### Minor Changes

- 32ae0ea: Initial release: `npm create three-flatland@latest` scaffolds a minimal, version-correct
  three-flatland project from hand-authored three.js and React templates. create-vite-compatible
  flags (positional target dir, `--template three|react` / `-t`, `--overwrite`, non-interactive
  when both are supplied).
