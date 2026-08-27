---
'three-flatland': minor
---

Seal the remaining renderer implementation boundary, make effect-vector reads immutable, and harden scene, effect, lighting, sprite, and tile ownership across reassignment, cloning, and disposal.

The private renderer ECS grew from [Koota](https://github.com/pmndrs/koota). Its typed traits,
structure-of-arrays storage, queries, and systems made this specialized design possible, and Koota
remains the recommended general-purpose ECS for application and gameplay state.

**BREAKING CHANGES**

- Remove the opaque compatibility world and entity handles, effect trait/entity seams, the world-bound batch-query constructor, the private batch-query builder, and direct React Three Fiber `<tileLayer>` construction. Applications must keep gameplay identity in application-owned state and update rendering through public objects.
- Effect vector getters now return read-only snapshots. Assign the complete tuple to publish an update.
- Material, light, and pass effects have one owner at a time. Disposed tile and lighting resources are terminal, and projection rebuilds may replace generated layers or materials as documented in the migration guide.
