---
"three-flatland": minor
---

> Branch: feat/world-effect-materials
> PR: https://github.com/thejustinwalsh/three-flatland/pull/156

### Sprite materials

- Fix: sprites with a constants-effect (e.g. `NormalMapProvider`) no longer share a single material instance across worlds — each world now gets its own effect-variant material, closing the same cross-world coupling gap previously fixed for default materials (PR #141)
- Fix: reassigning `texture` on a sprite holding a shared effect-variant material no longer mutates that shared instance in place; it now correctly re-resolves a variant for the new texture
- Sprites created before being added to a `SpriteGroup` continue to resolve a bootstrap effect-variant material, then transparently re-resolve to the world-scoped variant on enrollment

World-scoped effect-variant materials round out the per-world material isolation work, preventing unintended visual/state coupling between independent `SpriteGroup` worlds that share textures and effects.
