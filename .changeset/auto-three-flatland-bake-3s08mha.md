---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package** — `@three-flatland/bake` introduces the `flatland-bake` CLI binary.

**CLI**
- `flatland-bake <subcommand>` dispatches to bakers declared in any installed package's `"flatland": { "bakers": [...] }` manifest field
- `flatland-bake --list` enumerates all discovered subcommands
- Bakers default-export a `Baker` interface (`name`, `description`, `run(args)`, optional `usage`)

**Discovery**
- Walks `node_modules` upward from CWD; tolerates scoped packages, missing directories, and malformed `package.json` files
- Duplicate subcommand names resolved first-wins; conflict is reported so callers can escalate or ignore
- CWD self-discovery: if the CLI runs inside a package whose own `package.json` declares bakers, those are registered before `node_modules` scans — lets package authors iterate without symlinking

**Normal-map baker** (contributed by `@three-flatland/normals`)
- `flatland-bake normal <sprite.png>` reads an RGBA PNG, computes 4-neighbor alpha gradient, and writes a sibling `.normal.png`
- Optional `--strength <n>` scales the gradient magnitude

New `@three-flatland/bake` package provides an extensible offline asset pipeline for the Flatland ecosystem; any npm package can contribute CLI subcommands by declaring a `flatland.bakers` manifest field.
