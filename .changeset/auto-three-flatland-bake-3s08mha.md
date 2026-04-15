---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**CLI**

- New `flatland-bake` binary — single entry point that discovers and dispatches to bakers contributed by any installed package
- Bakers declared via `"flatland": { "bakers": [{ "name", "description", "entry" }] }` in package.json
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing dirs, and malformed manifests
- CWD-self-discovery: bakers in the CWD's own `package.json` register first, enabling package authors to iterate without self-symlinking
- Duplicate-name conflicts reported with first-wins policy
- `flatland-bake --list` enumerates all discovered bakers

**Normal-map baker**

- `flatland-bake normal <sprite.png>` — offline Node port of the `normalFromSprite` TSL helper
- Reads RGBA PNG, computes 4-neighbor alpha gradient, writes sibling `.normal.png`
- `--strength <n>` flag scales the gradient before normalization (default 1)
- Reduces per-fragment shader cost: consumers load the baked PNG as a texture instead of paying four alpha samples + gradient at runtime

`@three-flatland/bake` ships the extensible CLI; `@three-flatland/normals` ships the first concrete baker and the runtime loader that consumes baked output.
