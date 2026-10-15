---
"three-flatland": patch
---

> Branch: fix/devtools-buffer-pool-tier
> PR: https://github.com/thejustinwalsh/three-flatland/pull/120

### b304ae4058fd4d940bde62907ecd208a3b4670e8
fix: restore buffer streaming without bloating the flush cursor
`@three-flatland/devtools` panel stopped rendering texture pixels — every
inspectable buffer entry (SDF passes, occlusion mask, ForwardPlus tiles)
logged `[devtools] buffer entry '...' exceeds remaining pool buffer space.
Shipping metadata only.`

Cause: `_textures.drain` was copying pixel bytes into the per-flush data-
packet cursor (so a typed-array view in the published payload referenced the
transferred pool buffer). When the data packet moved to the 256 KB medium
tier — to fix the BroadcastChannel re-broadcast clone wobble — even a single
SDF (~900 KB) overflowed the cursor and drain fell back to metadata-only.
The convert path's `if (!entry.pixels) continue` guard then skipped the
RGBA8/VP9 broadcast for that entry, so the consumer saw nothing.

The cursor copy was always redundant. `_flush` already deletes `entry.pixels`
after queuing each entry's `transport.convert(...)` — pixels never travel via
the broadcasted data message regardless. They flow exclusively through the
worker's `__convert__` path → `buffer:raw` / `buffer:chunk` broadcasts — and
that path acquires its own per-entry large buffer for the transfer. The
consumer renderer reads from `state.buffers[name].pixels`, which both
broadcasts populate; the data-message pixel reference was a wasted
intermediate.

Fix is surgical:
* `DebugTextureRegistry.drain` references `e.sample` directly. No cursor
  copy, no size check, no warning. The `into?: BufferCursor` parameter +
  `warnedOversized` flag + `copyTypedTo` import all drop out.
* `DevtoolsProvider._flush` keeps `acquireMedium()` (no tier escalation
  needed — pixel bytes never travel via this buffer) and drops the cursor
  arg from the textures drain call.

Streaming pipeline untouched: convert → RGBA8 → buffer:raw (thumbnail mode)
and convert → VideoEncoder → buffer:chunk (VP9 stream mode) both still flow
through the per-entry large convBuf, the worker still handles codec probing
and keyframe forcing, and the consumer's VideoDecoder path reads frames the
same way.

Tests:
* `DebugTextureRegistry.test.ts` (new, 5 tests) — drain references the
  cached sample directly (no copy), omits pixels when not in the pixel
  subscription, handles huge samples (1024×1024 = 4 MB ForwardPlus shape)
  without warnings or pixel loss, emits metadata-only when the sample
  isn't ready, suppresses re-emission while version + shape are unchanged.
* `DevtoolsProvider.buffers.test.ts` (new, 2 tests) — drives a real
  `_flush` against a capturing transport: asserts `convert()` was called
  with the raw pixels (the streaming path is alive), and that the
  broadcast data message carries metadata for the entry but `entry.pixels`
  is `undefined` (broadcast wobble can't return).

Full suite: typecheck 31/31, debug tests 65/65 (8 files incl. the two new),
lint 0 errors.
Files: packages/three-flatland/src/debug/DebugTextureRegistry.test.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.buffers.test.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts
Stats: 4 files changed, 342 insertions(+), 33 deletions(-)
