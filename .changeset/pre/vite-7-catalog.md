---
'@three-flatland/devtools': patch
---

Require Vite 7 as a peer.

The peer range narrows from `^5 || ^6 || ^7` to `^7.0.0`. The workspace now runs
a single Vite major — pinned by the catalog and enforced by a `pnpm.overrides`
entry, so a transitive dependency cannot reintroduce a second one. Verified on a
clean install: one `vite@7.3.6` on disk, one lockfile resolution, all 15 live
symlinks pointing at it.
