---
"@three-flatland/skia": patch
---

> Branch: claude/skia-rendering-regression-b1d604
> PR: https://github.com/thejustinwalsh/three-flatland/pull/186

## Fixes

- Fix Safari-only blank render in Skia demos caused by a WASM MIME-type fallback failure. `instantiateStreaming` consumed the `Response` body before rejecting on non-`application/wasm` MIME types (or redirected responses); the fallback then tried to re-read the same drained body via `arrayBuffer()`, throwing `TypeError: body stream already read` and aborting Skia init entirely.
- Fix by streaming from `res.clone()` so the original body stays intact for the `arrayBuffer()` fallback path.
- Add regression test modeling browser single-read `Response` body semantics to prevent recurrence.

Skia's WASM loader now correctly falls back to `arrayBuffer()` on MIME rejections without breaking Safari rendering.
