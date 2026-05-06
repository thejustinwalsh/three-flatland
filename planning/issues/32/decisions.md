# Decisions log — Issue #32 Phase 1

## Astro 5 → 6 migration is mandatory, not optional
**File(s):** `docs/package.json`
**Date:** 2026-05-06

**Decision:** Phase 1 includes the Astro 5 → 6 migration. The plan's fallback ("stay on latest 5.x, file follow-up") is off the table.

**Why:** Peer-dep audit showed:
- `@astrojs/starlight@0.38.4` requires `astro@^6.0.0`
- `starlight-llms-txt@0.8.1` requires `astro@^6.0.0`
- `starlight-heading-badges@0.7.0` requires `@astrojs/starlight@>=0.38.0` (which itself requires Astro 6)

The issue explicitly says "Update to the latest starlight version, ensure all plugins are on the latest version as well." The latest Starlight requires Astro 6. There's no path to add the new plugins without bumping Astro to 6.

**Evidence:** `npm view @astrojs/starlight@0.38.4 peerDependencies` returns `{ astro: '^6.0.0' }`.

## Removed sidebar entries for slug-text content
**File(s):** `docs/astro.config.mjs:236`, `docs/astro.config.mjs:251`
**Date:** 2026-05-06

**Decision:** Drop `guides/slug-text` and `examples/slug-text` from the sidebar.

**Why:** Both entries referenced content that doesn't exist on `main` (only on the active `feat-slug` branch). Starlight 0.33 silently dropped missing-slug entries; Starlight 0.38 throws `AstroUserError: The slug … does not exist` and fails the build. The Phase 1 PR is branched from `main`, so the missing content is genuinely missing here. When `feat-slug` merges and brings the actual MDX content, the sidebar entries can be re-added in that PR.

**Evidence:** `ls docs/src/content/docs/guides/` and `examples/` confirm no `slug-text.mdx` files. Build error: `linkFromInternalSidebarLinkItem` rejects missing slugs.

**How to apply:** When `feat-slug` lands on `main`, re-add the two sidebar entries.

## Astro 6 content collections require loaders + relocation
**File(s):** `docs/src/content.config.ts` (new), `docs/src/content/config.ts` (deleted)
**Date:** 2026-05-06

**Decision:** Moved `src/content/config.ts` to `src/content.config.ts` (root of `src/`) and switched `defineCollection` to use `docsLoader()` from `@astrojs/starlight/loaders`.

**Why:** Astro 6 removed legacy content collections (no-loader path). Starlight ships `docsLoader()` for this purpose. The relocation is required by Astro 6's new content config discovery.

**Evidence:** Astro 6 throws `LegacyContentConfigError` at build time without the move. https://docs.astro.build/en/guides/upgrade-to/v6/#removed-legacy-content-collections.

## Vite 7 explicit dep + @unocss/astro explicit dep
**File(s):** `docs/package.json`
**Date:** 2026-05-06

**Decision:** Pin `vite: ^7.3.2` directly in `docs` devDeps (not from the workspace catalog, which still holds `vite: ^6.4.1`); add `@unocss/astro: ^66.6.8` as an explicit dep.

**Why:**
- Astro 6 brings Vite 7 transitively, but pnpm strict mode hides it from `docs`'s tsconfig view, breaking `import('vite').Plugin` JSDoc types in `vite-plugins/*.js`. Local pin gives `astro check` a Vite 7 type tree without forcing a workspace-wide catalog bump.
- `unocss/astro` is a subpath of the `unocss` package whose runtime `astro.mjs` does `import '@unocss/astro'` — this is an *optional* peer that pnpm strict mode does not auto-install. Without the explicit dep, the build fails with `Cannot find package '@unocss/astro'`.

**Why not bump the catalog Vite to 7:** would force the catalog change on every example (mini-breakout, examples/*) and risk a cascade of unrelated breakage. The Phase 2/3 PRs (or a follow-up "catalog Vite 7" PR) are a better home.

## starlight-plugin-icons needs unocss as a peer
**File(s):** `docs/package.json`
**Date:** 2026-05-06

**Decision:** Adding `unocss` as a docs dependency alongside `starlight-plugin-icons`.

**Why:** The plugin uses unocss to ship icons via `@iconify-json/*` collections. Stated peer deps: `unocss: '>=0.58.0'`. Without it, the plugin won't function.

**Evidence:** `npm view starlight-plugin-icons@1.1.6 peerDependencies` lists unocss as required.
