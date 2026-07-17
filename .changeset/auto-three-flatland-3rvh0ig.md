---
"three-flatland": patch
---

> Branch: codex/driller-refresh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/189

### Fixes

- Fix sprite lighting/shadows drifting out of alignment with sprites when scrolling an orthographic camera — the lighting world offset now includes camera translation instead of only local frustum edges
- Fix `Sprite2D` losing its texture when an explicit `material` prop (common in R3F usage) is provided instead of a `texture` prop and an effect/variant provider resolves a material variant — the sprite's effective material texture is now used as a fallback so it no longer silently falls back to an untextured material

### Summary

Corrects lighting/shadow positioning during camera scroll and preserves sprite textures when materials are set explicitly (e.g. via React Three Fiber) alongside effect variants.
