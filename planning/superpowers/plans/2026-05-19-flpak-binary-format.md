# `.flpak` Binary Format — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@three-flatland/pak` — a zero-dependency, GLB-inspired binary container codec — and migrate the `slug` font baker/loader onto it as the proving ground.

**Architecture:** A Layer-0 package (no `three`, no validator deps) with two entry points — `pack()` (Node/CLI side) and `unpack()` (browser+node) — plus a `RecordCursor` for array-of-structs buffers and a TypeScript-only `defineRecord` layout builder. The on-disk format is a 12-byte file header + a JSON metadata chunk + a BIN payload chunk of named, 4-byte-aligned buffers. The published JSON Schema is the language-agnostic metadata contract. Then `slug` replaces its bespoke `{name}.slug.json` + `{name}.slug.bin` pair with a single `{name}.slug.flpak`.

**Tech Stack:** TypeScript, pnpm workspace, tsup (`bundle: false`, esm+cjs+dts), vitest 2.1.8, turbo. No runtime dependencies in `@three-flatland/pak`.

**Spec:** `planning/superpowers/specs/2026-05-19-flpak-binary-format-design.md` — read it before starting. This plan implements that spec; section references (§N) point into it.

---

## File structure

```
packages/pak/
  package.json                 # @three-flatland/pak — zero deps, esm+cjs+dts
  tsup.config.ts               # bundle:false, no externals (pure TS)
  tsconfig.json                # extends ../../tsconfig.base.json
  README.md                    # the format README (framing + how to read)
  src/
    schema.ts                  # PakDataType, PakMetadata, descriptor + record types,
                               #   ELEMENT_SIZE, PakError, PAK_JSON_SCHEMA
    pack.ts                    # pack(metadata, namedBuffers) -> ArrayBuffer
    unpack.ts                  # unpack(buf) -> UnpackedPak (+ all validation)
    records.ts                 # RecordCursor / TypedRecordCursor
    layout.ts                  # defineRecord, f32/i32/.../vec, LayoutType
    index.ts                   # public re-exports
    pack.test.ts
    unpack.test.ts
    records.test.ts
    layout.test.ts
    conformance.test.ts        # golden-file round-trip + cross-language fixtures
    __fixtures__/              # golden .flpak files + expected decoded JSON
```

Slug changes (Phase 2):

```
packages/slug/
  src/baked.ts                 # packBaked/unpackBaked rewritten over @three-flatland/pak
  src/SlugFontLoader.ts        # loads a single .slug.flpak
  src/baked.test.ts            # updated; + equivalence golden test
  src/flatland.slug.font.schema.json   # NEW — domain JSON Schema for slug metadata
  package.json                 # add @three-flatland/pak dependency
```

---

## Constants reference (used verbatim in code)

From spec §2. On-disk byte order is normative; compare via little-endian `uint32`:

| Name | On-disk bytes | LE u32 literal |
|---|---|---|
| `MAGIC` | `46 4C 50 4B` (`FLPK`) | `0x4b504c46` |
| `TYPE_JSON` | `4A 53 4F 4E` (`JSON`) | `0x4e4f534a` |
| `TYPE_BIN` | `42 49 4E 00` (`BIN\0`) | `0x004e4942` |

`FORMAT_VERSION = 1`. Element sizes: `Float32/Int32/Uint32 = 4`, `Uint16/Int16 = 2`, `Uint8/Int8 = 1`.

---

# Phase 1 — `@three-flatland/pak`

## Task 1: Scaffold the package

**Files:**
- Create: `packages/pak/package.json`
- Create: `packages/pak/tsup.config.ts`
- Create: `packages/pak/tsconfig.json`
- Create: `packages/pak/src/index.ts` (temporary stub)

- [ ] **Step 1: Create `packages/pak/package.json`**

```json
{
  "name": "@three-flatland/pak",
  "version": "0.1.0-alpha.0",
  "description": "Zero-copy, 4-byte-aligned binary container for baked GPU-ready assets (.flpak)",
  "type": "module",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./flpak-metadata.schema.json": "./flpak-metadata.schema.json"
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "flpak-metadata.schema.json", "LICENSE", "README.md"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "keywords": ["binary", "container", "glb", "webgpu", "zero-copy", "assets", "flpak"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/thejustinwalsh/three-flatland.git",
    "directory": "packages/pak"
  }
}
```

Note: NO `dependencies`, NO `peerDependencies`. This package is pure TS.

- [ ] **Step 2: Create `packages/pak/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
})
```

- [ ] **Step 3: Create `packages/pak/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create stub `packages/pak/src/index.ts`**

```ts
export {}
```

- [ ] **Step 5: Install + verify the workspace picks up the package**

Run: `pnpm install`
Expected: completes; `@three-flatland/pak` is linked in the workspace. Then `pnpm --filter @three-flatland/pak typecheck` exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/pak/package.json packages/pak/tsup.config.ts packages/pak/tsconfig.json packages/pak/src/index.ts pnpm-lock.yaml
git commit -m "chore(pak): scaffold @three-flatland/pak package"
```

---

## Task 2: Types, element sizes, error type, JSON Schema

**Files:**
- Create: `packages/pak/src/schema.ts`
- Create: `packages/pak/flpak-metadata.schema.json` (copy of the published schema)
- Test: `packages/pak/src/schema.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/pak/src/schema.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { ELEMENT_SIZE, PakError, PAK_JSON_SCHEMA } from './schema'

describe('schema', () => {
  it('element sizes match the spec', () => {
    expect(ELEMENT_SIZE).toEqual({
      Float32: 4, Int32: 4, Uint32: 4, Uint16: 2, Int16: 2, Uint8: 1, Int8: 1,
    })
  })
  it('PakError carries a code', () => {
    const e = new PakError('BAD_MAGIC', 'nope')
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('BAD_MAGIC')
    expect(e.name).toBe('PakError')
  })
  it('PAK_JSON_SCHEMA requires kind/version/buffers', () => {
    expect(PAK_JSON_SCHEMA.required).toEqual(['kind', 'version', 'buffers'])
    expect(PAK_JSON_SCHEMA.$defs.dataType.enum).toContain('Float32')
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/schema.test.ts`
Expected: FAIL — `./schema` has no such exports.

- [ ] **Step 3: Implement `packages/pak/src/schema.ts`**

