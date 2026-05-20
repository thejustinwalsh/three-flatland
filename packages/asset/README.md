# @three-flatland/asset

A zero-dependency runtime reader (`.`) and a Node-side glTF-Transform bake helper (`./bake`) for storing Flatland baked assets as standard **glTF 2.0 / GLB**. Baked output passes the official Khronos glTF-Validator and is readable by any glTF tool — generic viewers render the native content; Flatland loaders reach the domain data through the thin `FL_*` extension layer. The runtime reader exposes zero-copy typed-array views directly into the fetched `ArrayBuffer`, so data textures and typed columns go to the GPU without an extra allocation.

---

## The native-first rule

Every future baker follows this decision rule. For each piece of baked data, ask: does core glTF already model this?

- **Yes** → store it natively. Typed tabular data lives in glTF **accessors** (`componentType` / `type` / `count`). Sampleable images live in glTF `image`/`texture`. Geometry lives in `mesh`/`primitive`. These are readable by every glTF tool for free.
- **No** (novel data: SDF tables, sprite-frame rects, half-float data textures, ragged band arrays) → store the bytes in accessors or bufferViews and describe them in a focused `FL_*` extension.

Two encoding patterns cover the edge cases:

- **Half-float data (e.g. RGBA16F curve texture):** store the raw 16-bit words in a `USHORT` (`5123`) `SCALAR` accessor. The extension records `format: "rgba16f"` and the dimensions. The accessor is standard; the interpretation is in the extension.
- **Ragged arrays (e.g. per-glyph band data):** a flat `USHORT` accessor holds the concatenated words; a `FLOAT` `SCALAR` accessor of length `N+1` holds the CSR prefix-sum offsets. `FLOAT` is used (not `UNSIGNED_INT`) because `UNSIGNED_INT` accessors are restricted to mesh indices in the glTF spec, and `FLOAT` holds exact integers up to 2²⁴.

The extension is always a thin semantic overlay. It names the accessors, records format metadata, and carries the small JSON fields (version, metrics, dimensions) that have no native glTF home. It never re-hosts data that belongs in a native accessor.

---

## Installation

```sh
pnpm add @three-flatland/asset
```

`./bake` requires `@gltf-transform/core` as a peer dependency. Install it in your baker/CLI package:

```sh
pnpm add -D @gltf-transform/core
```

---

## Runtime API (`.`)

Exports: `readAsset`, `readGLB`, `AssetError` and the types `FlatlandAsset`, `GlbResult`, `AssetErrorCode`.

### `readAsset(buf: ArrayBuffer): FlatlandAsset`

Parse a GLB buffer and return a zero-copy reader. All typed-array views share the original `ArrayBuffer`; no bytes are copied.

```ts
import { readAsset } from '@three-flatland/asset'

const buf = await fetch('/fonts/Inter-Regular.slug.glb').then(r => r.arrayBuffer())
const asset = readAsset(buf)

// Read the FL_slug_font extension header
const ext = asset.ext<{ version: number; glyphs: { count: number } }>('FL_slug_font')
const columns = (ext as any).columns as Record<string, { accessor: number }>

// Zero-copy typed view over the advanceWidth accessor
const advanceWidth = asset.accessor(columns['advanceWidth'].accessor) as Float32Array

// Raw bytes for a data texture
const curveBytes = asset.bufferView(0)
```

### `FlatlandAsset`

```ts
interface FlatlandAsset {
  json: any                                         // parsed glTF JSON document
  accessor(index: number): ArrayBufferView          // zero-copy view by glTF accessor index
  bufferView(index: number): Uint8Array             // zero-copy raw bytes by bufferView index
  ext<T = unknown>(name: string): T | undefined     // root extension object by name
}
```

Errors throw `AssetError` with a `code` of `'BAD_GLB'` (structural violations, wrong magic/version, truncation) or `'BAD_ACCESS'` (out-of-range index, unknown componentType).

**Why a custom reader instead of `GLTFLoader`:** `GLTFLoader` interprets a GLB as a renderable scene and does not surface free-floating data accessors. For baked asset data the tiny reader is the direct path. For baked geometry, `GLTFLoader` remains correct — both read the same standard GLB.

### `readGLB(buf: ArrayBuffer): GlbResult`

Lower-level parse of the GLB container. Returns the parsed `json`, `binByteOffset`, and `binByteLength` so callers can build typed-array views by hand. `readAsset` calls this internally.

---

## Bake API (`./bake`, Node only)

Exports: `addColumn`, `createFLExtension` and the types `FLProperty`, `FLExtensionBundle`, `FLExtensionInstance`.

`@gltf-transform/core` is a bake-time-only peer dependency — it is never bundled into the runtime.

### `addColumn`

