---
"@three-flatland/skia": patch
---

> Branch: claude/skia-rendering-regression-b1d604
> PR: https://github.com/thejustinwalsh/three-flatland/pull/186

- Fix blank/broken Skia rendering in Safari caused by a WASM init failure on MIME-type fallback paths (e.g. behind a cross-origin redirect)
  - `instantiateWasm` now streams from `res.clone()` so the original response body stays unread, letting the `res.arrayBuffer()` fallback succeed instead of throwing `TypeError: body stream already read`
  - Added regression tests modeling real single-read `Response` body semantics

Fixes a Safari-specific blank render bug in `@three-flatland/skia`'s WASM loader where the MIME-type fallback path crashed instead of recovering.
