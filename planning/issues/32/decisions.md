# Decisions log — Issue #32

# Phase 3 decisions

## Phase 3.x: Examples + Showcases as top-level masonry surfaces
**File(s):** `docs/src/components/gallery/{GalleryGrid,GalleryTile}.astro`; `docs/src/content/docs/{examples,showcases}/index.mdx`; `docs/scripts/capture-examples.mjs`; `docs/astro.config.mjs` (`navLinks` + sidebar trim); `packages/starlight-theme/components/overrides/parts/NavBar.astro` (active-state); `docs/src/components/ExamplePreview.tsx` (view-transition pairing)
**Date:** 2026-05-07

**Decision:** Lift Examples and Showcases out of the docs sidebar into their own `template: splash` index pages reachable from new top-of-page nav links (Docs / Examples / Showcases). Replace the sidebar lists with masonry grids of tiles that lazy-load a poster + a hover-played `<video>` (recorded from each example's `<canvas>` buffer). Pair the tile to its detail page via a slug-derived `view-transition-name` so the browser morphs the tile geometry into the preview iframe on click.

**Why:** Stakeholder ask — the existing examples/showcases sidebar entries felt like docs pages but the experience is interactive demos, not prose. A masonry surface with hover-preview tiles is the right read for that content. Three top-level surfaces (Docs / Examples / Showcases) match how users mentally split the content too.

**Terminology:** "Examples" stays for focused single-feature demos; "Showcases" stays for full app/game demos. Minis (e.g. `mini-breakout`) are implementation packages — not user-facing — and don't get a top-level surface.

**Capture path:** Playwright headless (path A from the design intake), recording from `canvas.captureStream(30)` + `MediaRecorder`. Skips devtools overlays AND the example's stats/Tweakpane chrome, so the recording is clean canvas only. Trigger: `pnpm --filter=docs capture:examples`. Captures go to `docs/public/captures/<slug>.{png,webm}` and are gitignored as runtime-regenerable artifacts (`.gitkeep` keeps the directory present for the build).

**Hover-video model:** Lazy (path b). The `<video>` element ships with `data-src` only; on first `pointerenter` we copy it onto `src` and call `play()`. First-frame swap fires on `loadeddata`, so even if autoplay is blocked the tile still flips from poster → video frame. Subsequent hovers just toggle play/pause. Reduced-motion skips the swap entirely.

**View transitions:** Tile carries `view-transition-name: tile-examples-<slug>`; ExamplePreview's iframe carries the same name. On click, the browser pair-morphs the tile's bounding box into the iframe's bounding box. Page-content alpha blends are the browser's default root cross-fade — no explicit choreography needed.

**PR:** Lands on `docs-refresh-foundation` (#33) as Phase 3.x — keeps the workstream consolidated rather than fragmenting into a parallel PR.

**How to apply:** Future example/showcase additions need (a) an entry in the masonry index MDX, (b) the example to exist at `examples/three/<slug>/`, (c) a capture run to populate posters + videos. The Playwright script's inventory at `docs/scripts/capture-examples.mjs` should be kept in sync with the masonry tiles.

---

## Site-title position parity between landing and docs
**File(s):** `packages/starlight-theme/components/overrides/PageFrame.astro` (removed `[data-landing] > header :global(.site-title-wrapper) { margin-left }` overrides)
**Date:** 2026-05-07

**Decision:** The wordmark + FL icon sit at the same x position on landing as on every docs page. Removed the landing-only `margin-left: 5rem` (3rem mobile) push that previously cleared the alpha ribbon's diagonal cutoff.

**Why:** Stakeholder feedback — the brand mark moving between views read as accidental, broke the sense of a stable site frame. The ribbon's diagonal tape passes through the area to the RIGHT of the wordmark; with z-index ordering (ribbon at 70, header at 50) the ribbon paints on top of the area it covers, but the wordmark and FL icon don't actually intersect the tape's painted path. Visually verified post-removal: no overlap, identical brand position landing ↔ docs.

**How to apply:** If the ribbon design changes such that it does overlap the logo column, prefer adjusting the ribbon (move it up, shrink it, or relocate to top-right) over re-introducing a landing-only logo offset. Brand-position consistency wins over ribbon placement.

---

## Tabs / TabItem: custom component replacement, not Starlight override (Option B)
**File(s):** `packages/starlight-theme/components/custom/Tabs.astro`, `packages/starlight-theme/components/custom/TabItem.astro`, `packages/starlight-theme/components/custom/rehype-tabs.ts`, `packages/starlight-theme/user-components.ts`, all `docs/src/content/docs/**/*.mdx` imports
**Date:** 2026-05-07

**Decision:** Tabs and TabItem are replaced (not overridden) via custom components in `packages/starlight-theme/components/custom/`, re-exported from `starlight-theme/components` alongside Starlight's user-components via `export *`. MDX imports were bulk-rewritten from `@astrojs/starlight/components` → `starlight-theme/components`. The local `Tabs.astro` mirrors Starlight 0.38.4's behaviour exactly except for icon rendering: colon-prefixed Iconify names (`material-icon-theme:npm`, `lucide:sparkles`, `simple-icons:react`) render as a UnoCSS class span (`<span class="i-${icon}">`) instead of going through Starlight's built-in `<Icon>` (which only knows `BuiltInIcons` and renders empty SVGs for anything else).

**Why:** Tabs / TabItem are NOT on Starlight's `components` config allow-list — that config map only covers layout/structural components (Header, Sidebar, PageFrame, etc.). Three other approaches were tried and rejected before landing on this one:
- **Vite `resolveId` plugin** to redirect `@astrojs/starlight/user-components/Tabs.astro` to a local override — failed because the import resolves to an absolute filesystem path before the plugin sees it; the alias never matched.
- **Vite `resolve.alias`** with a regex matching the absolute node_modules path — Astro's resolver pipeline appears to short-circuit before the alias fires; build artifacts confirmed the original Tabs was still loaded.
- **`pnpm patch @astrojs/starlight`** — pins us to a specific Starlight version with a permanent diff; rejected as too brittle for what's effectively cosmetic.

The custom-component approach is the cleanest non-hack: ~270 lines of Tabs.astro + minimal TabItem.astro + an inlined `rehype-tabs.ts` (the upstream `processPanels` is a private export, so we copy it verbatim with attribution). When Starlight bumps Tabs.astro behaviour, we mirror the relevant changes here. The `export *` from `@astrojs/starlight/components` followed by named `Tabs` / `TabItem` exports shadows just those two — every other user-component (`Aside`, `Card`, `Code`, `Steps`, `LinkCard`, etc.) flows through unchanged.

**Evidence:** `dist/` HTML inspection confirms tab icons render as `<span class="i-simple-icons:npm tab-icon">` post-migration vs empty `<svg>` pre-migration. Build green at `pnpm --filter=docs build`.

**How to apply:** Future work that needs to extend Starlight user-components beyond Starlight's prop surface should follow the same pattern (custom in `components/custom/`, re-export from `user-components.ts` shadowing the upstream name). Don't reach for Vite aliasing — it doesn't work against Astro's resolver chain.

---

## UnoCSS preset-icons: `mode: 'mask'` for universal monochrome
**File(s):** `docs/uno.config.ts:14-18`
**Date:** 2026-05-07

**Decision:** `presetIcons({ mode: 'mask', ... })` forces every icon (regardless of source iconset) to render via CSS `mask` + `background-color: currentColor`. Multi-color brand glyphs (material-icon-theme's npm/pnpm/yarn/bun colored logos) collapse to single-color silhouettes that inherit from the surrounding text color.

**Why:** Default `mode: 'auto'` lets multi-color icons render in their original palette, which clashed visibly with the gem-tinted theme — colored brand logos sat next to monochrome lucide icons in the same tab strip and the typography. Forcing mask mode trades brand-color fidelity for whole-system color consistency. Brand icons now respect dark/light mode, gem hover tints, and figcaption tints automatically.

**Evidence:** Built CSS at `dist/_astro/common.*.css` shows `.i-material-icon-theme\:npm{--un-icon:url(...);mask:var(--un-icon) no-repeat;background-color:currentColor;...}` — confirms mask mode is active in production.

**How to apply:** When picking icons, prefer monochrome-designed iconsets (lucide, simple-icons) over multi-color ones (material-icon-theme) — under mask mode the multi-color glyphs lose visual detail and may become hard to read at small sizes (the bun icon was the trigger here).

---

## Tab brand icons: `simple-icons` over `material-icon-theme`
**File(s):** `docs/package.json` (`@iconify-json/simple-icons` dep), `docs/src/content/docs/**/*.mdx` (TabItem `icon=` props), `docs/uno.config.ts` (safelist)
**Date:** 2026-05-07

**Decision:** Tab icons for npm/pnpm/yarn/bun/react/threedotjs use `simple-icons:*` rather than `material-icon-theme:*`. Generic UI icons (sparkles for the agents tab) stay on `lucide`.

**Why:** Material-icon-theme glyphs are designed for VS Code's file explorer at small sizes with full color — they read as flat colored boxes when masked, especially `bun` which is a stylized cream blob that becomes an unreadable silhouette in mono. Simple-icons is the official monochrome brand icon set; npm/pnpm/yarn/bun all have official-brand-shape silhouettes there that survive masking cleanly.

**How to apply:** New tab/badge icons for branded products should resolve from `@iconify-json/simple-icons`. UI affordances (chevrons, sparkles, info, warning, etc.) stay on lucide.

---

## `.header` selector scope: site header animation must exclude figcaption
**File(s):** `packages/starlight-theme/components/overrides/Header.astro:128-160`
**Date:** 2026-05-07

**Decision:** The scroll-driven `hdr-compact` animation is selector-scoped to `[data-slot='layout'] > header` — NOT the bare `.header` class. The animation also excludes `[data-landing]` so the landing's transparent header keeps its hero-canvas backdrop on scroll.

**Why:** Expressive-code renders codeblock titles as `<figcaption class="header">`. Starlight's layout uses `<header class="header">` for the site chrome. A bare `:global(.header)` selector matched both — every codeblock figcaption inherited the scroll-tied background-color cross-fade, producing a phantom alpha fade on captions that the user reported repeatedly across multiple sessions before the cause was identified. The data-slot anchor sidesteps the class collision entirely.

The landing exclusion (`:not([data-landing])`) is separate and addresses a different bug: the hero canvas extends UP behind the transparent header. The compact-fade keyframe sets `background-color` to opaque-ish, which clobbers the intentional transparency on scroll.

**How to apply:** Any future header-targeting CSS should use `[data-slot='layout'] > header` (or scope to the override's hashed class via Astro's component scoping). NEVER use bare `.header` — too many third-party components use that class name.

---

## Header height parity: paint-only animation, no layout shift
**File(s):** `packages/starlight-theme/components/overrides/Header.astro:128-160`
**Date:** 2026-05-07

**Decision:** The `hdr-compact` keyframe ONLY changes paint-time properties (`background-color`, `backdrop-filter`, `border-bottom-color`). The header's `padding-block` is constant across all states and pages. Header height is dictated solely by the inner `.container { height: var(--header-height) }` rule.

**Why:** The previous implementation transitioned `padding-block` from `0.625rem` → `0.25rem` on scroll, which felt right per-page but broke view-transitions between landing ↔ docs. The landing's then-zero padding-block landed on a docs page with non-zero padding, briefly painting an opaque slab above the hero canvas during morph (the "black bar artifact"). Constant header bounding box across pages = no vertical layout shift to cross-fade through.

The visual "compact" feel still lands via the bg/backdrop-filter/border cross-fade — those properties are paint-only and don't affect the canvas's `top: calc(var(--header-height) * -1)` extension calc.

**How to apply:** Keep `--header-height` static. Header chrome animations should be paint-only (color, filter, shadow, border-color) — never padding/margin/height — so view-transitions can cross-fade safely between landing and docs pages.

---

## Tab + codeblock: outer card vertical inset, children horizontal inset
**File(s):** `packages/starlight-theme/styles/base.css` (`.starlight-tabs` + `.tablist-wrapper` + `.tablist-wrapper ~ [role='tabpanel']` + scoped `--ec-codePadInl`)
**Date:** 2026-05-07

**Decision:** `<starlight-tabs>` carries vertical inset (`padding-block: 0.8rem`) and the rounded shape + background. The two children (`.tablist-wrapper`, `[role='tabpanel']`) carry horizontal inset (`padding-inline: 0.5rem`). Inside the panel, the codeblock's `--ec-codePadInl` is overridden to `0.5rem` so the code's first column aligns vertically with the tab strip's first pill on the same `1rem`-from-card-edge baseline.

**Why:** The first attempt put both vertical and horizontal padding on the outer card, but expressive-code's `--ec-codePadInl` (default `1rem`) compounded on top of the outer 0.5rem horizontal, pushing code content too far in (`1.5rem` from card edge vs `1rem` for tab pills). Splitting the inset between outer (vertical) and children (horizontal) lets each child reset its inner content padding independently. Then matching `--ec-codePadInl` to the children's `0.5rem` puts code text and tab text on the same baseline.

The figcaption's `padding-inline` is matched to the same `0.5rem` so caption text and code lines line up too.

**How to apply:** When stacking layout shells inside a card-shaped container, put the chrome (background, radius) on one container and split inset axes between the layers — don't double-pad. For codeblocks specifically, override `--ec-codePadInl` (not `padding`) when changing inline padding so expressive-code's gutter calc stays consistent.

---

## Figcaption styling: pure typography, no chrome
**File(s):** `packages/starlight-theme/styles/base.css` (`.expressive-code .frame.has-title .header` etc.)
**Date:** 2026-05-07

**Decision:** Codeblock titles (`<figcaption class="header">`) render as plain italic gem-toned text with `padding-inline` matching the codeblock's content baseline. All expressive-code chrome — tab-bar background, active-tab indicator pseudo, terminal traffic-light dots, terminal title-bar bottom-border — is suppressed via `display: none` / transparent overrides. Same treatment for `has-title` and `is-terminal` frames. Empty terminal headers (no `title=` meta) are fully hidden so they don't reserve placeholder height.

**Why:** Expressive-code paints two competing variants of the same concept: a tabbed editor look (file titles) and a simulated macOS terminal window (shell blocks). Both reduce the figcaption to a "UI bar" pasted on the codeblock. Stripping the chrome and treating the title as a typographic caption gives one solid figure shape with a quiet gem-italic label — same vibe whether the snippet is TypeScript or shell.

Figcaption color is `color-mix(in oklab, var(--diamond) 65%, var(--muted-foreground))` — gem-tinted but mixed toward muted so the caption reads as label, not headline.

**How to apply:** Don't reach for figcaption when you want emphasis — it's intentionally muted. For "this is the file" semantics use `~~~lang title="..."`. Empty terminal frames should never render a title bar — the `:not(.has-title)` rule covers the `is-terminal` case explicitly because expressive-code adds `has-title` only when the meta is present.

---

## Container width: 60rem main + TOC at 1280px+ only + 180px TOC
**File(s):** `packages/starlight-theme/components/overrides/TwoColumnContent.astro`
**Date:** 2026-05-07

**Decision:** Main content `max-width: 60rem` (~120 col). TOC right-rail visible only at `1280px+` (was 1024px+; pulled one breakpoint further out). TOC track narrowed from 240px → 180px. Container left padding scales: `4 * spacing` at 1024–1279, `8 * spacing` at 1280+.

**Why:** Original 40rem (~80 col) was too tight with prose set in JetBrains Mono — long code lines forced horizontal scroll and aside callouts felt cramped. 60rem gives more breathing room without breaking line-length-as-readability convention badly. Pulling TOC to 1280px+ is the bigger win at the 13–15" laptop range where left sidebar (240px) + TOC (180px) + gaps were leaving the main column at ~508px on a 1024px viewport. Now at 1024–1279, it's left sidebar + main only with no right rail; main column gets ~720px instead.

180px TOC vs 240px reflects that headings on this site are short — the wider track was wasted whitespace.

**How to apply:** When tightening layouts further, look at what each grid track is actually displaying at the smallest breakpoint where it appears. Track widths set for 1440px+ are usually overprovisioned for 1280px.

---

## Inline-code chip: scoped color theming via `--code-chip-*` tokens
**File(s):** `packages/starlight-theme/styles/base.css` (`:not(pre) > code` + scoped overrides for asides / cards / value-props / stat-items)
**Date:** 2026-05-07

**Decision:** Inline `<code>` chips use generic `--code-chip-accent` and `--code-chip-bg` tokens (default to `var(--diamond)` and `var(--muted)` respectively). Scoped rules inside asides, FeatureCards, ValueProps, and StatItems override those tokens to inherit the local accent — caution aside → orange chip, emerald card → emerald chip, etc.

**Why:** Default global diamond-tinted chips broke the color cohesion of caution asides (orange aside with a blue chip looked accidental). Token-driven scoping means the chip always belongs to its surrounding container's color system without having to author per-context CSS rules.

**How to apply:** New container components with their own gem accent should set `--code-chip-accent: var(--<their-accent>)` and `--code-chip-bg: var(--<their-bg>)` in their `:scope > * :not(pre) > code` rule. The fallback token chain (`var(--card-accent, var(--vp-accent, var(--stat-accent, var(--diamond))))`) covers the existing components.

---

## Safari JSX dev runtime: prebundle via `optimizeDeps.include`
**File(s):** `docs/astro.config.mjs` (`vite.optimizeDeps.include`)
**Date:** 2026-05-07

**Decision:** `optimizeDeps.include` extended from `['react-dom/client']` to `['react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime']`.

**Why:** Safari was throwing `TypeError: jsxDEV is not a function` on the HeroShader's React `client:only="react"` hydration in dev mode. Vite lazy-resolves `react/jsx-dev-runtime` on first hydration; Chrome handles it but Safari occasionally commits the component before the runtime module finishes loading. Pre-bundling forces the runtimes into the initial dep graph so JSX call sites always have their renderer.

**Evidence:** Reproduced in Safari, fixed by the include change after dev server restart. Production build was always fine (uses `react/jsx-runtime` which is already bundled in the prod chunk).

**How to apply:** Any new React component loaded via `client:*` directives in dev should not trigger this — but if a future Safari-only hydration timing bug surfaces, this is the first place to check.

---

## WebGPU/WebGL marketing copy: TSL + hand-rolled paths, koota-managed batching
**File(s):** `docs/src/content/docs/index.mdx` (FeatureCard + ValueProp + StatsBanner copy), `docs/src/content/docs/getting-started/introduction.mdx` (FeatureList copy)
**Date:** 2026-05-07

**Decision:** All "WebGPU Native / no WebGL fallbacks / impossible on WebGL" framing was replaced. New framing acknowledges:
- TSL targets BOTH WebGPU and WebGL2 — same shader graph compiles for both renderers
- Parity is earned, not free — dedicated WebGL paths in TSL are hand-rolled where they earn real performance gains
- WebGPU is the ceiling, not the floor — opt-in for compute, storage buffers
- Sprite batching state is managed by `koota` (an expressive ECS) — not "custom ECS"
- The ECS-to-GPU shared layout is the additional speed unlock, beyond the usual ECS-CPU-cache wins

**Why:** Previous copy claimed exclusivity ("designed exclusively for WebGPU renderer", "no WebGL baggage", "effects impossible on WebGL"). Stakeholder corrected: that's not what the library is. Marketing was promising a different product than what ships. Honest framing also lets the engineering work behind 1:1 parity be visible — the value isn't free magic, it's deliberate dual-path implementation.

**How to apply:** Future feature copy should resist the temptation to position WebGPU as the only way the library works. The framing is "WebGPU + WebGL, same API, hand-tuned where the renderers diverge." Mentions of `koota` should not call it "custom ECS" — it's a third-party ECS we use; the custom layer is the batching system built on top.

---

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


## Gem-background system: helper lives in example templates, not in `@three-flatland/presets`
**File(s):** `examples/three/template/GemBackground.ts`, `examples/react/template/GemBackground.tsx`, `scripts/sync-examples.ts` (new)
**Date:** 2026-05-07

**Decision:** The gem-background helper that renders a gem-tinted radial-gradient backdrop (matching the tile fallback poster) lives in the example **templates**, copied per-example by a sync script — not in `@three-flatland/presets` as a published preset.

**Why:** The presets package holds full opinionated *pipeline presets* (lighting setups, etc.), not utility primitives. Shipping a "draw a tinted background quad" helper there muddles that contract. Examples are also explicitly designed to be standalone copy-paste-able sandboxes (StackBlitz fork target), so a sync-from-source pattern fits the existing examples ergonomic better than a runtime dependency. Same approach `sync-pack` already uses for package.json catalog mirroring.

**Evidence:** Existing `scripts/sync-pack.ts` + `lefthook.yml` `sync-pack-full` / `sync-pack-files` entries demonstrate the precedent. Examples already duplicate code by design (per `examples/CLAUDE.md`).

**How to apply:** `examples/_shared/gems.config.ts` is the single source for gem order + per-slug overrides + hex values. `scripts/sync-examples.ts` reads it, walks `examples/{three,react}/*` (minus `template`), copies the appropriate helper file, writes `gem.ts` per example, and regenerates `docs/src/data/example-gems.ts` for the GalleryTile component. Lefthook re-runs on edits to either template or the config.

## Gem-background: index-based assignment with override map (not hardcoded)
**File(s):** `examples/_shared/gems.config.ts`
**Date:** 2026-05-07

**Decision:** `gem = OVERRIDES[slug] ?? GEM_ORDER[sortedIndex % GEM_ORDER.length]`. Examples sorted alphabetically, gems cycle through the canonical `GEM_ORDER` list (diamond → emerald → gold → amethyst → ruby → pink → salmon → turquoize). Per-slug overrides only when the auto-assignment vibes wrong.

**Why:** Hardcoding `{ basic-sprite: 'diamond', animation: 'emerald', … }` becomes a maintenance burden as examples are added. Index-based with optional overrides lets new examples slot in without manual mapping; explicit overrides remain available for taste.

**How to apply:** When adding a new example, no config change needed unless its auto-assigned gem feels wrong. If it does, add to `GEM_OVERRIDES`. `null` in OVERRIDES = no gem treatment at all (currently no examples need this — knightmark/skia just call different layers, not opt out entirely).

## Gem-background: three-layer architecture (clear / quad / composed fragment)
**File(s):** `examples/three/template/GemBackground.ts`, `examples/react/template/GemBackground.tsx`
**Date:** 2026-05-07

**Decision:** The helper exposes three primitives that examples compose individually:

1. `gemClearColor(gem)` — returns a `Color`. Always applied (renderer clear color or scene.background) so even examples that don't render a backdrop quad still read as the right gem at the edges.
2. `createGemBackground({ gem, lit })` — returns a fullscreen-quad `Mesh` with a TSL fragment matching the CSS tile gradient. Default for most examples.
3. `gemGradientFragment({ gem, uv })` — returns a TSL `Node<vec4>` consumable in any colorNode / output graph. Required for skia (composes the gem into the skia floor + canvas surfaces); available for future custom-render demos.

**Why:** Different examples need different layer combinations:
- Default examples: L1 + L2 (clear color as backstop, lit gradient quad as backdrop)
- knightmark: L1 only (sprites fill viewport, a backdrop quad would just be hidden)
- skia: L1 + L3 (skia paints its own surface; the gem must be **inside** the rendering, not behind it, so the floor and canvas backdrop carry the same tonal identity as the tile poster)

A single monolithic component would force opt-out flags or branching logic. Three discrete primitives let each example's entry file express its layer choice naturally with regular function calls — no config needed beyond the gem name.

**Evidence:** Tile poster is currently a CSS radial gradient (`circle at 30% 30%, gem-40%-card → gem-12%-bg → bg`). Replicating that as a TSL fragment with the same color stops produces a matching screenshot. skia's existing pipeline composes its surface via TSL, so a TSL-Node export is the right shape for that integration.

**How to apply:** Each example author picks the layers that fit. Default = L1 + L2. Sync only handles file copy + `gem.ts` codegen — wiring layer calls into entry files is manual content editing per example (deliberately, to avoid invasive entry-file rewrites).

# Phase 4 polish decisions

## vtbot rework: ProgressBar custom, AutoNameSelected dropped, replaceSidebarContent off
**File(s):** `docs/src/components/Head.astro`
**Date:** 2026-05-07

**Decision:** Three vtbot-related defaults reverted/replaced in one go.

1. `<ProgressBar/>` from `astro-vtbot/components/` removed; replaced with a custom `<div id="tf-progress">` driven by `astro:before-preparation` / `astro:after-swap` lifecycle events plus pure CSS animation. The vtbot ProgressBar imports `@swup/progress-plugin@3` from unpkg.com at runtime (`<script>import 'https://unpkg.com/...'</script>`), and the swup plugin behavior under Astro view-transitions was unreliable — the `.swup-progress-bar` element often never inserted into the DOM. Custom implementation is fully self-contained and predictable.
2. `<AutoNameSelected />` removed entirely. Its default `vtbot-hx-N` naming is positional — the first `<h1>` of one page morphs into the first `<h1>` of the next page regardless of semantic relationship. This produced the user-reported "headers fly around the screen changing text" effect. Browser default page cross-fade is a cleaner read than fake morphs across unrelated content.
3. `replaceSidebarContent` flag removed from `<VtBotBase/>`. vtbot's default is to PRESERVE the sidebar DOM on navigation; the flag was an explicit opt-in to replacement. Default behavior gives us scroll-position + `<details open>` state preservation for free.

**Why:** Each vtbot default we'd opted out of created a regression. ProgressBar's external CDN dependency made initial paint of the progress bar racy; AutoNameSelected's positional naming had no useful "morph between pages" semantic; replaceSidebarContent inverted the desired persistence behavior.

**Evidence:** Live debugging via Chrome MCP confirmed: with vtbot ProgressBar, the `.swup-progress-bar` element was missing from the DOM at idle AND during nav (verified with `document.querySelector('.swup-progress-bar')`). Custom progress bar appears reliably on every nav. AutoNameSelected removed → header chrome no longer morphs across unrelated pages. replaceSidebarContent removed → sidebar `<details open>` survives across page-loads.

**How to apply:** When wiring view-transition libraries to a non-trivial site, prefer custom lifecycle handlers over plugin-of-a-plugin imports (especially CDN-hosted ones). Test each vtbot flag empirically — defaults were generally chosen well.

## White-flash on every navigation: html element bg explicit + hex fallback
**File(s):** `packages/starlight-theme/styles/base.css`
**Date:** 2026-05-07

**Decision:** `html { background-color: var(--background, #111418); }` (with a `:root[data-theme='light']` companion for the paper-toned variant). Previously only `body` had a bg-color, and `:root[data-theme='dark']` defined `--background` but didn't apply it as a property anywhere on the html element itself.

**Why:** During CSS view-transitions, the browser captures `::view-transition-old(root)` / `::view-transition-new(root)` snapshots; under those snapshots, the html element shows through. With no html bg, that's the browser default white — which is the full-screen white flash users were seeing on every navigation. Setting the bg on `html` itself eliminates the flash. The hex fallback (`#111418` for dark, `#f6f5f1` for light) makes the rule land even before custom-property tokens resolve at first paint — `--background` is defined on `:root[data-theme='dark']`, which only matches AFTER the StarlightThemeProvider script applies the data attribute.

**Evidence:** Chrome MCP debug session: `getComputedStyle(document.documentElement).backgroundColor` returned `rgba(0, 0, 0, 0)` before fix → `oklch(...)` after.

**How to apply:** Any site using CSS view-transitions or full-page snapshots should set bg on both `html` AND `body`, with hex fallbacks on tokens that resolve via theme-applied data attributes. The body-only pattern is incomplete.

## Sidebar `<details>` state preservation: mutate event.newDocument on astro:before-swap
**File(s):** `docs/src/scripts/motion.ts`
**Date:** 2026-05-07

**Decision:** localStorage handler restores sidebar `<details>` open state in two places: (a) initial page load via `initSidebarDetailsPersistence()` on the live document, and (b) BEFORE Astro commits a view-transition swap via `astro:before-swap` mutating `event.newDocument`. Storage key per group: `tf:sidebar-open:<label>`.

**Why:** Earlier attempt put restoration in `astro:page-load`, which fires AFTER the new DOM has painted — the SSR-rendered `<details open={!entry.collapsed}>` flashed through before localStorage could correct it. `astro:before-swap` fires after the new doc is parsed but BEFORE it's committed as the live DOM, so the open state is mutated pre-paint, no flash.

**How to apply:** For ANY UI state that survives navigation but is server-rendered with default values (form inputs, toggle buttons, etc.), restore via `astro:before-swap` mutation, not `astro:page-load`. The latter is post-paint.

## Foil rim system on cards: three-layer (scene + cursor hotspot + lens flare)
**File(s):** `docs/src/components/FeatureCard.astro`, `docs/src/components/gallery/GalleryTile.astro`
**Date:** 2026-05-07

**Decision:** A consistent foil rim treatment on `.feature-card` and `.gallery-tile` via three layered effects on the existing `.card-edge` / `.tile-edge` pseudo-element:

1. Base ring — conic gradient driven by `--effective-light-angle` (perlin-modulated `--scene-angle`), broad gem-tinted "lit half" reading.
2. `::before` — narrow 30°-wide cursor hotspot at `--light-angle`, opacity tracks `--mouse-active` so the glint fades in/out with hover. Bright peak centered AT light-angle (not 90° off) so the glint is on the SAME side as the cursor — earlier `from calc(... - 105deg)` produced a 90°-counterclockwise glint, fixed to `from calc(... - 22deg)`.
3. `::after` — small star-shaped lens flare anchored at `(--mx, --my)` with mix-blend-mode: screen, masked into a 4-point cross via three layered linear-gradients + radial-gradient.

All three layers respect `prefers-reduced-motion: reduce` (pseudo-elements `display: none`).

**Why:** The previous treatment was a pure ambient glow that didn't react to cursor — felt static. Three discrete layers separately address ambient-light direction (scene-angle), cursor-direction-as-light-position (light-angle), and cursor-position-as-eye-anchor (mx/my). Together they read as a foil card: ambient scene light bathes the lit half, the cursor drags a sharp glint along the rim, and a star flare blooms where the eye is looking.

**How to apply:** New surfaces wanting the foil treatment opt in via `class="u-light"` (registers with motion.ts) plus a `.card-edge` / `.tile-edge` child element with the layered conic + radial structure. The cursor-stripe / star-flare math is portable to any rounded-rect surface.

## Holographic icon foil on FeatureList + FeatureCard
**File(s):** `docs/src/components/FeatureList.astro`, `docs/src/components/FeatureCard.astro`
**Date:** 2026-05-07

**Decision:** Replace the default `background-color: currentColor` from UnoCSS's preset-icons mask mode with a layered gradient on icon spans inside FeatureList rows + FeatureCard headers. Two background-image layers: (1) cursor-tracked highlight stripe at `--light-angle`, (2) holographic rainbow base with hue-ladder phase-shifted by `--scene-angle` and mixed 50–60% into the per-row/per-card gem accent so it stays in-family. `background-blend-mode: screen, normal`. Filter saturate/contrast scales with `--mouse-active` so hovered surfaces sweep a sharper prismatic streak. Reduced-motion collapses to a static gem-tinted gradient.

**Why:** Plain monochrome icons on gem-themed rows read as clip-art over content. Foil treatment turns icons into trading-card-foil moments — same identity, more dimension — without inflating asset count (the lucide glyph is still the source).

**How to apply:** New iconified rows can adopt the same recipe by wrapping the Icon component's class in `.card-icon-holo` / `.feature-icon-holo` style scope and inheriting `--feature-accent` / `--card-accent` / `--mouse-active` / `--light-angle` / `--scene-angle` from a `.u-light`-registered ancestor.

## Drop-shadow glow removal pass (site-wide)
**File(s):** `docs/src/components/StatsBanner.astro`, `docs/src/components/ValueProp.astro`, `docs/src/components/FeatureList.astro`, `docs/src/components/FeatureCard.astro`, `docs/src/components/gallery/GalleryTile.astro`, `docs/src/components/ExampleSplitView.astro`, `packages/starlight-theme/components/overrides/parts/toc/TableOfContentsList.astro`, `packages/starlight-theme/components/overrides/parts/SidebarSublist.astro`, `packages/starlight-theme/styles/base.css`
**Date:** 2026-05-07

**Decision:** Remove decorative drop-shadow glows site-wide. Specifically:

- text-shadow glows on stat values, feature titles
- box-shadow gem-tinted directional / radial halos on .vp-rule, FeatureCard:hover, GalleryTile:hover, .sl-link-button.{primary,secondary}:hover, TOC active marker, SidebarSublist active marker, ExampleSplitView grid (kept the 1px ring, dropped the diamond-tinted lift glow)

Kept: focus-visible rings (3px gem at 35% — accessibility), CaptureModal staging shadow (theatrical context), Card.astro retro pixel-offset shadow (intentional retro), button hover lift transforms (gem-tinted halo gone, `transform: translateY(-1px)` lift retained), 1px ring shadows that act as borders (no blur).

BrandAsset retro glows kept untouched — separate domain (only used for OG-image generation, not user-facing pages).

**Why:** Decorative gem-tinted halos on hover read as "every-other-website glow." Restraint over chroma per Design Context. The cursor-tracked foil rim system carries the hover affordance more deliberately; lift-on-hover via translate is enough motion cue. Glows pulled the eye to ambient surfaces instead of the actual interactive moment.

**How to apply:** Future surfaces should use the foil rim + cursor hotspot system for hover affordance, not gem-tinted box-shadows. If lift is needed, use `transform: translateY` over `box-shadow` with a colored bloom.

## Filter alpha-clip via feComposite
**File(s):** `docs/src/components/Head.astro` (#tf-gem-perturb / #tf-foil-perturb SVG filters)
**Date:** 2026-05-07

**Decision:** Both displacement filters now end with `<feComposite in="displaced" in2="SourceGraphic" operator="in" />` to clip displaced output through the source's alpha. Foil-perturb scale also dropped 6 → 4.

**Why:** Without the composite, displaced pixels at the rounded-corner edges sample beyond the source rect (transparent), rendering as black "specs" against the page bg. Visible especially on the gold card. The "in" operator keeps only displaced pixels that overlap the original source's alpha — no out-of-shape bleed regardless of corner radius.

**How to apply:** Any displacement/turbulence filter on a rounded surface should end with `feComposite operator="in"` against `SourceGraphic` to prevent edge-artifact bleed.

## API ref tree: continuous guide line, chevron-centered pip, truncate-ellipsis, deepest-level skip
**File(s):** `packages/starlight-theme/components/overrides/parts/SidebarSublist.astro`
**Date:** 2026-05-07

**Decision:** Multiple coordinated changes to the collapsable sidebar tree (used by API Reference):

1. Indent guide line moved from per-nested-group `border-left` to a continuous absolutely-positioned `::before` on each parent `.container-group-link`. Eliminates gaps between sibling groups (the 2px gap from `.container-group-link { gap: 2px }` between sibling borders broke the line).
2. Guide line scoped via `:has(.container-sidebar-entry)` so only folders that contain MORE nested folders get the guide. Deepest level (entry-links only) skips it — the chevron of the parent + the entry's own active/hover pip already communicate structure.
3. Chevron moved from trailing (right) to leading (left) — folder-tree convention. Closed-state rotation pre-existing (`-90deg`) repurposed; path geometry kept (v chevron) so closed = right-pointing `>`.
4. Active / hover pip moved from `.entry-link-inner::before` (positioned relative to inner pad-box) to `.entry-link::before` (positioned relative to the link, with `.entry-link` now `position: relative`). Both pip and guide use `left: 0.375rem; transform: translateX(-50%)` so they're centered at chevron's middle.
5. `entry-link-inner` `padding-left` raised from `var(--spacing) * 2` → `var(--spacing) * 4` and gap dropped 0.4rem → 0.25rem so there's clear space between pip and content.
6. Long unbreakable identifiers (e.g. `MaterialEffectClass`) truncate with ellipsis instead of wrapping. `.entry-label` gets `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. Sidebar column no longer grows with the longest typedoc symbol.
7. Singleton-collapsable selectors switched from `:only-child` to `:only-of-type` because GalleryTile inlines a hover-video `<script type="module">` as a sibling of the `<a>`, breaking `:only-child`. `:only-of-type` ignores other element types.
8. Hover rect + collapsable summary inset padding both removed — chevron + indent guide carry the affordance; an extra hover-fill on top reads as overactive chrome and breaks visual continuity with the indent line. Static `h4.entry-title` keeps its inset for top-level section breathing room.

**Why:** The previous sidebar API tree had multiple coordinated visual issues (gaps in guide, off-center pip, wrapping breaks layout, wrong chevron position). Untangling them required this batch — most decisions are interdependent.

**How to apply:** Future sidebar tree work should preserve: chevron-leading layout, single-element guide on parent (not per-child border), pip and guide co-aligned at chevron-center via `transform: translateX(-50%)`, truncation over wrapping, `:only-of-type` for singleton selectors when a sibling script is in play.

## Top-nav per-section gem accents
**File(s):** `packages/starlight-theme/components/overrides/parts/NavBar.astro`
**Date:** 2026-05-07

**Decision:** Each top-nav link (Docs / Examples / Showcases) carries its own gem hue for hover + active states, set via inline `--nav-gem` derived from the link's first path segment:
- Docs (`/getting-started/`) → amethyst
- Examples (`/examples/`) → diamond
- Showcases (`/showcases/`) → ruby

Active-state matching also rewritten to handle the "Docs is the catch-all for any docs cluster path" case — Docs lights up across `/getting-started`, `/guides`, `/branding`, `/llm-prompts`, `/api`. Examples + Showcases match by their first path segment.

**Why:** Single-accent active state didn't read as section-identity; users navigating between Introduction / Installation / Guides lost the "Docs" indicator entirely (originally exact-prefix match against `/getting-started/introduction/`). Gem-per-section is consistent with the design system's color-as-taxonomy convention.

**How to apply:** New nav links carry their own gem via the same `linkFirstSegment` derivation. Default fallback is diamond.

## Primary CTA gold (token-local override) + LinkButton black-inner-edge fix
**File(s):** `packages/starlight-theme/styles/base.css`
**Date:** 2026-05-07

**Decision:** Two coordinated changes on `.sl-link-button.primary`:

1. Color theme: amethyst (purple) → gold gradient. Text color hardcoded to `oklch(0.18 0.04 80)` (dark warm-tinted) so it reads high-contrast on the bright gold gradient in both light + dark mode. The `--primary` TOKEN itself stays at amethyst — only the LinkButton's local CSS swaps to gold. Other `--primary` consumers (FeatureCard default, ValueProp default, sidebar fallback) keep their existing color narrative.
2. `border: 1px solid transparent` removed entirely (set to `border: 0`). The `::before` foil rim sits at `inset: 0` of the button's border-box; a 1px transparent border pushed the ring 1px inward, exposing the page bg as a thin black inner edge artifact. Border-zero means the ring sits at the very outer pixel of the button. Secondary button got the same treatment for parity.

**Why:** User flagged purple as wrong for primary CTA energy + visible black artifact on the foil's inner edge. Localizing the gold change to LinkButton (not the global `--primary` token) preserves the token narrative for downstream consumers while updating the most prominent CTA to a stronger gem.

**How to apply:** When a button's foil rim or background gradient should sit at the outer pixel, drop the border entirely. Use a transparent ::before-based rim instead of border-image (more flexible, alpha-aware).

## Alpha ribbon: 45° square restore + scale (not transform) for hover
**File(s):** `packages/starlight-theme/components/overrides/PageFrame.astro`
**Date:** 2026-05-07

**Decision:** Ribbon wrapper is a strict 12rem × 12rem square (was 36×13 wider non-square). Tape rotated -45° with `transform: rotate(-45deg)` static. Hover scale via the individual `scale` property (`scale: 1.03`) instead of compounding `transform: rotate(-45deg) scale(1.03)`. Reduced-motion override pins `scale: 1`. Mobile breakpoint dropped — same size at all viewports.

**Why:** Original wider non-square ribbon was added to clear the wordmark logo column. Stakeholder feedback: square + 45° + allowing logo overlap is the correct sticker concept. Critical detail: keeping `transform` static (not in the transition list) prevents initial-load rotate animation. The browser was animating from `rotate(0)` → `rotate(-45deg)` on first paint when transform was on the transition list — splitting rotation (static) from scale (animatable) avoids it. The individual `scale` property animates independently of transform.

**How to apply:** When a static transform should not animate on initial load, leave it OUT of the `transition` list. Use individual transform-property properties (`scale`, `rotate`, `translate`) for the parts that should animate.

## Custom progress bar — destination-tinted gem gradient + 150ms show-delay
**File(s):** `docs/src/components/Head.astro`
**Date:** 2026-05-07

**Decision:** Top-edge progress bar implemented as a fixed-position 3px `<div id="tf-progress">` driven by view-transition lifecycle events:

- `astro:before-preparation` schedules a 150ms timer to flip `data-state="loading"` (CSS sweeps width 0 → 92% over 9s with cubic-bezier easing).
- `astro:after-swap` either cancels the pending timer (cached/instant nav, bar never shown) or flips to `data-state="done"` (CSS sweeps width 92% → 100% + opacity 1 → 0 over 350ms, then resets).
- Gradient runs `gem-low → gem-high` based on the destination's section (mapping mirrors NavBar's): landing → gold, /examples → diamond, /showcases → ruby, docs cluster → amethyst.

**Why:** Replaces vtbot's `<ProgressBar/>` (CDN-dependent, unreliable). 150ms show-delay matches the standard "don't show a spinner for instant operations" UX guideline — fast/cached navigations stay silent. Destination-tinted gradient gives visual continuity with the destination's nav-link gem accent.

**How to apply:** Per-destination theming pattern transfers to any progress/loading affordance. Read `event.to.pathname` in `astro:before-preparation` to derive theme inputs.

## ValueProp .vp-rule: cursor-driven foil bar
**File(s):** `docs/src/components/ValueProp.astro`
**Date:** 2026-05-07

**Decision:** `.vp-rule` (vertical 3px gem stripe in ValueProp) replaced its static dim → bright → dim gradient with a cursor-driven foil treatment. Bright peak position anchored to `--my` (cursor's vertical position 0..100% across the section). Section gains `u-light` so motion.ts wires the cursor vars; `.u-light::before / ::after` gem-facet pseudos suppressed and section-level perspective tilt disabled (large prose sections shouldn't lean toward the cursor).

**Why:** Static fade was decorative-only; cursor-driven peak makes the bar feel alive without the heavy treatment a card or button gets.

**How to apply:** Section-scale "live" affordances should use `u-light` cursor variables but suppress the full-card pseudo treatment when the design wants a quieter result.

## FeatureList background damped to 12% scene-angle drift
**File(s):** `docs/src/components/FeatureList.astro`
**Date:** 2026-05-07

**Decision:** FeatureList rows keep the `.u-light::before` gem-faceted background, but with a damped scene-angle response: `linear-gradient(calc(90deg + (var(--scene-angle, 135deg) - 90deg) * 0.12), …)` — biased hard to 90° (light from left, where the gem rule lives) with only 12% drift via scene-angle. The displacement filter (`#tf-gem-perturb`) is dropped on row scale (visible). Cursor-radial pseudo (`::after`) stays disabled on rows — too busy on a thin row, and the holographic icon's filter already responds to cursor.

**Why:** Default scene-angle reactivity rotated the gradient across the row's full width, which read as wonky on a thin 1-row strip when light arced to the opposite side. The deliberate left-rule background-image carries the row's color identity; the gem-faceted bg should be quieter on rows than on cards.

**How to apply:** Surfaces where full scene-angle rotation would distort layout (thin rows, narrow strips) should override `.u-light::before`'s background with a damped angle expression.

# Phase 3.x decisions (showcases redesign + capture pipeline)

## Showcases: 2-col max grid + singleton featured layout
**File(s):** `docs/src/components/gallery/ShowcaseGrid.astro`, `docs/src/components/gallery/ShowcaseTilePlaceholder.astro`, `docs/src/content/docs/showcases/index.mdx`
**Date:** 2026-05-08

**Decision:** Showcases get a dedicated `<ShowcaseGrid>` (2-col max at >=768px, 1-col below; 64rem container max). When only one `<a class="gallery-tile">` is present, `:only-of-type` triggers a singleton-featured layout: spans both columns at 38rem max-width, justify-self center, with bigger inner padding + larger title/description and a 6s ambient brightness/saturation breath animation.

`ShowcaseTilePlaceholder` is a non-interactive `<div>` mirror of GalleryTile's chrome (gem accent, foil rim, body type) plus a centered "Coming Soon" badge. Renders alongside the real Breakout tile on the index so the per-showcase frontmatter theme system is visible without uncommenting code. Critically: placeholders are `<div>` (not `<a>`), so they're a different element TYPE — `:only-of-type` still matches Breakout's `<a>` and the singleton-featured layout STILL applies. Result: Breakout featured/centered on row 1, two themed placeholders on row 2.

**Why:** User direction was 2-col grid (not carousel) with single-item centered at half-width; placeholders demonstrate the multi-showcase theming without committing real `<a>` siblings that would break the singleton layout.

**Evidence:** Initial `:only-child` selector failed because GalleryTile inlines a hover-video `<script type="module">` as a sibling of the `<a>` — script counts as a child. `:only-of-type` (counts by element tag) ignores the script. Cross-component CSS overrides (cross-tile body padding/typography) require `<style is:global>` because GalleryTile's styles are scoped under its own astro hash; without `is:global`, selectors from this file would only match elements rendered BY this file.

**How to apply:** When stretching one component's CSS to reach into another component's internal markup in Astro, use `<style is:global>`. When sibling-counting selectors need to ignore inlined component scripts, prefer `:only-of-type` over `:only-child`.

## ShowcaseDetailLayout: drop inline editor, external CTAs, gem-tinted chrome
**File(s):** `docs/src/components/ShowcaseDetailLayout.astro`, `docs/src/content/docs/showcases/breakout.mdx`
**Date:** 2026-05-08

**Decision:** Showcase detail pages use `<ShowcaseDetailLayout>` instead of `<ExampleDetailLayout>` + Tabs+StackBlitzEmbed. Differences:
- No inline SplitView code editor — full-app showcases are best read on GitHub, not tinkered with inline.
- External "Open in StackBlitz" + "View on GitHub" CTAs in the header, primary tinted by the showcase's gem.
- `<slot name="preview" />` for the live `<ShowcaseGame />` at full panel width.
- Default `<slot />` = MDX prose (architecture / design story / controls), rendered inside `.sl-markdown-content`.
- Per-showcase gem flows through chrome via `--showcase-accent` (back link, primary CTA, stage ring all track the same gem).

**Why:** Examples and Showcases serve different reads. Examples are tinker-targets; Showcases are curated narratives. Inline code editing on a full game adds noise without value.

**How to apply:** New showcases pass `slug`, `sourcePath`, and `gem` props; URL convention is `https://stackblitz.com/github/<repo>/tree/<branch>/<sourcePath>` + matching GitHub URL. The layout handles all chrome — MDX file is just the prose.

## Capture scripts: canvas pixel buffer read, not Playwright element screenshot
**File(s):** `docs/scripts/capture-examples.mjs`, `docs/scripts/capture-minis.mjs`
**Date:** 2026-05-08

**Decision:** Both capture scripts (examples + minis) read the canvas's pixel buffer directly via Canvas API in page context, NOT Playwright's `locator.screenshot()`. The Node-side gets bytes via:

```js
const base64 = await page.evaluate(() => new Promise((resolve, reject) => {
  requestAnimationFrame(() => {
    const c = document.querySelector('canvas')           // (or scoped selector)
    const snap = document.createElement('canvas')
    snap.width = c.width; snap.height = c.height
    snap.getContext('2d').drawImage(c, 0, 0)
    snap.toBlob(async (blob) => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
      resolve(btoa(bin))
    }, 'image/png')
  })
}))
const pngBuffer = Buffer.from(base64, 'base64')
```

Done inside `requestAnimationFrame` so the capture happens right after a frame draws — works for r3f canvases without `preserveDrawingBuffer: true`. Alpha is preserved end-to-end (2D canvas + PNG natively). WEBP gets `alphaQuality: 100` for clean transparent edges.

**Why:** Playwright's `locator.screenshot()` is an ELEMENT screenshot — captures the rendered region of the page within the element's bounding box, INCLUDING any DOM that overlaps it (Astro dev overlay, view-transition pseudos, vtbot scripts, alpha ribbon, progress bar). Direct canvas-buffer read bypasses all of that.

`omitBackground: true` was needed when we used Playwright screenshots to preserve alpha — but since we're now reading the canvas buffer directly, the alpha just comes through naturally. Earlier attempts to flatten the alpha via `sharp().flatten()` were exactly wrong: the GalleryTile's tile bg is gem-tinted, and the video (via `canvas.captureStream`) preserves alpha and composites on the tile bg at display time. The still needs to do the same — store alpha, let the tile composite at display time. Both still + video are now the same source mechanism (canvas pixel buffer) and look visually identical.

**Evidence:** User report: dev overlay was visible in the still but not in the video, even though both were "of the canvas." Confirmed Playwright element screenshot includes overlapping DOM. Confirmed `drawImage(canvas)` reads the canvas's pixel buffer directly, no overlapping DOM. Same mechanism as `canvas.captureStream` (which is why video never had this issue).

**How to apply:** Any future capture script that needs the canvas's actual pixel content should use the `drawImage + toBlob + base64 across page.evaluate` pattern. Playwright's element screenshot is for rendered-page captures (component screenshots), not for canvas-only buffer extraction.

## Capture-minis: server probe specific route, per-stage logging, 8s settle
**File(s):** `docs/scripts/capture-minis.mjs`
**Date:** 2026-05-08

**Decision:** Three diagnostic improvements on capture-minis (also useful for capture-examples in future iterations):

1. Server probe hits the actual showcase URL (`/showcases/<slug>/`), not generic `/`. Generic 200 responses from unrelated leftover servers (orphan astro dev, stray python http.server) used to trigger false-positive reuse — Playwright then navigated to a server without our actual routes and the page never resolved.
2. Per-stage logging: `[capture-minis]   navigating... ok / waiting for canvas... ok / settling Xms... ok / capturing...` so any future hang is immediately visible at the exact stage.
3. `domcontentloaded` instead of `load` for `page.goto`. The docs site has lazy fonts + images + view-transition scripts that can keep the `load` event open for many seconds; React.lazy + Suspense mount AFTER DOMContentLoaded anyway.
4. Settle bumped from 3s → 8s. WebGPU init + flatland scene compile + first attract-mode AI tick + first paint takes longer than 3s on the docs dev server. 8s gives ample headroom.

**Why:** A silent hang in a long-running capture script is much harder to debug than an explicit error. Per-stage logging surfaces the failure point. The specific-route probe prevents the "probe says reuse, capture says hang" trap.

**How to apply:** Capture scripts that probe an existing dev server should always probe a route specific to the test target, not just `/`. Long-running scripts should log per-stage so silent hangs become visible failures.

---

# Session 2026-05-08 (post-compaction) — Component overrides catch-up + heading-badges sweep

## Heading-badges sweep — 6 tasteful badges across guides
**File(s):** `docs/src/content/docs/guides/skia.mdx`, `docs/src/content/docs/guides/tsl-nodes.mdx`, `docs/src/content/docs/guides/pass-effects.mdx`
**Date:** 2026-05-08

**Decision:** Activate `starlight-heading-badges` (configured but unused) on a tasteful set of 6 sections that signal status / experience-level:
- Skia API surface (SkiaCanvas / Drawing Nodes / SkiaGroup) → `:badge[Alpha]{variant=caution}`
- TSL Nodes Material Effects → `:badge[Recommended]{variant=success}` paired with Low-Level TSL Usage → `:badge[Advanced]{variant=note}`
- Pass Effects Pass Chaining → `:badge[Advanced]{variant=note}`

Skipped blanket `:badge[v0.X]` placement — every package is at `0.1.x-alpha`, so version stamps would just be noise across the board.

**Why:** The badges plugin had been wired in Phase 1 but never used. The point of the system is to create meaningful distinctions where status / readiness / depth differ. Skia's API is the newest and most volatile (Alpha warrants the caution variant); TSL Nodes has a clear high-level vs low-level distinction the docs already articulate. Six placements demonstrates the system without decorating every heading.

**How to apply:** Future badge placements should mark a meaningful semantic distinction (status, platform, version) — not be a decoration. If most readers don't gain new information from a badge, it's noise.

## TOC badge deserialization — inlined parser instead of plugin internal import
**File(s):** `packages/starlight-theme/components/overrides/parts/toc/TableOfContentsList.astro`
**Date:** 2026-05-08

**Decision:** When we override Starlight's `TableOfContents` component, we displace `starlight-heading-badges`'s own override that handles badge serialization in TOC links. Without intervention, raw `__SHB__caution__SHB__Alpha__SHB__` markers leak into `aria-current` link text and on-this-page navigation. Two paths considered:
1. Import `deserializeBadges` from `starlight-heading-badges/libs/badge`
2. Inline the deserializer in our `TableOfContentsList`

Chose 2 because (a) the plugin's `package.json` `exports` field doesn't expose `./libs/badge`; (b) the serialization format is small (~25 lines) and stable; (c) avoiding a private-internals import keeps us insulated from upstream refactors.

**Why:** Plugin-private API access is fragile. The format is documented in the plugin's `libs/badge.ts` and the round-trip is symmetrical (serialize on remark side, deserialize on render side). Copying the deserializer is ~one screen of code and locks in our resilience.

**How to apply:** When composing with another Starlight plugin's overrides, prefer (a) composing the plugin's components directly via its public exports (b) inlining a small deserializer if (a) isn't accessible — avoid dot-dot-slash through node_modules paths or undocumented internal imports.

## Pagination: per-destination gem + foil-rim + restored eyebrow/title layout
**File(s):** `packages/starlight-theme/components/overrides/Pagination.astro`
**Date:** 2026-05-08

**Decision:** Full impeccable loop on Pagination. The prior override flattened Starlight's eyebrow/title two-line layout to bare titles, dropped translations support, didn't tie into the gem-per-section taxonomy, and didn't apply the foil rim system. Rewrote with:
- Two-line eyebrow + title (Starlight-default information design)
- Per-destination gem accent via `gemForHref` (mirrors Head.astro's `gemForPath` and NavBar's per-link mapping)
- Foil rim: `::before` gem gradient ring + `::after` soft hotspot wash, both pointer-tracked via the global `--mx`/`--my` from `data-light`
- Chevron lifts into a gem-tinted chip with spring-eased translate on hover
- Responsive: 1-col stack at narrow widths, 2-col grid at ≥48rem
- Restored RTL via `dir` + isRtl chevron path swap
- Reveal-on-scroll via `u-reveal`

**Why:** Pagination sits at the foot of every doc page and was the loudest gap in the design-system fidelity sweep. Per-destination gem accents make the navigation purposeful — the user can see at a glance whether they're heading further into the same section (matching gem) or jumping to a different cluster (different gem).

**How to apply:** Any link that implies destination should consider per-destination gem accent, mirroring `gemForPath`. Hover affordances should follow the foil-rim convention (`::before` ring driven by cursor `--mx/--my`).

## Footer: meta below pagination, single divider
**File(s):** `packages/starlight-theme/components/overrides/Footer.astro`
**Date:** 2026-05-08

**Decision:** Reorder `<EditLink>` + `<LastUpdated>` meta row to sit BELOW Pagination, matching Starlight's default ordering. Pagination owns the divider (border-top) for the "leaving this page" affordance; meta sits below as quiet attribution. Drops the redundant border-top on the meta row that was creating a double horizontal rule.

**Why:** With Pagination's own divider in the redesign, the prior layout had two stacked rules (meta border-top + pagination border-top). Single divider per page is cleaner; meta-as-attribution-below-pagination matches Starlight default plus reads naturally as "more about THIS page" after the "go to NEXT page" cue.

**How to apply:** When two adjacent components both want a divider, pick one as the canonical divider-owner (typically the more semantically-loaded one) and have the other suppress its own.

## ContentPanel: documented passthrough intent
**File(s):** `packages/starlight-theme/components/overrides/ContentPanel.astro`
**Date:** 2026-05-08

**Decision:** ContentPanel stays a passthrough — `<div class="content-panel" style="display:contents"><slot /></div>`. The structural class is preserved for selector stability but no padding/max-width/divider rules carry over from Starlight default. An inline comment documents which override owns each layout responsibility (TwoColumnContent / PageTitle / MarkdownContent / Pagination / Footer).

**Why:** The previous bare `<slot />` invited a future agent to "complete" the override by adding padding or max-width — which would fight the framing rules in the actual layout components. The comment + structural class is the smallest valuable diff that prevents that misread.

**How to apply:** When an override is intentionally a passthrough or near-passthrough, document the intent inline. Empty / minimal overrides without context read as incomplete and invite well-meaning regressions.

## Search modal: result hover lift + accent rail + kbd cleanup
**File(s):** `packages/starlight-theme/components/overrides/Search.astro`
**Date:** 2026-05-08

**Decision:** Polish the search modal interior (Pagefind UI integration). Two changes:
1. Each result gets a 2px diamond-tinted left accent rail on hover/focus (`::after` since Pagefind owns `::before` for page/tree icons). Mirrors the sidebar pip pattern. Scales 0.5 → 1 over 200ms; reduced-motion strips the transition.
2. Cleaned up the `kbd` shortcut indicator's tangled CSS — was `display: none !important` plus a media-query override, plus an inline script that used `setProperty('display', 'flex', 'important')`. Visibility is now fully script-driven; CSS only handles appearance.

**Why:** The "you've selected this" affordance via left accent rail is consistent across docs surfaces (sidebar pip, TOC active marker, search results). Kbd cleanup removed a silent-bug-magnet — the duplicated declarations had different values across paths.

**How to apply:** "You've selected this" affordance should always be a left accent rail, gem-tinted, that wakes up via scaleY transition. Don't mix CSS visibility logic with script-driven visibility — pick one source of truth.

## Mobile TOC restored — narrow viewports get badges-aware on-this-page nav
**File(s):** `packages/starlight-theme/components/overrides/PageSidebar.astro`, `packages/starlight-theme/components/overrides/TwoColumnContent.astro`
**Date:** 2026-05-08

**Decision:** Render `MobileTableOfContents` (resolves to `starlight-heading-badges`'s plugin override since we don't override it ourselves) alongside our desktop `TableOfContents` in PageSidebar. Mobile wrapper uses `display: contents` at <1280px so the inner `<details>`'s `position: fixed` actually escapes the layout. Desktop wrapper hidden at <1280px to avoid double-TOC.

Updated `TwoColumnContent`'s `.toc` slot from `display: none` → `display: contents` at narrow widths so fixed-positioned children can render. `display: none` cascades to children regardless of `position: fixed`.

Themed mobile TOC: diamond-tinted border, card-toned bg, blur+saturate backdrop, Inter font stack, smooth state transitions, badge sizing tightened in the "you are here" indicator.

**Why:** Pre-fix, narrow viewports (<1280px) got NO TOC at all — we'd dropped the mobile component when forking from lucode and never re-added it. Long doc pages on tablet were uncomfortable to scan. Adopting the plugin's `HeadingBadgesMobileTableOfContents.astro` gives badges-aware mobile nav for free.

**How to apply:** When overriding a Starlight component that has a mobile-vs-desktop split (TableOfContents has `MobileTableOfContents`), check both. `display: none` on a layout slot hides ALL children including position-fixed ones — `display: contents` is the escape hatch when you need fixed-positioned children to render but don't want the slot to take flow space.

## Hero: dormant override brought to design-system fidelity
**File(s):** `packages/starlight-theme/components/overrides/Hero.astro`
**Date:** 2026-05-08

**Decision:** No pages currently use `hero:` frontmatter (landing uses `template: splash` with custom hero composition). The Starlight Hero override is dormant. Brought it to design-system fidelity so the moment it's adopted it lands fully formed:
- On-load entrance via `hero-enter` class — staggered fade-rise with 80ms steps, CSS animation (not `u-reveal` because hero is at top-of-page where IntersectionObserver fires immediately, defeating the reveal discipline)
- Hero image picks up gem-tinted outline + soft drop with per-instance override via `--hero-image-gem` custom prop
- Tighter mobile padding (16/10 → 24/16 at ≥768px) so hero doesn't push everything below the fold on narrow viewports
- Reduced motion strips the entrance animation

**Why:** Dormant overrides decay if they don't track the design system, and adoption is a future event we can't predict. Bringing it up to fidelity now keeps the option of "drop a hero: in frontmatter" alive without per-page bespoke composition.

**How to apply:** For top-of-page elements, prefer CSS keyframe entrance animations to scroll-driven reveals — IntersectionObserver fires immediately when the element is already in view, defeating the staggered choreography you'd get from scroll triggers further down the page.
