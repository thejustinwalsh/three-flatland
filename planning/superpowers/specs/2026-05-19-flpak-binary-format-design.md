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

Constants. **The normative form is the on-disk byte sequence (file order).** The "LE u32" column is the value you get from `DataView.getUint32(offset, /*littleEndian=*/true)` and what you compare against; it is provided so integer comparisons and the byte sequence cannot drift apart (the classic GLB foot-gun — defining the magic as an integer whose little-endian bytes spell something *other* than the intended ASCII).

| Name | On-disk bytes (file order) | ASCII | LE u32 (for comparison) |
|---|---|---|---|
| `MAGIC` | `46 4C 50 4B` | `F L P K` | `0x4B504C46` |
| `TYPE_JSON` | `4A 53 4F 4E` | `J S O N` | `0x4E4F534A` |
| `TYPE_BIN` | `42 49 4E 00` | `B I N \0` | `0x004E4942` |

A reader MUST either compare the four raw bytes in file order, or read a little-endian `uint32` and compare against the LE u32 column — the two are equivalent by construction. `TYPE_BIN` carries a trailing `\0`; readers compare the full 4-byte value including the null.

### Byte accounting (GLB convention — stated, not inferred)

- **`chunkLen`** is the **padded** byte length of the chunk payload (excluding the 8-byte chunk header). It is always a multiple of 4. A reader advances to the next chunk header at `offset + 8 + chunkLen` and is guaranteed to land 4-byte aligned — there is no separate "round up past padding" step.
- **`totalLength`** is the size of the **entire file**: the 12-byte file header plus every chunk (8-byte header + padded payload). A reader MUST verify `totalLength === buffer.byteLength`; bytes beyond `totalLength` are an error, not trailing slack.
- **Buffer `off`** (in a descriptor) is relative to the **first byte of the BIN chunk payload** (i.e. immediately after the BIN chunk's 8-byte header), never relative to the file or the chunk header.
- **Layout determinism:** within the BIN payload, buffers are laid out in the **insertion order of the `buffers` object's keys** (`Object.keys` order). Two compliant writers given the same input produce byte-identical files. A 0-length buffer occupies **0 payload bytes**; its `off` is the current cursor and the next buffer shares the same `off`.

### Chunk loop, not hardcoded offsets

The reader walks `(chunkLen u32, chunkType u32)` headers in sequence:

- The **first** chunk MUST be `JSON`. The **second** MUST be `BIN`. The BIN chunk is **always present**; it MAY have `chunkLen === 0` when `buffers` is empty (a metadata-only asset). This resolves the otherwise-ambiguous "is BIN optional?" question — it is mandatory but may be empty.
- Required chunks out of order, a missing JSON or BIN chunk, or a chunk whose `8 + chunkLen` exceeds `totalLength` are all errors (throw).
- Any **further chunks past BIN are skipped** if the reader doesn't recognize the type. This is the forward-compat seam (a future CRC chunk, alternate/compressed payload, etc.) and costs ~10 lines.

This replaces any reliance on a fixed `jsonStartOffset`.

### Alignment invariant

- **Every buffer starts on a 4-byte boundary and is null-padded (`0x00`) to a 4-byte length.** Enforced by both packer and unpacker.
- The JSON chunk payload is space-padded (`0x20`) to a 4-byte boundary so the BIN chunk header lands aligned. The padding spaces follow the **complete** JSON value, so the chunk is valid JSON with insignificant trailing whitespace; a strict parser in any language MUST tolerate trailing `0x20`.
- **Absolute alignment, not just payload-relative.** The header chain is `12 (file header) + 8 (JSON chunk header) + 4k (padded JSON) + 8 (BIN chunk header)`, every term a multiple of 4, so the BIN payload starts at a 4-byte-aligned **absolute** file offset; combined with `off % 4 === 0`, every buffer's absolute offset is a multiple of 4. This is what makes `new Float32Array(srcBuffer, absoluteOffset, len/4)` legal (JS) and `reinterpret_cast<float*>` safe (native). **It holds only when `srcBuffer` starts at absolute byte 0.** Therefore `unpack` takes a whole `ArrayBuffer` (as from `fetch().arrayBuffer()`); it does NOT accept a `Uint8Array`/`DataView` slice with a nonzero `byteOffset` unless that offset is itself a multiple of 4 (in which case the reader MUST fold it into every view offset). Native loaders MUST place the file in ≥4-byte-aligned memory for zero-copy reinterpret; otherwise copy.
- **4 bytes is exactly enough** and the design deliberately stops there:
  - `writeBuffer` (vertex / index / uniform / storage) requires only 4-byte alignment of the upload offset and size. The 16-byte (std430) and 256-byte (uniform dynamic-offset) alignments are *not* upload concerns — they are internal struct layout (baked into bytes, expressed via `record.stride` + pad fields) or bind-group binding offsets (set at bind time). Neither is a file-format concern.
  - `writeTexture`'s 256-byte `bytesPerRow` is per-row and width-dependent; it is unsolvable by buffer alignment and is intrinsically domain-reader territory.
  - Every supported element type constructs a typed-array view at ≤4-byte alignment.
- **Intra-record field alignment.** Each `record` field's `offset` MUST be a multiple of its element size (`Uint16`→2, `Float32`/`Int32`/`Uint32`→4, 8-bit→1). Otherwise a typed-array view over that field throws `RangeError` (JS) or faults (native). Enforced by validation (§5) and by `defineRecord` (§5).
- **Caveat tied to the type set:** the 4-byte guarantee holds *because* the element types are all ≤32-bit. If `Float64`/`Int64` are ever added, those buffers will need 8-byte alignment. Note it; do not build it now.

### Endianness & caps

- **All multi-byte values are little-endian** (matches GPU and x86/ARM) — header integers, chunk headers, **and the buffer payload element data** (`Float32`/`Int32`/`Uint32`/`Uint16`/`Int16`). Floats are IEEE-754 (`Float32` = binary32; a `Uint16` buffer tagged half-float by domain metadata is IEEE-754 binary16). A reader MUST use explicit little-endian reads (`DataView.getUint32(off, true)`), never a host-endianness `Uint32Array` cast, so big-endian / WASM-on-BE hosts read correctly.
- The container `type` is a **storage width only**, never a numeric interpretation. Half-float, sRGB, and normalized-int semantics (beyond the `normalized` flag in §4) live in domain metadata; the container never reinterprets element bits.
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
  off: number                  // byte offset relative to the BIN chunk payload start (4-byte aligned)
  len: number                  // true logical (unpadded) length in bytes; len: 0 allowed
  type: PakDataType            // REQUIRED — typed-array element / storage width
  normalized?: boolean         // flat buffer only: integer elements map to [0,1] (unsigned) / [-1,1] (signed)
  record?: PakRecordSchema     // present ⇒ structured (AoS / interleaved); MUST NOT coexist with mime
  mime?: string                // present ⇒ opaque media; do NOT interpret as records; MUST NOT coexist with record
}

