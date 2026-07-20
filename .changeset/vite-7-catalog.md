---
'@three-flatland/devtools': patch
---

Accept Vite 7 as a peer.

The workspace catalog moves to `vite ^7.3.6`, so everything is on one major
instead of docs running 7 while the catalog held 6. The split was a real hazard:
`vitest/config` types against Vite 7, so a package pinned to 6 hit type conflicts
when it enabled tests.
