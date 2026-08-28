# Documentation Audit Report

**Date:** 2026-08-27
**Pages audited:** 41 prose (`docs/src/content/docs/**/*.mdx`, excluding generated `api/`)
**Scope:** Accuracy + Engagement + LLM Docs + JSDoc
**Method:** repo `documentation` skill (`audit.md` four layers, `diataxis.md` type rules)
**Predecessor:** the 2026-05-24 audit, tracked as epic #96

## Top-Level Findings

Six pages have been added since the 2026-05-24 audit and had **never been audited**:

| Added | Page |
| --- | --- |
| 2026-06-12 | `examples/hit-test.mdx` |
| 2026-06-22 | `guides/hit-testing.mdx` |
| 2026-07-01 | `guides/devtools-architecture.mdx` |
| 2026-08-20 | `examples/hierarchy-clipping.mdx` |
| 2026-08-22 | `guides/pixel-perfect-rendering.mdx` |
| 2026-08-23 | `guides/private-ecs-migration.mdx` |

The eleven epic-#96 children (#101–#108, #98, #100, #104) still describe the *older* pages; nothing in
the epic covers these six.

## Layer 1 — Accuracy

| Check | Result |
| --- | --- |
| `syncKey` on every code-sample `Tabs` block | **2 defects, fixed** — `examples/hit-test.mdx:156,177` |
| Tab labels match the site convention (`Three.js` / `React`) | **2 defects, fixed** — `Three.js (Sprite2D)` / `Three.js (AnimatedSprite2D)` were one-off labels that break framework sync (site uses `Three.js` 57x, `React` 58x) |
| R3F imports from `@react-three/fiber/webgpu` | pass — zero `import` statements use bare `@react-three/fiber`. Prose and install commands mention the bare package 12 times, correctly, since that is the peer-dependency name |
| Relative cross-links resolve | pass — **158/158**, verified against route semantics (`trailingSlash: always`, so each page is a route directory) |
| Malformed anchors (`../page#frag/`) | pass — none |
| Version-pin consistency | pass — three.js `^0.185.1` (10 mentions, matches catalog), R3F `10.0.0-alpha.3` (12 mentions) |

## Layer 2 — Engagement

### Type purity (criterion 5)

`examples/hit-test.mdx` — declared **Tutorial** (Examples bucket). **Fails.**
`## Two paths to the same raycaster` is alternatives and `### Roadmap — not yet supported` is
neither guided nor a lesson; both are Tutorial must-not content. Split candidate.

`examples/hit-test.mdx` vs `guides/hit-testing.mdx` — **content duplication.** Near-identical
heading sets: pointer events, hit-test modes, alpha mode, tile picking, hover under a moving camera.
The Tutorial and the How-to are covering the same ground rather than cross-linking.

`guides/pixel-perfect-rendering.mdx` — declared **How-to**. Minor: `## Limitations` is Explanation.

`guides/private-ecs-migration.mdx` — declared **How-to**. **Passes.** Imperative task headings
throughout; the newest page is the most type-pure.

`guides/devtools-architecture.mdx` — **no finding.** The `guides/` path prefix is a file convention,
not the IA bucket; `astro.config.mjs` places it in the **Concepts** sidebar group, where its
explanatory content is correct.

### Visual coverage (criterion 2)

8 of 41 pages carry no visual (checked against the real component inventory in
`docs/src/components/`, not a guessed list):

| Page | Note |
| --- | --- |
| `getting-started/quick-start.mdx` | the canonical Tutorial shows no picture of the result |
| `guides/pixel-perfect-rendering.mdx` | strong `<Compare>` candidate — pixel-perfect vs fractional is a seam-slider case |
| `guides/shadows-setup.mdx` | How-to, no visual |
| `guides/private-ecs-migration.mdx` | migration How-to, low priority |
| `examples/index.mdx`, `showcases/index.mdx` | gallery/index pages |
| `getting-started/installation.mdx`, `llm-prompts.mdx` | Reference/prompt pages, visual not applicable |

### Signature callout (criterion 4)

29 of 41 pages carry no `:::tip[Performance note]`. The skill treats this as soft — only a
perf-relevant page with none is suspect. Not itemised as findings here.

## Layer 3 — LLM Docs

**Pass.** `llms.txt` / `llms-full.txt` are generated at build time by `starlight-llms-txt`
(`docs/astro.config.mjs`), not hand-maintained, so the audit's drift concern does not apply.

## Layer 4 — JSDoc

`SpriteGroup.stats` (`packages/three-flatland/src/pipeline/SpriteGroup.ts:1058`) points readers at a
`Flatland.stats` that does not exist. Tracked as #99; PR #122 proposes redirecting it to
`flatland.spriteGroup.stats`, but that accessor returns `RenderStats` — `spriteCount`, `batchCount`,
`visibleSprites` — with **no `drawCalls`**, which is the value the comment is about. `RenderStats`'s
own docblock names the correct destination: the debug bus `stats` feature in the
`@three-flatland/debug` subpath. The fix is a redirect there, not to `spriteGroup.stats`.

## Cross-Cutting Recommendations

1. Add "source TSDoc audit for `three-flatland` core" as a child of #96 — the epic's API-reference
   children (#100, #104) are scoped to devtools pages and guide tables, so #99 has no owner.
2. Split `examples/hit-test.mdx` per the `diataxis.md` recipe, and de-duplicate it against
   `guides/hit-testing.mdx`.
3. Close #98 if superseded — `create-three-flatland` shipped in #203 on 2026-07-20.
4. #97 still blocks the prose half of #96. Its first acceptance criterion is already met by
   `~/.claude/skills/voice-register/` (anchored on a 229k interview corpus); what remains is wiring
   `marketing-voice` to it with graceful degradation, since that skill lives outside the repo.

## Environment note (not a docs defect)

The docs build failed locally on an untouched tree until the worktree was repaired: `three` and
`@types/three` were at 0.183.1 against a lockfile pinning 0.185.1/0.185.4, `astro` was 6.4.8 against
7.1.3, and `packages/three-flatland/dist/` was a 2026-07-20 build that still imported `koota` at
runtime. `pnpm install --frozen-lockfile` plus `nx build three-flatland` cleared it.
Post-repair: **503 pages, exit 0.**