type PakDataType = 'Float32' | 'Int32' | 'Uint32' | 'Uint16' | 'Int16' | 'Uint8' | 'Int8'
```

A buffer is **exactly one** of these — `record` and `mime` are mutually exclusive and `pack()`/`unpack()` MUST reject a buffer that sets both:

- **structured** — has `record`.
- **opaque media** — has `mime` (PNG, ttf, …).
- **flat typed array** — neither (optionally `normalized`).
- **opaque domain-walked** — `type: 'Uint8'`/`Uint16` with neither `record` nor `mime`; the domain reader walks it manually. *This is the deliberate escape hatch for variable-length data and is why reflection is unnecessary.*

**`normalized`** (borrowed from glTF §3.6.2.3, the one accessor concept worth keeping) closes a real self-describing hole for flpak's own targets — packed `Uint8` RGBA colors and `snorm` baked-normal data. Without it the byte `type` (`Uint8`) can't tell the consumer to map `0..255 → 0..1` or `-128..127 → -1..1`, forcing that intent into ad-hoc domain metadata. Default `false`. On a flat buffer it applies to every element; inside a `record` it is a per-field flag (below). It is a *semantic hint the reader honors when converting*, never a re-interpretation of stored bits.

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
  offset: number               // byte offset within stride; MUST be a multiple of the element size
  count: number                // element count (1 = scalar, >1 = fixed vector)
  normalized?: boolean         // integer elements map to [0,1] (unsigned) / [-1,1] (signed); default false
}
```

