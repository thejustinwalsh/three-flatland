# Issue #32: Docs Refresh

**Link:** https://github.com/thejustinwalsh/three-flatland/issues/32
**Branch (Phase 1):** `docs-refresh-foundation` — shipped as PR #33

## Goal

Modernize the docs site in three reviewable phases:
1. **Foundation** — Astro 6, Starlight 0.38, replace hand-rolled icon and llms.txt hacks with community plugins. *(shipped)*
2. **Design system** — fork [`lucode-starlight`](https://github.com/lucas-labs/lucode-starlight-theme) into a workspace-local Starlight plugin, retheme its tokens to base16 Materia + the new typography stack. Establishes a self-maintained design system instead of hand-patching CSS and component overrides ad-hoc.
3. **Redesign + polish** — drive a component-by-component redesign through the `/impeccable:*` skills, rebuild the landing page with embedded three-flatland scenes, add `astro-vtbot` for SPA polish (loading indicators, page-order morphs, sidebar-state preservation, MFE border control).

The redesign is intentionally scoped *behind* a design-system substrate so each component decision lives in one place, gets tokenized once, and propagates everywhere — the opposite of the current pattern where `retro-theme.css` (1605 lines) and 26 ad-hoc `.astro` components fight each other.

---

## Phase 1 — Foundation ✅ shipped as PR #33

See PR description for the full report. Summary:
- Astro 5 → 6 + Starlight 0.33 → 0.38 migration (forced by all three new plugins requiring Astro 6)
- Replaced `Icon.astro` SVG-injection hack with `starlight-plugin-icons` (UnoCSS + iconify)
- Replaced hand-maintained `docs/public/llms*.txt` with `starlight-llms-txt` (raw-content mode)
- Added `starlight-heading-badges` for `## Heading :badge[…]` syntax
- Migration drive-bys: content config relocation, `process.cwd()`-based path resolution, sidebar-config cleanup
- Follow-ups filed: #34 (catalog Vite 7), #35 (Starlight `Props` deprecation), #36 (unused `isProd`)

Out-of-band cleanup deferred from Phase 1 (small, focused PRs):
- Remove `window.__gpuSupported` global + inline `<script is:inline>`. Move detection into a `useGPUSupport()` hook in `docs/src/utils/`; render proper "WebGPU/WebGL2 required" fallback in `HeroGame`/`ShowcaseGame` instead of `return null`. Discovered while exploring scope; out of foundation scope but in spirit of "remove hand-rolled hacks."

---

## Phase 2 — Design system: fork `lucode-starlight` → `packages/starlight-theme`

**Goal:** stand up a self-maintained design system as a workspace-local Starlight plugin (private; package name `starlight-theme`). End of phase: docs site renders via `plugins: [starlightTheme()]` with our tokens; visual style is shadcn-leaning but already wearing the base16 Materia palette and the new typography, with utility-class authoring everywhere via UnoCSS's Tailwind v4–spec preset. No bespoke component redesigns yet — that's Phase 3.

### Why fork instead of `npm install`

| | `npm install lucode-starlight` | Fork into `packages/starlight-theme` |
|---|---|---|
| Upstream churn risk | High — lucode is `0.1.x`, breaking changes likely | None |
| Customization surface | Limited to plugin's options + CSS overrides | Full control of every token, override, and Astro file |
| Maintenance | Free upstream improvements; harder local mods | We own everything; pull bug fixes manually |
| Brand alignment | Always shadcn-derivative | Becomes our brand |
| Phase 3 work | Constrained by lucode's structure | Scaffolding bends to our design |

The issue brief explicitly wants "sleek, minimal, clean … Ableton/Bitwig … classic Scandinavian … Dieter Rams." That's not a config tweak on top of shadcn; it's a different design language. Forking is the honest framing of what we're doing.

### Vendoring approach

1. Add a workspace package under `packages/starlight-theme/` — private, never published. `package.json` carries `"name": "starlight-theme"` and `"private": true`. Workspace consumers reference it via `"starlight-theme": "workspace:*"`.
2. Copy lucode source verbatim from `lucas-labs/lucode-starlight-theme@master:packages/lucode-starlight/` into our new package. Preserve their git history reference in the package README under "Attribution" (lucode is MIT; lucode itself credits `adrian-ub/starlight-theme-black`).
3. Match lucode's structure exactly so we can compare diffs against upstream when we want to pull a fix:
   ```
   packages/starlight-theme/
     core/
       plugin.ts               (Starlight plugin entry)
       config/
         constants.ts
         expresive-code.ts
         override.ts
         schemas.ts
         vite.ts
     components/
       overrides/              (17 Starlight component overrides)
       custom/                 (ContainerSection, LinkButton, dropdown)
     styles/
       base.css                (reset / element baseline)
       layers.css              (cascade-layer setup)
       theme.css               (tokens + light/dark)
     index.ts                  (export default plugin)
     schema.ts                 (ExtendDocsSchema)
     user-components.ts        (re-exports for content authors)
     package.json
     README.md                 (our README + attribution to lucode + black)
   ```
4. Wire it into the docs site's astro.config.mjs:
   ```js
   import starlightTheme from 'starlight-theme'
   // …
   Icons({
     starlight: {
       plugins: [
         starlightTypeDoc(...),
         starlightHeadingBadges(),
         starlightLlmsTxt({ rawContent: true }),
         starlightTheme(),
       ],
     },
   })
   ```
   Order matters: `starlight-theme` goes last so its overrides win.

### Authoring substrate: UnoCSS + Tailwind v4 spec via `presetWind4`

We already run UnoCSS (peer-dep behind `starlight-plugin-icons`). Phase 2 also enables `@unocss/preset-wind4` (already in the installed tree at `66.6.8`) so component overrides can author with the Tailwind v4 utility vocabulary instead of bespoke CSS in `<style>` blocks. Same authoring experience as adopting Tailwind, single runtime, keeps the iconify integration we set up in Phase 1.

```ts
// docs/uno.config.ts (post-phase-2)
import { defineConfig, presetWind4 } from 'unocss'
import { presetStarlightIcons } from 'starlight-plugin-icons/uno'

export default defineConfig({
  presets: [
    presetStarlightIcons(),
    presetWind4(),
  ],
  theme: {
    // base16 Materia tokens — single source of truth for the design system.
    // Mirrored to Starlight's --sl-color-* CSS vars in starlight-theme/styles/theme.css
    // so Starlight's own components also pick them up.
    colors: { /* base16 Materia */ },
    fontFamily: {
      sans: ['Public Sans', 'system-ui', 'sans-serif'],
      nav: ['Inter', 'system-ui', 'sans-serif'],
      prose: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      code: ['Commit Mono', 'JetBrains Mono', 'ui-monospace', 'monospace'],
    },
  },
})
```

**Why UnoCSS-with-Wind4 instead of `@astrojs/starlight-tailwind`:**

| | UnoCSS + `presetWind4` | `@astrojs/starlight-tailwind` v5 + Tailwind v4 |
|---|---|---|
| Runtime systems | One (UnoCSS, already installed) | Two (Tailwind + still need UnoCSS for `starlight-plugin-icons`) OR replace iconify wiring |
| Tailwind vocabulary fluency | Same — `presetWind4` is spec-compatible | Same |
| AI / agent fluency | Slightly lower than vanilla Tailwind | Highest |
| Build size | Smaller (one runtime) | Larger (or icon-system rework to drop UnoCSS) |
| Phase 1 churn | None | Significant — rewires the icon system |

Trading "vanilla Tailwind ecosystem" for "no Phase 1 rework + single utility runtime" is the right call here. Lucode's existing structure (cascade layers in `layers.css`, design tokens in `theme.css`) already aligns with Tailwind v4's mental model — this is a substrate swap, not a rewrite.

### Token layer (base16 Materia + typography)

Replace the contents of `styles/theme.css` (lucode's shadcn tokens) with base16 Materia mapped onto Starlight's `--sl-color-*` system. Reference: https://github.com/Defman21/base16-materia-scheme.

Typography swap (formerly old Phase 2, now folded in here since it's just additional tokens):

| Role | Font |
|---|---|
| Headings, titles, section titles | Public Sans |
| Navigation, sidebar links, section links | Inter |
| Prose | JetBrains Mono |
| Code blocks | Commit Mono (verify availability — fallback: JetBrains Mono if Fontsource doesn't ship Commit Mono and self-hosting is too much work for Phase 2) |

Drop existing `@fontsource/silkscreen`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` from `docs/package.json` and from the `customCss` array in `astro.config.mjs`. The Starlight plugin's CSS layer registers the new fontsource imports.

### Files this phase deletes from `docs/src/`

Once `starlight-theme` lands, these become dead code:
- `docs/src/styles/retro-theme.css` (1605 lines — replaced by `theme.css` in the plugin)
- `docs/src/styles/patterns.css` (137 lines of dithering — incompatible with the new aesthetic; some patterns may migrate to a `patterns/` subset if we want subtle texture)
- `docs/src/styles/global.css`, `docs/src/styles/custom.css` (folded into `base.css` in the plugin)
- Selected component overrides currently in `docs/src/components/`: `Hero.astro`, `PageFrame.astro`, `ThemeSelect.astro`, `SiteTitle.astro`, `SocialIcons.astro`, `Head.astro`. The plugin replaces these via Starlight's components map.
- `RetroBackground.astro`, `RetroHero.astro` — pixel-art treatments, replaced by Phase 3 components.

Site-specific components stay in `docs/src/components/` (they're content/page concerns, not theme concerns): `BrandAsset`, `BrandIcon`, `Card`, `CardGrid`, `CaptureModal`, `ExamplePreview`, `ExampleTabs`, `FeatureCard`, `FeatureList`, `HeroGame`, `HeroGradient`, `LinkButton`, `ShowcaseGame`, `SoundToggle`, `StackBlitzEmbed`, `StatsBanner`, `ValueProp`, `Icon`.

### Skill choreography for Phase 2

Run **before any code**:
- `/impeccable:teach-impeccable` — one-time setup; captures our design context (brand voice, palette, type stack, motion principles, Ableton/Bitwig/Scandinavian/Dieter Rams direction) and writes it to AI config so subsequent skills are grounded.

Run **during the fork**:
- `/impeccable:extract` on the existing `docs/src/styles/` + `docs/src/components/` to inventory tokens and patterns *before* deleting them — catches anything site-specific worth preserving in the new design system (e.g., the brand palette assignments that aren't pure base16).
- `/impeccable:normalize` against the new `theme.css` to ensure tokens are coherent across light/dark modes and that lucode's existing component overrides reference our tokens (not the leftover shadcn variables).

Run **at the end of Phase 2**:
- `/impeccable:audit` against the docs site to baseline a11y, perf, theming, and responsive behavior on the new substrate. Captures regressions from the swap and seeds the Phase 3 work list.

### Phase 2 acceptance

- [ ] `packages/starlight-theme/` exists as a workspace package (private, name `starlight-theme`), registered in `pnpm-workspace.yaml`
- [ ] Plugin registers cleanly in `astro.config.mjs`, build passes, type check passes
- [ ] `@unocss/preset-wind4` enabled in `docs/uno.config.ts`; sample utility classes (`px-4`, `bg-bg-2`, `font-prose`) resolve in built CSS
- [ ] base16 Materia tokens are the single source in `uno.config.ts` `theme` field, mirrored to Starlight's `--sl-color-*` vars in `starlight-theme/styles/theme.css`; light + dark modes verified in browser
- [ ] Public Sans / Inter / JetBrains Mono / Commit Mono load locally (no external font requests)
- [ ] All four `docs/src/styles/*.css` files deleted; the `customCss` array in `astro.config.mjs` no longer references them
- [ ] Six component overrides removed from `components: { … }` map (provided by the plugin instead)
- [ ] `impeccable:audit` report captured in `planning/issues/32/phase-2-audit.md` for Phase 3 to act on

---

## Phase 3 — Redesign + polish

**Goal:** drive the actual visual redesign through the design system Phase 2 stood up. Each component override gets a Flatland-aligned design pass; the landing page is rebuilt; SPA polish is added; visualizations get embedded in selected guide pages.

### Component-by-component redesign

For each Starlight component override in `packages/starlight-theme/components/overrides/`, apply this loop:

```
1. /impeccable:critique     — UX evaluation of the current (lucode-derived) state
2. /impeccable:distill      — strip to essence; remove anything not earning its keep
3. /impeccable:frontend-design — implement the redesigned component
4. /impeccable:harden       — error states, edge cases, i18n, overflow
5. /impeccable:polish       — alignment, spacing, consistency
6. /impeccable:adapt        — verify across screen sizes
```

Priority order (high-traffic first): `Header` → `Sidebar` → `Hero` → `ContentPanel` → `MarkdownContent` → `PageSidebar` (TOC) → `Search` → `Pagination` → `Footer` → remainder.

### Landing page rebuild (`docs/src/content/docs/index.mdx`)

The current landing is a feature-card grid + tabs. Issue brief calls for a "creative design aesthetic" with "interactivity and visuals" weaving through. Approach:

1. `/impeccable:onboard` to design the first-time visitor experience (what does someone landing on /three-flatland/ at hour zero need to see?).
2. `/impeccable:frontend-design` to compose the page — minimalist DAW-inspired layout, embedded three-flatland scenes via `<HeroGame />` and supplemental scenes.
3. `/impeccable:colorize` and `/impeccable:delight` to layer in personality without overwhelming the Dieter-Rams baseline.
4. `/impeccable:bolder` *or* `/impeccable:quieter` — judgment call after first composition; the brief calls for "modern affection for contrast and functional color," which suggests bolder is the safer bias.

### Per-page interactive visualizations

Pick 2–3 high-value guide pages and embed an interactive three-flatland scene that demonstrates the topic, beyond the existing iframe `<ExamplePreview />`:

- `guides/tsl-nodes.mdx` — node-graph editor showing live shader composition
- `guides/pass-effects.mdx` — toggleable pass stack with side-by-side preview
- `guides/tilemaps.mdx` — small interactive tilemap with brush controls

Each gets a `/impeccable:delight` pass after the technical wiring is done. These are bespoke; they live in `docs/src/components/scenes/` and are embedded with `<ClientOnly>`-style guards.

### SPA polish via `astro-vtbot`

Add `astro-vtbot` for first-party-feeling client navigation. It does *not* replace the per-feature reinit glue (Pagefind, theme, table-scroll); those remain. What it adds:

- `<VtbotStarlight />` replaces the bare `<ClientRouter />` in our Head override with Starlight-aware defaults
- `<PageOrder />` — animation direction follows sidebar order (back/forward feel for free)
- `<AutoNameSelected />` — auto-assigned `view-transition-name`s on headings → smooth title morphs between pages
- `<LoadingIndicator />` or `<ProgressBar />` — visual feedback for slow pages (typedoc-heavy API ref pages)
- `<BorderControl />` — force hard reload at MFE realm boundaries (`/three-flatland/examples/three/...` iframes are a different realm; soft swap there breaks state)
- Sidebar-state preservation (collapsed groups, scroll position) across navigation — currently lost on every nav

After the wiring lands, run `/impeccable:animate` to design morph/transition timings (durations, easings, choreography) per the new aesthetic. Reduced-motion respected throughout — `/impeccable:harden` covers that.

### Heading-badges sweep (deferred from Phase 1)

`starlight-heading-badges` is installed but no badges are placed yet. Sweep selected pages to mark version-tied features and platform-divergent behaviors:

```md
## SpriteGroup :badge[v0.2]
## WebGPU initialization :badge[WebGPU only]
```

Pick this up after the design system + components are stable so we're not chasing markup that's about to change.

### Phase 3 acceptance

- [ ] Each component override in `packages/starlight-theme/components/overrides/` has been through the impeccable loop and reflects the new aesthetic
- [ ] Landing page rebuilt; embedded scenes render on supported browsers, fall back gracefully otherwise (proper UI, not `return null`)
- [ ] At least 2 guide pages have an embedded interactive visualization beyond `<ExamplePreview />`
- [ ] `astro-vtbot` integrated; smooth navigation verified between Guides ↔ Examples ↔ Showcases; reduced-motion respected
- [ ] Pagefind, theme, and table-scroll glue confirmed still working after vtbot integration (see Phase 3 reinit-glue audit task below)
- [ ] `/impeccable:audit` final pass shows ≤ N regressions vs. Phase 2 baseline, with ≥ X improvements in the perf/a11y axes
- [ ] `/impeccable:optimize` final pass — bundle size, image optimization, font loading, animation cost
- [ ] Heading-badges placed on pages with version-tied or platform-divergent features

---

## Cross-cutting: reinit-glue audit (do once, before Phase 3 finishes)

The current `Head.astro` carries five hand-rolled scripts that survive view transitions. After Phase 1 + Phase 2 land, probe each to see if it's still required (Astro 6 / Starlight 0.38 may have closed some gaps):

| Glue | File:line | Probe |
|---|---|---|
| Theme `data-theme` re-apply on `astro:after-swap` | Head.astro:24–44 | Comment out, verify theme persists across nav. Starlight's ThemeSelect should handle it natively. |
| GPU/WebGL feature detection (`window.__gpuSupported`) | Head.astro:46–56 | Replace with a `useGPUSupport()` hook + proper fallback UI in HeroGame/ShowcaseGame. Tracked separately (see Phase 1 follow-up note). |
| Pagefind reinit + suggestions | Head.astro:58–130 | Comment out reinit branch, navigate with search panel open. Suggestions injection stays site-specific. |
| HMR `astro:page-load` re-dispatch | Head.astro:132–141 | Comment out, verify dev HMR doesn't break ClientRouter state. May be fixed in Astro 6. |
| Table-scroll wrapper enhancement | Head.astro:143–202 | Stays — site-specific UX. May move into `starlight-theme`'s MarkdownContent override if widely useful. |

File any that are still required as proper utilities under `docs/src/utils/`; remove the others.

---

## Files this skill creates

```
planning/issues/32/
  plan.md         (this file — mirrored as issue comment)
  decisions.md    (appended during each phase's implementation)
  phase-2-audit.md  (created at end of Phase 2 by /impeccable:audit)
```
