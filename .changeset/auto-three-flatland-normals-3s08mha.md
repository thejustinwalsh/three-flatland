---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New package: `@three-flatland/normals`

- Offline normal-map baker: reads an RGBA PNG, computes a 4-neighbor alpha gradient, and writes a tangent-space `.normal.png` sibling
- Contributed as `flatland-bake normal` subcommand — appears in `flatland-bake --list` automatically after install
- Optional `--strength` multiplier; output path defaults to `<input>.normal.png`

## `NormalMapLoader`

- Runtime loader extending `three.Loader` — R3F `useLoader`-compatible
- Static `NormalMapLoader.load(url, { forceRuntime? })` API with shared URL-keyed cache for vanilla use
- Returns a `Texture` loaded from the sibling `.normal.png` if it exists, otherwise `null` — caller switches to the runtime `normalFromSprite` TSL path
- Silent HEAD probe on 404; dev-time warning fired at most once per URL when the runtime path is taken; suppressed in `NODE_ENV=production`

## Example

```ts
// try baked first, fall back to runtime normalFromSprite
const loader = new NormalMapLoader()
const tex = await loader.loadAsync('/sprites/knight.png')
// tex === Texture (baked) or null (runtime fallback)
```

Adds offline normal-map baking via `flatland-bake normal` and a `NormalMapLoader` runtime loader that implements the canonical try-baked / fallback-to-runtime pattern.
