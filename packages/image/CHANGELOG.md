# @three-flatland/image

## 0.1.0-alpha.3

### Minor Changes

- 2224926: **BREAKING CHANGES**
  - Raise the supported Three.js runtime to `^0.185.1` and align development types on `@types/three ^0.185.4`.
  - Raise the React Three Fiber integration to the exact `10.0.0-alpha.3` release. React integrations now require React `~19.2.0`, matching R3F alpha.3's `<19.3` peer window.

  Migrate Flatland's TSL, clipping, disposal, and instanced-buffer compatibility paths to Three.js r185. The r185 instancing event regression is handled before geometry upload, matching the upstream fix, so newly visible batched instances do not flash for one frame. Standalone `@three-flatland/slug` installs the same guarded timing fix for its instanced glyph meshes.

  The temporary r185 timing shim targets Three's bundled WebGPU `EventNode` and recognizes the internal buffer-sync callback by its buffer API fingerprint. A custom frame callback that duplicates that exact internal pattern will also run before frame while the shim is active.

  Normalize 2xSai vector branches for r185's stricter TSL inference, preserve `SlugText.dispose()` fluent chaining after Three changed `InstancedMesh.dispose()` to return `void`, and ship Skia declarations with resolvable WebGPU and Node ambient types.

  Examples, benchmarks, minis, starter templates, package guidance, and installation docs now use the same dependency stack. `create-three-flatland` is included so the updated starter templates publish with this release.

## 0.1.0-alpha.2

### Patch Changes

- 2b6f4be: fix: add the `repository` and `license` fields to package.json. The empty
  `repository.url` made npm reject the publish with E422 (sigstore provenance
  could not verify the source repo). With provenance enabled, the field must
  match the GitHub repo URL.

## 0.1.0-alpha.1

### Patch Changes

- 7617e28: docs: add package README (banner, KTX2 rationale, encode/decode + Ktx2Loader usage, CLI) and LICENSE

## 0.1.0-alpha.0

### Minor Changes

- 00c4ae5: Initial release. Publishes the image pipeline that was already complete but never
  un-privated: PNG/WebP/AVIF/KTX2 encode and decode, the `Ktx2Loader`, and the
  `flatland-bake encode` baker.

  This makes KTX2 reachable by consumers for the first time — both the loader and
  the compression CLI (`flatland-bake encode --format ktx2 --basis-mode etc1s|uastc`),
  which previously existed only behind the VS Code extension's Image Encoder.
