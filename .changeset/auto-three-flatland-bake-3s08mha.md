---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/bake` — extensible asset-baking CLI**

- New `flatland-bake` binary; dispatches to subcommands contributed by packages via a `flatland.bakers` manifest in `package.json`
- Bakers are auto-discovered by walking `node_modules` upward from CWD; installing a package that declares bakers makes its subcommand appear in `flatland-bake --list`
- CWD self-discovery: when the CLI runs inside a package whose own `package.json` declares bakers, those register ahead of `node_modules` scans — iterate on a baker without symlinking it into its own `node_modules`
- Duplicate-name baker registrations reported as conflicts with first-wins policy
- `flatland-bake normal <input.png>` subcommand added by installing `@three-flatland/normals` (no additional wiring required)

Extensible bake pipeline for offline asset pre-processing, with `@three-flatland/normals` as the first shipped baker.
