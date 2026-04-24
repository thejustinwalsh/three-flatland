---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `flatland-bake` CLI binary — discovers and dispatches to bakers contributed by workspace or npm packages via a `flatland.bakers` manifest in `package.json`
- Baker packages default-export a `Baker` object (`{ name, description, run(args), usage? }`); installing a package makes its subcommand appear in `flatland-bake --list` automatically
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing directories, and malformed manifests; duplicate name conflicts use first-wins policy
- CWD self-discovery: when the CLI runs inside a package that declares its own bakers, they are registered before `node_modules` scans, enabling baker authors to iterate without self-symlinking
- Added `devtimeWarn`, `sidecar`, and `writeSidecar` utilities for the canonical "try baked → runtime fallback + dev-time warning" loader pattern
- Normal descriptor sidecar support (`.normal.json`) integrated into the loader infrastructure

`@three-flatland/bake` ships with no concrete bakers; packages such as `@three-flatland/normals` contribute subcommands by declaring a `flatland.bakers` manifest.
