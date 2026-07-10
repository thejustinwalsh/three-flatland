# three-flatland

## Build & Test

- `pnpm dev` — docs (port 4000) + examples MPA (port 5174) behind microfrontends proxy at http://localhost:5173
- `pnpm --filter=example-react-tilemap dev` — run a single example
- `pnpm sync:pack examples minis` — sync example/mini package.json deps with the workspace catalog after editing `pnpm-workspace.yaml`. **The bare form exits 1**: `scripts/sync-pack.ts` requires explicit directory args (`pnpm sync:pack <dir> [<dir>…]`), which is how `lefthook.yml` invokes it.
- `pnpm sync:react` — regenerate React subpath wrappers after touching `packages/three-flatland/src/*/index.ts`

## Code Style

- No semicolons, single quotes, trailing commas (Prettier)
- `type` keyword required for type-only imports (`consistent-type-imports` + `verbatimModuleSyntax`)
- Unused vars must be prefixed with `_`

## Architecture

- **WebGPU + WebGL2 via TSL** (Three Shader Language). One shader graph compiles to WGSL and GLSL ES 3.0, so both backends ship from the same source. WebGL2 is reached only through `WebGPURenderer`'s fallback backend — never the legacy `WebGLRenderer`.
- R3F examples import from `@react-three/fiber/webgpu`, not `@react-three/fiber`
- Three.js users: `import from 'three-flatland'` — R3F users: `import from 'three-flatland/react'` (all packages follow this `/react` subpath pattern, incl. `@three-flatland/devtools/react`)
- Shared versions in `pnpm-workspace.yaml` catalog; `pnpm.overrides` maps `@three-flatland/*` to `workspace:*`
- Text and vector shapes go through `@three-flatland/slug` — analytic Bézier evaluation, instanced, resolution-independent, no atlas. See [packages/slug/CLAUDE.md](packages/slug/CLAUDE.md).
- `@three-flatland/skia` (Skia WASM; Ganesh/WebGL + Graphite/WebGPU) is the escape hatch for raster and complex-vector work Slug cannot express — gradients, filters, blurs. It is never on the hot path, and never one render target per element.

## Examples

- Examples always exist in **pairs** — Three.js + React. Create both or neither.
- `examples/three/` = plain Three.js, `examples/react/` = React Three Fiber
- R3F classes must be registered with `extend()` before use in JSX
- All Three.js objects used as R3F JSX elements need: optional constructor params, property setters, array-compatible setters — except ported packages, which keep upstream signatures and use R3F's `args` (see Constraints)

## Planning

- All planning, PRDs, milestones, and specs live in /planning, ensure all planning docs live under this directory.
- Save superpowers specs to planning/superpowers/specs.
- Save superpowers plans to planning/superpowers/plans.

## Workflow

- Use Conventional Commits — releases are cut from changesets generated from the commit history. CI auto-generates the changesets from commit history; we do NOT hand-write them. A package is release-visible iff `private !== true` and it's not in `.changeset/config.json`'s `ignore` list. See [.changeset/CLAUDE.md](.changeset/CLAUDE.md) for the full flow (commit-type → bump mapping, the generator script, alpha pre-release mode).

## Engineering discipline (iron law)

- **Tech debt is fixed at the point of discovery — fold it in, every turn.** When you hit a bug, a broken build step, or tech debt while working — even if it's outside your immediate task — you fix it in the same change. Do not dodge it, do not merely note it, do not defer-by-default. The **only** exception: you can prove another active workstream already owns the fix (a named branch/PR/issue) — then cross-reference that work so the connection isn't lost, and move on. "I'll leave it for later" is not an option.

## Constraints

- Performance is critical — minimize draw calls, batch sprites via SpriteGroup, watch frame budgets
- All custom Three.js classes must work with R3F's no-arg construction + property-setting pattern. This is an **ergonomic convention for classes we author**, so consumers never reach for R3F's `args` prop — it is not an R3F requirement. **Ported packages are exempt**: `@three-flatland/uikit` preserves `@pmndrs/uikit`'s constructor signatures verbatim (e.g. `Fullscreen(renderer, ...)`) and passes them through R3F's `args`, which is the sanctioned mechanism. API compatibility beats convention. Do not "fix" a ported constructor to be no-arg.

## Do NOT

