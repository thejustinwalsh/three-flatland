---
"@three-flatland/skia": patch
---

> Branch: claude/skia-rendering-regression-b1d604
> PR: https://github.com/thejustinwalsh/three-flatland/pull/186

- Fix Safari blank-render regression when loading the Skia WASM module. `WebAssembly.instantiateStreaming` locked the response body; on a MIME rejection (Safari rejects streaming for non-`application/wasm` MIME types where Chrome accepts it) or a cross-origin redirect, the fallback tried to re-read the same drained body and threw `TypeError: body stream already read`, aborting Skia init entirely.
- Now streams from `res.clone()` so the original body stays intact for the `arrayBuffer()` fallback.
- Adds a regression test modeling browser single-read body semantics.

Fixes a real-world blank render seen on the deployed docs demo in Safari.
