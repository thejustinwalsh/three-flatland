---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/bake`** — extensible offline asset pipeline CLI.

### CLI

- New `flatland-bake` binary with extensible subcommand dispatch
- Baker discovery walks `node_modules` upward from CWD, tolerating scoped packages and malformed manifests; first-wins on name conflicts
- CWD-self-discovery: packages declaring their own `flatland.bakers` are registered before `node_modules` scan, enabling authoring without self-symlinking
- `flatland-bake --list` enumerates all registered bakers

### Baker protocol

- Packages contribute bakers via `package.json` `flatland.bakers` array: `{ name, description, entry }` where `entry` default-exports a `Baker` (`{ name, description, run(args), usage? }`)
- Installing a package with a `flatland.bakers` manifest automatically makes its subcommands available with no wiring

### Sidecar support

- `sidecar` / `writeSidecar` modules for reading and writing `.json` descriptor files alongside baked assets
- `devtimeWarn` helper for issuing one-shot dev-only warnings in the try-baked-then-runtime loader pattern

Installing `@three-flatland/normals` makes `flatland-bake normal` available automatically via the baker manifest.
