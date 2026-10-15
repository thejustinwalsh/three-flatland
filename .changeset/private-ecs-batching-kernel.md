---
'three-flatland': minor
---

Replace Koota-backed renderer coordination with the private typed runtime while preserving batch assignment, hierarchy, picking, material, lighting, pass, and disposal behavior.

This specialization grew from [Koota](https://github.com/pmndrs/koota): its typed traits,
structure-of-arrays storage, queries, and systems made the renderer design possible. Koota remains
the recommended general-purpose ECS for application and gameplay state.

**BREAKING CHANGES**

- Remove renderer world, entity, and trait properties, including the temporary opaque compatibility handles. Keep gameplay identity in application-owned state and update rendering through public objects; see the migration guide and packaged codemods.
- `SpriteBatch` slot allocation and release methods are private, and numeric sort layers must be finite signed 32-bit integers.