```ts
export type PakDataType = 'Float32' | 'Int32' | 'Uint32' | 'Uint16' | 'Int16' | 'Uint8' | 'Int8'

export const ELEMENT_SIZE: Record<PakDataType, number> = {
  Float32: 4, Int32: 4, Uint32: 4, Uint16: 2, Int16: 2, Uint8: 1, Int8: 1,
}

export interface PakRecordField {
  name: string
  type: PakDataType
  offset: number
  count: number
  normalized?: boolean
}

export interface PakRecordSchema {
  stride: number
  count: number
  fields: PakRecordField[]
}

export interface PakBufferDescriptor {
  off: number
  len: number
  type: PakDataType
  normalized?: boolean
  record?: PakRecordSchema
  mime?: string
}

export interface PakMetadata {
  kind: string
  version: number
  name?: string
  buffers: Record<string, PakBufferDescriptor>
  [key: string]: unknown
}

export type PakErrorCode =
  | 'BAD_MAGIC' | 'BAD_FORMAT_VERSION' | 'BAD_TOTAL_LENGTH' | 'BAD_CHUNK'
  | 'BAD_JSON' | 'BAD_METADATA' | 'BAD_BUFFER' | 'BAD_RECORD' | 'BAD_ACCESS'

export class PakError extends Error {
  code: PakErrorCode
  constructor(code: PakErrorCode, message: string) {
    super(message)
    this.name = 'PakError'
    this.code = code
  }
}

// Published verbatim as ./flpak-metadata.schema.json (Task 2 Step 5). Keep in sync.
export const PAK_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://three-flatland.dev/schema/flpak-metadata.json',
  title: 'FlatlandPackageMetadata',
  type: 'object',
  required: ['kind', 'version', 'buffers'],
  additionalProperties: true,
  properties: {
    kind: { type: 'string', minLength: 1 },
    version: { type: 'integer', minimum: 1 },
    name: { type: 'string' },
    buffers: { type: 'object', additionalProperties: { $ref: '#/$defs/buffer' } },
  },
  $defs: {
    dataType: { enum: ['Float32', 'Int32', 'Uint32', 'Uint16', 'Int16', 'Uint8', 'Int8'] },
    buffer: {
      type: 'object',
      required: ['off', 'len', 'type'],
      not: { required: ['record', 'mime'] },
      properties: {
        off: { type: 'integer', minimum: 0, multipleOf: 4 },
        len: { type: 'integer', minimum: 0 },
        type: { $ref: '#/$defs/dataType' },
        normalized: { type: 'boolean' },
        mime: { type: 'string' },
        record: { $ref: '#/$defs/record' },
      },
    },
    record: {
      type: 'object',
      required: ['stride', 'count', 'fields'],
      properties: {
        stride: { type: 'integer', minimum: 1 },
        count: { type: 'integer', minimum: 0 },
        fields: { type: 'array', items: { $ref: '#/$defs/field' }, minItems: 1 },
      },
    },
    field: {
      type: 'object',
      required: ['name', 'type', 'offset', 'count'],
      properties: {
        name: { type: 'string', minLength: 1 },
        type: { $ref: '#/$defs/dataType' },
        offset: { type: 'integer', minimum: 0 },
        count: { type: 'integer', minimum: 1 },
        normalized: { type: 'boolean' },
      },
    },
  },
} as const
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `packages/pak/flpak-metadata.schema.json`** — copy the object literal from `PAK_JSON_SCHEMA` (Step 3) as standalone JSON (drop `as const`, valid JSON). This is the published artifact.

- [ ] **Step 6: Commit**

```bash
git add packages/pak/src/schema.ts packages/pak/src/schema.test.ts packages/pak/flpak-metadata.schema.json
git commit -m "feat(pak): metadata types, element sizes, PakError, published JSON Schema"
```

---

## Task 3: `pack()`

**Files:**
- Create: `packages/pak/src/pack.ts`
- Test: `packages/pak/src/pack.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/pak/src/pack.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { pack } from './pack'

const MAGIC_LE = 0x4b504c46
const TYPE_JSON_LE = 0x4e4f534a
const TYPE_BIN_LE = 0x004e4942

describe('pack', () => {
  it('writes a valid header + JSON + BIN with little-endian magic', () => {
    const data = new Float32Array([1, 2, 3, 4])
    const buf = pack({ kind: 'test', version: 1 }, { a: data })
    const dv = new DataView(buf)
    expect(dv.getUint32(0, true)).toBe(MAGIC_LE)
    expect(dv.getUint32(4, true)).toBe(1)              // formatVersion
    expect(dv.getUint32(8, true)).toBe(buf.byteLength) // totalLength
    const jsonLen = dv.getUint32(12, true)
    expect(dv.getUint32(16, true)).toBe(TYPE_JSON_LE)
    expect(jsonLen % 4).toBe(0)
    const binHeaderOff = 20 + jsonLen
    expect(dv.getUint32(binHeaderOff + 4, true)).toBe(TYPE_BIN_LE)
  })

  it('infers type, computes off/len, lays buffers in insertion order, 4-byte aligns', () => {
    const a = new Uint16Array([1, 2, 3])           // 6 bytes -> padded to 8
    const b = new Float32Array([9])                 // 4 bytes
    const buf = pack({ kind: 't', version: 1 }, { a, b })
    const json = readJson(buf)
    expect(json.buffers.a).toMatchObject({ off: 0, len: 6, type: 'Uint16' })
    expect(json.buffers.b).toMatchObject({ off: 8, len: 4, type: 'Float32' }) // a padded 6->8
  })

  it('bare ArrayBuffer / DataView default to Uint8', () => {
    const ab = new ArrayBuffer(4)
    const buf = pack({ kind: 't', version: 1 }, { raw: ab })
    expect(readJson(buf).buffers.raw.type).toBe('Uint8')
  })

  it('byte-identical across runs for the same input', () => {
    const input = { a: new Float32Array([1, 2]), b: new Uint8Array([7, 8, 9]) }
    const x = pack({ kind: 't', version: 1 }, { ...input })
    const y = pack({ kind: 't', version: 1 }, { ...input })
    expect(new Uint8Array(x)).toEqual(new Uint8Array(y))
  })

  it('throws when a buffer sets both record and mime', () => {
    expect(() =>
      pack({ kind: 't', version: 1 }, {
        bad: { data: new Uint8Array(4), mime: 'image/png',
          record: { stride: 4, count: 1, fields: [{ name: 'x', type: 'Uint8', offset: 0, count: 4 }] } },
      }),
    ).toThrow(/record.*mime|mime.*record/i)
  })

  it('throws when required metadata is missing', () => {
    // @ts-expect-error missing version
    expect(() => pack({ kind: 't' }, { a: new Uint8Array(4) })).toThrow()
  })
})

function readJson(buf: ArrayBuffer): any {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)))
}
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/pack.test.ts`
Expected: FAIL — no `pack`.

- [ ] **Step 3: Implement `packages/pak/src/pack.ts`**

```ts
import {
  ELEMENT_SIZE, PakError,
  type PakBufferDescriptor, type PakDataType, type PakMetadata, type PakRecordSchema,
} from './schema'

const MAGIC_LE = 0x4b504c46
const TYPE_JSON_LE = 0x4e4f534a
const TYPE_BIN_LE = 0x004e4942
const FORMAT_VERSION = 1

export type PakInput =
  | ArrayBuffer
  | ArrayBufferView
  | { data: ArrayBuffer | ArrayBufferView; record?: PakRecordSchema; mime?: string; normalized?: boolean }

export type NamedBuffers = Record<string, PakInput>

