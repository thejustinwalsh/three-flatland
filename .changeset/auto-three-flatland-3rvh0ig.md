---
"three-flatland": patch
---

> Branch: codex/driller-refresh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/189

### Fixes

- Fix sprite lighting/shadows drifting out of sync with sprites while the camera scrolls — `worldOffset` now includes camera translation instead of only local frustum edges (`Flatland`, `lightEffectSystem`)
- Fix `Sprite2D` effects (e.g. lighting/shadow variants) silently falling back to an untextured white material when a sprite is constructed with an explicit `material` prop instead of a `texture` prop (common with R3F) — variant resolution now falls back to the material's own texture

Sprite lighting stays correctly positioned during camera scrolling, and effect-driven material variants now resolve correctly for sprites configured via an explicit material rather than a texture prop.
