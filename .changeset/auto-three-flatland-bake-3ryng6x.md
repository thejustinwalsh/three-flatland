---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `flatland-bake` CLI binary — single entry point that discovers and dispatches to subcommands contributed by any installed npm package via a `flatland.bakers` manifest in `package.json`
- Baker packages default-export a `Baker` object (`{ name, description, run(args), usage? }`); installing the package automatically registers the subcommand in `flatland-bake --list`
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing dirs, and malformed `package.json` files; duplicate names resolved with first-wins + conflict report
- CWD self-discovery: when the CLI runs inside a package that declares its own `flatland.bakers`, those are registered before `node_modules` scans so authors can iterate without self-symlinking
- Sidecar and devtime-warn utilities added for the canonical loader pattern (try baked → runtime fallback + one-time dev warning outside `NODE_ENV=production`)

Initial release of `@three-flatland/bake`: the extensible asset-baking CLI for the Flatland ecosystem, with zero-config baker discovery via package manifests.
