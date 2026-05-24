---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## flatland-bake CLI

- New `@three-flatland/bake` package providing the `flatland-bake` binary
- Plugin-based baker discovery: packages contribute bakers via `"flatland": { "bakers": [...] }` in `package.json`; installing a package makes its subcommands appear in `flatland-bake --list` with no additional wiring
- Discovery walks `node_modules` upward from CWD, tolerating scoped packages, missing directories, and malformed `package.json`; duplicate baker names reported as first-wins conflicts
- CWD self-discovery: a package's own `package.json` bakers are registered ahead of `node_modules` scans, enabling iteration without self-symlinking
- `flatland.bakers` is the legacy field name; `flatland.bake` is canonical — installing either is accepted, the legacy name emits a deprecation warning

## Fixes

- CLI help text updated to reference the canonical `flatland.bake` field (was `flatland.bakers`)
- Removed dead `&& header.status !== 206` guard in `sidecar.ts` (`Response.ok` already covers 200–299)
- `setTorchEnabled` in the lighting example deferred off the `useFrame` loop via `queueMicrotask` to prevent mid-frame React state updates

The package introduces the `flatland-bake` CLI that any flatland package can extend by declaring bakers in its `package.json`.
