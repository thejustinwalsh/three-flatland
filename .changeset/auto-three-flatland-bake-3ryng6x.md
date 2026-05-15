---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Package: `@three-flatland/bake`

- `flatland-bake` CLI binary — single entry point that discovers and dispatches to package-contributed bakers
- Baker discovery via `flatland.bakers` manifest in `package.json`; installing a package that provides a baker makes its subcommand appear in `flatland-bake --list` with no extra wiring
- Scoped package support, missing-dir tolerance, and first-wins conflict policy for duplicate baker names
- CWD self-discovery: when the CLI runs inside a package that declares its own bakers, those register first (useful for baker authors iterating without self-symlinking)

## Normal Descriptor Support

- `devtimeWarn` utility — emit a console warning at most once per URL, only outside `NODE_ENV=production`
- Sidecar read/write helpers (`sidecar.ts`, `writeSidecar.ts`) for `.normal.json` descriptor files produced by `flatland-bake normal`
- `discovery.ts` updated to support CWD-self and node_modules scanning in the same pass

Introduces the `@three-flatland/bake` package and `flatland-bake` CLI, enabling workspace packages to contribute asset-pipeline subcommands without modifying the core toolchain.
