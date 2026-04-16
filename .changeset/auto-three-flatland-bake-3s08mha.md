---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `flatland-bake` CLI binary that discovers and dispatches to baker subcommands contributed by installed packages via a `flatland.bakers` manifest in `package.json`
- `Baker` interface: `{ name, description, run(args), usage? }` — packages default-export a baker to register a subcommand; appears in `flatland-bake --list` automatically
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing dirs, and malformed `package.json`; duplicate names report conflicts with first-wins policy
- CWD-self-discovery: when the CLI runs inside a package that declares its own bakers, those register first (baker authors can iterate without symlinking)
- `flatland-bake normal <sprite.png>` subcommand registered by `@three-flatland/normals` via the `flatland.bakers` manifest

New `@three-flatland/bake` package provides an extensible offline asset processing CLI; bakers are contributed by installing packages that declare a `flatland.bakers` manifest.
