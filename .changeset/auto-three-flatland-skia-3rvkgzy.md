---
"@three-flatland/skia": patch
---

> Branch: claude/skia-rendering-regression-b1d604
> PR: https://github.com/thejustinwalsh/three-flatland/pull/186

### Fixes

- Fix blank Skia render on Safari caused by a WASM MIME-type fallback failure. `instantiateStreaming` now streams from a cloned `Response`, so if it rejects (non-`application/wasm` MIME type or redirect) the `arrayBuffer()` fallback can still read the original, un-drained body instead of throwing `TypeError: body stream already read`.
- Add regression test modeling browser single-read `Response` body semantics.

Fixes a Safari-only blank-render regression in Skia WASM init; no API changes.
