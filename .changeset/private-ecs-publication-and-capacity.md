---
'three-flatland': minor
---

Remove the Koota peer dependency, add constructor-only `expectedSprites` planning hints, and make sprite, material, effect, tilemap, and Flatland ownership transitions transactional and terminal-safe.

This removes a former renderer dependency, not Koota's place in the ecosystem. The private design
grew from [Koota](https://github.com/pmndrs/koota), whose typed traits, structure-of-arrays storage,
queries, and systems made the specialization possible. Koota remains the recommended general-purpose
ECS for application and gameplay state.
