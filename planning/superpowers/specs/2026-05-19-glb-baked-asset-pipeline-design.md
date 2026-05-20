# GLB Baked-Asset Pipeline — Design

**Status:** Design canonical · **Authored:** 2026-05-19 · **Supersedes:** `2026-05-19-flpak-binary-format-design.md` (rejected — see Background)

Use **glTF 2.0 / GLB** as the on-disk container for baked Flatland assets. Bake with **glTF-Transform** (Node), read at runtime with a tiny zero-dependency GLB reader. A small `FLATLAND_asset` glTF extension names the buffers and carries domain metadata. One fetch per asset; a fast path to direct GPU upload.

---

## Background — why not a custom container

We first designed a bespoke container (`.flpak`). A review against glTF/GLB, four implementer reviews, and a cold FlatBuffers/Protobuf comparison all converged on the same conclusion: **the `.flpak` container was a stripped-down GLB re-invention.** GLB already gives us the 12-byte header + JSON chunk + BIN chunk, and being real glTF buys an ISO standard, the official glTF-Validator, viewers, and readers in every language — the exact cross-language property we were hand-rolling. So we drop the custom format and standardize on GLB.

What carries over from the `.flpak` work (genuinely reusable, not format-specific):
- `defineRecord` + `LayoutType` (one declaration → byte layout + inferred TS type).
- `RecordCursor` / `TypedRecordCursor` (name-resolved, zero-copy, arity-checked reads over an array-of-structs buffer).
- The record-schema shape (`stride`/`count`/`fields{name,type,offset,count,normalized?}`) and `ELEMENT_SIZE`.
- The validation discipline and the golden-conformance-fixture idea.

What is deleted: the bespoke file framing (`pack()`, magic/chunk constants, our own `unpack()` chunk walk), and the `flpak-metadata.schema.json`. glTF-Transform does the packing; the GLB spec is the framing contract.

---

## Goals & non-goals

**Goals**
1. **Atomic delivery** — one `.glb` per logical asset; one `fetch` → one `ArrayBuffer`.
2. **Zero-copy GPU upload** — named buffers come back as typed-array **views** into the fetched `ArrayBuffer`, ready for `device.queue.writeBuffer` / `texImage2D` with no CPU re-pack.
3. **Self-describing structured records** — AoS tables (glyph/cmap/kern, atlas frames) carry a machine-readable layout so a reader resolves fields by name and survives writer-version drift.
4. **Standard + cross-language** — real glTF: validatable, inspectable, readable outside JS.
5. **One pattern for everything we bake** — meshes, images, data textures, record tables, ragged blobs, metadata.

**Non-goals** (unchanged from the prior analysis): no multi-asset scene packs beyond what one logical asset needs; no compression beyond what glTF/transport already provide (HTTP br/gzip; KTX2 for textures); no speculative generality — build slug-first, let other domains adopt the pattern when real.

---

## Architecture

Two sides, deliberately split by environment.

### Bake side — Node, glTF-Transform (dev/CLI only)

A baker builds a `Document`, emits a single `.glb`:

