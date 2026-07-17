---
"three-flatland": patch
---

> Branch: codex/driller-refresh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/189

### Bug Fixes

- Fixed sprite lighting/shadows drifting out of alignment with the scene as the camera scrolls — the light-effect world offset now includes camera translation, not just the local orthographic frustum edges (`Flatland`, `lightEffectSystem`)
- Fixed `Sprite2D` losing its effect-variant material's texture when a sprite is constructed with an explicit `material` prop (common in R3F usage) instead of a `texture` prop — the variant resolver now falls back to the material's existing texture instead of silently producing an untextured white material

### Summary

Scrolling scenes now keep lighting and shadows correctly positioned, and sprites built with an explicit material prop no longer lose their texture when resolving effect variants.
