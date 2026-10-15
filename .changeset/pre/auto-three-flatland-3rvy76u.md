---
"three-flatland": minor
---

> Branch: feat/world-effect-materials
> PR: https://github.com/thejustinwalsh/three-flatland/pull/156

### Changes

- World-scope constants-effect material variants: sprites with a constants-effect (e.g. `NormalMapProvider`) now resolve materials per-world instead of from a flat module-global cache, eliminating cross-world material sharing/coupling for effect variants (matches existing default-material behavior)
- Reassigning a texture on a sprite holding a shared effect-variant material now re-resolves the variant instead of mutating the shared instance in place
- Fixed `alphaTest`/`premultipliedAlpha` being silently dropped on variant re-resolution (texture reassignment, dispose resurrection, bootstrap enrollment) — sprites relying on alpha-test depth fast-path or premultiplied-alpha `CustomBlending` now keep those settings correctly
- Added `Sprite2DMaterial.variantOptions` accessor to centralize variant option readback and prevent future drift between the cache key and its consumers

### Summary

Effect-variant materials are now world-scoped like default materials, fixing cross-world sharing bugs, and a related regression that dropped alpha-test/premultiplied-alpha settings during material re-resolution has been fixed.