- **Flat / SoA** = one buffer per attribute, no `record`.
- **Interleaved / AoS** = one buffer with `record`; field offsets within `stride` describe the interleave. Mixed element types within a record are allowed. `stride > Σ field sizes` expresses padding.
- This maps **1:1 onto WebGPU `GPUVertexBufferLayout`**: `stride` → `arrayStride`, each field → an attribute with its `offset`.
- **Field constraints (validated, §5):** every field's `offset` MUST be a multiple of its element size, and `offset + count * elementSize` MUST be `≤ stride` (a field cannot escape its record). `count * stride` MUST equal `len` (no trailing bytes); `count` is authoritative for iteration.

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
- **`PAK_JSON_SCHEMA` (Draft 2020-12) is published as the language-agnostic reader contract.** Its value is *interop*, not internal validation: any language can generate metadata-reading code from it, and editors validate hand-authored JSON against it (VS Code `$schema`). The schema MUST be published **in full, including the `record` sub-schema and the `PakDataType` enum** — otherwise the "any language can read it" claim is false for structured buffers (the format's signature feature). The complete schema:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://three-flatland.dev/schema/flpak-metadata.json",
  "title": "FlatlandPackageMetadata",
  "type": "object",
  "required": ["kind", "version", "buffers"],
  "additionalProperties": true,                       // open-ended domain metadata
  "properties": {
    "kind":    { "type": "string", "minLength": 1 },
    "version": { "type": "integer", "minimum": 1 },
    "name":    { "type": "string" },
    "buffers": {
      "type": "object",
      "additionalProperties": { "$ref": "#/$defs/buffer" }
    }
  },
  "$defs": {
    "dataType": { "enum": ["Float32","Int32","Uint32","Uint16","Int16","Uint8","Int8"] },
    "buffer": {
      "type": "object",
      "required": ["off", "len", "type"],
      "not": { "required": ["record", "mime"] },      // record and mime mutually exclusive
      "properties": {
        "off":  { "type": "integer", "minimum": 0, "multipleOf": 4 },
        "len":  { "type": "integer", "minimum": 0 },
        "type": { "$ref": "#/$defs/dataType" },
        "normalized": { "type": "boolean" },
        "mime": { "type": "string" },
        "record": { "$ref": "#/$defs/record" }
      }
    },
    "record": {
      "type": "object",
      "required": ["stride", "count", "fields"],
      "properties": {
        "stride": { "type": "integer", "minimum": 1 },
        "count":  { "type": "integer", "minimum": 0 },
        "fields": { "type": "array", "items": { "$ref": "#/$defs/field" }, "minItems": 1 }
      }
    },
    "field": {
      "type": "object",
      "required": ["name", "type", "offset", "count"],
      "properties": {
        "name":   { "type": "string", "minLength": 1 },
        "type":   { "$ref": "#/$defs/dataType" },
        "offset": { "type": "integer", "minimum": 0 },
        "count":  { "type": "integer", "minimum": 1 },
        "normalized": { "type": "boolean" }
      }
    }
  }
}
```

  JSON Schema can't express the cross-field arithmetic constraints (`offset % elementSize === 0`, `offset + count*elemSize ≤ stride`, `count*stride === len`, `off+len ≤ BIN length`); those are enforced by the reader's structural checks (§5) and listed there.
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
  | { data: ArrayBuffer | ArrayBufferView; record?: PakRecordSchema; mime?: string; normalized?: boolean }
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

// Allocation-free cursor; field offsets/stride ALWAYS resolved from the file's record (see below)
interface RecordCursor {
  readonly count: number
  get(index: number, field: string): number          // scalar field (count===1)
  getArray(index: number, field: string, out?: ArrayBufferView): ArrayBufferView  // vector field (count>1)
}
```