```ts
function addColumn(
  doc: Document,
  buffer: Buffer,
  name: string,
  typedArray: Float32Array | Uint16Array | Int16Array | Uint32Array | Uint8Array | Int8Array,
  type: string,   // glTF accessor type string: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | …
): Accessor
```

Create a named glTF `Accessor` on a `Document`. The `componentType` is inferred from the typed-array constructor. `type` is the glTF accessor type string.

### `createFLExtension`

```ts
function createFLExtension(extensionName: string): FLExtensionBundle
```

Returns `{ ExtClass }` — a concrete glTF-Transform `Extension` subclass for the named `FL_*` extension. Register it with `NodeIO` and attach it to a `Document`.

`ext.createProperty(metadata)` returns a `FLProperty` that holds plain JSON metadata plus a named map of `Accessor` references. Accessor indices are resolved in the `write()` hook via `WriterContext.accessorIndexMap` — no internal coupling.

### Example: bake two columns and an extension

```ts
import { Document, NodeIO } from '@gltf-transform/core'
import { addColumn, createFLExtension } from '@three-flatland/asset/bake'

const doc = new Document()
const buf = doc.createBuffer()

// Bake typed columns as native glTF accessors
const accIds = addColumn(doc, buf, 'glyphId', new Float32Array([0, 1, 2]), 'SCALAR')
const accAdv = addColumn(doc, buf, 'advanceWidth', new Float32Array([512, 480, 600]), 'SCALAR')

// Create the FL_* extension
const { ExtClass } = createFLExtension('FL_demo_font')
const ext = doc.createExtension(ExtClass).setRequired(true)

const prop = ext.createProperty({ version: 1, glyphs: { count: 3 } })
prop.setAccessorRef('glyphId', accIds)
prop.setAccessorRef('advanceWidth', accAdv)

doc.getRoot().setExtension('FL_demo_font', prop)

const io = new NodeIO().registerExtensions([ExtClass])
const glb = await io.writeBinary(doc)
// glb is a Uint8Array — write to disk or return from a CLI
```

The emitted extension JSON shape is:

```jsonc
{
  "version": 1,
  "glyphs": { "count": 3 },
  "columns": {
    "glyphId":      { "accessor": 0 },
    "advanceWidth": { "accessor": 1 }
  }
}
```

---

## The `FL_*` extension shape

Extensions follow `KHR_lights_punctual`-style: resources defined natively, referenced by index from the extension JSON. The `FL_` prefix requires no Khronos registration — it is a private convention our tools agree on.

**Naming:** `FL_` + lowercase snake feature name — e.g. `FL_slug_font`, `FL_sprite_atlas`, `FL_tilemap`.

**`extensionsRequired` vs `extensionsUsed`:**

- Use `Required` for a standalone data-only `.glb` (no scene geometry to show; a non-supporting loader should error rather than silently misread the file).
- Use `Used` for a composed scene pack (generic glTF tools still render the native geometry/textures and ignore the `FL_*` assets).

### Worked example — `FL_slug_font`

```jsonc
{
  "asset": { "version": "2.0", "generator": "slug-bake" },
  "extensionsUsed": ["FL_slug_font"],
  "extensionsRequired": ["FL_slug_font"],
  "buffers": [{ "byteLength": 1328720 }],
  "accessors": [
    { "bufferView": 0, "componentType": 5126, "type": "SCALAR", "count": 512 },  // advanceWidth (FLOAT)
    { "bufferView": 1, "componentType": 5123, "type": "VEC2",   "count": 1280 }, // cmap [u16,u16]
    { "bufferView": 2, "componentType": 5122, "type": "SCALAR", "count": 600  }, // kern flat [g1,g2,val]×N (SHORT)
    { "bufferView": 3, "componentType": 5126, "type": "SCALAR", "count": 513  }, // band offsets (FLOAT, N+1 CSR)
    { "bufferView": 4, "componentType": 5123, "type": "SCALAR", "count": 9000 }, // band data (USHORT words)
    { "bufferView": 5, "componentType": 5123, "type": "SCALAR", "count": 524288 } // curve texture (USHORT = RGBA16F bits)
  ],
  "extensions": {
    "FL_slug_font": {
      "version": 1,
      "metrics": { "unitsPerEm": 2048, "ascender": 1984, "descender": -494 },
      "glyphs": { "count": 512 },
      "kern": { "stride": 3 },
      "curveTexture": { "width": 2048, "height": 128, "format": "rgba16f" },
      "bandTexture":  { "width": 2048, "height": 32,  "format": "rg32f" },
      "bands": { "glyphCount": 512 },
      "columns": {
        "advanceWidth": { "accessor": 0 },
        "cmap":         { "accessor": 1 },
        "kern":         { "accessor": 2 },
        "bandOffsets":  { "accessor": 3 },
        "bandData":     { "accessor": 4 },
        "curveTexture": { "accessor": 5 }
      }
    }
  }
}
```