function inferType(v: ArrayBuffer | ArrayBufferView): PakDataType {
  if (v instanceof Float32Array) return 'Float32'
  if (v instanceof Int32Array) return 'Int32'
  if (v instanceof Uint32Array) return 'Uint32'
  if (v instanceof Uint16Array) return 'Uint16'
  if (v instanceof Int16Array) return 'Int16'
  if (v instanceof Int8Array) return 'Int8'
  return 'Uint8' // Uint8Array, Uint8ClampedArray, DataView, bare ArrayBuffer
}

function toBytes(v: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  return new Uint8Array(v)
}

const pad4 = (n: number): number => (n + 3) & ~3

export function pack(metadata: Omit<PakMetadata, 'buffers'>, namedBuffers: NamedBuffers): ArrayBuffer {
  if (typeof metadata?.kind !== 'string' || metadata.kind.length === 0)
    throw new PakError('BAD_METADATA', 'metadata.kind (non-empty string) is required')
  if (!Number.isInteger(metadata.version) || metadata.version < 1)
    throw new PakError('BAD_METADATA', 'metadata.version (integer >= 1) is required')

  const buffers: Record<string, PakBufferDescriptor> = {}
  const slices: Uint8Array[] = []
  let cursor = 0

  for (const [name, input] of Object.entries(namedBuffers)) {
    const isOpts =
      input != null && typeof input === 'object' && 'data' in input && !ArrayBuffer.isView(input)
    const raw = isOpts ? (input as any).data : (input as ArrayBuffer | ArrayBufferView)
    const record: PakRecordSchema | undefined = isOpts ? (input as any).record : undefined
    const mime: string | undefined = isOpts ? (input as any).mime : undefined
    const normalized: boolean | undefined = isOpts ? (input as any).normalized : undefined
    if (record && mime)
      throw new PakError('BAD_BUFFER', `buffer "${name}" sets both record and mime`)

    const bytes = toBytes(raw)
    const desc: PakBufferDescriptor = { off: cursor, len: bytes.byteLength, type: inferType(raw) }
    if (normalized) desc.normalized = true
    if (record) desc.record = record
    if (mime) desc.mime = mime
    buffers[name] = desc

    slices.push(bytes)
    const padded = pad4(bytes.byteLength)
    if (padded > bytes.byteLength) slices.push(new Uint8Array(padded - bytes.byteLength))
    cursor += padded
  }

  const binBytes = cursor
  let json = JSON.stringify({ ...metadata, buffers })
  json = json.padEnd(pad4(json.length), ' ')
  const jsonBytes = new TextEncoder().encode(json)

  const total = 12 + 8 + jsonBytes.byteLength + 8 + binBytes
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)

  dv.setUint32(0, MAGIC_LE, true)
  dv.setUint32(4, FORMAT_VERSION, true)
  dv.setUint32(8, total, true)
  let o = 12
  dv.setUint32(o, jsonBytes.byteLength, true); dv.setUint32(o + 4, TYPE_JSON_LE, true); o += 8
  u8.set(jsonBytes, o); o += jsonBytes.byteLength
  dv.setUint32(o, binBytes, true); dv.setUint32(o + 4, TYPE_BIN_LE, true); o += 8
  for (const s of slices) { u8.set(s, o); o += s.byteLength }

  return out
}
```

Note: `json.padEnd(pad4(json.length), ' ')` is safe because JSON is ASCII-safe except for non-ASCII string content; metadata keys/values here are ASCII. If a domain ships non-ASCII `name`, switch to byte-length padding: encode first, then pad the `Uint8Array` with `0x20`. Add that refinement in Step 5.

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/pack.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Harden JSON padding for non-ASCII** — replace the two padding lines with byte-accurate padding:

```ts
  const jsonRaw = new TextEncoder().encode(JSON.stringify({ ...metadata, buffers }))
  const jsonPadded = pad4(jsonRaw.byteLength)
  const jsonBytes = new Uint8Array(jsonPadded)
  jsonBytes.set(jsonRaw, 0)
  jsonBytes.fill(0x20, jsonRaw.byteLength) // trailing spaces after the complete JSON value
```

Add a test: a metadata `name` with a non-ASCII char (e.g. `'café'`) still round-trips and the BIN header stays 4-aligned. Run the suite again; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/pak/src/pack.ts packages/pak/src/pack.test.ts
git commit -m "feat(pak): pack() — framing, type inference, 4-byte alignment, determinism"
```

---

## Task 4: `unpack()` + view/bytes accessors + full validation

**Files:**
- Create: `packages/pak/src/unpack.ts`
- Test: `packages/pak/src/unpack.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/pak/src/unpack.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { pack } from './pack'
import { unpack } from './unpack'
import { PakError } from './schema'

describe('unpack', () => {
  it('round-trips flat buffers zero-copy', () => {
    const a = new Float32Array([1.5, 2.5, 3.5])
    const b = new Uint16Array([10, 20])
    const u = unpack(pack({ kind: 't', version: 2, name: 'x' }, { a, b }))
    expect(u.metadata.kind).toBe('t')
    expect(u.metadata.version).toBe(2)
    expect(Array.from(u.view('a') as Float32Array)).toEqual([1.5, 2.5, 3.5])
    expect(Array.from(u.view('b') as Uint16Array)).toEqual([10, 20])
    expect(u.has('a')).toBe(true)
    expect(u.has('nope')).toBe(false)
  })

  it('returns raw bytes and constructs aligned Float32 views', () => {
    const u = unpack(pack({ kind: 't', version: 1 }, { a: new Float32Array([7]) }))
    expect(u.bytes('a').byteLength).toBe(4)
    expect(() => u.view('a')).not.toThrow() // absolute offset is 4-aligned
  })

  it('empty buffer (len 0) is valid', () => {
    const u = unpack(pack({ kind: 't', version: 1 }, { e: new Uint16Array([]) }))
    expect(u.view('e').byteLength).toBe(0)
  })

  it.each([
    ['bad magic', (b: Uint8Array) => (b[0] = 0)],
    ['bad totalLength', (b: Uint8Array) => (b[8] = (b[8]! + 1) & 0xff)],
  ])('throws PakError on %s', (_label, corrupt) => {
    const buf = pack({ kind: 't', version: 1 }, { a: new Float32Array([1]) })
    const bytes = new Uint8Array(buf)
    corrupt(bytes)
    expect(() => unpack(bytes.buffer)).toThrow(PakError)
  })

  it('throws on unknown buffer name', () => {
    const u = unpack(pack({ kind: 't', version: 1 }, { a: new Float32Array([1]) }))
    expect(() => u.view('ghost')).toThrow(PakError)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/unpack.test.ts`
Expected: FAIL — no `unpack`.

- [ ] **Step 3: Implement `packages/pak/src/unpack.ts`**

