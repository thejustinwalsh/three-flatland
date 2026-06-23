# docs/ agent guidance

## REQUIRED: verify the docs build after any change

After **any** edit inside `docs/`, the build must pass before the change is considered done. Run:

```sh
# From the repo root — builds the deps the docs site imports
pnpm --filter=@three-flatland/mini-breakout build

# Then typecheck the docs site
cd docs && npx astro check
```

`astro check` exits non-zero on TypeScript or MDX type errors. Fix all errors before marking work complete.

A full production build uses `astro check && astro build` (the `build` script in `docs/package.json`). The turbo `docs#build` task depends on every example package and several workspace packages — running it from the root via `turbo run docs#build` is the canonical full build, but it is slow. Use `astro check` for fast iteration.

## Gotchas

### Workspace deps must be built first

`astro check` / `astro build` import workspace packages at build time. If `dist/` is absent, Astro will fail with `Cannot find module '@three-flatland/...'` or similar. Build the affected packages before running the docs build.

The minimal set for the docs site to resolve is:

- `pnpm --filter=@three-flatland/mini-breakout build` (pulls in its own dep chain)
- All example packages listed in `turbo.json` under `docs#build.dependsOn`

`turbo run docs#build` handles the full dep graph automatically. For one-off changes, building only the changed package plus `mini-breakout` is usually sufficient.

### `@three-flatland/skia` may fail locally

`skia` requires the Zig WASM toolchain. If Zig is not installed, `pnpm build` from the root will fail at the `skia` step. Options:

- Skip skia: `turbo run docs#build --filter=docs...^@three-flatland/skia` is not straightforward; the easiest workaround is to build all non-skia deps individually.
- `astro check` itself does **not** import skia directly (it's only loaded at runtime in examples); skia build failure only blocks `turbo run docs#build`, not `astro check` alone.
- If skia is absent from `dist/`, example pages that import it will fail to type-check. In that case, either install Zig and build skia, or skip those pages.

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
