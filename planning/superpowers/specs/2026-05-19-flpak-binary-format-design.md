# `.flpak` — Flatland Package Binary Format

**Status:** Design canonical · **Authored:** 2026-05-19 · **Package:** `@three-flatland/pak` (Layer 0)

A high-performance, zero-copy, 4-byte-aligned binary container for delivering baked assets to the runtime. GLB-inspired: a fixed file header, a JSON metadata chunk, and a binary payload chunk. Self-describing, so files outlive the tools that wrote them.

> Companion: `.library/three-flatland/loader-architecture.md` (the loader pattern domain packages build on top of this codec).

---

## 1. Goals & non-goals

### Three jobs this format does

1. **Atomic delivery** — one HTTP fetch, one `ArrayBuffer`, no torn state between a manifest and its sibling binaries, deterministic load order.
2. **Zero-copy GPU upload** — buffers are pre-aligned and pre-typed so a view goes straight to `device.queue.writeBuffer(...)` (or `texImage2D`) with no CPU parse, transform, or re-pack. The bytes in the file are byte-identical to the bytes the GPU receives.
3. **Self-describing structured records** — engine-specific records (glyph tables, tilemap chunks, animation tracks) carry a machine-readable layout schema, so a reader extracts fields by *name* and survives byte-layout changes across writer versions.

### Non-goals (the YAGNI line — confirmed during design)

- **No multi-asset scene packs.** One `.flpak` = one logical asset. No cross-asset references, dependency graphs, or progressive streaming.
- **No compression.** HTTP transport (gzip/brotli) compresses the JSON; texture blobs are already compressed (KTX2/PNG/WebP). A future compressed-payload chunk can be added additively without a format break.
- **No full reflection.** No nested records, unions, or named-type references. Variable-length / ragged data stays an opaque buffer the domain reader walks. (See §5, slug band data.)
- **No 64-bit offsets.** `uint32` lengths cap a file at 4 GiB — wildly sufficient for 2D assets.

---

## 2. Binary layout

```
┌──────────────────── 12B FILE HEADER ────────────────────┐
│ magic "FLPK" u32 │ formatVersion u32 │ totalLength u32   │
└──────────────────────────────────────────────────────────┘
┌─ 8B CHUNK HEADER ─┐
│ chunkLen u32 │ "JSON" u32 │  …UTF-8 metadata, 0x20-padded to /4…
├─ 8B CHUNK HEADER ─┤
│ chunkLen u32 │ "BIN\0" u32 │ …binary payload, per-buffer 4-byte aligned…
└─ (optional future chunks: skipped by readers that don't recognize them) ─┘
```

Constants (little-endian):

| Name | Value | ASCII |
|---|---|---|
| `MAGIC` | `0x464C504B` | `FLPK` |
| `TYPE_JSON` | `0x4A534F4E` | `JSON` |
| `TYPE_BIN` | `0x004E4942` | `BIN\0` |

### Chunk loop, not hardcoded offsets

The reader walks `(chunkLen u32, chunkType u32)` headers in sequence:

- The **first** chunk MUST be `JSON`. The **second** MUST be `BIN`.
- Any **further chunks are skipped** if the reader doesn't recognize the type. This is the forward-compat seam (a future CRC chunk, alternate/compressed payload, etc.) and costs ~10 lines.

This replaces any reliance on a fixed `jsonStartOffset`.

### Alignment invariant

- **Every buffer starts on a 4-byte boundary and is null-padded (`0x00`) to a 4-byte length.** Enforced by both packer and unpacker.
- The JSON chunk payload is space-padded (`0x20`) to a 4-byte boundary so the BIN chunk header lands aligned.
- **4 bytes is exactly enough** and the design deliberately stops there:
  - `writeBuffer` (vertex / index / uniform / storage) requires only 4-byte alignment of the upload offset and size. The 16-byte (std430) and 256-byte (uniform dynamic-offset) alignments are *not* upload concerns — they are internal struct layout (baked into bytes, expressed via `record.stride` + pad fields) or bind-group binding offsets (set at bind time). Neither is a file-format concern.
  - `writeTexture`'s 256-byte `bytesPerRow` is per-row and width-dependent; it is unsolvable by buffer alignment and is intrinsically domain-reader territory.
  - Every supported element type constructs a typed-array view at ≤4-byte alignment.
