---
'three-flatland': minor
---

Remove the Koota peer dependency, add constructor-only `expectedSprites` planning hints, and make sprite, material, effect, tilemap, and Flatland ownership transitions transactional and terminal-safe.

This removes a former renderer dependency, not Koota's place in the ecosystem. The private design
grew from [Koota](https://github.com/pmndrs/koota), whose typed traits, structure-of-arrays storage,
queries, and systems made the specialization possible. Koota remains the recommended general-purpose
ECS for application and gameplay state.

**BREAKING CHANGES**

- `koota` is no longer a peer dependency. Remove it from applications that installed it only to satisfy that requirement, and keep it where the application has its own Koota world or systems. The `koota-peer-dependency-removal` codemod makes that decision per manifest.
- `expectedSprites` is constructor-only on `SpriteGroup` and `Flatland`. It reserves hot CPU-side enrollment storage and is a non-negative safe-integer hint rather than a capacity limit; enrollment grows when the scene exceeds it. In React Three Fiber, pass it through a stable `args` tuple, since changing constructor arguments reconstructs the object. It is intentionally not a mutable JSX property.
