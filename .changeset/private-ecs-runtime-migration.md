---
"three-flatland": minor
---

Replace Koota-backed renderer coordination with a private typed runtime, remove the Koota peer dependency, add constructor-only `expectedSprites` capacity hints, and harden scene, effect, lighting, sprite, and tile ownership across reassignment and disposal.

**BREAKING CHANGES**

- Remove accidental renderer internals from the public surface, including world and entity handles, effect traits, batch-query constructors, `SpriteBatch` slot mutation methods, and direct React Three Fiber `<tileLayer>` construction. Applications must keep gameplay identity in application-owned state and update rendering through public objects.
- Effect vector getters now return read-only snapshots. Assign the complete tuple to publish an update.
- Sort layers must be finite signed 32-bit integers, effect schemas reject invalid or colliding fields, and configured batch sizes must be positive safe integers within the supported limit.
- Material, light, and pass effects have one owner at a time. Disposed tile and lighting resources are terminal, and projection rebuilds may replace generated layers or materials as documented in the migration guide.