- **Caveat tied to the type set:** the 4-byte guarantee holds *because* the element types are all ≤32-bit. If `Float64`/`Int64` are ever added, those buffers will need 8-byte alignment. Note it; do not build it now.

### Endianness & caps

- All multi-byte integers are **little-endian** (matches GPU and x86/ARM).
- `uint32` lengths → 4 GiB max file size.

---

## 3. Metadata contract (JSON chunk)

```ts
interface PakMetadata {
  kind: string                 // REQUIRED — content discriminator, e.g. 'flatland.slug.font'
  version: number              // REQUIRED — writer's sentinel: monotonic integer ≥ 1
  name?: string
  buffers: Record<string, PakBufferDescriptor>   // REQUIRED
  [key: string]: unknown       // open-ended domain metadata (texture dims, metrics, etc.)
}
```

### Two versions, two owners, no conflict

| Version | Where | Type | Owner | Bumped when |
|---|---|---|---|---|
| `formatVersion` | file header `uint32` | int | the `.flpak` spec | the container binary layout changes (rare) |
| `version` | JSON metadata | monotonic int ≥ 1 | the *writer* (slug, normals, …) | the writer's own asset shape/semantics change |

They live in different namespaces (binary header vs. JSON object), so the metadata field is plainly named `version`.

`version` is a **monotonic integer**, not semver — unambiguous comparison is exactly what upgrade logic wants (`if (meta.version < 2) …`), with no semver-parse or precedence subtleties.

`version` and `kind` are both **required by the JSON Schema** — a baker that forgets to identify or version its output fails validation. This is the good-practice forcing function. The container requires the field's *presence* and validates its *shape*; it never interprets its *semantics* (which `version` value means what is the domain reader's business).

### How the two versions divide resilience work

- **Record schemas** (self-describing field names + offsets, §4) absorb *byte-layout* drift — a v1 reader pulls `advanceWidth` by name out of a v2 buffer.
- **`version`** absorbs *semantic* drift — "v2 fonts carry strokeSets, v1 didn't," so the reader branches on the value.
- **`kind`** lets a reader handed an arbitrary `.flpak` identify the content type before it trusts `version`.

---

## 4. Buffer descriptor & record schema

### Three orthogonal fields — never conflated

```ts
interface PakBufferDescriptor {
  off: number                  // byte offset within the BIN payload (4-byte aligned)
  len: number                  // true logical (unpadded) length in bytes; len: 0 allowed
  type: PakDataType            // REQUIRED — typed-array element for casting
  record?: PakRecordSchema     // present ⇒ structured (AoS / interleaved)
  mime?: string                // present ⇒ opaque media; do NOT interpret as records
}

type PakDataType = 'Float32' | 'Int32' | 'Uint32' | 'Uint16' | 'Int16' | 'Uint8' | 'Int8'
```

A buffer is exactly one of:

- **structured** — has `record`.
- **opaque media** — has `mime` (PNG, ttf, …).
- **flat typed array** — neither.
- **opaque domain-walked** — `type: 'Uint8'`/`Uint16` with neither `record` nor `mime`; the domain reader walks it manually. *This is the deliberate escape hatch for variable-length data and is why reflection is unnecessary.*

`gpu` and `align` fields from earlier drafts are **removed**: `gpu` could not deliver push-button upload without dragging GPU-API knowledge into a Layer-0 format, and `align` is moot under the universal 4-byte invariant. Precise GPU upload params (texture format/dims/`bytesPerRow`, vertex attribute shader locations) live in **domain metadata**, composed by the domain reader.

### Record schema — flat *and* interleaved, level-2 AoS