**`pack()` `type` inference.** A `Float32Array` → `'Float32'`, `Uint16Array` → `'Uint16'`, etc. (the obvious map). A `Uint8ClampedArray` → `'Uint8'`. A bare `ArrayBuffer` or a `DataView` carries no element type → defaults to `'Uint8'` (opaque bytes). The caller may always override via the object form's implied `record`/`mime`. `pack()` validates required metadata (`kind`/`version`) and rejects `record`+`mime` on the same buffer **before** emitting.

**Typed-vs-untyped cursor — offsets always come from the file.** This is the subtle correctness rule: **both** cursor forms resolve each field's `offset`, element `type`, `count`, and the record `stride` **from the file's `record` schema**, never from the caller's `defineRecord` layout. The passed layout `L` is used *only* to (a) type the result at compile time and (b) assert each named field exists in the file with a matching `type`/`count` — throwing if not. This preserves the forward-compat promise for the **typed** path too: if a v2 writer reorders fields or grows the stride (40→44), a v1 caller's `Glyph` still reads correctly because the byte math uses the file's stride/offsets; a removed/retyped field throws instead of silently misreading. (Reading offsets from the caller's layout would silently corrupt every record after index 0 on any stride change — explicitly disallowed.)

**Cursor arity & errors.** `get` on a `count>1` field throws; `getArray` on a `count===1` field throws; an unknown field name throws; an out-of-range `index` throws; a supplied `out` buffer whose length/type doesn't match the field throws. No silent element-0 reads.

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

- **Field constructors** (`f32`/`i32`/`u32`/`u16`/`i16`/`u8`/`i8`, `vec(type, n)`) map to `PakDataType` + count.
- **Layout rule (precise, deterministic).** Fields are placed in declaration order. Each field's `offset` is rounded up to a multiple of its element size (natural alignment). The record's `stride` is the running offset after the last field, rounded up to the **largest element size among all fields** — so consecutive records stay aligned. Padding gaps are unused bytes the writer zero-fills.
  - *Mixed-type example:* `defineRecord({ id: u32, flags: u8, color: vec(u8, 4) })` → `id` at 0 (size 4); `flags` at 4 (size 1); `color` at 5 (size 1, 4 elems); running offset 9; largest element size = 4 → `stride = 12` (3 trailing pad bytes). The all-`Float32` glyph example above needs no padding because every field is 4-aligned already.
- **`LayoutType<typeof X>`** infers the decoded object shape — this is the type the reader returns, identical to what a hand-written reader would produce.
- **Interop & normativity:** `Glyph.schema` is an ordinary `PakRecordSchema`, so the data-authored path (hand-written schema, codegen) and the builder path produce the same on-disk bytes. **The on-disk `record` schema is the sole cross-language contract; `defineRecord`/`f32`/`vec`/`LayoutType` are TypeScript-only ergonomics a foreign implementation ignores.** A non-JS writer need not replicate the layout rule above — it may choose any field offsets that satisfy the §4 field constraints; the self-describing `record` makes the result readable regardless.

### Robustness — enumerated validation (each case has a defined behavior)

`unpack()` performs these checks in code (zero-dep), throwing a typed `PakError` on any failure. The list is exhaustive on purpose — every reviewer-identified corruption/ambiguity case is here so two implementations agree on what is and isn't a valid file.

**File / chunk level:**
- `MAGIC` mismatch → throw.
- `totalLength !== buffer.byteLength` (either direction; trailing bytes are an error) → throw.
- Any chunk where `8 + chunkLen` reads past `totalLength`, or `chunkLen` is not a multiple of 4 → throw.
- First chunk not `JSON`, or second chunk not `BIN` (BIN mandatory, may be `chunkLen 0`) → throw. Unknown chunks **after** BIN → skip.
- JSON chunk not valid UTF-8, or `JSON.parse` fails → throw a typed error (not a raw `SyntaxError`).
- `formatVersion` greater than the reader supports → throw (forward-version guard).

