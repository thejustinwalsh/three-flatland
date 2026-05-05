# three-flatland Loader Architecture

Canonical reference for how loaders are designed, where they live, and how packages compose. Read this **before** designing or refactoring any loader (texture, atlas, tilemap, font, normal map, future formats).

> Companion docs:
> - `planning/bake/loader-pattern.md` — the in-tree "baked → runtime fallback" pattern, with the exact 30-line shape every loader inlines.
> - `.library/threejs/idiomatic-threejs-patterns.md` — the `THREE.Loader<T>` contract our loaders extend.

---

## 1. The hard rules

These came out of a long architectural review in 2026-05-04 and supersede earlier "registry + base class" sketches. The rules are deliberately conservative — duplication is preferred to coupling.

1. **Every loader extends `three.Loader<T>` directly.** No `BaseImageLoader<T>`, no `LoaderRegistry`, no `@three-flatland/loader-kit` shared-helper package. The pattern is small enough that ~30 lines of duplication per loader is cheaper than the abstraction tax.
2. **R3F `useLoader` compatibility is non-negotiable.** Every loader must work with `useLoader(MyLoader, url)` out of the box. This is the test for "is the shape right?"
3. **Static API parallels the instance API.** `MyLoader.load(url, opts)` returns a cached promise; `new MyLoader().loadAsync(url)` works for vanilla three / R3F idioms.
4. **Format dispatch is inline `if`s, not registries.** When `TextureLoader` needs to handle KTX2, it does:
   ```ts
   if (extOf(url) === 'ktx2') {
     const { Ktx2Loader } = await import('@three-flatland/image/loaders/ktx2')
     return new Ktx2Loader().loadAsync(url)
   }
   ```
   No central dispatcher, no proxy registration. The dynamic `import()` IS the lazy chunk.
5. **No shared abstract base.** If you find yourself wanting one, re-read rule 1. If 5+ loaders genuinely have identical guts, revisit — but the bar is high.

---

## 2. Package layering

Three-flatland is composed of independent sibling packages. They form a strict DAG:

```
Layer 0 — Format I/O & shared baker plumbing (no domain knowledge)
  @three-flatland/bake     Baker contract, devtimeWarn, BakedAssetLoaderOptions
  @three-flatland/image    PNG / WebP / AVIF / KTX2 encode + decode + Ktx2Loader

Layer 1 — Domain bakers (image is one input among many; the IP is the algorithm)
  @three-flatland/normals  Sprite alpha → normal map; runtime TSL fallback
  @three-flatland/slug     TTF → SDF font atlas; opentype.js fallback
  (future) pbr-bake, animation-bake, ...

Layer 2 — Composer (assembles layers into the runtime story)
  three-flatland           TextureLoader, SpriteSheetLoader, TilemapLoader
                           compose Layer 0 + 1 packages into "do the right
                           thing without thinking" UX.

Layer 3 — Consumer
  user code                Imports `three-flatland` (everyday) or any sibling
                           directly (composability escape hatch).
```

**Dependencies only flow downward.** Sibling packages MUST NOT depend on `three-flatland` — they stay standalone-publishable. `three-flatland` depends on the siblings it needs.

### The boundary test

When deciding which package a loader belongs in, ask:

> **"Could a non-three-flatland user reasonably want this package alone?"**

- **Yes** → goes in a sibling package (`@three-flatland/image`, `@three-flatland/normals`, etc.).
- **No** → it's three-flatland-specific composition; lives in `three-flatland` itself.

Examples:
- `Ktx2Loader` — vanilla three.js / R3F users want this for KTX2 support → `@three-flatland/image/loaders/ktx2`.
- `NormalMapLoader` — anyone doing 2D-shaded sprites in three.js could use it → `@three-flatland/normals`.
- `TextureLoader` (preset-aware, format-dispatching) — only makes sense inside three-flatland's UX → `three-flatland/loaders`.
- `SpriteSheetLoader` — composes TextureLoader + normals + atlas types from three-flatland → `three-flatland/loaders`.

---

## 3. The three-tier surface

For any composable feature (texture loading, tilemap loading, etc.), three-flatland exposes three tiers. Same shape applies to every loader family.

### Tier 1 — Everyday, zero-config (the 95% case)

```ts
import { TextureLoader, SpriteSheetLoader } from 'three-flatland/loaders'

const tex = await new TextureLoader().loadAsync('/asset.ktx2')   // KTX2 chunk lazy-fetches
const tex = await new TextureLoader().loadAsync('/asset.png')    // native bitmap path
const sheet = await new SpriteSheetLoader().loadAsync('/atlas.json')

// R3F:
const tex = useLoader(TextureLoader, '/asset.ktx2')              // works the same
```