```ts
interface PakRecordSchema {
  stride: number               // bytes per record (the interleave window)
  count: number                // number of records (== len / stride)
  fields: PakRecordField[]
}
interface PakRecordField {
  name: string
  type: PakDataType
  offset: number               // byte offset within stride
  count: number                // element count (1 = scalar, >1 = fixed vector)
}
```

- **Flat / SoA** = one buffer per attribute, no `record`.
- **Interleaved / AoS** = one buffer with `record`; field offsets within `stride` describe the interleave. Mixed element types within a record are allowed. `stride > Σ field sizes` expresses padding.
- This maps **1:1 onto WebGPU `GPUVertexBufferLayout`**: `stride` → `arrayStride`, each field → an attribute with its `offset`.

Example (slug glyph table, 10×Float32):

```ts
record: {
  stride: 40, count: 1280,
  fields: [
    { name: 'glyphId',      type: 'Float32', offset: 0,  count: 1 },
    { name: 'bounds',       type: 'Float32', offset: 4,  count: 4 },
    { name: 'bandLoc',      type: 'Float32', offset: 20, count: 2 },
    { name: 'advanceWidth', type: 'Float32', offset: 28, count: 1 },
    { name: 'lsb',          type: 'Float32', offset: 32, count: 1 },
    { name: 'hasOutline',   type: 'Float32', offset: 36, count: 1 },
  ],
}
```

**Reserved (not built in v1): strings & buffer refs.** A future `StringRef` / `BufferRef` field type + a designated strings buffer convention covers labels and sub-arrays (e.g. atlas frame names). It is additive — a new field type plus a chunk-compatible reader — so adding it later is not a format break. Slug needs zero strings, so v1 ships AoS + opaque-walk only.

### Validation contract — zero-dep checks, published JSON Schema, no trapping

The contract is **TS types + zero-dependency structural checks in code**, with JSON Schema shipped as a *published artifact*, not a runtime dependency. The distinction matters:

- **Internal validation is plain code, zero-dep.** `unpack()` checks its own invariants directly (magic, `formatVersion`, `totalLength`, `kind`/`version`/`buffers` present and well-typed, 4-byte alignment, descriptor bounds). `@three-flatland/pak` imports **no** validator library and **no** JSON Schema engine. Because the payload is binary-packed, a runtime JSON-Schema validation pass buys nothing the structural checks don't already cover.
- **`PAK_JSON_SCHEMA` (Draft 2020-12) is published as the language-agnostic reader contract.** Its value is *interop*, not internal validation: any language can generate metadata-reading code from it, and editors validate hand-authored JSON against it (VS Code `$schema`). This is why we still ship it even though we don't validate against it internally. Highlights:
  - `required: ['kind', 'version', 'buffers']`
  - `version`: `{ type: 'integer', minimum: 1 }`
  - each buffer: `required: ['off', 'len', 'type']`; `len.minimum: 0`; `off.minimum: 0`
  - `record` and `mime` optional; `additionalProperties: true` on the root for domain metadata.
- **No schema system is forced on users.** `record` is optional and root metadata is open-ended, so a user can store opaque buffers + their own domain metadata and validate that slice with their own **Standard Schema** validator (Zod / Valibot / ArkType — the `~standard` interface). pak never sees or requires it. The bring-your-own-validator path is first-class, not an afterthought.