**Metadata level:**
- Missing/ill-typed `kind`, `version`, or `buffers` → throw. `version` not an integer ≥ 1 → throw.
- A buffer with both `record` and `mime` → throw.

**Buffer level:**
- `off % 4 !== 0`, or `[off, off+len]` not within the BIN payload → throw.
- `len` not a multiple of the element size of `type` (so `len/elemSize` is integral) → throw.

**Record level:**
- `count * stride !== len` → throw (`count` is authoritative; no trailing bytes).
- Any field with `offset % elementSize !== 0` (would make a typed-array view illegal) → throw.
- Any field with `offset + count * elementSize > stride` (field escapes its record) → throw.

**Accessor level (lazy, on access):**
- `view`/`bytes`/`records` on an unknown buffer name → throw.
- Cursor arity / unknown-field / out-of-range-index / mismatched-`out` → throw (see §5 cursor rules).

`len: 0` and `count: 0` are valid (empty kern table, empty glyph set).

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
| kern `[u16,u16,i16]` | buffer + `record` (all 2-byte elems → stride 6; buffer slot null-padded to /4) |
| **band section (per-glyph variable)** | opaque `Uint16` buffer (no record) **+ a `bandOffsets` index buffer** (`record`, `Uint32`, count = glyphs+1) giving each glyph's byte range — see below |
| metrics, strokeSets, textureWidth | top-level domain metadata; `kind: 'flatland.slug.font'`, `version` |

`SlugFontLoader` reads one file instead of two; `unpackBaked` is rewritten against the cursor API.

**Why the `bandOffsets` index** (added after the cross-language review, §10): the per-glyph band data is genuinely ragged, so its *inner* layout stays an opaque domain-walked buffer — that part is correct and is the evidence reflection is unnecessary. But shipping it *purely* opaque forces any reader to walk every prior glyph and to parse a prose encoding string to find glyph `i`'s data. A parallel `bandOffsets` record buffer (`prefix` byte offsets into `bands`) makes the outer structure **machine-readable random-access data** instead of English: glyph `i`'s bands are `bands[bandOffsets[i] .. bandOffsets[i+1]]`. The inner `[numH, numV, …]` walk remains documented domain knowledge, but the high-risk "walk-all-prior / parse-the-sentence" hurdle is gone. This is the cheap mitigation that keeps cross-language reuse tractable without building reflection.

---

## 8. Testing

- **Round-trip:** `pack` → `unpack` byte-identical recovery for flat, interleaved, mixed-type, mime, and opaque buffers; empty buffers (`len 0`, `count 0`); multiple buffers with correct 4-byte padding.
- **Byte-exactness / determinism:** the same input produces a byte-identical file across runs; buffer order follows `buffers` key insertion order; assert the magic on disk is bytes `46 4C 50 4B` and a LE-u32 read returns `0x4B504C46`.
- **Alignment invariant:** every buffer's *absolute* offset (not just payload-relative) is `% 4 === 0`; a `Float32Array` view constructed over each `Float32` buffer does not throw; an intentionally mis-aligned field `offset` is rejected at validation.
- **Malformed input (each must throw, per §5 list):** bad magic; `totalLength` over/under `byteLength`; `chunkLen` not /4 or overrunning the file; missing/reordered JSON/BIN; invalid UTF-8 / unparseable JSON; `record`+`mime` together; `off` mis-aligned or out of range; `len` not a multiple of element size; `count*stride !== len`; field `offset` mis-aligned or escaping `stride`. Unknown chunk after BIN must **skip**, not throw.
- **Schema validation:** missing `kind`/`version`/`buffers` rejected; non-integer or `< 1` `version` rejected; `PAK_JSON_SCHEMA` itself validates a known-good metadata object and rejects each malformed case above that is expressible in JSON Schema.
- **Cursor:** field-by-name resolution; offsets resolved **from the file** even when a typed layout is passed; forward-compat both ways — (a) untyped reader reads a buffer whose `record` has extra trailing fields; (b) a v1 typed layout reads a v2 buffer whose stride **grew** and whose fields **reordered**, still correct because byte math uses the file's stride; a removed/retyped field **throws**, not misreads. Arity/unknown-field/out-of-range all throw.
- **Cross-language conformance:** a small set of golden `.flpak` files + their expected decoded values, checked into the repo, so a non-JS implementation can validate against them; round-trip a file produced by the spec's documented byte layout (not just our own writer).
- **Slug equivalence:** the migrated font produces glyph/cmap/kern/band data identical to the current `unpackBaked` output (golden test against an existing baked font).