The user doesn't think about format. The Tier 1 wrapper does inline format detection and dynamic-imports specialist loaders as needed.

### Tier 2 — Direct format use (composability for vanilla three.js / R3F)

```ts
import { Ktx2Loader } from '@three-flatland/image/loaders/ktx2'
import { NormalMapLoader } from '@three-flatland/normals'

const tex = await new Ktx2Loader().loadAsync('/asset.ktx2')
const tex = useLoader(Ktx2Loader, '/asset.ktx2')
```

Same class the Tier 1 wrapper uses internally. Single source of truth, no wrappers wrapping wrappers.

### Tier 3 — Optimization / preload (production tuning)

```ts
import { Ktx2Loader } from '@three-flatland/image/loaders/ktx2'

// Eager-load the chunk at app startup so first KTX2 hit is sync:
void import('@three-flatland/image/loaders/ktx2')

// Or warm the static cache:
await Ktx2Loader.load('/critical-asset.ktx2')
```

Future: a `flatland-bundle-warm` Vite plugin will AST-walk user code, find which loader chunks are statically reachable, and emit a generated `bootstrapLoaders.ts` that pre-warms exactly those chunks. Zero-config in dev, pre-resolved in production.

---

## 4. The standalone-package surface for asset formats

Packages that own asset formats (currently `@three-flatland/image`) follow this subpath layout:

```
@three-flatland/image/
├── src/
│   ├── encode.ts, decode.ts, ...                  // Layer-0 format I/O
│   ├── codecs/{png,webp,avif,ktx2}.ts             // per-format codecs
│   ├── loaders/Ktx2Loader.ts                      // three.Loader<CompressedTexture>
│   └── runtime/transcoder-loader.ts               // wasm wrapper used by Ktx2Loader
├── libs/basis/
│   ├── basis_encoder.wasm                         // built artifact (our bespoke output)
│   └── basis_transcoder.wasm                      // built artifact (same library family)
└── package.json exports:
    ".":                       // encode/decode (Node + browser, no three required)
    "./node":                  // Node-side encoder entry
    "./cli":                   // bake CLI entry
    "./loaders/ktx2":          // Ktx2Loader (browser, peerdeps three)
```

### Naming conventions

- **`libs/`**, NOT `vendor/`. Vendor is for upstream sources we copy in (basisu C++ source). `libs/` is for OUR bespoke build artifacts (compiled wasm, generated JS bridges). **Group by library family**, not per-artifact: `libs/basis/` holds both `basis_encoder.wasm` and `basis_transcoder.wasm` (they share basisu sources); a future Draco integration would land in `libs/draco/` with all its artifacts. Mirrors three.js's `three/examples/jsm/libs/{basis,draco,…}/` layout.
- **`loaders/`** for `three.Loader<T>` subclasses. One file per loader. Subpath-exported per-loader for fine-grained tree-shaking.
- **`runtime/`** for wasm wrappers and other browser-runtime glue used INSIDE loaders. Internal-ish; not subpath-exported unless a non-loader consumer needs it.

### What the asset-format package MUST do

- Stay standalone — no `three-flatland` dependency. Ever.
- Declare `three` as an **optional peer** at the package level. Main entries (encode/decode/CLI) don't need three; the `loaders/*` subpath does. Optional peer is the one place this semantic actually fits because the package is genuinely partial-three-dependent at the subpath level.
- Pass `sideEffects: false` so unused subpath code tree-shakes from consumer bundles.
- Use `bundle: false` in tsup so each entry is its own chunk and subpath imports don't drag siblings.

---

## 5. Cross-package dependency policy

### `three-flatland` → siblings

Hard `dependencies` (NOT peerDependencies, NOT optionalDependencies):

```jsonc
// packages/three-flatland/package.json
{
  "dependencies": {
    "@three-flatland/image": "workspace:*",
    "@three-flatland/normals": "workspace:*",
    "@three-flatland/slug": "workspace:*"
  }
}
```

Reasoning: peer/optional-peer semantics differ across npm/pnpm/yarn and can't be relied on for the "do the right thing without thinking" UX. Hard deps + tree-shaking + lazy `import()` is the only combination where:

1. The user gets the package available without manual install.
2. Their browser bundle pays nothing if they don't use the feature.
3. The bundler dedupes when they ALSO import the sibling directly.

