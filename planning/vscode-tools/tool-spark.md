# Tool: Spark (Image A/B Encoder)

## What is spark.js

`spark.js` (Ignacio Castano / ludicon) is a three.js-ecosystem texture loader that ships images GPU-compressed — smaller on disk **and** smaller in GPU memory than KTX2/BasisU in typical cases, and faster to upload. WebP + spark.js is the headline path: small files, compressed GPU representation, quick transcode.

- Repo: https://github.com/ludicon/spark.js
- Overview post: https://www.ludicon.com/castano/blog/2025/09/three-js-spark-js/

This tool is *named* Spark because it pairs with spark.js, but the tool itself is an **image A/B encoder** (like Squoosh) — independent of what runtime loader the consumer picks. Runtime loader selection is a separate concern in `packages/three-flatland/` (see below).

## Goal

Right-click a PNG / WebP / KTX2 → open a webview that encodes the image to any of the other formats and shows an A/B comparison across three memory axes:

| Axis | Shown as |
|---|---|
| **Disk** | encoded file size (bytes) |
| **Decoded RAM** | decoded-to-RGBA8 size (width × height × 4) |
| **GPU memory** | depends on the runtime loader path the user selects for comparison — see below |

## GPU memory estimation

The tool shows GPU memory for **each plausible runtime loader**, so the user can make an informed choice:

| Runtime loader | Source format | GPU format (typical desktop) | GPU bytes |
|---|---|---|---|
| three.js default `TextureLoader` | PNG / WebP | RGBA8 uncompressed | `w × h × 4` |
| three.js `KTX2Loader` | KTX2/BasisU | BC7 (desktop) / ASTC 4×4 (mobile) | `w × h × 1` (BC7) |
| **spark.js loader** | WebP + spark runtime compression | compressed (format per spark) | per spark's compression ratio — computed from the loader's public stats |

The readout updates live as the user changes encoder params. Green/red indicators highlight the best-in-class column per axis.

## User flow

1. Right-click `hero.png` → "Open in Spark". (Also: command palette `Spark: Convert Image`.)
2. Webview opens with the source image on the left; right pane shows encoded result.
3. Top bar picks **output format**: PNG / WebP / KTX2. Format-specific param panel below.
4. Second top bar picks the **runtime loader simulation**: three.js default / KTX2Loader / spark.js. Updates the GPU memory readout.
5. Live preview: before/after canvas, zoom + pan synced, pixel peeker.
6. Save: writes the encoded output next to the source (`hero.webp`, `hero.ktx2`). If a `hero.atlas.json` sibling exists, offer to update `meta.sources`.

## Encoder choices

**Open question to confirm**: does spark.js ship an encoder or just a loader? Action: read `spark.js` repo, note findings in an implementation prelude. If spark exports an encoder, adopt it verbatim. If not:

| Target | Encoder |
|---|---|
| PNG | `sharp` (Node, in extension host) or a pure-JS encoder for webview parity |
| WebP | `sharp` or `@jsquash/webp` (WASM; Squoosh's encoder) |
| KTX2 | `basis_universal` WASM (Binomial) in a worker; `toktx` CLI as fallback if speed is inadequate |

All encoders run in `worker_threads` from the extension host — the webview is view-only.

## Architecture

```
Extension host (ESM)                   Webview (React + StyleX)
  SparkCommand                           React app
    → spawns webview                       - tools-design-system
  SparkEncoderService                      - before/after canvas, pixel peeker
    - WASM encoders in worker_threads      - format picker + param panel
    - exposes `encode({ input, target,     - loader picker + memory readout
       params })`                          - Save button → postMessage
  SparkMemoryEstimator
    - disk: trivial (encoded bytes)
    - RAM:  w × h × 4
    - GPU:  table of per-loader estimates; spark.js estimate via
            its public stats API (best-effort probe + headroom)
  SidecarPatcher
    - if meta.sources array present in matching .atlas.json:
      offers to add/update the encoded format
```

## Contribution

```json
"contributes": {
  "commands": [
    { "command": "threeFlatland.spark.convert", "title": "Open in Spark" }
  ],
  "menus": {
    "explorer/context": [
      {
        "command": "threeFlatland.spark.convert",
        "when": "resourceExtname in threeFlatland.imageExts",
        "group": "navigation@30"
      }
    ]
  }
}
```

## Runtime loader work (sister task, not this tool)

Out of scope here but tracked as a follow-up against `packages/three-flatland/`. The `TextureLoader` / `SpriteSheetLoader` should accept an ordered loader preference on top of the format preference:

```ts
loadSpriteSheet('hero', {
  formats: ['webp', 'ktx2', 'png'],   // source format preference
  loader:  'spark'                    // or: 'three-ktx' | 'three-default' | 'auto'
})
```

- `auto` (default): pick `spark` when a spark-blessed WebP sidecar is present; else `three-ktx` when KTX2 is present; else `three-default`.
- Loaders are dynamically imported so the three.js KTX2Loader + BasisU transcoder aren't paid for when spark handles it.
- Dev-time warn if a requested format is missing; degrade to next in `formats` array.

Spark the tool produces these alternate source files; runtime loader picks which to use.

## Sidecar patch (atlas)

When a matching `*.atlas.json` is found:

```diff
 "meta": {
   "image": "hero.png",
   "sources": [
     { "format": "png",  "uri": "hero.png" },
+    { "format": "webp", "uri": "hero.webp" },
+    { "format": "ktx2", "uri": "hero.ktx2" }
   ]
 }
```

User confirms via modal before write. ajv-validated against the atlas schema (see below for schema location) before saving.

## Risks / open questions

1. **Does spark.js ship an encoder?** Drives whether we pull it in or roll our own from `@jsquash/webp` + `basis_universal` WASM. Read the repo before committing to an encoder stack.
2. **GPU stat for spark** — compute from spark's public stats/telemetry if exposed; otherwise document as "modeled" with the math used. Don't present a false-precision number.
3. **Encoder performance** — WASM on a `worker_thread` may still block large images for several seconds. Show a progress indicator; debounce param changes.
4. **KTX2 transcoder + CSP** — if we preview KTX2 output in the webview we need `wasm-unsafe-eval` in the CSP for the BasisU transcoder.
5. **Lossy WebP color shifts** — A/B must show a per-pixel delta overlay so users don't ship quality regressions unknowingly.

## References

- [spark.js repo](https://github.com/ludicon/spark.js)
- [three.js + spark.js overview](https://www.ludicon.com/castano/blog/2025/09/three-js-spark-js/)
- [Squoosh (reference A/B UX)](https://squoosh.app/)
- [@jsquash/webp](https://github.com/jamsinclair/jSquash)
- [basis_universal](https://github.com/BinomialLLC/basis_universal)
- [KTX 2.0 spec](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html)
- [three.js KTX2Loader](https://threejs.org/docs/#examples/en/loaders/KTX2Loader)
