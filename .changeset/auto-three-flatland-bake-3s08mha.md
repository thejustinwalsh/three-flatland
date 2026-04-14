---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `flatland-bake` CLI**

- New `flatland-bake` binary that auto-discovers and dispatches to bakers contributed by any installed package
- Bakers registered via `"flatland": { "bakers": [{ "name", "description", "entry" }] }` in `package.json`
- Baker default-exports a `Baker` object (`{ name, description, run(args), usage? }`); subcommand appears in `flatland-bake --list` automatically
- Discovery walks `node_modules` upward from CWD, tolerates scoped packages and malformed manifests; first-wins on duplicate names
- CWD self-discovery: when `flatland-bake` runs inside a package that itself declares bakers, those register before `node_modules` scans — no symlink needed during development
- `flatland-bake normal <sprite.png>` subcommand added when `@three-flatland/normals` is installed (contributed by that package's baker manifest)

This release establishes the extensible offline toolchain for Flatland asset preprocessing.
