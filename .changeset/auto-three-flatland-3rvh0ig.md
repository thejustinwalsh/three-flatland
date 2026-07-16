---
"three-flatland": patch
---

> Branch: codex/driller-refresh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/189

### Bug Fixes

- Fixed sprite lighting/shadows drifting out of alignment with the scene while the camera scrolls — the Forward+ light-culling grid's world offset now accounts for camera position instead of only local frustum extents.
- Fixed related sprite and default-material regressions uncovered by the shadow-pipeline fix (`Flatland.ts`, `Sprite2D.ts`).

Sprite lighting and shadows now track correctly during camera scroll, eliminating visible drift/misalignment in scrolling scenes.
