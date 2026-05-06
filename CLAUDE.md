# three-flatland

## Build & Test
- `pnpm dev` — docs (port 4000) + examples MPA (port 5174) behind microfrontends proxy at http://localhost:5173
- `pnpm --filter=example-react-tilemap dev` — run a single example
- `pnpm sync:pack` — sync example/mini package.json deps with the workspace catalog after editing `pnpm-workspace.yaml`
- `pnpm sync:react` — regenerate React subpath wrappers after touching `packages/three-flatland/src/*/index.ts`

## Code Style
- No semicolons, single quotes, trailing commas (Prettier)
- `type` keyword required for type-only imports (`consistent-type-imports` + `verbatimModuleSyntax`)
- Unused vars must be prefixed with `_`

## Architecture
- WebGPU + TSL (Three Shader Language) exclusively — no WebGL, no GLSL
- R3F examples import from `@react-three/fiber/webgpu`, not `@react-three/fiber`
- Three.js users: `import from 'three-flatland'` — R3F users: `import from 'three-flatland/react'` (all packages follow this `/react` subpath pattern, incl. `@three-flatland/tweakpane/react`)
- Shared versions in `pnpm-workspace.yaml` catalog; `pnpm.overrides` maps `@three-flatland/*` to `workspace:*`

## Examples
- Examples always exist in **pairs** — Three.js + React. Create both or neither.
- `examples/three/` = plain Three.js, `examples/react/` = React Three Fiber
- R3F classes must be registered with `extend()` before use in JSX
- All Three.js objects used as R3F JSX elements need: optional constructor params, property setters, array-compatible setters

## Planning
- All planning, PRDs, milestones, and specs live in /planning, ensure all planning docs live under this directory.
- Save superpowers specs to planning/superpowers/specs.
- Save superpowers plans to planning/superpowers/plans.

## Workflow
- Use Conventional Commits — releases are cut from changesets generated from the commit history

## Constraints
- Performance is critical — minimize draw calls, batch sprites via SpriteGroup, watch frame budgets
- All custom Three.js classes must work with R3F's no-arg construction + property-setting pattern

## Do NOT
- Use GLSL or `onBeforeCompile` — all shaders use TSL node materials
- Use `WebGLRenderTarget` — use renderer-agnostic `RenderTarget`
- Use Web Awesome (`@awesome.me/webawesome`) — examples use Tweakpane (`@three-flatland/tweakpane/react`) now
- Add `declare global { namespace JSX }` — use `ThreeElements` interface augmentation via `three-flatland/react`

## Design Context

Applies to the `docs/` site and the `packages/starlight-theme/` workspace plugin. Captured 2026-05-06 via `/impeccable:teach-impeccable`; refresh by re-running that skill if the brand direction shifts.

### Users
Developers building 2D scenes with Three.js or React Three Fiber — indie game devs, generative-art / interactive-visualization makers, and devs exploring WebGPU + TSL. Context when using the docs: evaluating whether the library fits a perf-sensitive use case, learning TSL idioms, copying examples into their own projects. Their job is to ship high-performance 2D scenes (sprites, tilemaps, effects) with confidence — not to consume marketing.

### Brand Personality
**Crafted, Expressive, Performant.**

Voice: confident-technical and welcoming-collaborative. Existing copy lands the tone — *"we're exploring,"* *"your feedback shapes what we build"* — keep it. Not corporate, not flippant. Aside callouts read like a teammate sharing notes; preserve that register.

Emotional goal: confidence in the tool's capability (it's serious infrastructure), and curiosity about what's possible (the expressive ceiling rewards exploration).

### Aesthetic Direction
**Ground floor:** Linear / Radix-leaning minimalism. Information density is high, ornament is low. Light and dark are equal first-class citizens, both auditable to WCAG AA. The page is a stage — quiet rhythm, generous whitespace where it matters, terse where it can be.

**Ceiling:** Rauno-/Vlad-leaning crafted moments. Subtle motion, bespoke micro-interactions, distinctive details that reward attention without shouting. Performance is part of the aesthetic — a docs site for a high-perf graphics library has to *itself* feel high-perf.

**Substrate:**
- Palette: base16 Materia mapped onto Starlight's `--sl-color-*` token system
- Typography: Public Sans (titles), Inter (nav/sidebar), JetBrains Mono (prose), Commit Mono (code); all bundled locally via Fontsource
- View transitions: `astro-vtbot` for page-order morphs, sidebar-state preservation, MFE border control; honors `prefers-reduced-motion`
- Audio: `SoundToggle` and audio-enabled examples stay; never autoplay; respect user mute

**Reference docs sites (in spirit):** linear.app/docs, radix-ui.com, partly tailwindcss.com for code-block treatment.

**Anti-references:** the current pixel-art retro design we're replacing — Jehkoba32 palette, Silkscreen typography, perspective floors with rotated colored boxes. The brand mark and social assets at `docs/src/assets/` and `BrandAsset.astro` are also retro and will be refreshed in Phase 3 of the docs refresh (issue #32).

### Design Principles
1. **Density without noise.** Show the API, the example, the verification. Don't pad. Density is earned through clarity, not white space.
2. **Quiet layout, expressive details.** Layout and rhythm stay restrained so motion and considered micro-interactions can carry the personality. The components are the actors; the page is the stage.
3. **Light and dark equal citizens.** Token-driven through the `starlight-theme` workspace plugin. Neither mode is the afterthought; both are designed.
4. **Performance is the proof.** Page transitions snappy, animations cheap, fonts subset, bundle lean. `prefers-reduced-motion` is honored everywhere.
5. **Audio belongs.** The library lives at the seam of dev-tool and creative-tool; sound toggles and audio examples are part of that. They never autoplay; they always respect mute.
