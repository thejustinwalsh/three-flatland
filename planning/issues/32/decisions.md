# Decisions log — Issue #32

## Phase 2/3 strategy: fork lucode-starlight as our internal design system, not `npm install` it
**Files:** `planning/issues/32/plan.md` (revised); future `packages/starlight-flatland/`
**Date:** 2026-05-06

**Decision:** Phase 2 vendors [`lucode-starlight`](https://github.com/lucas-labs/lucode-starlight-theme) into `packages/starlight-flatland/` as a private workspace package and reskins it. Phase 3 then drives a component-by-component redesign through the `/impeccable:*` skill family and adds `astro-vtbot` for SPA polish.

**Why:**
- The original Phase 2/3 split (typography → theme) was still framed as "edit `retro-theme.css` + the existing component overrides" — i.e., more of the same hand-patched CSS approach the issue is asking us to escape.
- Lucode is a Starlight plugin already shaped exactly the way our design system should be: token layers in `styles/{base,layers,theme}.css`, 17 component overrides registered through Starlight's plugin API, expressive-code config, vite config, schema extension. It's MIT-licensed; peer-dep is `@astrojs/starlight >=0.38.3` (we land on 0.38.4 in Phase 1, so already aligned).
- Forking instead of installing trades upstream-update-for-free against full ownership. Given (a) lucode is at `0.1.x` and likely to break, (b) the issue brief's design direction (Ableton/Bitwig minimalism, base16 Materia, Dieter Rams) is a different language than lucode's shadcn-derivative starting point, and (c) we want this to be "our design system, self-maintained," fork wins on every axis except getting upstream bug fixes for free.
- Restructuring the phases also lets Phase 2 land *infrastructure* (the plugin scaffold + tokens) and Phase 3 land *design work* (the actual aesthetic). That's a much cleaner review boundary than the previous "typography PR + theme PR" split that artificially separated two halves of the same change.

**How to apply:**
- Phase 2: copy lucode source verbatim, retheme tokens to base16 Materia + the new typography stack, swap out the existing `docs/src/styles/*.css` and the six theme-shaped component overrides (Hero, PageFrame, ThemeSelect, SiteTitle, SocialIcons, Head). Run `/impeccable:teach-impeccable` once at the start, `/impeccable:extract` and `/impeccable:normalize` during, `/impeccable:audit` to baseline at the end.
- Phase 3: per-component redesign loop (`critique → distill → frontend-design → harden → polish → adapt`) through every override. Add astro-vtbot for SPA polish (`<VtbotStarlight />`, `<PageOrder />`, `<AutoNameSelected />`, `<LoadingIndicator />`, `<BorderControl />` for MFE realm boundaries). Sidebar-state preservation comes for free with vtbot — currently lost on every nav.

**Why astro-vtbot specifically and not just `<ClientRouter />`:**
- `<ClientRouter />` alone gives SPA navigation but no Starlight-aware niceties.
- vtbot is the canonical "Starlight + view transitions polish" library — it knows about Starlight's component shape, sidebar structure, and realm boundaries.
- It does NOT replace per-feature reinit glue (Pagefind, theme, table-scroll). Those problems are app-specific and stay hand-rolled — but get audited and pruned in Phase 3 since Starlight 0.38 may have closed some of those gaps natively.

**Evidence:** lucode `package.json` exports list 17 component overrides + 3 styles + a schema extension; peerDeps `{ @astrojs/starlight: '>=0.38.3' }`; MIT license. Repo: https://github.com/lucas-labs/lucode-starlight-theme.

---

## Tailwind authoring via UnoCSS `presetWind4`, not `@astrojs/starlight-tailwind`
**Files:** `docs/uno.config.ts` (Phase 2 update); future `packages/starlight-theme/`
**Date:** 2026-05-06

**Decision:** Phase 2 enables `@unocss/preset-wind4` on top of our existing UnoCSS configuration. We do NOT install `@astrojs/starlight-tailwind` or the `tailwindcss` package.

**Why:**
- We already run UnoCSS (it's the peer-dep behind `starlight-plugin-icons` from Phase 1).
- `@unocss/preset-wind4@66.6.8` is in the installed tree and is spec-compatible with Tailwind v4 — same vocabulary, same `theme` semantics, same `@apply` support.
- Switching to `@astrojs/starlight-tailwind` (v5, peer-deps `tailwindcss: ^4.0.0`) would either: (a) run two utility-class runtimes side-by-side, OR (b) require replacing `starlight-plugin-icons` with a different icon system to drop UnoCSS entirely. Both are net-negative — the first adds bundle size and maintenance, the second throws away Phase 1's icon wiring.
- The user's underlying concern — "Tailwind is easier to maintain for a theme than custom CSS" — is real and addressed by adopting the Tailwind utility vocabulary. Whether the runtime is named "Tailwind" or "UnoCSS+presetWind4" is irrelevant for the authoring experience.

**Trade-off accepted:** AI/agent fluency is slightly lower with UnoCSS than with vanilla Tailwind (less corpus). Mitigation: lucode's structure already pre-organizes the theme into tokens + cascade layers + component overrides, so authoring is mostly utility-class application within a fixed scaffold — even an agent unfamiliar with UnoCSS specifics can work productively because the surface area is small (`presetWind4` + iconify; that's it).

**Evidence:** `npm view @unocss/preset-wind4` → `66.6.8`; `ls node_modules/.pnpm/@unocss+preset-wind4*` → installed.

---

## Phase 2 package naming: `starlight-theme` (private workspace package)
**Files:** `packages/starlight-theme/package.json` (Phase 2)
**Date:** 2026-05-06

**Decision:** The forked Starlight theme plugin is named `starlight-theme` (unscoped, `private: true`) and lives at `packages/starlight-theme/`. Workspace consumers reference it as `"starlight-theme": "workspace:*"`.

**Why:** User preference. Convention-wise the repo has both unscoped (`three-flatland`) and scoped (`@three-flatland/nodes`, `@three-flatland/mini-breakout`) names; for a private theme package that's never published, the unscoped form is shorter and reads cleanly in `astro.config.mjs` imports.

---

# Phase 1 decisions



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
