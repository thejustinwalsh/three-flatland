---
"@three-flatland/atlas": patch
---

> Branch: feat/overdraw-tight-mesh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/142

## Fixes

- `polygonizeAlpha` now traces every connected component in an alpha mask instead of only the first, falling back to the convex hull of all contours for disconnected shapes — previously a second blob could be clipped entirely by an incomplete envelope.
- Fixed winding: the fully-opaque fast path now matches `earClip`'s y-down winding so both paths produce correct CCW front faces after the downstream y-flip.

Fixes polygon-tracing correctness issues for disconnected alpha shapes and winding consistency, found during adversarial review of the atlas tight-mesh work.
