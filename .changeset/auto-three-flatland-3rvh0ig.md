---
"three-flatland": patch
---

> Branch: codex/driller-refresh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/189

### Bug Fixes

- Fix lighting/shadows drifting out of alignment with sprites as the camera scrolls — the world offset used by lights, SDF shadows, and radiance cascades now accounts for camera translation instead of only the local frustum extents.
- Fix sprites losing their texture when an explicit `material` prop (common in R3F usage) resolves an effect variant — the variant resolver now falls back to the material's own texture instead of assuming `null`.

**Summary:** Sprites now keep correct lighting/shadow alignment while scrolling, and effect-variant materials no longer drop textures when supplied explicitly (e.g. via R3F).
