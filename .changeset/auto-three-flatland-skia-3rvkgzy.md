---
"@three-flatland/skia": patch
---

> Branch: claude/skia-rendering-regression-b1d604
> PR: https://github.com/thejustinwalsh/three-flatland/pull/186

- Fix blank/failed Skia render on Safari caused by an unhandled `TypeError: body stream already read` during WASM init
  - `instantiateWasm` now streams from a cloned `Response`, leaving the original body unread for the MIME-error fallback
  - Previously, a non-`application/wasm` MIME type (or cross-origin redirect) caused `instantiateStreaming` to drain the body and reject, then the fallback tried to re-read the same already-consumed body and threw, aborting Skia init entirely
  - Added regression test modeling real single-read `Response` body semantics

Fixes a Safari-specific bug where the docs demo rendered blank due to a cross-origin redirect tripping the WASM MIME fallback path.
