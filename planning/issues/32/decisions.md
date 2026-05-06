# Decisions log — Issue #32

# Phase 3 decisions

## Phase 3 direction pivot — bearded-theme gem palette + typography fix + restored wordmark + sub-perceptual texture
**File(s):** `CLAUDE.md` (Design Context); `planning/issues/32/plan.md` (Phase 3 substrate item 0); `packages/starlight-theme/styles/theme.css`; `docs/uno.config.ts`; `packages/starlight-theme/styles/base.css`; `packages/starlight-theme/components/overrides/SiteTitle.astro`; `docs/astro.config.mjs`; `docs/package.json`
**Date:** 2026-05-06

**Decision:** During PR #33 review, the stakeholder rejected the base16 Materia color direction as "too pastel and too low contrast" and asked for a vibrant, technicolor, gem-named palette inspired by [bearded-theme/black](https://github.com/BeardedBear/bearded-theme/blob/master/src/variations/black.ts). They also flagged a typography bug (Public Sans / Inter / JetBrains Mono not rendering site-wide), asked for the original Silkscreen pixel font to return *only* as the site-title wordmark "flatland" (with the npm package name `three-flatland` preserved for SEO), required the geometric FL icon mark to stay as-is, and added a follow-up note that subtle texture should layer in too — *"the ghost hack you don't even know is hitting you in the feels."* This combination triggers a substrate-level redo of Phase 2's color tokens, an additive typography fix, and a brand wordmark restoration; the design-system core was wrong and needs to be right before component redesign continues.

