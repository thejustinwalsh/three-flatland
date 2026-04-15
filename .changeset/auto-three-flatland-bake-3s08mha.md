---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New package: `@three-flatland/bake`

- New `flatland-bake` CLI binary — single entry point that discovers and dispatches to package-contributed bakers
- Bakers declared via `flatland.bakers` array in `package.json`; installing a package makes its subcommand appear in `flatland-bake --list` automatically
- Baker interface: default-export a `Baker` object `{ name, description, run(args), usage? }`
- Discovery walks `node_modules` upward from CWD; handles scoped packages, missing dirs, and malformed manifests; duplicate-name conflicts reported with first-wins policy
- CWD self-discovery: when the CLI runs inside a package with its own baker declarations those are registered first, enabling iteration without self-symlink

## `flatland-bake normal` (via `@three-flatland/normals`)

- `flatland-bake normal <input.png> [output.png] [--strength N]` — offline normal-map baker contributed by `@three-flatland/normals`

Adds a `flatland-bake` CLI for discoverable, package-contributed asset bakers; the initial `normal` subcommand is provided by `@three-flatland/normals`.