```ts
import {
  ELEMENT_SIZE, PakError,
  type PakBufferDescriptor, type PakDataType, type PakMetadata,
} from './schema'
import { RecordCursor, makeCursor } from './records'

const MAGIC_LE = 0x4b504c46
const TYPE_JSON_LE = 0x4e4f534a
const TYPE_BIN_LE = 0x004e4942
const SUPPORTED_FORMAT_VERSION = 1

const VIEW_CTORS: Record<PakDataType, any> = {
  Float32: Float32Array, Int32: Int32Array, Uint32: Uint32Array,
  Uint16: Uint16Array, Int16: Int16Array, Uint8: Uint8Array, Int8: Int8Array,
}

export interface UnpackedPak {
  metadata: PakMetadata
  has(name: string): boolean
  view(name: string): ArrayBufferView
  bytes(name: string): Uint8Array
  records(name: string): RecordCursor
}

export function unpack(buf: ArrayBuffer): UnpackedPak {
  const dv = new DataView(buf)
  if (buf.byteLength < 20) throw new PakError('BAD_CHUNK', 'file too small')
  if (dv.getUint32(0, true) !== MAGIC_LE) throw new PakError('BAD_MAGIC', 'not a .flpak file')
  const formatVersion = dv.getUint32(4, true)
  if (formatVersion > SUPPORTED_FORMAT_VERSION)
    throw new PakError('BAD_FORMAT_VERSION', `formatVersion ${formatVersion} unsupported`)
  const total = dv.getUint32(8, true)
  if (total !== buf.byteLength) throw new PakError('BAD_TOTAL_LENGTH', 'totalLength != byteLength')

  // Walk chunks. First must be JSON, second must be BIN.
  let o = 12
  const readChunk = (expect: number, label: string) => {
    if (o + 8 > total) throw new PakError('BAD_CHUNK', `${label} chunk header past EOF`)
    const len = dv.getUint32(o, true)
    const type = dv.getUint32(o + 4, true)
    if (type !== expect) throw new PakError('BAD_CHUNK', `expected ${label} chunk`)
    if (len % 4 !== 0) throw new PakError('BAD_CHUNK', `${label} chunkLen not /4`)
    const start = o + 8
    if (start + len > total) throw new PakError('BAD_CHUNK', `${label} chunk overruns file`)
    o = start + len
    return { start, len }
  }

  const jsonChunk = readChunk(TYPE_JSON_LE, 'JSON')
  const binChunk = readChunk(TYPE_BIN_LE, 'BIN')
  // (any further chunks are simply ignored)

  let metadata: PakMetadata
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(buf, jsonChunk.start, jsonChunk.len),
    )
    metadata = JSON.parse(text)
  } catch (e) {
    throw new PakError('BAD_JSON', `JSON chunk not valid UTF-8/JSON: ${(e as Error).message}`)
  }
  validateMetadata(metadata)

  const binStart = binChunk.start
  const binLen = binChunk.len
  for (const [name, d] of Object.entries(metadata.buffers)) validateBuffer(name, d, binLen)

  const desc = (name: string): PakBufferDescriptor => {
    const d = metadata.buffers[name]
    if (!d) throw new PakError('BAD_ACCESS', `no buffer "${name}"`)
    return d
  }

  return {
    metadata,
    has: (name) => name in metadata.buffers,
    bytes: (name) => {
      const d = desc(name)
      return new Uint8Array(buf, binStart + d.off, d.len)
    },
    view: (name) => {
      const d = desc(name)
      const Ctor = VIEW_CTORS[d.type]
      return new Ctor(buf, binStart + d.off, d.len / ELEMENT_SIZE[d.type])
    },
    records: (name) => makeCursor(buf, binStart, desc(name), name),
  }
}

function validateMetadata(m: PakMetadata): void {
  if (typeof m?.kind !== 'string' || m.kind.length === 0)
    throw new PakError('BAD_METADATA', 'missing kind')
  if (!Number.isInteger(m.version) || (m.version as number) < 1)
    throw new PakError('BAD_METADATA', 'version must be integer >= 1')
  if (m.buffers == null || typeof m.buffers !== 'object')
    throw new PakError('BAD_METADATA', 'missing buffers')
}

function validateBuffer(name: string, d: PakBufferDescriptor, binLen: number): void {
  if (d.record && d.mime) throw new PakError('BAD_BUFFER', `"${name}": record and mime`)
  const size = ELEMENT_SIZE[d.type]
  if (size == null) throw new PakError('BAD_BUFFER', `"${name}": bad type ${d.type}`)
  if (d.off % 4 !== 0) throw new PakError('BAD_BUFFER', `"${name}": off not /4`)
  if (d.off < 0 || d.off + d.len > binLen) throw new PakError('BAD_BUFFER', `"${name}": out of range`)
  if (d.len % size !== 0) throw new PakError('BAD_BUFFER', `"${name}": len not multiple of ${size}`)
  if (d.record) validateRecord(name, d, size)
}

function validateRecord(name: string, d: PakBufferDescriptor, _size: number): void {
  const r = d.record!
  if (r.stride <= 0) throw new PakError('BAD_RECORD', `"${name}": stride <= 0`)
  if (r.count * r.stride !== d.len)
    throw new PakError('BAD_RECORD', `"${name}": count*stride (${r.count * r.stride}) != len (${d.len})`)
  for (const f of r.fields) {
    const fs = ELEMENT_SIZE[f.type]
    if (fs == null) throw new PakError('BAD_RECORD', `"${name}.${f.name}": bad type`)
    if (f.offset % fs !== 0) throw new PakError('BAD_RECORD', `"${name}.${f.name}": offset not /${fs}`)
    if (f.offset + f.count * fs > r.stride)
      throw new PakError('BAD_RECORD', `"${name}.${f.name}": escapes stride`)
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/unpack.test.ts`
Expected: PASS. (Note: `records.ts` is created in Task 5; until then, stub `makeCursor`/`RecordCursor` in `records.ts` with a throwing body so `unpack.ts` compiles. Do that stub now:)

```ts
// packages/pak/src/records.ts (temporary stub — replaced in Task 5)
import type { PakBufferDescriptor } from './schema'
export interface RecordCursor { readonly count: number }
export function makeCursor(_b: ArrayBuffer, _s: number, _d: PakBufferDescriptor, _n: string): RecordCursor {
  throw new Error('not implemented')
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/pak/src/unpack.ts packages/pak/src/unpack.test.ts packages/pak/src/records.ts
git commit -m "feat(pak): unpack() — chunk walk, full validation, zero-copy accessors"
```

---

## Task 5: `RecordCursor` (untyped)

