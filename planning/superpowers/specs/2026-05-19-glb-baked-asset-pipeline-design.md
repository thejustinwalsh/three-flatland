# GLB Baked-Asset Pipeline — Design

**Status:** Design canonical · **Authored:** 2026-05-19 · **Supersedes:** `flpak` (rejected — see Background)

Bake Flatland assets into standard **glTF 2.0 / GLB**. Use core glTF for everything glTF already models (accessors, meshes, textures); use a thin, focused, per-format extension only for the semantic layer glTF lacks. Bake with **glTF-Transform** (Node); read at runtime with a tiny zero-dependency GLB reader. One fetch per asset, a fast path to direct GPU upload, and composability into multi-asset "pak" files for a scene's worth of data.

---

## Background — the decisions behind this design

This design is the endpoint of a deliberate narrowing, each step removing invented machinery:

1. **Custom container (`.flpak`) → GLB.** A review against glTF/GLB plus a FlatBuffers/Protobuf comparison showed the bespoke container was a stripped-down GLB re-invention. GLB gives us the framing for free, plus an ISO standard, the glTF-Validator, and every-language readers.
2. **Don't re-model what glTF models.** Tabular data is described by native glTF **accessors** (componentType/type/count/normalized), not a bespoke record schema in an opaque blob.
3. **Per-format extensions, not one umbrella.** Every registry extension does one thing (`KHR_lights_punctual`, `KHR_texture_basisu`). So `FL_slug_font`, `FL_sprite_atlas`, … each focused, independently versioned, independently adoptable. No `FL_asset_pack` grab-bag.
4. **Extension, not `extras`, for the semantic layer** — because we need composition: assets referenced by scene content, surviving as first-class resources. `extras` is an inert blob that can't be referenced and gets orphan-pruned.
5. **Not EXT_structural_metadata.** It's the Cesium/3D-Tiles binary property-table system, built for millions of geospatial features and read only by the Cesium stack. Our metadata is small JSON lookups; our heavy data is GPU buffers. Borrow its proven conventions (offset buffers for ragged arrays), not its machinery.
6. **No prefix registration needed.** A glTF extension is a JSON key our tools agree on; registration is only a public-registry courtesy. `FL_` is fine.

A **blind independent port** (an engineer given only the slug format + the goals, none of the above) converged on the same core — SoA accessors, CSR offset buffers for ragged data, a custom extension, a custom GLB reader, glTF-Transform bake, and did not reach for EXT_structural_metadata — corroborating this design. Its two refinements (data textures as extension-referenced bufferViews not custom-MIME images; a thin manifest + name-based refs for composition; FLOAT offset accessors) are folded in below.

---

## The native-first decision rule

For each piece of baked data, ask: **does core glTF (or a KHR/EXT extension) already model this?**

- **Yes** → store it natively (mesh, texture, accessor) and **reference it by index** from the extension. Native content is readable by every glTF tool for free.
- **No** (novel data: SDF tables, sprite-frame rects, tilemap grids, half-float data textures) → store the bytes in accessors/bufferViews and describe them in a focused `FL_*` extension.

The extension is always a **thin semantic overlay + references** — it never re-hosts native-modelable data. Its weight is inversely proportional to how much glTF already models: a sprite atlas (native texture + native hull meshes) needs a thin extension; a slug font (novel SDF data) needs a thicker one; a pure mesh needs none.

---

## Goals & non-goals

**Goals:** atomic single-fetch delivery; direct-to-GPU (zero-copy typed-array views into the fetched buffer); lossless round-trip; per-format, well-defined, adoptable extensions; composability into scene packs; readability by other glTF tooling for the native content.

**Non-goals:** no bespoke binary format; no compression beyond glTF/transport; no speculative generality — build slug-first, design composition so atlas/tilemap drop in later without a repaint, but don't build them yet.

---

## Architecture

### Bake side — Node, glTF-Transform (dev/CLI only)

