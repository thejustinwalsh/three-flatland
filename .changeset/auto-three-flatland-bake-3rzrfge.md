---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

NEW PACKAGE. Everything listed below is additive.

**CLI**
- New `flatland-bake` binary — discovers and dispatches to bakers contributed by workspace or npm packages via a `flatland.bakers` field in `package.json`
- Bakers default-export a `Baker` object (`{ name, description, run(args), usage? }`) and are picked up automatically
- `--list` enumerates all discovered bakers and descriptions
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing dirs, and malformed manifests
- Duplicate-name registrations are reported as conflicts with a first-wins policy

**Discovery**
- CWD self-discovery: when the CLI runs inside a package that declares its own `flatland.bakers`, those bakers register ahead of `node_modules` scans — lets package authors iterate without symlinking into their own `node_modules`

**Utilities**
- `devtimeWarn` — fires a warning at most once per key, only outside `NODE_ENV=production`
- Sidecar file helpers (`sidecar.ts`, `writeSidecar.ts`) for co-located baked asset descriptors

New `@three-flatland/bake` package providing the extensible `flatland-bake` CLI; installing any package that contributes a `flatland.bakers` manifest makes its subcommand available automatically.