Small JSON fields (`metrics`, `strokeSets`, texture dimensions) live in the extension's JSON object directly. All numeric column data lives in BIN, referenced by accessor index.

---

## Ecosystem integration — registerable extension classes

A `FL_*` baker SHOULD also ship a **registerable glTF-Transform extension
class** from its `./bake` subpath. That single class lets generic gltf-transform
tools (`optimize`, `inspect`, `validate`, the Document API) read and round-trip
the baked `.glb` without dropping the `FL_*` accessors.

```ts
import { NodeIO } from '@gltf-transform/core'
import { FlSlugFontExtension } from '@three-flatland/slug/bake'

const io = new NodeIO().registerExtensions([FlSlugFontExtension])
const doc = await io.read('Inter-Regular.slug.glb') // accessor refs intact
// …optimize / inspect / re-write — the FL_slug_font property graph survives.
```

Without registration, an unregistered tool treats the `FL_*` accessors as
unused (so an `optimize` pass may prune them), or — for a file that marks the
extension in `extensionsRequired` — refuses to load it at all (`Missing required
extension`). Exporting the class from `./bake` is what makes a baked Flatland
asset a first-class citizen in the wider glTF tooling ecosystem.

`createFLExtension` returns the class you re-export; bind it once and reuse it
for both the writer (inside `packBaked`) and the public export:

```ts
const _slug = createFLExtension('FL_slug_font')
export const FlSlugFontExtension = _slug.ExtClass
```

## Composition (designed, not yet built)

The shape is designed so multi-asset scene packs compose without a rewrite:

- **Per-format extensions** carry arrays so multiple assets of a kind fit one file: `FL_slug_font.fonts: [...]`, `FL_sprite_atlas.atlases: [...]`.
- **`FL_pak`** — a thin manifest listing named asset slots: `{ assets: [ { type: "font", name: "inter", ext: "FL_slug_font", index: 0 }, ... ] }`.
- **`FL_asset_ref`** on a glTF node — references an asset by name: `node.extensions.FL_asset_ref = { asset: "inter" }`. Name-based refs survive resource reordering where index-based refs don't.

This mirrors the `KHR_lights_punctual` pattern. A level pack `.glb` would be: native meshes, materials, and textures (viewable in any glTF tool) + per-format extension pools + the `FL_pak` manifest + nodes with `FL_asset_ref`. `extensionsUsed` (not `Required`) keeps generic tools working.

---

## Validation

Baked output passes the [official Khronos glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) with 0 errors. Unknown-extension info notes are expected and acceptable. The conformance fixture is committed at `packages/asset/` — the GLB magic bytes on disk are `67 6C 54 46` (`glTF`).

---

## Writing a new baker

Use `packages/slug/src/bake.ts` (`packBaked`, `FlSlugFontExtension`) for the
Node/tooling side and `packages/slug/src/baked.ts` (`unpackBaked`, runtime
reader) for the browser side as the reference implementation. The packer and the
runtime reader live in separate modules so `@gltf-transform/core` stays out of
the runtime static graph — it is reachable only through the package's `./bake`
subpath.

Checklist for a new format (e.g. `FL_sprite_atlas`, `FL_tilemap`):

1. Apply the **native-first rule**: sampleable images go in `image`/`texture`; geometry goes in `mesh`/`primitive`/accessors; typed tabular data goes in typed accessors. Put only the semantic layer in the extension.
2. Name the extension `FL_<feature>` (e.g. `FL_sprite_atlas`). Add it to `extensionsUsed` and `extensionsRequired` as appropriate.
3. Use `addColumn` for each typed column. Use a `USHORT` + `FLOAT` CSR pair for ragged arrays. Use a `USHORT` accessor for half-float data textures.
4. Use `createFLExtension('FL_<feature>')` to produce the glTF-Transform `ExtClass`. Call `ext.createProperty(metadata)` and `prop.setAccessorRef(semantic, acc)` for each column.
5. Register the `ExtClass` with `NodeIO` and call `io.writeBinary(doc)`. Bind the class once (`const { ExtClass } = createFLExtension('FL_<feature>')`) and **re-export it from your package's `./bake` subpath** (e.g. `FlSlugFontExtension`) so downstream gltf-transform tooling can register it — see "Ecosystem integration" above.
6. On the runtime side, import from `@three-flatland/asset` (`.`). Call `readAsset(buf)`, then `asset.ext('FL_<feature>')` to read the extension JSON and `asset.accessor(index)` to get zero-copy typed views.
7. Run the emitted GLB through `gltf-validator` — 0 errors is the bar.