Build a glTF `Document`, emit one `.glb`. **All baked numeric data is native glTF accessors** — no raw bufferViews, no glTF-Transform internal APIs:
- **Tabular data** (glyph columns, cmap, kern) → **accessors** (SoA — one accessor per column).
- **Ragged data** (slug bands) → a flat **`USHORT` accessor** (the concatenated band words) + a **FLOAT offset accessor** (count = N+1, CSR/prefix-sum; FLOAT because `UNSIGNED_INT` accessors are spec-restricted to mesh indices, and FLOAT holds exact integers to 2²⁴).
- **Data textures** (curve RGBA16F, band RG-F32) → **accessors carrying the raw bytes**: the half-float curve texture is a `USHORT` accessor (the 16-bit half-float *bits*, stored losslessly; the extension records `format: "rgba16f"` + dims), the band texture a `FLOAT` accessor. This is fully native and validator-clean — a `USHORT` accessor is a standard glTF accessor; storing half-float bits in it is a normal data-packing use, with the true format declared in the extension. (NOT glTF images: a custom-MIME image is non-conformant. NOT raw bufferViews: that would require glTF-Transform's semi-internal `otherBufferViews` path — accessors avoid it.)
- **Standard images / sampleable textures** (sprite atlases) → native glTF `image`/`texture` (PNG; KTX2-Basis via `KHR_texture_basisu`).
- **Geometry** (sprite hull meshes, scene meshes) → native `mesh`/`primitive`/accessors (read by `GLTFLoader` for free).
- **Semantic layer** (kind/version, name→accessor map, metrics, strokeSets) → the `FL_*` extension JSON, nested in the glTF JSON document, referencing the accessors **by index**.

glTF-Transform (`@gltf-transform/core`) is a bake-time-only dependency — never shipped to the browser. The extension is authored as a glTF-Transform `Extension`/`ExtensionProperty` that emits accessor-index references via the public `WriterContext.accessorIndexMap` (`.addRef()`) — no `otherBufferViews`, no internal coupling.

### Runtime side — zero-dependency GLB reader

A ~80-line reader, no glTF-Transform, no three. It parses the standard GLB container — 12-byte header, JSON chunk (`0x4E4F534A`), BIN chunk (`0x004E4942`) — `JSON.parse`s the JSON chunk (the glTF document), reads our extension object, and resolves each accessor/bufferView/image index to a **zero-copy typed-array view** into the one fetched `ArrayBuffer`.

```ts
function readAsset(buf: ArrayBuffer): FlatlandAsset
interface FlatlandAsset {
  json: GlTFJson                            // the parsed glTF document
  accessor(index: number): ArrayBufferView   // zero-copy view by glTF accessor index
  bufferView(index: number): Uint8Array      // zero-copy raw bytes by bufferView index
  ext<T = unknown>(name: string): T | undefined  // root extension object, e.g. ext('FL_slug_font')
}
```

Domain loaders (e.g. `SlugFontLoader`) build on `readAsset`: read `ext('FL_slug_font')`, follow its accessor indices to typed views, upload the data-texture bufferViews to `DataTexture`s. **Why a custom reader, not `GLTFLoader`:** `GLTFLoader` interprets a GLB as a renderable *scene* and won't surface free-floating data accessors; for baked data the tiny reader is the fast path. For baked *geometry*, `GLTFLoader` remains correct — both read the same standard GLB.

---

## The `FL_slug_font` extension (worked example)

The extension is a JSON object nested in the glTF JSON chunk under `extensions`. Binary lives in the BIN chunk, referenced by integer index.

```jsonc
{
  "asset": { "version": "2.0", "generator": "slug-bake" },
  "extensionsUsed": ["FL_slug_font"],
  "extensionsRequired": ["FL_slug_font"],          // see "required vs used" below
  "buffers": [{ "byteLength": 1328720 }],
  "bufferViews": [
    { "buffer": 0, "byteOffset": 0,       "byteLength": 1048576 },  // curve texture (RGBA16F bytes)
    { "buffer": 0, "byteOffset": 1048576, "byteLength": 262144  },  // band texture (RG-F32 bytes)
    { "buffer": 0, "byteOffset": 1310720, "byteLength": 18000   },  // ragged band data
    { "buffer": 0, "byteOffset": 1328720, "byteLength": "..."   }   // accessor-backed columns…
  ],
  "accessors": [
    { "bufferView": 3, "componentType": 5126, "type": "SCALAR", "count": 512 },   // glyph advanceWidth
    /* …other glyph columns… */
    { "bufferView": "...", "componentType": 5123, "type": "VEC2",   "count": 1280 }, // cmap [u16,u16]
    { "bufferView": "...", "componentType": 5122, "type": "SCALAR", "count": 600 },  // kern flat [g1,g2,val]×N
    { "bufferView": "...", "componentType": 5126, "type": "SCALAR", "count": 513 }   // band offsets (FLOAT, N+1)
  ],
  "extensions": {
    "FL_slug_font": {
      "version": 1,
      "name": "Inter-Regular",
      "metrics": { "unitsPerEm": 2048, "ascender": 1984, "descender": -494, "...": "..." },  // plain JSON
      "strokeSets": [],                                                                       // plain JSON
      "glyphs": { "count": 512, "fields": { "advanceWidth": { "accessor": 0 }, "...": "..." } },
      "cmap": { "accessor": 10 },
      "kern": { "accessor": 11, "stride": 3 },
      "bands": { "offsetAccessor": 12, "dataAccessor": 13 },
      "curveTexture": { "accessor": 14, "width": 2048, "height": 128, "format": "rgba16f" },  // USHORT accessor, half-float bits
      "bandTexture":  { "accessor": 15, "width": 2048, "height": 32,  "format": "rg32f" }     // FLOAT accessor
    }
  }
}
```

- **`metrics`/`strokeSets` are nested JSON** in the JSON chunk — no separate blob, no second format.
- Data lives in BIN; the extension links to it by accessor/bufferView index.
- **Naming:** `FL_` prefix, lowercase snake feature (`FL_slug_font`). No Khronos registration required (private extension our tools agree on).
- **`extensionsRequired` vs `extensionsUsed`:** use **Required** for a standalone data-only `.glb` (no scene to show — a non-supporting loader should error, not silently misread). Use **Used** for a composed scene pack (so generic glTF tools still render the native geometry/textures and just ignore our assets).

---

## Composition — multi-asset scene packs

Modeled on `KHR_lights_punctual` (resources defined once, referenced by index/name), split into single-responsibility pieces (the blind-port refinement):

- **Per-format extensions** carry each asset's description, as arrays so multiple assets of a kind live in one file: `FL_slug_font.fonts: [...]`, `FL_sprite_atlas.atlases: [...]`.
- **`FL_pak`** — a thin manifest extension listing named asset slots: `{ assets: [ { type: "font", name: "inter", ext: "FL_slug_font", index: 0 }, ... ] }`. Pure index; keeps each format extension independently testable.
- **`FL_asset_ref`** on a node — references an asset **by name**: `node.extensions.FL_asset_ref = { asset: "inter" }`. Name-based refs survive resource reordering where index-based don't.

A level pack `.glb` is then: native meshes/materials (the scene, viewable in any glTF tool) + native textures + the per-format extension pools + the `FL_pak` manifest + nodes with `FL_asset_ref`. `extensionsUsed` (not Required) so generic tools render what they understand. **Build slug's single-font case now (a one-element `fonts` array); `FL_pak`/`FL_asset_ref` and multi-asset come when the compose tools are real — the shape is array-based from day one so nothing repaints later.**

---

## Package shape

`@three-flatland/asset` (Layer 0; renamed from the prior `pak` work):

```
@three-flatland/asset
  .              runtime reader (zero-dep, browser+node): readAsset + GLB-chunk parse + accessor/bufferView views
  ./bake         Node bake helpers + per-format glTF-Transform extension authoring
                 (peerDependency: @gltf-transform/core)
```

- `.` ships zero dependencies (no three, no glTF-Transform). Slug and other sibling bakers/loaders depend on it.
- `./bake` peer-deps `@gltf-transform/core`; imported only by Node-side bakers/CLIs.
- The prior flpak `pack.ts`/`unpack.ts`/bespoke schema are deleted. `defineRecord`/`RecordCursor` are **not needed for slug** (SoA columns are plain typed arrays); keep them only if a future *interleaved GPU vertex/instance* buffer case appears (where glTF `byteStride` interleaving is idiomatic). Per YAGNI, don't ship them unused.

---

## Slug migration: `.slug.glb`

| Today (`baked.ts`) | In the GLB |
|---|---|
| curve texture (Uint16 RGBA16F) | `USHORT` accessor (half-float bits), referenced by `FL_slug_font.curveTexture` (+ dims/format) |
| band texture (Float32 RG) | `FLOAT` accessor, referenced by `FL_slug_font.bandTexture` (+ dims) |
| glyph table (10×f32) | 10 SoA FLOAT SCALAR accessors, named columns under `glyphs.fields` |
| cmap [u16,u16] | USHORT VEC2 accessor |
| kern [u16,u16,i16] | SHORT SCALAR accessor, stride 3 |
| band section (ragged) | flat USHORT accessor + FLOAT offset accessor (N+1, CSR) |
| metrics, strokeSets, textureWidth | `FL_slug_font` JSON (metrics, strokeSets, texture dims/formats); `kind`/`version` |

`slug-bake` uses `@three-flatland/asset/bake` + `@gltf-transform/core`. `SlugFontLoader` fetches one `.slug.glb`, `readAsset()`, follows `FL_slug_font`, builds curve/band `DataTexture`s from the bufferView bytes (zero-copy). opentype.js stays unloaded.

---

## Testing

- **Reader round-trip:** bake a fixture `.glb` (Node) → `readAsset` → zero-copy views, accessor reads, data-texture bufferView bytes, `ext('FL_slug_font')` metrics.
- **glTF validity:** the emitted `.glb` passes the official glTF-Validator (no errors; unknown-extension info note acceptable; confirm no invalid image/accessor).
- **Golden conformance:** committed `.glb` + expected decoded JSON, validated from disk; assert the GLB magic on disk is `67 6C 54 46` ("glTF").
- **Slug equivalence:** the migrated font reproduces glyph/cmap/kern/band data identical to the current `unpackBaked` output.

---

## Open / future

- `FL_sprite_atlas` (native texture + native hull meshes + thin frame-table extension), `FL_tilemap`, when those are real.
- `FL_pak` + `FL_asset_ref` wiring when a compose tool exists.
- Geometry/mesh assets use glTF natively + `GLTFLoader`; no extension.
- Revisit EXT_structural_metadata only if we ever need generic queryable metadata across many heterogeneous asset types in one file.
