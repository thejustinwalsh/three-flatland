# Tool: Spark (PNG/WebP → KTX2/BasisU)

## Goal

Right-click a PNG or WebP → open a lightweight webview that previews and converts the image to KTX2 (BasisU). Emits `{name}.ktx2` next to the source and updates the atlas sidecar's `meta.sources` to advertise the new format.

Name: **Spark** — placeholder; confirm with preferred brand. Command prefix `threeFlatland.spark.*`.

## Why a dedicated tool

- KTX2/BasisU encoding has several knobs (ETC1S vs UASTC, quality, mipmap level, alpha handling) that demand a UI.
- Runtime fallback (`formats: ['ktx2', 'webp', 'png']`) is only meaningful when the alternative formats exist side-by-side. A one-click authoring tool closes the loop.
- Keeps encoding concerns out of the atlas editor (separation of authoring vs format engineering).

## Encoder

**Open question — confirm before implementing**: which encoder do we use?

Options:

| Encoder | Speed | Quality | Notes |
|---|---|---|---|
| `basis_universal` WASM (Binomial) | moderate | reference | Official; larger WASM |
| `@gltf-transform/functions` + `toktx` CLI | fast | good | Requires `toktx` binary installed (KTX Software repo); simpler JS API |
| Three.js's own BasisTextureLoader transcoder (decode only) | — | — | Not an encoder |

v0 recommendation: `basis_universal` WASM invoked in a Node worker from the extension host. Self-contained; no external binaries. Degrade to a CLI-bundled `toktx` if WASM speed proves inadequate on large batches.

Spec the encoder pipeline separately once the choice is locked.

## User flow

1. Right-click `hero.png` → "Convert to KTX2 (Spark)".
2. Webview opens with before/after preview (original vs encoded), file-size readout, and encoding params panel:
   - Mode: ETC1S (smaller, lossy) / UASTC (larger, higher quality)
   - Quality: 0..255 (ETC1S) or 0..4 (UASTC pack level)
   - Mipmap levels: auto / manual
   - Alpha: separate / premultiplied / none (auto-detected default)
   - Y-flip: on/off (depends on consumer; three.js wants no flip)
3. Click "Encode" → writes `hero.ktx2` next to the PNG.
4. If a `hero.atlas.json` sidecar exists, offer to update `meta.sources` to include the new format. Ajv-validate before write.

## Architecture

```
Extension host (ESM)                     Webview (React + StyleX)
  SparkCommand                             React app
    → spawns webview                         - tools-design-system
  SparkEncoderService                        - before/after image preview (Canvas)
    - wraps BasisU WASM (or toktx spawn)     - params panel
    - runs in worker_threads to avoid        - size/quality readouts
      blocking the extension host            - Encode button → postMessage to host
  SidecarPatcher
    - reads atlas.json next to input
    - splices { format: 'ktx2', uri } into meta.sources
    - writes via WorkspaceEdit (ajv-validated)
```

Webview is view-only; all encoding in the host. Preview uses three.js's `KTX2Loader` with the BasisU transcoder to render the encoded result — round-trip visual validation.

## Contribution

```json
"contributes": {
  "commands": [
    { "command": "threeFlatland.spark.convert", "title": "Convert to KTX2 (Spark)" }
  ],
  "menus": {
    "explorer/context": [
      {
        "command": "threeFlatland.spark.convert",
        "when": "resourceExtname == .png || resourceExtname == .webp",
        "group": "navigation@30"
      }
    ]
  }
}
```

## Sidecar update

When a matching `*.atlas.json` is found, propose an update:

```diff
 "meta": {
   "image": "hero.png",
   "sources": [
     { "format": "png",  "uri": "hero.png" },
+    { "format": "ktx2", "uri": "hero.ktx2" },
     { "format": "webp", "uri": "hero.webp" }
   ]
 }
```

User confirms via modal before write. If no atlas sidecar exists, skip silently; KTX2 can be consumed without one.

## JSON Schema touch

The `meta.sources` array is defined in `tools/io/schemas/atlas.schema.json` (see atlas tool + schemas readme). Spark only writes — validation is the schema's job.

## Risks

1. **Encoder size** — BasisU WASM is ~2–3 MB. Packs into the VSIX one time; tolerable.
2. **Host-thread blocking** — encode in `worker_threads`; extension-host must remain responsive.
3. **Three.js transcoder assets for preview** — needs `basis_transcoder.js` + `.wasm` shipped alongside the webview bundle. CSP `wasm-unsafe-eval` required.
4. **Fallback contract coupling** — Spark's value is tied to the runtime loader accepting `formats` fallback array. If that work slips, Spark still produces KTX2 but the three-flatland runtime can't use it yet. Landing order: runtime loader fallback → Spark.

## Open questions (user confirms)

- Tool name: **Spark** placeholder. If "spark.js" refers to an existing package we plan to adopt, link it here.
- Encoder pick: BasisU WASM vs `toktx` CLI.
- Whether to ship a CLI alongside the GUI (`flatland-bake ktx2 <input>` as a registered `Baker` in `packages/bake`). If yes, implement CLI first in `packages/<name>/` and wrap the GUI around it — matches the normal-baker pattern.

## References

- [KTX 2.0 spec (Khronos)](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html)
- [BasisU (Binomial)](https://github.com/BinomialLLC/basis_universal)
- [three.js KTX2Loader](https://threejs.org/docs/#examples/en/loaders/KTX2Loader)
- [KTX-Software (`toktx`)](https://github.com/KhronosGroup/KTX-Software)
- [@gltf-transform KTX functions](https://gltf-transform.dev/classes/functions.toktx)
