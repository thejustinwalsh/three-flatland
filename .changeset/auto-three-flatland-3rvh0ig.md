---
"three-flatland": patch
---

> Branch: codex/driller-refresh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/189

### Bug Fixes

- Fixed sprite lighting and shadows drifting out of alignment with the scene while the camera scrolls — world offset now accounts for the camera's translation, not just its orthographic frustum edges.
- Fixed sprites constructed with an explicit `material` (common in R3F, e.g. `<sprite2D material={...} />`) losing their texture when a lighting/shadow effect resolved a registry material variant — the effective material texture is now used as a fallback when no `texture` prop was set.

### Internal

- Replaced the always-initialized (placeholder-seeded) module-scoped scratch object in `lightEffectSystem` with a lazily-initialized one, removing an unsafe type assertion while keeping the per-frame update path zero-allocation.

Fixes visible lighting/shadow misalignment during camera scroll and a texture-loss bug for sprites using an explicit `material` prop with effects.
