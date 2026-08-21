---
'three-flatland': minor
'@three-flatland/nodes': minor
'@three-flatland/presets': minor
'@three-flatland/skia': minor
'@three-flatland/slug': minor
'@three-flatland/image': minor
'@three-flatland/devtools': minor
'@three-flatland/normals': patch
'create-three-flatland': patch
---

**BREAKING CHANGES**

- Raise the supported Three.js runtime to `^0.185.1` and align development types on `@types/three ^0.185.4`.
- Raise the React Three Fiber integration to the exact `10.0.0-alpha.3` release. React integrations now require React `~19.2.0`, matching R3F alpha.3's `<19.3` peer window.

Migrate Flatland's TSL, clipping, disposal, and instanced-buffer compatibility paths to Three.js r185. The r185 instancing event regression is handled before geometry upload, matching the upstream fix, so newly visible batched instances do not flash for one frame.

The temporary r185 timing shim targets Three's bundled WebGPU `EventNode` and recognizes the internal buffer-sync callback by its buffer API fingerprint. A custom frame callback that duplicates that exact internal pattern will also run before frame while the shim is active.

Normalize 2xSai vector branches for r185's stricter TSL inference, preserve `SlugText.dispose()` fluent chaining after Three changed `InstancedMesh.dispose()` to return `void`, and ship Skia declarations with resolvable WebGPU and Node ambient types.

Examples, benchmarks, minis, starter templates, package guidance, and installation docs now use the same dependency stack. `create-three-flatland` is included so the updated starter templates publish with this release.
