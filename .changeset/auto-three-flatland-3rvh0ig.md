---
"three-flatland": patch
---

> Branch: codex/driller-refresh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/189

### Bug Fixes

- Fix sprite lighting/shadows drifting out of alignment with the scene when the camera scrolls — lighting world-offset now includes camera translation instead of only local frustum extents (`Flatland`, `lightEffectSystem`)
- Fix `Sprite2D` losing its explicit `material` texture when an effect provider resolves a registry material variant (e.g. via R3F's `material` prop instead of `texture`) — variant resolution now falls back to the material's own texture instead of rendering untextured/white

### Summary

Corrects lighting and shadow positioning during camera scroll and preserves textures on sprites configured with an explicit material when effects are applied.
