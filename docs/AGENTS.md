# docs/ agent guidance

## REQUIRED: verify the docs build after any change

After **any** edit inside `docs/`, the build must pass before the change is considered done. Run:

```sh
# From the repo root: Nx builds every dependency before checking and building docs.
pnpm nx build docs
```

The `docs` build runs `astro check && astro build` and exits non-zero on TypeScript or MDX errors.
For a fast check after dependencies have been built, run `pnpm --filter docs exec astro check`.

## REQUIRED: preserve Koota design provenance

Every public page that discusses three-flatland's private or internal renderer ECS must retain all
three parts of the project's Koota attribution:

1. Link to [Koota](https://github.com/pmndrs/koota).
2. State that Koota's typed-trait, structure-of-arrays, query, and system model made the specialized
   Flatland design possible.
3. State that Koota remains the recommended general-purpose ECS for application and gameplay state.

This applies to guides, explanations, README prose, release notes, migration notes, and future public
architecture material. Removing Koota as a former package peer must never be framed as replacing or
superseding Koota. `privateArchitectureContract.test.ts` enforces the attribution on public files that
describe the private system; this instruction is the authoring rule for new pages.

## Gotchas

### Workspace deps must be built first

`astro check` / `astro build` import workspace packages at build time. If `dist/` is absent, Astro will fail with `Cannot find module '@three-flatland/...'` or similar. Build the affected packages before running the docs build.

Use `pnpm nx build docs` to build the dependency graph in order. A direct package build does not
build its workspace dependencies first.

### Skia WASM builds

`skia` reuses committed WASM libraries when their source freshness stamp matches. A fresh checkout
can build its TypeScript wrappers on macOS without recompiling WASM. If WASM sources change, use the
supported host/toolchain described in `packages/skia/AGENTS.md`. Do not skip a failed package build
or pack stale output. Skia's font tests also require its pinned `third_party/skia` submodule.

### Tabs/TabItem import — silent style bug

Always import `Tabs` and `TabItem` from `starlight-theme/components`, never from `@astrojs/starlight/components`. Both resolve at compile time; the wrong import produces unstyled tabs with no build error.

```mdx
// correct
import { Tabs, TabItem } from 'starlight-theme/components'

// wrong — silent style regression
import { Tabs, TabItem } from '@astrojs/starlight/components'
```

### Gallery index is a static list

Example pages are auto-discovered by their frontmatter for the individual detail pages, but `docs/src/content/docs/examples/index.mdx` is a **manually maintained** list. When adding a new example page, you must also add an entry to that file. The page will exist at its URL without this step, but it will not appear in the gallery.

### `loadExample` path convention

Example code is loaded via `loadExample('three' | 'react', name)` in the page frontmatter. The `name` argument must match the directory name under `examples/three/` and `examples/react/`. Examples always come in pairs — both the Three.js and React variants must exist before their page is added.