> **Interop boundary (be honest about it):** JSON Schema / Standard Schema describe *decoded value shapes* (objects, optionals, unions, strings); the `record` schema describes *byte layout* (stride, offsets, element type). They are **not isomorphic** — you cannot soundly auto-derive a byte layout from an arbitrary value schema (the byte-level facts aren't in it). Supported bridges: (a) **decode-side** — validate a decoded record (a plain object) with your own Standard Schema validator; (b) **layout single-source-of-truth** — see §5 `defineRecord`; (c) **one-way codegen** — emit TS types / a decoded-shape JSON Schema *from* a `record` schema. The reverse ("any validator → byte layout, losslessly") is intentionally not promised.

---

## 5. API surface

`@three-flatland/pak` is **pure codec, no `three.Loader`** — keeps it three-free (Layer 0). Domain packages own their loaders.

```ts
// Node / CLI side (slug-bake, flatland-bake, …)
function pack(metadata: Omit<PakMetadata, 'buffers'>, namedBuffers: NamedBuffers): ArrayBuffer

type NamedBuffers = Record<string,
  | ArrayBuffer | ArrayBufferView                              // bare → flat typed buffer
  | { data: ArrayBuffer | ArrayBufferView; record?: PakRecordSchema; mime?: string }
>
// `pack` derives each descriptor's `off`/`len`/`type` and the 4-byte padding; the caller
// supplies only the bytes plus optional `record` (e.g. Glyph.schema) or `mime`.

// Runtime (browser + node)
function unpack(buf: ArrayBuffer): UnpackedPak

interface UnpackedPak {
  metadata: PakMetadata
  view(name: string): ArrayBufferView   // typed by `type`, zero-copy view into the source buffer
  bytes(name: string): Uint8Array        // raw bytes (mime blobs, writeBuffer source)
  records(name: string): RecordCursor                       // untyped cursor (reads schema from the file)
  records<L extends RecordLayout>(name: string, layout: L): TypedRecordCursor<L>  // typed via defineRecord
  has(name: string): boolean
}

// Allocation-free cursor; resolves fields by name from the schema → byte-layout-independent
interface RecordCursor {
  readonly count: number
  get(index: number, field: string): number          // scalar field
  getArray(index: number, field: string, out?: ArrayBufferView): ArrayBufferView  // vector field
}
```

### Layout single-source-of-truth: `defineRecord`

One declaration derives **both** the byte layout (for `pack()`) **and** the decoded TS type (for the reader), so the two cannot drift. Pure TypeScript inference — no codegen step, still zero-dep.

```ts
import { f32, i32, u32, u16, i16, u8, i8, vec, defineRecord, type LayoutType } from '@three-flatland/pak'

const Glyph = defineRecord({
  glyphId:      f32,
  bounds:       vec(f32, 4),
  bandLoc:      vec(f32, 2),
  advanceWidth: f32,
  lsb:          f32,
  hasOutline:   f32,
})

Glyph.schema            // → PakRecordSchema: stride + per-field offsets computed automatically
type Glyph = LayoutType<typeof Glyph>
//           → { glyphId: number; bounds: [number,number,number,number];
//               bandLoc: [number,number]; advanceWidth: number; lsb: number; hasOutline: number }

// writer: pack the buffer with the derived layout
pack({ kind: 'flatland.slug.font', version: 1 }, {
  glyphs: { data: glyphBytes, record: Glyph.schema },
})

// reader: typed cursor — field names autocomplete, typos are compile errors
const cur = unpacked.records('glyphs', Glyph)
const w = cur.get(i, 'advanceWidth')           // number, checked
const b = cur.getArray(i, 'bounds')            // length-4 view, checked
```

- **Field constructors** (`f32`/`i32`/`u32`/`u16`/`i16`/`u8`/`i8`, `vec(type, n)`) map to `PakDataType` + count; `defineRecord` computes `stride` and each `offset` in declaration order (with natural padding to the field's element size).
- **`LayoutType<typeof X>`** infers the decoded object shape — this is the type the reader returns, identical to what a hand-written reader would produce.
- **Interop:** `Glyph.schema` is an ordinary `PakRecordSchema`, so the data-authored path (hand-written schema, codegen) and the builder path produce the same on-disk bytes — `defineRecord` is sugar over the same descriptor, not a separate format.

### Robustness (closes gaps in the first-pass draft)

- **Bounds checking in `unpack`/accessors:** every descriptor's `[off, off+len]` must fit inside the BIN chunk and `off` must be 4-byte aligned, or throw. No blind trust of metadata (prevents out-of-bounds reads on truncated/malformed input).
- **Magic / formatVersion / totalLength validation** with clear errors.
- **`len: 0` accepted** (e.g. empty kern table).

---

## 6. Package layout

Mirrors `@three-flatland/image`:

```
@three-flatland/pak/
  src/pack.ts        # Node-safe, no three
  src/unpack.ts      # browser + node, no three
  src/records.ts     # RecordCursor / TypedRecordCursor
  src/layout.ts      # defineRecord, field constructors (f32…), LayoutType
  src/schema.ts      # PakMetadata / descriptor TS types + published PAK_JSON_SCHEMA
  package.json exports:
    "."  →  pack / unpack / records / schema / types   (zero deps)
```

- **Layer 0.** Passes the boundary test ("could a non-three-flatland user reasonably want this alone?" — yes, anyone shipping baked JS assets).
- `slug` / `normals` / future bakers depend on `@three-flatland/pak`; it depends on nothing.
- `sideEffects: false`, `bundle: false` (tsup) per the format-package conventions.

### Loader integration

Domain loaders (e.g. `SlugFontLoader`) remain `three.Loader<T>` subclasses per the canonical pattern. They `fetch()` the `.flpak`, call `unpack()`, read via the cursor/views, and return a domain object. `@three-flatland/pak` ships no loader and imports no GPU/three types.

---

## 7. Validation case: slug migration

`packages/slug/src/baked.ts` is a bespoke one-off of this exact idea (`{name}.slug.json` + `{name}.slug.bin`). Migrating it to a single `{name}.slug.flpak` is the design's proof, and it exercises every capability plus the opaque escape hatch:

| Today (`baked.ts`) | In `.flpak` |
|---|---|
| curve texture (Uint16 RGBA half-float) | buffer `type:'Uint16'`; width/height/format in domain metadata |
| band texture (Float32 RG) | buffer `type:'Float32'`; dims in domain metadata |
| glyph table (10×f32) | buffer + `record` (the §4 example) |
| cmap `[u16,u16]` | buffer + `record` (stride 4) |
| kern `[u16,u16,i16]` | buffer + `record` (stride 6 → 8 padded) |
| **band section (per-glyph variable)** | flat `Uint16` buffer, **no record** — slug reader walks it (opaque escape hatch) |
| metrics, strokeSets, textureWidth | top-level domain metadata; `kind: 'flatland.slug.font'`, `version` |

`SlugFontLoader` reads one file instead of two; `unpackBaked` is rewritten against the cursor API. The band data staying opaque is the concrete evidence reflection is unnecessary.

---

## 8. Testing

- **Round-trip:** `pack` → `unpack` byte-identical recovery for flat, interleaved, mime, and opaque buffers; empty buffers; multiple buffers with correct 4-byte padding.
- **Alignment invariant:** assert every buffer `off % 4 === 0` and padded length `% 4 === 0`.
- **Malformed input:** bad magic, truncated file, `totalLength` mismatch, out-of-range descriptor, unknown chunk (must skip, not throw).
- **Schema validation:** missing `kind`/`version`/`buffers` rejected; non-integer or `< 1` `version` rejected.
- **Record cursor:** field-by-name resolution; forward-compat (a reader with the v1 field list reads correct values from a buffer whose `record` has extra trailing fields).
- **Slug equivalence:** the migrated font produces glyph/cmap/kern/band data identical to the current `unpackBaked` output (golden test against an existing baked font).

---

## 9. Open / future (additive, non-breaking)

- **Strings & buffer refs** (`StringRef` / `BufferRef` field types) — when atlas frame-names or animation track-names land.
- **Compressed payload chunk** — if raw vertex/grid data ever dominates transport and gzip/br isn't enough.
- **64-bit offsets / `Float64` types** — only if an asset ever exceeds the 32-bit envelope (would bump buffer alignment to 8 for those buffers).
- **CRC / integrity chunk** — if assets are served over untrusted transport.

Each is reachable through the unknown-chunk skip seam or an additive field, so none forces a `formatVersion` break for existing readers.
