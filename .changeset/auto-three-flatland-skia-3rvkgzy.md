---
"@three-flatland/skia": patch
---

> Branch: claude/skia-rendering-regression-b1d604
> PR: https://github.com/thejustinwalsh/three-flatland/pull/186

- Fix blank/broken Skia rendering in Safari when the WASM binary is served via a redirect or non-`application/wasm` MIME type
  - `instantiateStreaming` now streams from a cloned `Response`, so the fallback to `arrayBuffer()` can still read the body instead of throwing `TypeError: body stream already read`
  - Adds a regression test modeling real single-read `Response` body semantics

Fixes a Safari-only blank render regression surfaced on the deployed docs demo; no API changes.