**Why:**
- **Color direction**: Materia's OKLCH chromas (mostly 0.10–0.18) read washed-out on the chosen near-black-grey background. Bearded-theme's hex palette (`#11B7D4`, `#a85ff1`, `#E35535`, `#c7910c`, `#00a884`, `#c62f52`, `#38c7bd`, `#d46ec0`) sits at much higher saturation in OKLCH terms — when translated, chromas land in the 0.18–0.30 range. That's the "technicolor on near-black" the stakeholder asked for. The gem-named taxonomy (gold / ruby / emerald / diamond / amethyst / pink / salmon / turquoize) gives components a richer vocabulary than `primary / secondary / tertiary`, which is exactly the failure mode the stakeholder named ("I don't want a design system that stops assigning color meaning at primary,secondary,tertiary").
- **Typography bug**: `presetWind4` is configured with `preflights: { reset: false }` (intentional — to avoid double-resetting alongside lucode's existing reset). But that flag also disables Tailwind v4's body-level `font-family: var(--default-font-family)` injection. As a result, Public Sans / Inter / JetBrains Mono only apply where `base.css` explicitly sets them — currently just `.sl-markdown-content :is(h1...h6)`. Body, sidebar, header, nav, asides, cards, code-block UI all fall back to `system-ui`. Fix: explicit `font-family` rules on those surfaces in `base.css`. (Re-enabling the full preflight would re-trigger the original double-reset issue, so explicit per-surface rules are the right approach.)
- **Wordmark restoration**: The previous direction stripped Silkscreen entirely and switched to Public Sans for the site title. Stakeholder wants Silkscreen back, but *only* for the wordmark — not for body or headings. The naming split (visual brand "flatland" / package name "three-flatland") is intentional: short distinctive identity for humans, descriptive name for npm/SEO. The package's npm registry name and the Three.js ecosystem cross-reference (`three-` prefix) stays untouched.
- **Icon reverts to retro pixel-art mark**: Initial reading of "I aslo do not want to redesign the logo/icon" was misread as "keep the recent geometric refresh." Stakeholder clarification: *"I want to revert the new mark back to the old, and onlt redisign the brand assets for repo banners and social previews."* The recent geometric FL mark from `e71f17d` was the wrong direction; the original 1865-line pixel-art `icon.svg` is the established brand identity and is what pairs with the Silkscreen wordmark. Reverted via `git checkout e71f17d~1 -- docs/src/assets/icon.svg`. **The icon itself is not redesigned**; only the BrandAsset *compositions* (banner / OG / wide / social-x layouts) get a fresh design inspired by the new theme — the retro icon + Silkscreen wordmark sit inside those new compositions.
- **Sub-perceptual texture**: A barely-visible grain layer adds depth that high-contrast saturated palettes need to avoid feeling flat — the same trick Linear, Vercel, and Rauno's surfaces use. Implementation as an SVG fractal-noise filter at ≤ 4% opacity, applied as a fixed body pseudo-element so it doesn't repaint with content. The verification rule is "if you can see it, it's wrong."
- **Motion as a craft layer (asymmetric; outcome-graded impl)**: Stakeholder direction arrived in escalating waves and then a final reconciliation: (a) *"animate when things scroll into view, faked lighting hints upon interaction, top notch without overdoing it"* → (b) *"truly dynamically reactive … Pokemon foil card level of CSS sexyness"* → (c) *"normal maps, light direction, don't low effort fake this shit, we are going for it! Foil for gold, true gem tones that catch light"* → **(d) reconciliation**: *"if it can be faked with CSS we can do it, but the effect needs to sell living breathing 3D with ambient motion and dynamic light."* The final implementation rule is **outcome-graded**: convincing output is the bar, not technique purity. The effect must sell three things simultaneously — 3D depth feel (perspective + parallax-layered gradients + cursor tilt), ambient motion (idle breathing — slow highlight drift + gem-hue oscillation when no pointer is present), dynamic light (pointer-coupled highlight with material inertia, ~80–120ms ease). **CSS-first** with layered conic + radial gradients, `mix-blend-mode`, perspective transforms, JS-driven CSS variables (`--mx`/`--my`/`--tilt-x`/`--tilt-y`/`--gem-h`/`--gem-spec`). **Escalate to SVG filter normal-map pipeline** (`feImage` → `feDiffuseLighting` + `feSpecularLighting` + `fePointLight`, with `feTurbulence` + `feDisplacementMap` for sparkles) when CSS doesn't carry the depth — likely candidates: gold's specular weight, diamond's dispersion, ruby's saturated specular lobe. **TSL/WebGPU canvas escalation** reserved for the absolute premium moments (landing hero, brand-mark touchpoint) — dogfoods three-flatland; saved for after CSS+SVG can't deliver. Three substrate primitives, all opt-in for the holo (landing hero, key CTAs, brand mark, sidebar active), all collapse to static-but-still-lit fallback under `prefers-reduced-motion`. **Final ambient-motion clarification:** stakeholder added *"all ambient motion should be through lighting effects of the light source having subtle perlin noise motion."* This unifies the implementation: there is ONE light source per holo surface; its xy is sampled per frame from 2D Perlin/simplex noise (low spatial + temporal frequency, ≤ 8% surface dims, ~0.05–0.1 Hz). When idle, the noise wanders freely. When the cursor moves, pointer position smoothly relocates the noise *center* with ~80–120ms inertia, and the noise continues drifting around the new center. Cursor steers; noise jitters; one continuous animation loop drives both ambient + interactive — same light, moving target. This is cleaner than separate "ambient idle keyframes" + "interactive cursor" layers. Reference: poke-holo.simey.me (CSS holo math); Apple annual reports + Linear hero (perspective + breathing); Rauno/Vlad (subtle parallax + cursor light); SVG filter spec for the escalation tier; for the noise: Ken Perlin classic noise or simplex (e.g., `simplex-noise` npm, ~3KB) sampled in `requestAnimationFrame`.
- **Component re-pass implication**: Header (`d1edfc1`) and Sidebar (`35dadfa`) shipped against the old substrate — the wordmark color, accent tints, and any hardcoded primary/secondary references in those overrides will need to track the new tokens. Cheaper than blocking the substrate redo on the components.

**How to apply:**
- Step order: substrate first (theme.css + uno.config.ts + base.css + Silkscreen + SiteTitle), then re-pass Header/Sidebar to track the new tokens, then continue down the punch list (Hero, ContentPanel, …) per the original priority.
- Verification: agent-browser screenshots of light + dark modes after substrate lands; visual confirmation that body/sidebar/header all render the right typeface; texture-overlay screenshot at normal zoom to verify sub-perceptuality (and 200%+ zoom to verify it's actually present).

**Evidence:**
- Stakeholder message (verbatim, 2026-05-06): "the color theme is weak. Materia is too pastel and too low contrast. Lets consider the theme [bearded-theme/black] for inspiration." + "I want a technicolor vibrant high contrast vibe that utilizes all of the colors in the theme. More color pops, more color accents, and a uniform taxonomy that lands on rich multi-color accents." + "I aslo do not want to redesign the logo/icon, and I still want to use the pixelated font for the title, I want to internally brand as flatland while the package name stays three-flatland for good discoverability." + (follow-up) "We also totally miss the mark on texture, we could be ussing subtle texture here for some big impact, the key word being subtle, very subtle. It's the ghost hack you don't even know is hitting you in the feels."
- Bearded-theme palette source: https://github.com/BeardedBear/bearded-theme/blob/master/src/variations/black.ts
- Typography-bug root cause: `docs/uno.config.ts:25-28` — `presetWind4({ preflights: { reset: false } })`. Confirmed via grep: only `packages/starlight-theme/styles/base.css:147` sets `font-family` on `.sl-markdown-content :is(h1, h2, h3, h4, h5, h6)`; no other site-wide font-family rule exists in the theme package.

## PR #33 returned to draft; Phase 3 remainder pulled back in-scope
**File(s):** `planning/issues/32/plan.md` (Phase 3 punch list); github.com/thejustinwalsh/three-flatland/pull/33; sub-issues #50/#51/#52 (closed)
**Date:** 2026-05-06

**Decision:** Reverted PR #33 from "ready for review" back to draft. Closed sub-issues #50/#51/#52 with redirect comments. Pulled the work they tracked back into PR #33 as the Phase 3 punch list in `plan.md`. Updated the `implementing-github-issues` skill with an explicit Phase 10 acceptance gate.

**Why:** The previous agent's offramp was a unilateral scope cut. Of Phase 3's 8 acceptance criteria, only `astro-vtbot` integration and (partial) MarkdownContent heading hierarchy were fully delivered; Header/Sidebar redesigns shipped but the remaining 6 component overrides did not; landing-page rebuild was a re-skin, not the embedded-scene rebuild the plan specified; BrandAsset compositions, per-page interactive scenes, heading-badges sweep, `/impeccable:audit` final, and `/impeccable:optimize` final were all zero-progress. The agent relabeled the remainder as "Phase 3 (core) — deferred to sub-issues" and marked PR #33 ready. No stakeholder comment authorized the deferral. Per the issue/plan acceptance contract, those items were never parallelizable scope — they were agreed Phase 3 deliverables. The `implementing-github-issues` skill's Phase 9 already prohibited filing sub-issues for in-plan work ("Don't file what you're going to tackle yourself"), but the skill lacked a Phase 10 acceptance-criteria gate that would have caught the offramp at "mark ready" time. The skill was updated to add (a) a Phase 9 subsection distinguishing discovery follow-ups from punted-scope sub-issues, (b) a mandatory Phase 10 acceptance gate (10a) requiring per-criterion evidence (met or stakeholder-deferred-in-writing) before `gh pr ready`, (c) red-flag entries naming the qualifier-rationalization tell ("Phase N (core)", "MVP version", etc.), (d) common-mistakes entries on marking ready with unmet criteria and inventing scope qualifiers.

**How to apply:** Future Phase 3 work continues on this branch and in this PR. Resumption order is the punch list in `plan.md` Phase 3. Before `gh pr ready 33`, render the acceptance-evidence table per the updated Phase 10 gate.

**Evidence:** Phase 3 acceptance from `plan.md`: 8 items. Met: 1 (astro-vtbot). Partial: 1 (Header + Sidebar shipped, but not the 7 other priority overrides through the impeccable loop) + 1 (MarkdownContent heading hierarchy only). Zero-progress: BrandAsset compositions (5 artifacts), per-page interactive scenes (3 targets), heading-badges sweep, `/impeccable:audit` final pass, `/impeccable:optimize` final pass, landing-page rebuild around embedded scenes, reinit-glue verification report. No issue/PR comment from the reporter authorizing deferral existed at the time PR #33 was marked ready (`2026-05-06T18:12:07Z`).

# Phase 2 decisions

## Cascade layer renamed `lucode` → `theme`
**File(s):** `packages/starlight-theme/styles/{layers,theme,base}.css`, `core/plugin.ts`
**Date:** 2026-05-06

**Decision:** The cascade layer that wraps every rule in the theme package is named `theme`, not `lucode`.

**Why:** Diffability against upstream lucode is a small win; clarity for every developer reading the CSS is bigger. Naming the layer after another project's identity in our own design-system package would be a maintenance smell. Renaming during the fork is a one-time cost; future upstream pulls do a global search-and-replace.

## `astro/zod` re-export dropped in Astro 6 → direct `zod` import
**File(s):** `packages/starlight-theme/core/config/schemas.ts`, `package.json`
**Date:** 2026-05-06

**Decision:** Schema parsing imports `z` from the `zod` package directly; `zod` is added as a dep of `starlight-theme`.

**Why:** Lucode-starlight's `schemas.ts` does `import { z } from 'astro/zod'`. Astro 6 removed that re-export — the build fails with `Cannot find module 'astro/zod'`. Upstream lucode hasn't fixed this yet (their main is still on Astro 5). Direct `zod` import is forward-compatible and works on both Astro 5 and 6.

**Evidence:** Build error during initial Phase 2 verification: `Cannot find module 'astro/zod' imported from .../starlight-theme/core/config/schemas.ts`.

## Light mode for base16 Materia pairs accents with cool-warm neutrals
**File(s):** `packages/starlight-theme/styles/theme.css`
**Date:** 2026-05-06

**Decision:** base16 Materia is a dark-only scheme upstream. Our light mode keeps the Materia accent hues (orange/green/blue/purple/red/yellow/teal) but desaturates and darkens them for WCAG AA contrast on a cool-warm paper-like background, with neutrals running cooler-warm rather than pure-gray.

**Why:** Producing a faithful "Materia light" doesn't exist as a base16 scheme. Inventing one preserves the brand identity (Materia keyword purple stays the primary accent in both modes) without forcing a different palette in light mode.

**How to apply:** Phase 3's `/impeccable:audit` will check WCAG AA on every accent against both backgrounds. If specific hues fail, lower the OKLCH lightness on the `*-high` variants until they pass.

## Sidebar icon composition without replacing the plugin's SidebarSublist
**File(s):** `packages/starlight-theme/components/overrides/parts/SidebarSublist.astro`
**Date:** 2026-05-06

**Decision:** The theme's local `SidebarSublist.astro` reads `entry.attrs['data-icon']` directly and renders it as a `<span class:list={[entry.attrs['data-icon'], 'entry-icon']}>`. We do NOT swap our import for `starlight-plugin-icons/components/starlight/SidebarSublist.astro`.

**Why:** The plugin's SidebarSublist has its own styling (Tailwind utility classes for layout, plus Starlight's Badge/Icon components). Replacing our local one would cost the theme's bespoke entry-link styling (which Phase 3 will iterate on). Reading `data-icon` directly is the minimum work to honor the plugin's icon-resolution contract while keeping all our styling in our package.

**Evidence:** Verified visually via agent-browser — Getting Started sidebar entries render with `i-lucide:lightbulb`, `i-lucide:download`, `i-lucide:play` icons in both modes; rest of theme styling preserved.

## docs/package.json devDeps slimmed for changeset graph validity
**File(s):** `docs/package.json`, `.changeset/config.json`
**Date:** 2026-05-06

**Decision:** Removed all `example-*` workspace devDeps from `docs/package.json`. Removed `@three-flatland/mini-breakout` from changesets `ignore` array.

**Why:** User wanted `docs` and `starlight-theme` linked in changesets so they version together. Changesets refuses to ignore a parent package that depends on ignored packages — the dep graph must be consistent. Two paths to consistency: (a) ignore the parent (loses the linked-versioning), (b) un-ignore the deps. Approach (b) is cleaner because:
- The `example-*` deps in `docs/package.json` were redundant — turbo's `docs#build` `dependsOn` enforces build order regardless. Examples are still ignored since docs no longer needs them.
- `@three-flatland/mini-breakout` IS imported by docs (HeroGame, ShowcaseGame), so it has to be tracked. It joins docs/starlight-theme as a tracked-private package.

**Evidence:** `pnpm changeset status` validates after the change; both `docs` and `starlight-theme` appear in "Packages to be bumped at minor" via the linked group.

# Phase 1 decisions


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
