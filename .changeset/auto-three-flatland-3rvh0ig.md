---
"three-flatland": patch
---

> Branch: codex/driller-refresh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/189

### Bug Fixes

- Fixed sprite/light lighting drifting out of alignment with the scene while the camera scrolled — world offset now accounts for camera translation, not just frustum extents, so `LightingContext`/`ShadowPipeline` compute correct absolute world bounds each frame.
- Fixed sprites created with an explicit `material` prop (common in R3F usage) silently losing their texture when an effect resolved a registry material variant — the variant resolver now falls back to the material's own texture instead of only `Sprite2D`'s internal `_texture` field.
- Refactored `lightEffectSystem`'s per-frame scratch object to lazily initialize from real values instead of seeding with `null`/`[]` placeholders and a type assertion, removing a source of latent type-unsafety while preserving the zero-allocation hot path.

Summary: this patch corrects a lighting/shadow misalignment during camera scrolling and a texture-loss bug for sprites constructed with an explicit material, plus a small type-safety cleanup in the light effect system's frame loop.