- Use GLSL or `onBeforeCompile` — all shaders use TSL node materials
- Use the legacy `WebGLRenderer` — target `WebGPURenderer`; its WebGL2 backend is the fallback
- Use `WebGLRenderTarget` — use renderer-agnostic `RenderTarget` (exported from `three`). Audited 2026-07-10: no site in this repo needs the WebGL-specific class, so there is no carve-out, not even for Skia's Ganesh backend.
- Use Web Awesome (`@awesome.me/webawesome`) — examples use Tweakpane (`@three-flatland/devtools/react`) now
- Add `declare global { namespace JSX }` — use `ThreeElements` interface augmentation via `three-flatland/react`

## Design Context

Applies to the `docs/` site and the `packages/starlight-theme/` workspace plugin. Originally captured 2026-05-06; **revised 2026-05-06** (PR #33 mid-flight) when the Materia/Linear-minimalist substrate proved too pastel and too low-contrast. Refresh by re-running `/impeccable:teach-impeccable` if the brand direction shifts again.

### Users

Developers building 2D scenes with Three.js or React Three Fiber — indie game devs, generative-art / interactive-visualization makers, and devs exploring WebGPU + TSL. Context when using the docs: evaluating whether the library fits a perf-sensitive use case, learning TSL idioms, copying examples into their own projects. Their job is to ship high-performance 2D scenes (sprites, tilemaps, effects) with confidence — not to consume marketing.

### Brand Personality

**Crafted, Expressive, Performant — and unapologetically _colorful_.**

Voice: confident-technical and welcoming-collaborative. Existing copy lands the tone — _"we're exploring,"_ _"your feedback shapes what we build"_ — keep it. Not corporate, not flippant. Aside callouts read like a teammate sharing notes; preserve that register.

Visual register: **technicolor on near-black.** A docs site for a graphics library should _itself_ feel like a graphics demo — saturated accents, jewel-toned highlights, color used as taxonomy, not just decoration. The library renders sprites and shaders; the site renders confidence and curiosity through chroma.

Emotional goal: confidence in the tool's capability (it's serious infrastructure), and curiosity about what's possible (the expressive ceiling rewards exploration).

### Naming

- **Visual / wordmark:** **flatland** — set in the pixelated `Silkscreen` typeface in the header alongside the geometric FL icon mark. This is what users see in the browser tab, the header, and brand assets.
- **Package / npm / SEO:** **three-flatland** — the npm package name, README headers, install commands, and any place a developer types or links to the package. Stays unchanged for discoverability against the Three.js / React Three Fiber ecosystem.
- The mismatch is intentional: short distinctive brand for humans, descriptive package name for search and crates registries.

### Aesthetic Direction

**Ground floor:** high-contrast vibrant minimalism — restrained layout, generous whitespace, but every accent and affordance lands in jewel-toned color. Density is still earned through clarity, but accents do not desaturate to read "grown-up." Light and dark are both first-class citizens, both auditable to WCAG AA, both saturated.

**Ceiling:** Rauno-/Vlad-leaning crafted moments — subtle motion, bespoke micro-interactions, distinctive details that reward attention. Performance is part of the aesthetic.

**Substrate:**