**Files:**
- Modify: `packages/pak/src/records.ts` (replace the stub)
- Test: `packages/pak/src/records.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/pak/src/records.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { pack } from './pack'
import { unpack } from './unpack'
import { PakError } from './schema'

const glyphRecord = {
  stride: 12, count: 2,
  fields: [
    { name: 'id', type: 'Uint32' as const, offset: 0, count: 1 },
    { name: 'uv', type: 'Float32' as const, offset: 4, count: 2 },
  ],
}

function build() {
  const buf = new ArrayBuffer(24)
  const dv = new DataView(buf)
  dv.setUint32(0, 100, true); dv.setFloat32(4, 0.5, true); dv.setFloat32(8, 0.25, true)
  dv.setUint32(12, 200, true); dv.setFloat32(16, 0.1, true); dv.setFloat32(20, 0.2, true)
  return unpack(pack({ kind: 't', version: 1 }, { glyphs: { data: buf, record: glyphRecord } }))
}

describe('RecordCursor', () => {
  it('reads scalar and vector fields by name', () => {
    const c = build().records('glyphs')
    expect(c.count).toBe(2)
    expect(c.get(0, 'id')).toBe(100)
    expect(c.get(1, 'id')).toBe(200)
    expect(Array.from(c.getArray(0, 'uv'))).toEqual([0.5, 0.25])
    expect(Array.from(c.getArray(1, 'uv'))).toEqual([0.1, 0.2])
  })
  it('throws on arity / unknown field / out of range', () => {
    const c = build().records('glyphs')
    expect(() => c.get(0, 'uv')).toThrow(PakError)       // vector via scalar getter
    expect(() => c.getArray(0, 'id')).toThrow(PakError)  // scalar via vector getter
    expect(() => c.get(0, 'nope')).toThrow(PakError)
    expect(() => c.get(99, 'id')).toThrow(PakError)
  })
  it('records() on a buffer without a record throws', () => {
    const u = unpack(pack({ kind: 't', version: 1 }, { flat: new Uint8Array([1, 2, 3, 4]) }))
    expect(() => u.records('flat')).toThrow(PakError)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/records.test.ts`
Expected: FAIL — stub throws "not implemented".

- [ ] **Step 3: Implement `packages/pak/src/records.ts`** (replace the stub)

```ts
import { ELEMENT_SIZE, PakError, type PakBufferDescriptor, type PakDataType, type PakRecordField } from './schema'

const READERS: Record<PakDataType, (dv: DataView, o: number) => number> = {
  Float32: (dv, o) => dv.getFloat32(o, true),
  Int32: (dv, o) => dv.getInt32(o, true),
  Uint32: (dv, o) => dv.getUint32(o, true),
  Uint16: (dv, o) => dv.getUint16(o, true),
  Int16: (dv, o) => dv.getInt16(o, true),
  Uint8: (dv, o) => dv.getUint8(o),
  Int8: (dv, o) => dv.getInt8(o),
}
const VIEW_CTORS: Record<PakDataType, any> = {
  Float32: Float32Array, Int32: Int32Array, Uint32: Uint32Array,
  Uint16: Uint16Array, Int16: Int16Array, Uint8: Uint8Array, Int8: Int8Array,
}

export interface RecordCursor {
  readonly count: number
  get(index: number, field: string): number
  getArray(index: number, field: string, out?: ArrayBufferView): ArrayBufferView
}

export function makeCursor(
  buf: ArrayBuffer, binStart: number, d: PakBufferDescriptor, name: string,
): RecordCursor {
  const r = d.record
  if (!r) throw new PakError('BAD_ACCESS', `buffer "${name}" has no record schema`)
  const base = binStart + d.off
  const dv = new DataView(buf)
  const byName = new Map<string, PakRecordField>(r.fields.map((f) => [f.name, f]))

  const field = (fname: string): PakRecordField => {
    const f = byName.get(fname)
    if (!f) throw new PakError('BAD_ACCESS', `"${name}": no field "${fname}"`)
    return f
  }
  const checkIndex = (i: number) => {
    if (!Number.isInteger(i) || i < 0 || i >= r.count)
      throw new PakError('BAD_ACCESS', `"${name}": index ${i} out of range [0,${r.count})`)
  }

  return {
    count: r.count,
    get(index, fname) {
      checkIndex(index)
      const f = field(fname)
      if (f.count !== 1) throw new PakError('BAD_ACCESS', `"${name}.${fname}": use getArray (count ${f.count})`)
      return READERS[f.type](dv, base + index * r.stride + f.offset)
    },
    getArray(index, fname, out) {
      checkIndex(index)
      const f = field(fname)
      if (f.count === 1) throw new PakError('BAD_ACCESS', `"${name}.${fname}": use get (scalar)`)
      const off = base + index * r.stride + f.offset
      if (out) {
        if (out.constructor !== VIEW_CTORS[f.type] || (out as any).length !== f.count)
          throw new PakError('BAD_ACCESS', `"${name}.${fname}": out buffer mismatch`)
        const reader = READERS[f.type]
        for (let k = 0; k < f.count; k++) (out as any)[k] = reader(dv, off + k * ELEMENT_SIZE[f.type])
        return out
      }
      return new VIEW_CTORS[f.type](buf, off, f.count)
    },
  }
}
```

Note the alignment subtlety: `new VIEW_CTORS[f.type](buf, off, f.count)` requires `off` to be a multiple of the element size. The §4 validation (`field.offset % elementSize === 0` plus 4-byte buffer alignment) guarantees this for fields whose element size ≤ buffer alignment. For a `Float32` field at an `off` not divisible by 4 the constructor would throw — which is exactly why `validateRecord` rejects mis-aligned field offsets. Covered by Task 7.

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/records.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pak/src/records.ts packages/pak/src/records.test.ts
git commit -m "feat(pak): RecordCursor — name-resolved, allocation-light, arity-checked"
```

---

## Task 6: `defineRecord` layout builder + typed cursor

**Files:**
- Create: `packages/pak/src/layout.ts`
- Modify: `packages/pak/src/records.ts` (add `TypedRecordCursor` + typed `records` overload support)
- Modify: `packages/pak/src/unpack.ts` (add typed `records` overload)
- Test: `packages/pak/src/layout.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/pak/src/layout.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { defineRecord, f32, u32, u8, vec } from './layout'
import { pack } from './pack'
import { unpack } from './unpack'

