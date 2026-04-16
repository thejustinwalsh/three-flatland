---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `@three-flatland/bake` package providing the `flatland-bake` CLI binary
- Packages contribute bakers via a `flatland.bakers` manifest in their `package.json`; bakers default-export a `Baker` object (`{ name, description, run(args), usage? }`)
- Installing a package that declares bakers makes its subcommand available in `flatland-bake --list` automatically
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing dirs, and malformed `package.json` files
- First-wins policy for duplicate baker names with conflict reporting
- CWD-self-discovery: when the CLI runs inside a package that declares its own bakers, those are registered first — lets package authors iterate without symlinking into their own `node_modules`

Introduces `@three-flatland/bake`, a pluggable asset pipeline CLI where packages contribute build-time bakers via manifest, making subcommands available automatically after install.