- **SoA typed tables** → glTF `Accessor`s (componentType + type + count; self-describing; `normalized` supported).
- **AoS / interleaved records, half-float data textures, ragged blobs** → raw bufferViews (glTF has no float16 accessor type, and accessors de-interleave on load, so AoS must be raw). Written via a custom extension using glTF-Transform's `WriterContext.otherBufferViews`.
- **Images / opaque media** → glTF `Texture` + `mimeType` (png/webp/**ktx2** via `KHR_texture_basisu`).
- **Metadata + buffer names** → the `FLATLAND_asset` extension (below).

glTF-Transform (`@gltf-transform/core`) is a **devDependency of bakers only** — never shipped to the browser.

### Runtime side — zero-dependency GLB reader

A ~100-line reader, no glTF-Transform, no three:

```ts
function readAsset(buf: ArrayBuffer): FlatlandAsset
interface FlatlandAsset {
  kind: string
  version: number
  meta: Record<string, unknown>           // domain metadata from the extension
  has(name: string): boolean
  view(name: string): ArrayBufferView      // zero-copy typed view into buf, by FLATLAND_asset name
  bytes(name: string): Uint8Array           // raw bytes (opaque media / writeBuffer source)
  records(name: string): RecordCursor
  records<L extends RecordLayout>(name: string, layout: L): TypedRecordCursor<L>
  image(name: string): { bytes: Uint8Array; mimeType: string }   // opaque media + mime
}
```

It parses the GLB container (12-byte header, JSON chunk `0x4E4F534A`, BIN chunk `0x004E4942` — the standard GLB layout), reads the `FLATLAND_asset` extension from the glTF JSON, and resolves each named buffer to a view into the BIN chunk via the glTF `bufferViews` / `accessors` arrays. Views are zero-copy slices of the one fetched `ArrayBuffer`.

**Why a custom reader and not three's `GLTFLoader`:** `GLTFLoader` interprets a GLB as a *scene* (meshes/materials/nodes) and won't surface arbitrary named data buffers. For baked **data** (font tables, SDF textures, atlas frames) the tiny reader is the fast path. For baked **geometry**, `GLTFLoader` remains the right tool — both read the same standard GLB.

### The `FLATLAND_asset` glTF extension

A glTF extension (`extensionsUsed: ["FLATLAND_asset"]`) on the document root carrying:

```jsonc
{
  "kind": "flatland.slug.font",      // REQUIRED content discriminator
  "version": 1,                       // REQUIRED writer's monotonic integer
  "buffers": {                        // name -> pointer into glTF bufferViews/accessors
    "glyphs":      { "bufferView": 3, "record": { "stride": 40, "count": 1280, "fields": [ ... ] } },
    "cmap":        { "accessor": 0 },                       // SoA accessor pointer
    "curve":       { "bufferView": 1, "mime": "application/octet-stream" }, // raw half-float texture bytes
    "atlasImage":  { "image": 0 }                            // glTF image (png/ktx2) by index
  },
  "metrics": { ... }                  // open-ended domain metadata
}
```

- `record` reuses the salvaged `PakRecordSchema` shape. `normalized` is per-field (and accessors carry it natively).
- Pointers are by glTF index (`bufferView` / `accessor` / `image`) — the reader resolves them to views/bytes.
- `kind` + `version` are required; `(kind, version)` is the content contract a reader gates on. Other keys are open domain metadata.
- The extension is published with a small schema doc (cross-language convention, below). glTF-Validator will accept it (unknown-extension info-level note only).

---

## Friction points (from the glTF-Transform review) and mitigations

1. **No float16 accessor type.** SDF curve/band textures (RGBA16F / RG-F32 data) travel as **raw bufferViews** named by the extension. The bake helper wraps glTF-Transform's `otherBufferViews` mechanism once; CI-tests it against a pinned glTF-Transform version. Read side is a zero-copy `Uint8Array` view.
2. **Accessors de-interleave on load.** True AoS record tables can't be a live strided accessor view, so they are raw bufferViews + a `record` descriptor in the extension. (This is the zero-copy path we want anyway.)
3. **`otherBufferViews` is a semi-internal glTF-Transform API.** Isolate it in one bake-helper module; pin the glTF-Transform version; cover it with a round-trip test so a version bump is caught.

---

## Package shape

Rename `@three-flatland/pak` → **`@three-flatland/asset`** (Layer 0):

```
@three-flatland/asset
  .              runtime reader (zero-dep, browser+node): readAsset + RecordCursor + defineRecord + types
  ./bake         Node bake helpers + the FLATLAND_asset glTF-Transform Extension
                 (peerDependency: @gltf-transform/core)
```

- `.` ships zero dependencies (no three, no glTF-Transform). Slug and other sibling bakers/loaders depend on it.
- `./bake` peer-deps `@gltf-transform/core`; imported only by Node-side bakers/CLIs.
- Salvaged verbatim into `.`: `layout.ts` (defineRecord, `f32`/…/`vec`, `LayoutType`, `recordFor`), `records.ts` (RecordCursor, TypedRecordCursor, makeCursor), and the record types + `ELEMENT_SIZE` from `schema.ts`.
- Deleted: `pack.ts`, `unpack.ts` (replaced by `readGLB.ts` + `readAsset.ts`), `flpak-metadata.schema.json`, the `PakMetadata`/`PAK_JSON_SCHEMA` framing. `Pak*` type names → `Asset*` (or keep neutral names like `RecordSchema`/`DataType`).

---

## Validation case: slug → `.slug.glb`

`packages/slug/src/baked.ts` currently emits `{name}.slug.json` + `{name}.slug.bin`. Migrate to a single `{name}.slug.glb`:

| Today (`baked.ts`) | In the GLB |
|---|---|
| curve texture (Uint16 RGBA half-float) | raw bufferView `curve`; dims/format in `FLATLAND_asset.metrics` |
| band texture (Float32 RG) | raw bufferView `band`; dims in metadata |
| glyph table (10×f32) | raw bufferView `glyphs` + `record` (stride 40) |
| cmap `[u16,u16]` | accessor or raw bufferView `cmap` + `record` (stride 4) |
| kern `[u16,u16,i16]` | raw bufferView `kern` + `record` (stride 6) |
| band section (per-glyph ragged) | raw bufferView `bands` (opaque) **+** `bandOffsets` (Uint32 prefix index, random-access) |
| metrics, strokeSets, textureWidth | `FLATLAND_asset` metadata; `kind: "flatland.slug.font"`, `version` |

`slug-bake` uses `@three-flatland/asset/bake` (+ `@gltf-transform/core`) to write the `.glb`. `SlugFontLoader` fetches one `.glb`, calls `readAsset()`, reads via cursor/views, builds the curve/band `DataTexture`s. opentype.js stays unloaded.

---

## Cross-language convention (carried over, simplified)

- Ship a small schema/doc for the `FLATLAND_asset` extension (the language-agnostic contract). Because the container is standard glTF, foreign readers already have GLB chunk parsing + bufferView resolution; they only need our extension's `buffers` map semantics.
- Prefer an index buffer over a purely-opaque ragged buffer when cross-language reuse matters (slug `bandOffsets`).
- `defineRecord` remains TS-only ergonomics; the on-disk `record` descriptor in the extension is the contract.
- Commit golden `.glb` fixtures + expected decoded values for conformance.

---

## Testing

- **Reader round-trip:** bake a fixture `.glb` (Node, glTF-Transform) → `readAsset` → assert zero-copy views, record cursor reads, image/mime extraction, `kind`/`version`.
- **glTF validity:** the emitted `.glb` passes the official glTF-Validator (no errors; unknown-extension info note acceptable).
- **otherBufferViews round-trip:** raw half-float bufferView writes and reads back byte-identical; pinned glTF-Transform version.
- **Salvaged units:** existing `defineRecord`/`RecordCursor` tests keep passing against the new reader.
- **Golden conformance:** committed `.glb` + expected JSON, validated from disk.
- **Slug equivalence:** migrated font reproduces glyph/cmap/kern/band data identical to the current `unpackBaked` output.

---

## Open / future

- Consolidating `@three-flatland/asset/bake` with the future `@three-flatland/bake` (baker contract) package if/when that lands.
- Geometry/mesh assets: use glTF natively + `GLTFLoader`; no extension needed.
- Sprite atlas and tilemap adopt the same `FLATLAND_asset` pattern when they're real (not built speculatively).
