---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changelog

### CLI

- `flatland-bake` CLI now discovers bakers contributed by workspace or npm packages via a `flatland.bake` manifest field in `package.json`
- CWD self-discovery: when the CLI runs inside a package that declares its own bakers, those register first — no symlinking required during authoring
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing dirs, and malformed manifests; first-wins on name conflicts
- Fixed help text: `--list` no longer references the legacy `flatland.bakers` field (canonical name is `flatland.bake`)

### Bug fixes

- Removed dead `&& header.status !== 206` guard in `sidecar.ts` — the check was unreachable (`Response.ok` already covers 200–299)
- Fixed `setTorchEnabled` in the lighting example: call now deferred via `queueMicrotask` to avoid setting state inside a `useFrame` render loop

`@three-flatland/bake` ships the extensible `flatland-bake` entry point; install any package that contributes a baker and its subcommand appears automatically in `flatland-bake --list`.

