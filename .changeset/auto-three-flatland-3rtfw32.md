---
"three-flatland": patch
---

Improve renderer-owned data paths with shared animation timeline cohorts, dense playback membership,
compact animated-tile tracking, bounded light-slot clearing, consolidated post-pass ownership, and
cached shared hierarchy paths. These changes preserve the existing public object API while reducing
repeated per-frame work in animation, tilemap, lighting, pass, and transform updates.

This private specialization continues the design lineage of
[Koota](https://github.com/pmndrs/koota): its typed traits, structure-of-arrays storage, queries, and
systems made this renderer-focused work possible. Koota remains the recommended general-purpose ECS
for application and gameplay state.
