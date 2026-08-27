---
'create-three-flatland': patch
---

Remove Koota from generated Three.js and React project manifests, and reject it if it is accidentally reintroduced as a starter dependency.

This removes a former renderer peer from generated starters; it does not replace Koota for
application-owned ECS state. The private renderer design grew from
[Koota](https://github.com/pmndrs/koota), whose typed traits, structure-of-arrays storage, queries, and
systems made the specialization possible. Koota remains the recommended general-purpose ECS for
application and gameplay state.