- **Palette:** technicolor gem-named taxonomy inspired by [bearded-theme/black](https://github.com/BeardedBear/bearded-theme/blob/master/src/variations/black.ts) — **gold**, **ruby**, **emerald**, **diamond**, **amethyst**, **pink**, **salmon**, **turquoize** sit alongside the conventional **blue**, **green**, **orange**, **red**, **yellow**, **purple** primitives. Every gem name is a token; components opt into them via `color="gem"` props or scope-driven assignment (sidebar sections, card grids, asides). Backgrounds sit at near-black `#111418` with gem-tinted soft variants (`gold-soft`, `ruby-soft`, etc.) for surface differentiation. Light mode keeps the same gem names with deeper saturation for contrast on paper-toned backgrounds.
- **Color taxonomy:** the design system does NOT stop at `primary / secondary / tertiary`. Color carries meaning at every level:
  - **Section identity** — sidebar groups each pick a gem. Hover and active states inherit that gem's hue.
  - **Card accent** — `<FeatureCard color="emerald">` (etc.). Card grids cycle gems by default; explicit `color` overrides.
  - **Links** — distinct token (`--link`) different from foreground; `--link-hover` shifts hue intentionally.
  - **Asides** — note (diamond-blue), tip (amethyst-purple), success (emerald-green), warning (gold-orange), danger (ruby-salmon).
  - **Code-block accents** — language-token colors lean on the gem palette.
- **Typography:**
  - **Wordmark / site title:** `Silkscreen` (pixel font) — the "flatland" mark only.
  - **Page titles, section headings:** `Public Sans` 600/700 — display weight, tight tracking.
  - **Navigation, sidebar, UI labels:** `Inter` 400/500/600 — humanist UI sans.
  - **Body prose:** `JetBrains Mono` — yes, prose-as-mono. Reads as "engineering log."
  - **Code blocks:** `Commit Mono` (with JetBrains Mono fallback) — programming ligatures, contextual alternates.
  - All four bundled locally via Fontsource. Site-wide font-families MUST be set explicitly on `body`, `header`, `nav`, `aside`, etc. — Tailwind v4's `theme.fontFamily` only generates utility classes, it does not auto-apply at the body level.
- **Texture (subtle):** a barely-perceptible grain/noise overlay on the near-black background — the kind of thing readers don't consciously notice but can feel the absence of. _The ghost hack you don't know is hitting you in the feels._ Implementation: an SVG fractal-noise filter or a tiny tiled noise PNG at very low opacity (≤ 4%), additive on dark mode, multiplicative or skipped on light. NEVER raise opacity to where it reads "textured" — if a user notices it, it's wrong. Reference: the way Vercel's, Linear's, and Rauno's surfaces feel "deep" without obvious patterns.
- **Motion (purposeful):** the substrate embraces animation as a craft layer — with deliberate asymmetry. **Ambient layers stay quiet so interactive moments can land hard.**
  - **Ambient — texture grain** (above): sub-perceptual, you-don't-see-it.
  - **Ambient — reveal on scroll** — sections, cards, and figures fade-rise into view as they enter the viewport. CSS scroll-driven animations (`animation-timeline: view()`) where supported, IntersectionObserver fallback for older browsers. Stagger grids by `nth-child`. Translate ≤ 16px, opacity 0→1, 240–360ms. Restrained.
  - **Interaction — pointer-tracking light** — soft radial-gradient highlight follows the cursor on cards, buttons, and key affordances. CSS custom properties `--mx`/`--my` updated via `pointermove`; gradient renders through `radial-gradient(at var(--mx) var(--my), …)`. The light hue tracks the surface's gem accent so the glint reads as "lit by the local color." Peak luminance ≤ 15% over base.
  - **Interaction — physically-lit foil sheen** (the headline): truly dynamically reactive surfaces with **real lighting math, not CSS gradient cosplay**. Implementation primitives:
    - **SVG filter pipeline** per gem material — `<feImage>` sources a baked normal map texture (subtle bump for the foil grain), `<feDiffuseLighting>` + `<feSpecularLighting>` with a `<fePointLight>` whose position tracks the pointer (set via JS-driven attribute updates). The diffuse term colors the surface, the specular term creates the sheen highlight, both react to cursor-derived light direction. `<feTurbulence>` + small `<feDisplacementMap>` adds the holo-fleck/sparkle layer.
    - **Per-gem materials** — each gem has its own tuned filter (`#mat-gold`, `#mat-ruby`, `#mat-emerald`, `#mat-diamond`, `#mat-amethyst`, …) with material-appropriate parameters: gold = high specular intensity, narrow lobe, warm diffuse, mild roughness; emerald = saturated green diffuse, prismatic chromatic-aberration sheen via per-channel offset; ruby = deep saturated diffuse, glossy specular; diamond = broad specular with cool blue-white, simulated dispersion via RGB-offset on the spec layer; amethyst = soft violet diffuse + sharp purple spec. Materials _feel_ different — gold has weight, diamond has sparkle, emerald has depth.
    - **Pointer-light coupling** — JS handler maps `pointermove` to light position (`x`/`y`/`z` on the `fePointLight`) and to a tilt CSS transform on the surface. Light position carries a slight perspective offset so the sheen sweeps across the surface as the cursor moves.
    - **Opt-in per surface** — utility class `.holo` + attribute `data-gem="gold|ruby|emerald|…"` selects the material. Brand mark, landing hero, key CTAs, sidebar active item earn the spend. Not ambient.
    - **Reduced motion** — collapses to a static rendering of the same filter (light position pinned), so the surface still reads as "lit" without animation.
  - **Implementation rule: convincing output is the bar.** The effect must sell _living, breathing 3D_ — surfaces with ambient idle motion + cursor-driven dynamic light + material weight that differs per gem. Three layers required:
    - **3D depth feel** — `perspective`, layered conic/linear gradients with parallax (background layers translate less than foreground when surface tilts), `transform: rotate3d` driven by pointer position. The surface bends toward the viewer's cursor.
    - **Ambient motion = perlin-noise-driven light position.** The light source is _always_ moving, even when no cursor is present, via 2D Perlin/simplex noise sampled per frame. The noise has a low spatial + temporal frequency so the wander reads organic, not mechanical — no `@keyframes` oscillation, just continuous noise drift of the light xy. ≤ 8% surface dimensions, ~0.05–0.1 Hz temporal scale. The surface breathes because the light breathes.
    - **Dynamic light** — pointer position sets the _center_ the noise wanders around, with ~80–120ms inertia ease. Cursor steers; noise jitters. When the cursor is idle the noise center stays put but the light keeps drifting around it; on pointermove the center smoothly relocates and the noise continues unbroken. One continuous animation loop drives both ambient and interactive light — they're the same light, just with a moving target.
  - **CSS-first if it sells.** Layered conic + radial gradients with `mix-blend-mode`, perspective transforms, idle `@keyframes`, and JS-driven `--mx`/`--my`/`--tilt` custom properties cover most cases without canvas/SVG-filter cost. **Escalate to SVG filter normal-map pipeline** (`feImage` + `feDiffuseLighting` + `feSpecularLighting` + `fePointLight`) only when CSS can't sell the depth — gold's specular weight, diamond's dispersion, ruby's saturated specular lobe are the likely escalation candidates. **Future option:** TSL/WebGPU canvas overlay for the most premium moments (dogfoods three-flatland), reserved for landing hero or brand-mark touchpoints if SVG filters aren't enough.
  - **Reduced motion** collapses ambient drift, kills tilt, pins the highlight to a single static pose. The surface still reads as gem-lit, just frozen.
  - **References:** poke-holo.simey.me (CSS holo math), Apple's annual report HTML pages and Linear's hero (perspective + ambient breathing), Vercel/Rauno surfaces (subtle parallax + cursor light).
  - All motion respects `prefers-reduced-motion: reduce` — reveals collapse to instant, pointer-light disables, holo-sheen flattens to a single static gem-tinted gradient, scroll-driven animations short-circuit. This is non-negotiable.
- **View transitions:** `astro-vtbot` for page-order morphs, sidebar-state preservation, MFE border control; honors `prefers-reduced-motion`.
- **Audio:** `SoundToggle` and audio-enabled examples stay; never autoplay; respect user mute.

**Reference (in spirit):** [bearded-theme black variants](https://github.com/BeardedBear/bearded-theme) (palette intent), Ableton Live Suite UI (information density + accent color usage), Figma's Variables UI (color-as-taxonomy), Material Theme Builder dark-on-jewel screenshots.

**Anti-references:** corporate-SaaS pastel palettes; the previous Materia substrate which was too desaturated and read "afterthought" rather than "designed"; designs that route every accent through a single primary hue.

### Logo / Icon

The **original retro pixel-art FL mark** is the established visual identity. It was briefly replaced with a geometric refresh (`e71f17d`) during Phase 3 and then reverted on stakeholder direction — the pixel mark is the brand. It pairs naturally with Silkscreen as the wordmark typography. **Do not redesign the icon.**

**Brand assets** (`BrandAsset.astro` — banner, OG, wide, social-x compositions) are a separate layer: those _do_ get redesigned, with layouts and surrounding graphics inspired by the new theme (gem palette, near-black, sub-perceptual texture). The retro pixel-art icon and Silkscreen "flatland" wordmark sit _inside_ those new compositions — the assets compose around the existing brand mark, they don't replace it.

### Design Principles

1. **Density without noise.** Show the API, the example, the verification. Don't pad. Density is earned through clarity.
2. **Color is taxonomy, not decoration.** Every gem in the palette is doing meaning-work somewhere — section identity, card accent, link affordance, aside type. If a color appears, it tells you something.
3. **Quiet layout, expressive accents.** Layout and rhythm stay restrained so the chroma can carry the personality. The components are the actors; saturation is the lighting.
4. **Light and dark equal citizens.** Token-driven through the `starlight-theme` workspace plugin. Neither mode is the afterthought; both are designed; both stay saturated.
5. **Performance is the proof.** Page transitions snappy, animations cheap, fonts subset, bundle lean. `prefers-reduced-motion` is honored everywhere.
6. **Audio belongs.** The library lives at the seam of dev-tool and creative-tool; sound toggles and audio examples are part of that. They never autoplay; they always respect mute.
