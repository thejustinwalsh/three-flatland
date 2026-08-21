---
'three-flatland': minor
'@three-flatland/nodes': minor
'@three-flatland/presets': minor
'@three-flatland/skia': minor
'@three-flatland/slug': minor
'@three-flatland/image': minor
'@three-flatland/devtools': minor
---

**BREAKING CHANGES**

- Raise the supported Three.js runtime to `^0.185.1` and align development types on `@types/three ^0.185.4`.
- Raise the React Three Fiber integration to the exact `10.0.0-alpha.3` release. React integrations continue to require React 19.

Migrate Flatland's TSL, clipping, disposal, and instanced-buffer compatibility paths to Three.js r185. The r185 instancing event regression is handled before geometry upload, matching the upstream fix, so newly visible batched instances do not flash for one frame.

Skia now ships `@webgpu/types` with preserved entry-point references so its public WebGPU declarations resolve in consuming TypeScript projects. Examples, minis, starter templates, package guidance, and installation docs now use the same dependency stack.
