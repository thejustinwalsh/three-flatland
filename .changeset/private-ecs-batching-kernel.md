---
"three-flatland": minor
---

Replace Koota-backed renderer coordination with the private typed runtime while preserving batch assignment, hierarchy, picking, material, lighting, pass, and disposal behavior.

**BREAKING CHANGES**

- Renderer world, entity, and trait properties now expose opaque compatibility handles instead of Koota types. Direct ECS access through these implementation details is unsupported.
- `SpriteBatch` slot allocation and release methods are private, and numeric sort layers must be finite signed 32-bit integers.
