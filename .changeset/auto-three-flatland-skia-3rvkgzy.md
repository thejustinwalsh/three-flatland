---
"@three-flatland/skia": patch
---

> Branch: claude/skia-rendering-regression-b1d604
> PR: https://github.com/thejustinwalsh/three-flatland/pull/186

## Fixes

- Fixed a Safari-only blank render bug in the WASM loader: `WebAssembly.instantiateStreaming` now streams from a cloned `Response`, so a MIME-type rejection (or redirected response) no longer leaves the original body drained for the `arrayBuffer()` fallback
- Previously this crashed Skia init entirely with `TypeError: body stream already read`, since Safari rejects streaming instantiation for non-`application/wasm` MIME types where Chrome accepts it
- Added a regression test modeling real single-read `Response` body semantics to prevent recurrence

## Summary

Patches a WASM loading crash that produced a blank render in Safari when the WASM response's MIME type or redirect triggered the streaming-instantiation fallback path.
