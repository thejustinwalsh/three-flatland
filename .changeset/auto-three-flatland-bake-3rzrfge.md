---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### New package: `@three-flatland/bake`

- New `flatland-bake` CLI — single extensible entry point for offline asset baking
- Packages contribute bakers via `"flatland": { "bakers": [...] }` in `package.json`; installing a package auto-registers its subcommands in `flatland-bake --list`
- Baker interface: `{ name, description, run(args), usage? }` default export
- Discovery walks `node_modules` upward from CWD; tolerates scoped packages, missing dirs, and malformed manifests
- CWD-self-discovery: when running inside a package that declares its own bakers, those register first — enables iteration without self-symlinking
- Duplicate baker names reported as conflicts with first-wins policy
- Sidecar helpers (`writeSidecar`, `readSidecar`) for writing JSON descriptor files alongside baked assets
- `devtimeWarn` utility: fires a warning at most once per key, suppressed in `NODE_ENV=production`

This release establishes the extensible bake pipeline that `@three-flatland/normals` and future asset bakers plug into.
