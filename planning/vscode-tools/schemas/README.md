# Sidecar JSON Schemas — Placement + Consumption

## Placement rule

Schemas live **next to the TS type that defines the format and the loader that consumes it** — inside the format-owning package. Types, loader, validator, and schema move together as one unit.

| Format | Owning package | Layout |
|---|---|---|
| Sprite atlas (`*.atlas.json`) | `packages/three-flatland/` | `src/sprites/atlas.schema.json` + `src/sprites/atlas.schema.ts` (ajv compile) |
| Normal descriptor (`*.normal.json`) | `packages/normals/` | `src/descriptor.schema.json` + `src/descriptor.schema.ts` |
| Future formats | their owning package | same layout |

Rationale: runtime loaders need the schema to do dev-time validation; tools need the same schema to validate before writing. If they come from different packages the types and schema drift. Colocating removes that risk.

**Not adopted**: a central `packages/schemas/` aggregate. It would pull types away from their loaders; maintenance burden outweighs organizational benefit for an internal suite.

## Package exports

Each format-owning package exports the schema file and a pre-compiled validator:

```jsonc
// packages/three-flatland/package.json (partial)
"exports": {
  ".":       { "import": "./dist/index.js",          "types": "./dist/index.d.ts" },
  "./sprites/atlas.schema.json":  "./src/sprites/atlas.schema.json",
  "./sprites/atlas":              { "import": "./dist/sprites/atlas.schema.js", "types": "./dist/sprites/atlas.schema.d.ts" }
}
```

Validator entry:

```ts
// packages/three-flatland/src/sprites/atlas.schema.ts
import Ajv, { type ValidateFunction } from 'ajv'
import schema from './atlas.schema.json' with { type: 'json' }
import type { SpriteSheetJSONHash } from './types'

export const atlasSchema = schema
const ajv = new Ajv({ allErrors: true, strict: true })
export const validateAtlas: ValidateFunction<SpriteSheetJSONHash> =
  ajv.compile<SpriteSheetJSONHash>(schema)
```

Consumers import exactly what they need — the JSON file for build-time schema injection, or the TS validator for runtime checks.

## Consumption patterns

### Runtime loader (dev-time validate, skip in prod)

```ts
import { validateAtlas } from 'three-flatland/sprites/atlas'

function load(json: unknown) {
  if (import.meta.env.DEV && !validateAtlas(json)) {
    console.warn('Atlas failed schema:', validateAtlas.errors)
  }
  return json as SpriteSheetJSONHash
}
```

### Tool (authoritative validate before write)

```ts
// tools/ext/src/tools/atlas/save.ts
import { validateAtlas } from 'three-flatland/sprites/atlas'

async function saveAtlas(uri: vscode.Uri, doc: unknown) {
  if (!validateAtlas(doc)) {
    throw new Error('Atlas invalid:\n' + ajvErrorsToString(validateAtlas.errors))
  }
  await vscode.workspace.fs.writeFile(uri, encode(doc))
}
```

### Editor autocomplete via `$schema`

Users add `"$schema"` to their sidecar JSON; VSCode / Cursor / JetBrains fetch it and provide IntelliSense:

```json
{
  "$schema": "https://three-flatland.dev/schemas/atlas.v1.json",
  "meta": { "image": "hero.png", "…": "…" }
}
```

The docs site publishes those URLs. Build step copies schemas from every package:

```bash
# docs/scripts/copy-schemas.mjs (pseudocode)
find packages -name '*.schema.json' \
  -exec cp {} docs/public/schemas/ \;
```

`$id` inside each schema file matches the published URL so validators work offline too:

```json
{ "$id": "https://three-flatland.dev/schemas/atlas.v1.json", "$schema": "https://json-schema.org/draft/2020-12/schema", "…": "…" }
```

### External consumers

Anyone consuming our formats (other renderers, game-engine plugins, etc.) can either:
- Pull the `.schema.json` from the published URL and validate standalone, or
- `npm install three-flatland` and import `validateAtlas` directly.

### Unit tests

`tools/io/src/test-utils/` ships a shared test harness (fixture loader, ajv-error formatter). Tests themselves live in the format-owning package:

```
packages/three-flatland/src/sprites/atlas.test.ts
  - round-trip every file in __fixtures__/valid/
  - every file in __fixtures__/invalid/ must fail with expected error code
  - TS-type parity: ts-json-schema-generator(SpriteSheetJSONHash) ≡ atlas.schema.json
```

Where `tools/io` fits: a tiny support package exporting:
- `loadFixture(relPath): unknown`
- `ajvErrorsToString(errors): string`
- `assertSchemaMatchesType<T>(schema, type)` — runs `ts-json-schema-generator` in-test and deep-equals against the file

Nothing format-specific in `tools/io`. Just test + error-formatting helpers.

## Authoring rules

1. **Draft 2020-12** (`"$schema": "https://json-schema.org/draft/2020-12/schema"`).
2. **Closed objects** — `"additionalProperties": false` on every object; `patternProperties` for maps.
3. **`$id`** matches the published docs URL.
4. **`$defs`** for reusable shapes (`Rect`, `Pos`, `Size`, `SourceEntry`, `Direction`).
5. **`integer` vs `number`** distinguished — pixel coords are `integer`.
6. **Enums spelled out** — directions, source formats, animation modes.
7. **TS type parity enforced by test** — schema and TS type never drift.

## Versioning

- Top-level or `meta.version` field.
- Additive changes: no version bump; schema loosens naturally.
- Breaking changes: bump major; keep old schema file (`atlas.v1.schema.json`) alongside new (`atlas.v2.schema.json`); write migration in the owning package (`packages/three-flatland/src/sprites/migrations/atlasV1toV2.ts`).

## Fixtures

Live in the format-owning package:

```
packages/three-flatland/src/sprites/__fixtures__/
  valid/
    basic.atlas.json
    multi-source.atlas.json
    normal-mapped.atlas.json
    animation-heavy.atlas.json
  invalid/
    missing-frames.atlas.json   (expect: required 'frames')
    bad-rect.atlas.json         (expect: number vs integer)
    unknown-prop.atlas.json     (expect: additionalProperties)

packages/normals/src/__fixtures__/
  valid/
    flat.normal.json
    single-region.normal.json
    multi-region-direction.normal.json
    dungeon-tileset.normal.json   (mirrors examples/react/lighting asset)
  invalid/
    bad-direction.normal.json
    missing-regions-but-tagged.normal.json
```

## Docs site integration

`docs/` has one build step that:

1. Globs `packages/*/src/**/*.schema.json`.
2. Copies to `docs/public/schemas/<basename>`.
3. Optionally generates an HTML reference page per schema (via `json-schema-viewer` or similar) linked from the docs sidebar.

No separate schema package; no schema duplication. The published URL is stable; `$id` in each file matches; everything validates offline and online alike.
