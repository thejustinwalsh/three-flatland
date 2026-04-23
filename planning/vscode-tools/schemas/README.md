# Sidecar JSON Schemas

Authoritative schema files for every JSON format this suite reads or writes live under `tools/io/schemas/`. This document is the authoring guide + test strategy. Schema files themselves are authored alongside the TypeScript types in `tools/io/src/` and compiled against both code and test corpora.

## Schemas

| File | Consumers | TS source of truth |
|---|---|---|
| `atlas.schema.json` | Sprite Atlas tool (write), `SpriteSheetLoader` (read) | `tools/io/src/atlas.ts` |
| `normal-descriptor.schema.json` | Normal Baker tool (write), `NormalMapLoader` (read) | `packages/normals/src/descriptor.ts` |
| `ktx2-sidecar.schema.json` | Spark tool (write) — optional sibling with encoder params | `tools/io/src/ktx2.ts` |
| `animation.schema.json` (optional) | Split file for animations when atlas and anim ship separately | `tools/io/src/animation.ts` |

Each schema uses `$id` of the form `https://three-flatland.dev/schemas/<name>.v<major>.schema.json` for forward-compatible versioning.

## Authoring rules

1. **Draft 2020-12.** Use `$schema: "https://json-schema.org/draft/2020-12/schema"`.
2. **Closed by default.** `"additionalProperties": false` on every object. Use `patternProperties` for maps (frame names, animation names).
3. **Required fields named explicitly.** Don't rely on `minProperties`.
4. **Integer vs number distinguished.** Pixel rects use `integer`; pitch/strength use `number`.
5. **Enums spelled out.** Directions, animation modes, source formats.
6. **References via `$defs`.** `Rect`, `Pos`, `Size`, `SourceEntry`, `FrameTag` etc. live under `$defs` and are reused.
7. **Round-trip tested.** Every schema has a TS type; a test asserts `generateSchema(T) ≡ schemaFile` (via `ts-json-schema-generator` or `typescript-json-schema`). Drift is a test failure.

## Validation flow

- **At write (extension host)**: before `workspace.fs.writeFile`, ajv-compile the schema, validate the document, throw on invalid with detailed error.
- **At read (extension host + runtime loader)**: optimistic parse; on failure, ajv-validate for a good error message.
- **In webviews**: optimistic client-side validation for live feedback as the user edits. Authoritative validation always runs in the host.

## Unit tests

Located at `tools/io/src/*.test.ts`. Minimum set per schema:

1. **Round-trip**: load each canonical example from `tools/io/schemas/fixtures/<name>/*.json` and validate.
2. **Known-invalid**: corrupted fixtures under `fixtures/<name>/invalid/*.json` MUST fail with an expected error code.
3. **Type parity**: `expectSchemaMatchesType<T>(schemaFile)` asserts TS→JSON Schema generation matches the file.
4. **Migration (when `version` bumps)**: `migrate(oldDoc)` produces a doc that validates under the new schema; tests cover every known legacy shape.

## Versioning

- Every schema has a `meta.version` or top-level `version` field.
- Minor changes (added optional fields): no version bump; schema tolerates.
- Breaking changes: bump the major; write a migration in `tools/io/src/migrations/<schema>.ts`; keep the old schema file around (`atlas.v1.schema.json`) for read-side back-compat.

## Fixtures

- `tools/io/schemas/fixtures/atlas/` — canonical PNG-only, PNG+WebP+KTX2, normal-mapped, animation-heavy examples.
- `tools/io/schemas/fixtures/normal-descriptor/` — flat, single-region, multi-region w/ directions, example from `examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json`.
- Invalid fixtures pair with expected ajv error codes.

## Generation + distribution

- `tools/io/package.json` exports the `schemas/*.json` files so external consumers can import them.
- `docs/` publishes the schemas at `https://three-flatland.dev/schemas/*` so editors (VSCode, JetBrains) auto-complete JSON against them via `$schema`.
- `tools/io` also exports precompiled ajv validators (`validateAtlas`, `validateNormalDescriptor`) so consumers don't re-compile at runtime.