describe('defineRecord', () => {
  it('computes stride + offsets with natural alignment', () => {
    const R = defineRecord({ id: u32, flags: u8, color: vec(u8, 4) })
    expect(R.schema.stride).toBe(12) // id@0(4), flags@4(1), color@5(4); pad to max elem size 4
    const byName = Object.fromEntries(R.schema.fields.map((f) => [f.name, f]))
    expect(byName.id).toMatchObject({ offset: 0, type: 'Uint32', count: 1 })
    expect(byName.flags).toMatchObject({ offset: 4, type: 'Uint8', count: 1 })
    expect(byName.color).toMatchObject({ offset: 5, type: 'Uint8', count: 4 })
  })

  it('all-f32 record needs no padding', () => {
    const R = defineRecord({ a: f32, b: vec(f32, 4) })
    expect(R.schema.stride).toBe(20)
  })

  it('reads back through a typed cursor (offsets from file)', () => {
    const Glyph = defineRecord({ id: u32, uv: vec(f32, 2) }) // stride 12
    const buf = new ArrayBuffer(12)
    const dv = new DataView(buf)
    dv.setUint32(0, 42, true); dv.setFloat32(4, 1, true); dv.setFloat32(8, 2, true)
    const u = unpack(pack({ kind: 't', version: 1 }, { g: { data: buf, record: Glyph.schema } }))
    const c = u.records('g', Glyph)
    expect(c.get(0, 'id')).toBe(42)
    expect(Array.from(c.getArray(0, 'uv'))).toEqual([1, 2])
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/layout.test.ts`
Expected: FAIL — no `layout` exports.

- [ ] **Step 3: Implement `packages/pak/src/layout.ts`**

```ts
import { ELEMENT_SIZE, type PakDataType, type PakRecordSchema } from './schema'

export interface FieldSpec { type: PakDataType; count: number }

export const f32: FieldSpec = { type: 'Float32', count: 1 }
export const i32: FieldSpec = { type: 'Int32', count: 1 }
export const u32: FieldSpec = { type: 'Uint32', count: 1 }
export const u16: FieldSpec = { type: 'Uint16', count: 1 }
export const i16: FieldSpec = { type: 'Int16', count: 1 }
export const u8: FieldSpec = { type: 'Uint8', count: 1 }
export const i8: FieldSpec = { type: 'Int8', count: 1 }
export const vec = (spec: FieldSpec, n: number): FieldSpec => ({ type: spec.type, count: n })

export type RecordLayoutSpec = Record<string, FieldSpec>

export interface RecordLayout<S extends RecordLayoutSpec = RecordLayoutSpec> {
  schema: PakRecordSchema
  spec: S
}

// Decoded TS type: scalar field -> number; vector field -> number[]
export type LayoutType<L extends RecordLayout> = {
  [K in keyof L['spec']]: L['spec'][K]['count'] extends 1 ? number : number[]
}

const alignUp = (n: number, a: number): number => (n + (a - 1)) & ~(a - 1)

export function defineRecord<S extends RecordLayoutSpec>(spec: S): RecordLayout<S> {
  let offset = 0
  let maxElem = 1
  const fields = Object.entries(spec).map(([name, fs]) => {
    const size = ELEMENT_SIZE[fs.type]
    offset = alignUp(offset, size)
    const field = { name, type: fs.type, offset, count: fs.count }
    offset += size * fs.count
    if (size > maxElem) maxElem = size
    return field
  })
  const stride = alignUp(offset, maxElem)
  return { schema: { stride, count: 0, fields }, spec }
}
```

Note: `schema.count` is `0` in the layout (the writer fills the real count when packing, since `pack` derives `len`; `unpack` reads `count` from the file). When passing `Glyph.schema` to `pack`, set `count` from the data: `{ ...Glyph.schema, count: n }`. Add a helper in Step 5.

- [ ] **Step 4: Add typed cursor support** — in `packages/pak/src/records.ts` add:

```ts
import type { RecordLayout, LayoutType } from './layout'

export interface TypedRecordCursor<L extends RecordLayout> {
  readonly count: number
  get(index: number, field: keyof L['spec'] & string): number
  getArray(index: number, field: keyof L['spec'] & string, out?: ArrayBufferView): ArrayBufferView
  decode(index: number): LayoutType<L>
}
```

In `makeCursor`, accept an optional `layout?: RecordLayout`. When provided, assert each `layout.spec` field exists in the file's `record` with matching `type`/`count`, throwing `BAD_ACCESS` on mismatch — **but resolve all byte math from the file's `record` (`d.record`), never from the layout** (spec §5: typed cursor offsets come from the file). Add a `decode(i)` that returns a plain object per `LayoutType`. Then in `unpack.ts` add the overload:

```ts
records(name: string): RecordCursor
records<L extends RecordLayout>(name: string, layout: L): TypedRecordCursor<L>
```

both delegating to `makeCursor(buf, binStart, desc(name), name, layout)`.

- [ ] **Step 5: Add `recordFor(layout, count)` helper** to `layout.ts`:

```ts
export function recordFor<L extends RecordLayout>(layout: L, count: number): PakRecordSchema {
  return { ...layout.schema, count }
}
```

Update the layout test's pack call to use it where a count is needed; verify the typed cursor test still reads offsets correctly even if you pass a layout whose `stride` you artificially change (prove offsets come from the file, not the layout — spec §5). Add that assertion.

- [ ] **Step 6: Run tests, verify pass**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/layout.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/pak/src/layout.ts packages/pak/src/records.ts packages/pak/src/unpack.ts packages/pak/src/layout.test.ts
git commit -m "feat(pak): defineRecord builder + typed cursor (offsets resolved from file)"
```

---

## Task 7: Validation completeness + public exports

**Files:**
- Create: `packages/pak/src/validation.test.ts`
- Modify: `packages/pak/src/index.ts`

- [ ] **Step 1: Write the validation matrix test** — `packages/pak/src/validation.test.ts`

One `it` per spec-§5 malformed case (each must throw `PakError` with the right `code`). Build a valid file, corrupt one thing, assert throw:

```ts
import { describe, it, expect } from 'vitest'
import { pack } from './pack'
import { unpack } from './unpack'
import { PakError } from './schema'

function patchJson(buf: ArrayBuffer, mutate: (m: any) => void): ArrayBuffer {
  // decode JSON chunk, mutate, re-encode at same padded length if possible, else rebuild via pack
  const dv = new DataView(buf); const jsonLen = dv.getUint32(12, true)
  const m = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)))
  mutate(m)
  // simplest: rebuild a fresh file carrying the mutated buffers map by hand-writing bytes is complex;
  // for these tests, construct invalid metadata directly through a low-level writer helper exported for tests.
  throw new Error('use buildRaw helper')
}
```

Because corrupting JSON-in-place is fiddly, export a **test-only low-level writer** `__writeRaw(metadata, binBytes)` from `pack.ts` (guarded by a comment "test surface") that writes arbitrary metadata + bin without the validation `pack` does, so you can produce malformed files. Then assert each:

```ts
it.each([
  ['count*stride != len', () => makeBadRecord({ count: 3 }), 'BAD_RECORD'],
  ['field offset escapes stride', () => makeBadRecord({ fieldOffset: 10 }), 'BAD_RECORD'],
  ['field offset mis-aligned', () => makeBadFieldAlign(), 'BAD_RECORD'],
  ['off not /4', () => makeBadOff(), 'BAD_BUFFER'],
  ['off+len out of range', () => makeBadRange(), 'BAD_BUFFER'],
  ['len not multiple of elem', () => makeBadLen(), 'BAD_BUFFER'],
  ['record + mime', () => makeRecordAndMime(), 'BAD_BUFFER'],
  ['version < 1', () => makeBadVersion(), 'BAD_METADATA'],
])('throws %s', (_l, build, code) => {
  try { unpack(build()); throw new Error('did not throw') }
  catch (e) { expect(e).toBeInstanceOf(PakError); expect((e as PakError).code).toBe(code) }
})
```

Implement each `makeBad*` with `__writeRaw`. (The engineer writes these helpers using `__writeRaw`; each produces a file with exactly one invalid property.)

- [ ] **Step 2: Run, verify fail** (helpers/`__writeRaw` not present)

Run: `pnpm --filter @three-flatland/pak exec vitest run src/validation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add `__writeRaw` to `pack.ts`** — a minimal writer that takes a full `PakMetadata` (with `buffers` already populated) and a `Uint8Array` BIN payload, and emits the framed file with NO validation. Reuse the framing code from `pack` (extract a private `frame(metadata, binBytes)` and have both `pack` and `__writeRaw` call it). Implement the `makeBad*` helpers in the test.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/validation.test.ts`
Expected: PASS (8 cases).

- [ ] **Step 5: Public exports** — `packages/pak/src/index.ts`

```ts
export { pack, type NamedBuffers, type PakInput } from './pack'
export { unpack, type UnpackedPak } from './unpack'
export { type RecordCursor, type TypedRecordCursor } from './records'
export {
  defineRecord, recordFor, vec, f32, i32, u32, u16, i16, u8, i8,
  type RecordLayout, type LayoutType, type FieldSpec,
} from './layout'
export {
  PAK_JSON_SCHEMA, PakError, ELEMENT_SIZE,
  type PakMetadata, type PakBufferDescriptor, type PakRecordSchema,
  type PakRecordField, type PakDataType, type PakErrorCode,
} from './schema'
```

- [ ] **Step 6: Full build + typecheck + test**

Run: `pnpm --filter @three-flatland/pak build && pnpm --filter @three-flatland/pak typecheck && pnpm --filter @three-flatland/pak exec vitest run`
Expected: build emits `dist/`, typecheck 0 errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/pak/src/validation.test.ts packages/pak/src/pack.ts packages/pak/src/index.ts
git commit -m "feat(pak): exhaustive validation matrix + public API surface"
```

---

## Task 8: Golden conformance fixtures + README

**Files:**
- Create: `packages/pak/src/__fixtures__/*.flpak` + `*.expected.json`
- Create: `packages/pak/src/conformance.test.ts`
- Create: `packages/pak/README.md`

- [ ] **Step 1: Generate golden fixtures** — write a one-off script (or a `beforeAll`) that `pack`s a known input covering flat + interleaved + mixed-type + mime + opaque buffers, writes the bytes to `__fixtures__/sample.flpak`, and writes the expected decoded values to `sample.expected.json`. Commit the bytes.

- [ ] **Step 2: Write the conformance test** — `conformance.test.ts` reads each `*.flpak` fixture from disk, `unpack`s it, and asserts the decoded values match the sibling `*.expected.json`. This is the file a non-JS implementation validates against. Assert: magic bytes on disk are `46 4C 50 4B`; first record's fields decode to expected numbers.

- [ ] **Step 3: Run, verify pass**

Run: `pnpm --filter @three-flatland/pak exec vitest run src/conformance.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `packages/pak/README.md`** — the format README (framing, constants, byte accounting, how-to-read, metadata, record schema, validation rules). Source it from spec §2/§4 + the cross-language §10 conventions. This README is the human-readable half of the cross-language contract.

- [ ] **Step 5: Commit**

```bash
git add packages/pak/src/__fixtures__ packages/pak/src/conformance.test.ts packages/pak/README.md
git commit -m "test(pak): golden conformance fixtures + format README"
```

---

# Phase 2 — Slug migration (the validation case)

> Read `packages/slug/src/baked.ts` end-to-end first — it is the bespoke format being replaced. The migration must produce glyph/cmap/kern/band data byte-equivalent in *meaning* to the current `unpackBaked` output (golden test in Task 11).

## Task 9: Slug depends on pak; rewrite `packBaked` over `pack()`

**Files:**
- Modify: `packages/slug/package.json` (add dependency)
- Modify: `packages/slug/src/baked.ts`
- Modify: `packages/slug/src/baked.test.ts`

- [ ] **Step 1: Add the dependency** — `packages/slug/package.json` `dependencies`:

```json
"@three-flatland/pak": "workspace:*"
```

Run: `pnpm install`. Expected: linked.

- [ ] **Step 2: Write the failing test** — extend `packages/slug/src/baked.test.ts`:

```ts
import { unpack } from '@three-flatland/pak'

it('packBaked emits a valid .flpak with kind/version and a bandOffsets index', () => {
  const out = packBaked(sampleBakeInput()) // sampleBakeInput: small synthetic BakeInput
  const u = unpack(out) // packBaked now returns ArrayBuffer (the .flpak), not {json, bin}
  expect(u.metadata.kind).toBe('flatland.slug.font')
  expect(u.metadata.version).toBeGreaterThanOrEqual(1)
  expect(u.has('glyphs')).toBe(true)
  expect(u.has('cmap')).toBe(true)
  expect(u.has('kern')).toBe(true)
  expect(u.has('bands')).toBe(true)
  expect(u.has('bandOffsets')).toBe(true)        // NEW random-access index (spec §7/§10)
  const c = u.records('glyphs', GlyphLayout)
  expect(c.count).toBeGreaterThan(0)
})
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @three-flatland/slug exec vitest run src/baked.test.ts`
Expected: FAIL — `packBaked` still returns `{ json, bin }`.

- [ ] **Step 4: Rewrite `packBaked`** in `packages/slug/src/baked.ts`:
  - Define `GlyphLayout = defineRecord({ glyphId: f32, bounds: vec(f32,4), bandLoc: vec(f32,2), advanceWidth: f32, lsb: f32, hasOutline: f32 })` (stride 40), `CmapLayout = defineRecord({ charCode: u16, glyphId: u16 })` (stride 4), `KernLayout = defineRecord({ left: u16, right: u16, value: i16 })` (stride 6).
  - Build the `bands` opaque `Uint16` buffer exactly as today (the per-glyph walk) **and** build a `bandOffsets` `Uint32Array` of length `glyphCount+1` giving each glyph's byte start within `bands` (prefix sum), as a record (`defineRecord({ off: u32 })`).
  - Move `metrics`, `textureWidth`, texture dims/formats, `strokeSets` into the metadata object; add `bandLayout` describing the opaque bands encoding (spec §7).
  - Call `pack({ kind: 'flatland.slug.font', version: 1, name, metrics, textures, bandLayout, strokeSets }, { curveTexture, bandTexture, glyphs: {data, record: recordFor(GlyphLayout, glyphCount)}, bands, bandOffsets: {data, record: recordFor(BandOffsetLayout, glyphCount+1)}, cmap: {...}, kern: {...} })`.
  - `packBaked` now returns `ArrayBuffer`. Export `GlyphLayout`/`CmapLayout`/`KernLayout` for the loader + tests.

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @three-flatland/slug exec vitest run src/baked.test.ts`
Expected: PASS.

- [ ] **Step 6: Update `bakedURLs`** to a single URL: `/fonts/X.ttf` → `/fonts/X.slug.flpak` (drop the `.json`/`.bin` pair). Update the CLI (`src/cli.ts`) to write one `.slug.flpak` file. Run `pnpm --filter @three-flatland/slug typecheck`; fix call sites.

- [ ] **Step 7: Commit**

```bash
git add packages/slug/package.json packages/slug/src/baked.ts packages/slug/src/baked.test.ts packages/slug/src/cli.ts pnpm-lock.yaml
git commit -m "feat(slug): bake to single .slug.flpak via @three-flatland/pak (+ bandOffsets index)"
```

---

## Task 10: Rewrite `unpackBaked` + `SlugFontLoader` for single-file load

**Files:**
- Modify: `packages/slug/src/baked.ts`
- Modify: `packages/slug/src/SlugFontLoader.ts`

- [ ] **Step 1: Write the failing test** — extend `baked.test.ts`:

```ts
it('round-trips: packBaked -> unpack -> reconstruct font data', () => {
  const input = sampleBakeInput()
  const u = unpack(packBaked(input))
  const data = unpackBaked(u) // unpackBaked now takes UnpackedPak
  expect(data.glyphs.size).toBe(input.glyphs.size)
  expect(data.cmapCodes.length).toBe(input.cmap.length)
  // bands now random-access via bandOffsets:
  expect(data.glyphs.get(firstGlyphId)!.bands.hBands.length).toBeGreaterThanOrEqual(0)
})
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @three-flatland/slug exec vitest run src/baked.test.ts`
Expected: FAIL — `unpackBaked` still takes `(bin, json)`.

- [ ] **Step 3: Rewrite `unpackBaked`** to take `UnpackedPak`:
  - Glyph table via `u.records('glyphs', GlyphLayout)` — `cur.get(i, 'glyphId')`, `cur.getArray(i, 'bounds')`, etc. (resolves offsets from the file).
  - cmap via `u.records('cmap', CmapLayout)` into `cmapCodes`/`cmapGlyphs` typed arrays (or keep `u.view('cmap')` as a flat `Uint16Array` and index 2-per-pair — either; prefer the cursor).
  - kern via `u.records('kern', KernLayout)`.
  - bands: `const bands = u.view('bands') as Uint16Array; const offsets = u.records('bandOffsets', BandOffsetLayout)`; for glyph `i`, slice `bands[offsets.get(i,'off')/2 .. offsets.get(i+1,'off')/2]` and run the existing inner `[numH, numV, ...]` walk on that sub-range. This removes the "walk all prior glyphs" pass.
  - curve/band textures: `u.bytes('curveTexture')` / `u.view('bandTexture')` straight to `DataTexture` upload at the loader.

- [ ] **Step 4: Rewrite `SlugFontLoader`** to fetch one `.slug.flpak`, `unpack()` it, call `unpackBaked(u)`, and build textures from `u.view('curveTexture')`/`u.view('bandTexture')` + dims in `u.metadata.textures`. Remove the two-file fetch.

- [ ] **Step 5: Run typecheck + tests**

Run: `pnpm --filter @three-flatland/slug typecheck && pnpm --filter @three-flatland/slug exec vitest run`
Expected: 0 type errors, tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/slug/src/baked.ts packages/slug/src/SlugFontLoader.ts
git commit -m "feat(slug): load single .slug.flpak; random-access bands via bandOffsets"
```

---

## Task 11: Slug equivalence golden test + domain JSON Schema

**Files:**
- Create: `packages/slug/src/flatland.slug.font.schema.json`
- Modify: `packages/slug/src/baked.test.ts`

- [ ] **Step 1: Equivalence test** — bake a real bundled test font (the repo already has fixtures used by `baked.test.ts`), produce a `.slug.flpak`, `unpackBaked` it, and assert the reconstructed glyph bounds / advanceWidth / cmap lookups / kern lookups equal what the *pre-migration* code produced for the same font. If a pre-migration golden snapshot isn't available, snapshot the new output and assert stability, plus spot-check 3 known glyphs by hand against `parseFont` output.

```ts
it('reconstructs the same glyph metrics as the source font', () => {
  const input = bakeRealTestFont()      // uses existing fontParser + texturePacker fixtures
  const data = unpackBaked(unpack(packBaked(input)))
  const A = data.glyphs.get(cmapLookup('A'.charCodeAt(0), data.cmapCodes, data.cmapGlyphs))!
  expect(A.advanceWidth).toBeCloseTo(input.glyphs.get(A.glyphId)!.advanceWidth)
  expect(A.bounds).toEqual(input.glyphs.get(A.glyphId)!.bounds)
})
```

- [ ] **Step 2: Run, verify pass**

Run: `pnpm --filter @three-flatland/slug exec vitest run src/baked.test.ts`
Expected: PASS.

- [ ] **Step 3: Author the domain JSON Schema** — `flatland.slug.font.schema.json`: a Draft-2020-12 schema for the slug metadata (`kind` const `flatland.slug.font`, required `metrics`/`textures`/`bandLayout`, an explicit slug encoding-version field), per spec §10 cross-language conventions. Reference it from the slug README.

- [ ] **Step 4: Commit**

```bash
git add packages/slug/src/flatland.slug.font.schema.json packages/slug/src/baked.test.ts
git commit -m "test(slug): glyph-metric equivalence + publish flatland.slug.font schema"
```

---

## Task 12: Workspace integration + full verification

**Files:**
- Modify: `pnpm-workspace.yaml` catalog if any shared version is needed (likely none — pak is dep-free).
- Verify: root scripts.

- [ ] **Step 1: Repo-wide typecheck + test + build**

Run: `pnpm typecheck && pnpm test && pnpm --filter @three-flatland/pak build && pnpm --filter @three-flatland/slug build`
Expected: all green. (`pnpm test` runs vitest across the workspace.)

- [ ] **Step 2: Lint + format**

Run: `pnpm lint && pnpm format:check`
Expected: 0 errors. Fix any. (No semicolons, single quotes, trailing commas — see root CLAUDE.md.)

- [ ] **Step 3: Changeset** — the repo cuts releases from changesets generated from commit history (`pnpm changeset:generate`). Conventional Commit messages above are sufficient; if a manual changeset is wanted: `pnpm changeset` and describe the new `@three-flatland/pak` package + slug change.

- [ ] **Step 4: Update the loader-architecture reference** if present — `@three-flatland/pak` is a new Layer-0 package; add it to the layering doc (`.library/three-flatland/loader-architecture.md`, "Layer 0" list) so the canonical reference stays accurate.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(pak): workspace integration, changeset, loader-architecture note"
```

---

## Self-review checklist (run before handing to executor)

- **Spec coverage:** §2 framing → Tasks 3/4; §3 metadata/versions → Tasks 2/4; §4 descriptor+record+normalized+JSON Schema → Tasks 2/4/5; §5 API + validation enumeration → Tasks 3–7; §5 defineRecord → Task 6; §6 package layout → Task 1; §7 slug migration → Tasks 9–11; §8 testing → Tasks 7/8/11; §10 cross-language conventions (index buffer, domain schema, golden files) → Tasks 8/9/11. All covered.
- **Type consistency:** `pack`/`unpack`/`makeCursor`/`defineRecord`/`recordFor` signatures are used identically across tasks; `PakError` codes are referenced consistently; `GlyphLayout`/`CmapLayout`/`KernLayout`/`BandOffsetLayout` introduced in Task 9 and reused in Tasks 10/11.
- **No placeholders:** core codec (`pack`/`unpack`/`records`/`layout`) has full code. Phase-2 slug tasks reference the existing 380-line `baked.ts` rather than reproducing it, with exact transformation steps and the new `bandOffsets` index spelled out — appropriate because the engineer modifies existing code in place.