---

## 9. Open / future (additive, non-breaking)

- **Strings & buffer refs** (`StringRef` / `BufferRef` field types) — when atlas frame-names or animation track-names land.
- **Compressed payload chunk** — if raw vertex/grid data ever dominates transport and gzip/br isn't enough.
- **64-bit offsets / `Float64` types** — only if an asset ever exceeds the 32-bit envelope (would bump buffer alignment to 8 for those buffers).
- **CRC / integrity chunk** — if assets are served over untrusted transport.

Each is reachable through the unknown-chunk skip seam or an additive field, so none forces a `formatVersion` break for existing readers.

---

## 10. Why not FlatBuffers / Protobuf — and the cross-language tradeoff

This was pressure-tested by handing an outside engineer *only* the README, the JSON Schema, and a decoded example `.flpak`, then asking why not just use FlatBuffers/Protobuf. The honest conclusion:

- **vs Protobuf — flpak wins decisively.** Protobuf decodes varints into allocated objects; you would never push a 512 KB texture or 1280 GPU-ready glyph records through it. Disqualified for raw, GPU-bound data.
- **vs FlatBuffers — a tie on the payload that matters.** flpak's assets are texture blobs + flat array-of-structs tables. That is exactly the case where FlatBuffers' nested-table machinery buys nothing and zero-copy is the whole point; both are zero-copy and alignment-correct there. FlatBuffers only pulls ahead on (a) cross-language reader *codegen* (`flatc` emits typed readers in ~12 languages from one `.fbs`) and (b) ragged/variable-length data (a real `[Band]` vector vs our opaque buffer).
- **What flpak buys that FB/PB cost:** no `flatc`/`protoc` build step, no `.fbs`/`.proto` as a competing source of truth, no generated-code bloat, no runtime dependency, and human-readable / diffable / hand-editable JSON metadata. For a one-asset-per-file container consumed primarily by our own TS/WebGPU runtime, that trade is sound.

**The honest cost:** a third party reimplementing in another language hand-writes the reader (header parse, chunk walk, JSON parse, buffer slicing, record walking). The framing is a half-day and the AoS records are mechanical; the JSON Schema validates metadata but generates nothing. This is acceptable *because* cross-language reuse is an occasional interest, not the primary axis — but two conventions keep it tractable and are **required of domain packages** (e.g. slug) that care about cross-language reuse:

1. **No purely-opaque ragged buffers when reuse matters — ship an index.** Pair an opaque variable-length buffer with a `record` offset/index buffer (see slug `bandOffsets`, §7) so the outer structure is random-access data, not a prose encoding string. The inner per-record walk may stay documented domain knowledge.
2. **Publish a `kind`-specific domain JSON Schema + an explicit domain encoding-version.** The container schema covers `kind`/`version`/`buffers`; each domain (`flatland.slug.font`, …) publishes a schema for *its* metadata (`metrics`, `textures`, `bandLayout`, …) and gates readers on a domain encoding-version field, rather than overloading the single monotonic `version`. Ship golden conformance files (§8) so a non-JS implementation validates against known-good bytes.

If full machine-readable ragged data ever becomes a hard cross-language requirement, that is the deferred level-3 path (`StringRef` / `BufferRef` + nested record support, §4/§9) — built only if the index-buffer convention proves insufficient.
