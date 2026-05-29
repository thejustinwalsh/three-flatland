---
"three-flatland": patch
---

> Branch: fix/devtools-buffer-pool-tier
> PR: https://github.com/thejustinwalsh/three-flatland/pull/120

**Fixes `@three-flatland/devtools` buffer inspector showing metadata-only for all texture entries** (SDF passes, occlusion mask, ForwardPlus tiles). Pixel data now streams correctly to the panel.

- `DebugTextureRegistry.drain` no longer copies pixel bytes into the flush-cursor; references `e.sample` directly
- Removed `into?: BufferCursor` parameter, `warnedOversized` flag, and `copyTypedTo` import from `DebugTextureRegistry`
- `DevtoolsProvider._flush` drops the cursor arg from the textures drain call; stays on `acquireMedium()` — pixel bytes were never in scope for this buffer path
- RGBA8/VP9 streaming pipeline (thumbnail and VP9 stream mode) is unchanged; pixels continue to flow via the worker `__convert__` → `buffer:raw` / `buffer:chunk` path
- Adds `DebugTextureRegistry.test.ts` (5 tests) covering: direct sample reference, pixel subscription gating, large (4 MB) samples, metadata-only on unready sample, dedup suppression
- Adds `DevtoolsProvider.buffers.test.ts` (2 tests) asserting `convert()` receives raw pixels and that broadcast data messages carry no pixel reference

Restores full texture inspection in the devtools panel by removing a redundant cursor-copy that caused all large buffer entries to fall back to metadata-only after the flush buffer moved to the 256 KB medium tier.