### Sibling → `three`

Optional peer:

```jsonc
// packages/image/package.json
{
  "peerDependencies": {
    "three": "catalog:"
  },
  "peerDependenciesMeta": {
    "three": { "optional": true }
  }
}
```

Reasoning: only the `loaders/*` subpath uses three. A Node user running just the encoder/CLI shouldn't be told to install three.

### Sibling → sibling

Hard `dependencies`. Same reasoning as three-flatland → siblings: deterministic install, bundler tree-shakes unused entries.

### Version drift mitigation

The risk: `@three-flatland/image@2.0` ships a breaking `Ktx2Loader` API; `three-flatland@1.5` still does `new Ktx2Loader()` matching the old shape. Dynamic import succeeds at build, blows up at runtime.

Mitigations:

1. **Changesets-locked co-versioning.** When image's loader API changes, three-flatland gets the matching update in the same release. The hard dep pin in three-flatland's `package.json` carries the lock to published consumers.
2. **Minimal API surface across boundaries.** `three-flatland`'s `TextureLoader` only uses `three.Loader<T>` contract methods on Tier 2 loaders (`loadAsync(url)`). Don't reach into specialist internals.
3. **Subpath exports are public API.** `@three-flatland/image/loaders/ktx2` is semver-disciplined like any other entry. Breaking changes there are MAJOR bumps.

---

## 6. The "baked → runtime" pattern (separate concern)

`planning/bake/loader-pattern.md` documents a SECOND pattern that some loaders follow on top of the architecture above: **baked offline asset → runtime fallback**.

This pattern applies to loaders whose output can be produced two ways:
- Pre-baked sibling file (e.g. `sprite.normal.png` next to `sprite.png`).
- Computed at runtime from the source (e.g. a TSL helper running per-fragment).

Examples: `NormalMapLoader`, `SlugFontLoader`. Each has a `forceRuntime` flag, version-gated payloads, and a `[kind] Generating data at runtime …` devtimeWarn telling the user to bake.

This pattern is **not** mandatory. `Ktx2Loader` doesn't use it (KTX2 IS the asset, not a baked sibling of one). `TextureLoader` doesn't use it (it just dispatches by format).

When you DO need it, copy the 30-line shape in the planning doc. Do not abstract it.

---

## 7. Quick decision table

| Scenario | Where to put it | Pattern |
|---|---|---|
| New asset format (e.g. .gltf, .draco) | `@three-flatland/image/loaders/<fmt>` (or new sibling if format is huge) | Standalone `three.Loader<T>` subclass |
| Domain baker (e.g. light occlusion bake) | New `@three-flatland/<domain>` sibling package | Baked → runtime pattern |
| Format dispatch inside `TextureLoader` | `packages/three-flatland/src/loaders/TextureLoader.ts` | Inline `if (ext === 'fmt') await import(...)` |
| Composes multiple sibling packages | `packages/three-flatland/src/loaders/` | Tier 1 wrapper, depends on siblings |
| Wasm artifact for a loader | `packages/<owner>/libs/<library-family>/` | Built by zig/cmake; folder shared with sibling artifacts from the same upstream library |
| Shared loader helper across siblings | **DON'T**. Inline 30 lines per loader. | See rule 1. |

---

## 8. Open follow-ups

- **TextureLoader / SpriteSheetLoader inline KTX2 dispatch** —
  `Ktx2Loader` ships at `@three-flatland/image/loaders/ktx2` (Tier 2 / direct
  use). Tier 1 (calling `TextureLoader.load('foo.ktx2')` and having it Just
  Work) is deferred until the `lighting-stochastic-adoption` branch lands
  its TextureLoader/SpriteSheetLoader rewrite. Spec:
  `planning/superpowers/specs/2026-05-04-three-flatland-textureloader-ktx2.md`.

## 9. References

- `planning/bake/loader-pattern.md` — the canonical bake/runtime shape (must-read when implementing a baker-fallback loader).
- `packages/three-flatland/src/loaders/TextureLoader.ts` — Tier 1 wrapper reference (preset hierarchy, R3F compat).
- `packages/three-flatland/src/loaders/SpriteSheetLoader.ts` — Tier 1 composer reference (atlas + normals + texture).
- `packages/normals/src/NormalMapLoader.ts` — sibling-package loader reference (baked → runtime).
- `packages/image/src/loaders/Ktx2Loader.ts` — format-I/O loader reference (when it lands; planned for Phase 2.1.2).
