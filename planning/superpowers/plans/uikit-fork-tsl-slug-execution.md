# uikit fork → TSL + Slug: execution plan

**Rev 5** — adds the **PR strategy & merge runbook** (stacked PR train, tip-green gate,
ordered one-sitting merge) and the **turbo.json build-graph fix** (slug + uikit
carve-outs; turbo.json is a serialization point). Rev 4 folded the D3 FINAL ruling
(`uikit-bake` bin; slug baker-contract debt; `SlugShapeSet` serialization) and the
Fleet execution strategy. Rev 3 folded the D1–D4 rulings; rev 2 folded Q1–Q7, E1–E4,
the example thread, serialization points, and build-system facts.
**Spec:** `planning/superpowers/specs/2026-07-10-uikit-fork-tsl-slug-design.md`
**Branch:** `feat/uikit-fork` (worktree `.claude/worktrees/uikit-fork`) — base of the
PR stack (see runbook).
**Sources:** uikit clone @ `0d4d887`; `three@0.183.1`; `@three-flatland/slug@0.1.0-alpha.3`.

Acceptance criteria are a hard gate in this repo: every item below is met, or carries an
explicit stakeholder-authorized deferral, before the PR is marked ready. **D1–D4 are
ruled** (recorded in spec §14 — they are execution requirements now, not open
questions). The one open decision is **D5** (default Inter source-TTF residence, spec
§14), which must be ruled before U2 starts. This plan is written for execution by a
parallel agent fleet: every phase is independently verifiable, leaves the tree green,
and names its serialization points.

## Repo mechanics (apply throughout)

- Conventional Commits; releases cut from **auto-generated** changesets — never
  hand-write changesets (`.changeset/CLAUDE.md`); repo is in alpha pre-release mode.
  New packages are release-visible iff `private !== true` and not in
  `.changeset/config.json` ignore; they start public with `0.1.0-alpha.0` intent.
- Prettier: no semicolons, single quotes, trailing commas. `type` keyword on type-only
  imports (`verbatimModuleSyntax`). Unused vars prefixed `_`.
- **TRAP: `pnpm --filter=<pkg> test` SILENTLY EXITS 0** for any package without a `test`
  script — which is most of them (`slug`, `bake`, `alphamap`, `normals`, …). Tests run
  through the single root `vitest.config.ts`. A phase that "verified tests pass" with a
  filtered command verified nothing. Use `pnpm exec vitest run packages/<pkg>/src` (or
  root `pnpm test`). This bit the orchestrator once already.
- **Lint/format is a per-phase gate, not a hook.** `lefthook.yml` pre-commit runs ONLY
  sync scripts (`sync-pack-full`, `sync-pack-files`, `sync-lockfile`,
  `sync-react-subpaths`, `sync-examples`, `check-skia-pin`) — no prettier, no eslint.
  Every phase's acceptance therefore runs format/lint/typecheck explicitly. **Gate on
  the files the phase touches, not the repo:** `pnpm format:check` already fails on 196
  files inherited from `main` (a `.prettierrc` export-wrapping disagreement), and
  `prettier --check .` fails on 557 (no `.prettierignore`, so it scans generated
  output). Use `pnpm exec prettier --check <changed files>` + `pnpm lint` +
  `pnpm typecheck`. Hooks do fire from worktrees.
- **No catalog bumps** — `three ^0.183.1` and `@react-three/fiber 10.0.0-alpha.2` are
  already pinned. Catalog **additions** only: `@preact/signals-core`, `yoga-layout`,
  `zod`, `@pmndrs/uikit-pub-sub`, `@pmndrs/pointer-events`, `suspend-react`, `zustand`.
  After editing `pnpm-workspace.yaml`: run `pnpm sync:pack`.
- `pnpm.overrides` maps `@three-flatland/*` → `workspace:*`; verify all four new
  packages (`uikit`, `uikit-lucide`, `uikit-default`, `uikit-horizon`) resolve
  through it.
- **React subpath decision (recorded):** `@three-flatland/uikit`'s `./react` is
  **hand-authored** (like `packages/slug/src/react.ts`). We do NOT touch
  `scripts/sync-react-subpaths.ts` or its `lefthook.yml` glob — they cover
  three-flatland/skia generated wrappers only and stay that way.
- **Sync cascade warning:** any commit touching `packages/*/package.json` or
  `pnpm-workspace.yaml` triggers `sync-pack-full` (rewrites `examples/` + `minis/`
  manifests and `git add`s them) and `sync-lockfile` (rewrites `pnpm-lock.yaml`).
  This is expected — do not revert those files; include them in the commit.
- **Constructor carve-out (fleet-critical — R8).** `@three-flatland/uikit` preserves
  `@pmndrs/uikit` constructor signatures **verbatim**, including required args like
  `Fullscreen(renderer, ...)`. Do NOT apply root `CLAUDE.md`'s no-arg convention to any
  uikit class — that rule governs classes this repo authors, and root `CLAUDE.md`
  (`37c186dc`) states the ported-package exemption. The React layer constructs through
  R3F's `args` prop (`packages/react/src/build.tsx:22-24` builds
  `args = [latestPropsRef.current, undefined, { renderContext }]`; `useSetup` stores
  `{ args }` at `build.tsx:74,84`), which is the sanctioned R3F mechanism for required
  constructor params. "Fixing" a ported constructor to no-arg is a silent public-API
  break; U1 and U4 gate this with a signature diff against upstream `.d.ts`.
- **Backend-specific TSL is authorized** (stakeholder ruling): branch at graph-build
  time on `builder.renderer.backend.isWebGPUBackend` inside `setup(builder)` — the
  pattern three itself uses (`BitcountNode.js:315-325`, `VarNode.js:236-238`), zero
  runtime cost. Q1/Q2 are therefore design choices, not blockers — and both are
  resolved with **zero branches** in v1 (vec4-lane mat4 layout; coverage-multiply clip
  with unconditional `fwidth`). Any branch added later needs a profiling result plus a
  both-backend screenshot parity pair (spec §5.5).
- Do not touch any `CLAUDE.md` (owned by another writer). Skia guidance is owned by
  PR #172 — cite it; never author `packages/skia/CLAUDE.md`.
- Licensing (spec §3.1): each forked package ships upstream MIT LICENSE with **both**
  copyright lines (Bela Bohlender 2024, Coconut Capital 2023); `THIRD_PARTY_LICENSES`
  gains the uikit entry; Slug's existing entries stay intact.

## Fleet serialization points (single-writer files)

Exactly one agent may own each of these at a time; conflicts here are the predictable
failure mode of parallel execution:

| File                                                                | Owning phase(s)                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml` (catalog) + `pnpm-lock.yaml`                  | P0 only (one commit)                                                                                          |
| `examples/_shared/gems.config.ts` + `docs/src/data/example-gems.ts` | P0 scaffolds the example registration once; later phases edit only inside `examples/{three,react}/uikit-hud/` |
| `THIRD_PARTY_LICENSES`                                              | P0                                                                                                            |
| `packages/slug/src/index.ts` (public export surface)                | one Slug-track agent at a time (S-phases are serial anyway)                                                   |
| `packages/slug/package.json` + `packages/slug/src/cli.ts`           | S1 only (baker-contract refactor + `flatland.bake` registration — D3 final)                                   |
| `turbo.json`                                                        | orchestrator only — slug carve-out on L0, uikit carve-outs land with their packages on L2/L3 (see runbook)    |
| `packages/skia/**`                                                  | NOBODY — descoped from this train (D1 moves to a follow-up PR)                                                |
| `packages/uikit/src/index.ts`                                       | U-track                                                                                                       |
| `lefthook.yml`, `scripts/sync-react-subpaths.ts`                    | NOBODY (recorded decision above)                                                                              |

## Dependency graph / parallelization

```
P0 scaffolding + E1–E4 ─┬─► S1 metrics ─► S2 layout ─► S3 batch ─► S4 shapes
                        │                                │            │
                        └─► U1 panel TSL ────────────────┤            │
                                 │                       ▼            ▼
                                 └──────────────► U2 text-on-slug   U3 svg-on-slug
                                                         └────┬───────┘
                                                              ▼
                                                  U4 react + kits ─► V final validation
   example thread: P0 row → U1 rows → U2 rows → U3 row → U4 row   (spec §10 table)
```

- **Strictly serial:** E1–E4 gate all fan-out; S1 → S2 → S3 → S4; S3 → U2 (no
  per-instance clip ⇒ no overflow/scroll text); S4 → U3.
- **Parallel tracks after P0:** the Slug track (S1–S4) and U1 are fully independent.
  Within phases, test authoring parallels implementation.
- **The interop example is a thread, not a phase.** `examples/{three,react}/uikit-hud`
  is scaffolded in P0 and each subsequent phase lights its rows from the spec §10
  table. A row that cannot be lit means the phase did not land — treat it as a failed
  gate, not a deferrable polish item.
- U4 needs U2 + U3 compiled surface; V needs everything.

## Fleet execution strategy

How the horde runs. An Opus orchestrator dispatches implementation agents, validates
their work, and personally does the hardest parts, looping until every acceptance
criterion is validated complete. Concurrency cap ≈ 16 simultaneous agents.

### Launch mechanism (read before dispatching anything)

This plan assigns **mixed model AND effort tiers** per work unit. The `Agent` tool
exposes `model` but **has no `effort` parameter** (it inherits session effort) — only
`Workflow`'s `agent({ model, effort })` sets both. **Therefore the horde must be
launched through `Workflow`, not `Agent`.** Every spawn pins `model:` explicitly;
never let a sub-agent default-inherit the frontier model.

**Fable implementation effort: `high`, not `xhigh`** (recommendation — first plan to
need this tier). Rationale: the Fable units below are tightly specified — the spec
pins the design, the gates pin correctness — so the work is _careful execution_, not
open-ended exploration. `xhigh`'s failure mode on implementation is over-exploration:
re-deriving settled design decisions, churning shader variants the gates can't
distinguish. This also matches the repo's standing "Fable advisors/planners run at
`high`, never `xhigh`" preference. When a Fable unit is genuinely stuck, the exit is
escalation to the orchestrator/stakeholder with failing fixtures — not more effort.

### Fan-out map with tier assignments

Tier discipline: Fable is reserved, not default. The test for a Fable unit: _what
would go subtly wrong under Sonnet?_ If that question has no concrete answer, it is a
Sonnet unit. Sonnet runs `medium` unless marked.

**Wave 0 — P0 (≈6 concurrent):**

| Unit                                                                                  | Model / effort                      | Owns (files)                                                                   | Proves                          | Tier rationale                                                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P0.a workspace plumbing (catalog, licenses, lockfile cascade, one commit)             | **opus** (orchestrator)             | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, LICENSE files, `THIRD_PARTY_LICENSES` | P0 acceptance rows 1, 6         | All serialization-point files; git is orchestrator-only                                                           |
| P0.b experiments E1–E4                                                                | **opus** (orchestrator, personally) | scratch harness only                                                           | E-table pass/fail + screenshots | Gates ALL fan-out; the evidence that authorizes proceeding must not be produced by an agent that wants to proceed |
| P0.c vendor core + react sources                                                      | sonnet / medium                     | `packages/uikit/**`                                                            | typecheck + ported specs green  | Mechanical import-rewrite + stubs                                                                                 |
| P0.d vendor kits + icons                                                              | sonnet / medium                     | `packages/uikit-{default,horizon,lucide}/**`                                   | typecheck green                 | Same                                                                                                              |
| P0.e example scaffold + gems registration                                             | sonnet / medium                     | `examples/{three,react}/uikit-hud/**`, `gems.config.ts`, `example-gems.ts`     | row 1 lit; syncs idempotent     | Template-following                                                                                                |
| ~~P0.f skia~~ **DESCOPED** — no agent; `packages/skia/**` is off-limits on this train | —                                   | —                                                                              | —                               | Stakeholder: cannot compile skia on this machine                                                                  |

**Wave 1 — after E1–E4 pass (Slug track serial ∥ U1; ≈4–5 concurrent):**

| Unit                                                                     | Model / effort   | Owns                                                                                         | Proves                | Tier rationale                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 metrics API + baker refactor                                          | sonnet / medium  | `packages/slug/src/{SlugFont,cli,index}.ts`, `pipeline/*`, `package.json`                    | S1 acceptance         | Deterministic API surfacing; tests are the oracle                                                                                                                                                                                                               |
| S2 layout engine + queries                                               | **fable / high** | `packages/slug/src/{layout,query}/**`, `SlugText`, `SlugStackText`                           | S2 acceptance         | R4: baseline math wrong-by-a-constant passes unit tests while every line of text shifts; the char-keyed-MSDF → glyph-id-Slug oracle mapping and whitespace×wrap×justify interactions are exactly where a wide-tier agent encodes its own bugs into passing code |
| S3 `SlugBatch` per-instance transform + Jacobian + clip                  | **fable / high** | `packages/slug/src/{SlugBatch,SlugGeometry,SlugMaterial,SlugStrokeMaterial}.ts`, `shaders/*` | S3 acceptance         | R2, D4 no-fallback: the hardest shader change; errors present as blurry/fat glyphs at rotations and non-uniform scale — subtle, visual, easy to declare done while wrong                                                                                        |
| S4.a shape pipeline core (ShapeSet, adaptive subdivision, serialization) | **fable / high** | `packages/slug/src/{SlugShapeSet,SlugShapeBatch,svg}.ts`                                     | S4 acceptance (core)  | R9: a too-coarse tolerance renders fine on simple icons and breaks on high-curvature paths — correctness is a numeric+visual judgment, not a type error                                                                                                         |
| S4.b lucide corpus scripts + fixtures                                    | sonnet / medium  | S4 test files only                                                                           | corpus + growth gates | Scripted breadth                                                                                                                                                                                                                                                |
| U1.a panel TSL coverage graph + shadows                                  | **fable / high** | `packages/uikit/src/panel/material/**`, `components/image.ts`                                | U1 acceptance (core)  | Correction-#2 class of bug: an `opacityNode` mapping renders perfectly while silently corrupting the shadow silhouette — precisely what a wide-tier agent ships confidently                                                                                     |
| U1.b fullscreen widening, depth.ts deletion, example U1 rows             | sonnet / medium  | `components/fullscreen.ts`, example files                                                    | rows 2–4 lit          | Mechanical, gated by U1.a's material                                                                                                                                                                                                                            |

**Wave 2 — U2 ∥ U3 (+ verifiers; ≈5–6 concurrent):**

| Unit                                                     | Model / effort    | Owns                                                  | Proves                | Tier rationale                                                                                                                                              |
| -------------------------------------------------------- | ----------------- | ----------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U2.a text render rewrite on `SlugBatch`                  | sonnet / **high** | `packages/uikit/src/text/**`                          | U2 acceptance         | Consumes settled S1–S3 APIs; bucket mechanics port 1:1; gates (e2e, stats, R4 diff) are deterministic — but ordering/allocation integration warrants `high` |
| U2.b `uikit-bake` bin + `font` subcommand + D5 execution | sonnet / medium   | `packages/uikit/src/cli.ts`, `package.json`           | CLI acceptance rows   | Proxying an exported function                                                                                                                               |
| U3.a `Svg` + shape-batch group manager                   | sonnet / **high** | `packages/uikit/src/components/svg.ts`, group manager | U3 acceptance         | Mirrors the glyph-group pattern U2 just proved                                                                                                              |
| U3.b `icons` subcommand                                  | sonnet / medium   | uikit cli                                             | icons round-trip gate | Mechanical over S4 serialization                                                                                                                            |
| S3-verify (adversarial)                                  | **fable / high**  | read-only + new fixtures                              | verifier report       | See "validation loop" — the one unit whose failure modes need frontier eyes independent of the implementer                                                  |
| U1-verify (adversarial)                                  | sonnet / high     | read-only + new fixtures                              | verifier report       | Shadow/clip edge cases enumerable from the spec                                                                                                             |

**Wave 3 — kit conformance + react (the widest fan-out; ≈13–14 concurrent ≤ cap):**

| Unit                                                                                      | Model / effort      | Owns                                                                                      | Proves                                    |
| ----------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| K1…K10: kit component slices (default + horizon split into ~10 disjoint component groups) | sonnet / medium ×10 | each: its component files in `packages/uikit-{default,horizon}/**` + its harness fixtures | components render; harness fixtures added |
| U4.a react port                                                                           | sonnet / high       | `packages/uikit/src/react/**`                                                             | U4 acceptance                             |
| U4.b react example twin                                                                   | sonnet / medium     | `examples/react/uikit-hud/**`                                                             | row 8 lit                                 |
| docs pages                                                                                | sonnet / medium     | `docs/src/content/docs/examples/uikit-hud.mdx`                                            | V docs gate                               |

D2 made the kits v1 scope, and they are the parallelism jackpot: dozens of
independent components against a settled panel/text/svg API. Slice by component
directory (one writer per file), and hand each slice its upstream-render fixture
duty so conformance evidence accumulates with the port instead of after it.

**Wave 4 — V:** **opus** (orchestrator): kit-harness adjudication (tolerance judgment
needs cross-unit context no sub-agent has), final integration, perf gates, compat
matrix, upstream-diff review, PR assembly.

**Critical path (8 serial stages):** P0(E1–E4) → S1 → S2 → S3 → S4 → U3 → U4 → V.
U2 joins at U4 (shorter: 7 via U2); U1 is off-path (parallel with S1–S3). The
schedule's scarce resource is the **serial Slug track** — staff S2/S3/S4 handoffs
tightly; everything else has slack.

### Worktree policy

Default: **shared worktree + one-writer-per-file** (the serialization table above) —
isolation costs 200–500 ms + disk per agent and buys nothing when file ownership is
disjoint. Two exceptions: (1) **Wave 3's kit fan-out runs with
`isolation: 'worktree'`** — 10+ agents running builds/tests concurrently collide on
`dist/` and vite caches even with disjoint sources; orchestrator merges slices
serially. (2) In shared-worktree waves, implementation agents run only file-scoped
test commands (`pnpm --filter=<pkg> test -- <path>`); full builds are
orchestrator-only.

### The validation loop (and how we prevent success-reporting on unverified work)

The failure mode to kill: an agent declares a visual/subtle unit done because "it
renders." Mechanism — four layers, cheapest first, argued:

1. **Every gate is a re-runnable command with checked-in evidence.** Each acceptance
   criterion maps to a script (vitest, playwright spec, screenshot-diff script) whose
   baselines are committed. "Done" means the command exits 0 on a clean checkout —
   proof is an artifact anyone can re-run, not a claim in a report.
2. **Acceptance is orchestrator-executed, never agent-self-reported.** The
   orchestrator re-runs every gate itself before marking a criterion met. Cheap
   (it's running commands), and it closes the unverified-success hole completely for
   deterministic gates. Agent reports are progress signals, not acceptance.
3. **Baseline provenance rule (anti-gaming):** an implementation agent may never
   create or regenerate golden fixtures / baseline screenshots in the same task that
   changes the code under test. Baselines are minted only by the orchestrator or a
   verifier agent, from a state the orchestrator has accepted. This kills the classic
   "regenerate the golden to match my bug" move — with it, layer 1 alone would be
   gameable.
4. **Adversarial verification only where "renders" ≠ "correct".** S3 (per-instance
   Jacobian), U1 (shadow silhouettes), S4 (curvature tolerance), R4 (baselines) get
   an independent verifier that did NOT write the code, briefed to _break_ it —
   construct hostile cases (extreme rotations, tiny/huge `pixelSize`, pathological
   cubics, descender-heavy scripts) and report findings. S3's verifier is Fable
   (frontier judgment on subtle AA quality); the rest are Sonnet-high because their
   hostile cases are enumerable from the spec. Why not verifiers everywhere: cost —
   deterministic gates don't need adversaries, they need layer 2.

Failure routing: failed gate → orchestrator diagnoses, routes back to the owning
agent with the failing artifact and a hypothesis; **maximum two round-trips**, then
the unit escalates a tier (sonnet → fable) or the orchestrator takes it over
personally. D4-class stalls (a required-scope gate that resists all tiers) escalate
to the stakeholder with the failing fixtures — never silently rescoped.

### Anti-patterns — brief every agent against these (learned this session)

1. **Do not "fix" a ported constructor to no-arg** (R8). Root `CLAUDE.md`'s
   convention exempts ported packages; `Fullscreen(renderer, ...)` is correct as-is.
2. **Do not revert the `sync-pack`/`sync-lockfile` cascade.** A commit touching
   `package.json` legitimately rewrites `examples/`, `minis/`, `pnpm-lock.yaml` —
   that is the hooks working, not accidental damage.
3. **Do not assume pre-commit formats or lints.** It runs sync scripts only. Run
   `prettier --check` + eslint yourself before reporting done.
4. **Do not regenerate baselines or goldens to make your change pass** (provenance
   rule above). If a baseline looks wrong, report it.
5. **Do not hand-write changesets**, touch any `CLAUDE.md`, `lefthook.yml`, or
   `scripts/sync-react-subpaths.ts`.
6. **Do not add backend-specific TSL branches** without a profiling result (spec
   §5.5); v1 ships zero.
7. **Do not import from `@pmndrs/*`** in forked code paths that were rewritten to
   workspace names; and do not add an MSDF fallback "for safety" — MSDF is deleted
   by ruling.
8. **Do not "modernize" the duck-typed `isInstancedMesh`** into a real
   `InstancedMesh` subclass unless E1 failed and the orchestrator ordered it.

## PR strategy & merge runbook

### The shape, decided and defended

**Stacked PR train: five layered branches, one PR per layer, NOTHING merges until the
tip is green — then the whole train merges to `main` in order, in one sitting.**

Why not the alternatives:

- **One mega-PR:** PR #172 (`preview/tools-combined`, +333,487/−181 across 586 files,
  100 commits, still open) is where "just fold it into one" ends up — unreviewable,
  unlandable. Rejected.
- **Incrementally-merged stack:** the repo's CI auto-generates changesets per PR and
  `release.yml` publishes from them. Merging the Slug layer weeks before the uikit
  layers would stage `@three-flatland/slug`'s new public API (clipping, kerning,
  layout, queries, batch mode) for release **before uikit has proven any of it** —
  directly against the stakeholder's success condition, _"uikit + slug text engine in
  one PR proven by uikit's use of slug."_ Rejected.
- **The held train** gets both properties: reviewable slices (each PR is one seam) and
  an atomic landing event (nothing publishes unproven). It costs near-zero rework
  because this repo merges with **merge commits, not squash** (verified:
  `git log --merges` on `main`) — so when layer N merges, GitHub auto-retargets
  layer N+1 to `main` and its diff collapses to its own commits. This amends binding
  decision #5 (spec §1): "one PR" becomes "one landing" — the spirit (one atomic,
  fully-proven delivery) is preserved; the letter changes for reviewability.

### Branch topology

Linear stack; each PR's base is its parent branch. Stack order is **merge order**, not
development order (U1 develops in parallel with S1–S4 even though its layer sits above
them).

| Layer | Branch                   | PR base | Contents (seam)                                                                                                                                                                                                                                                    | Phases / work units                                                   |
| ----- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| L0    | `feat/uikit-fork`        | `main`  | Planning docs + CLAUDE.md changes (already committed); adjudicated debt: **slug turbo carve-out** (`aecc2f21`; skia/D1 descoped); licensing (`THIRD_PARTY_LICENSES`, LICENSE files land with their packages); E1–E4 evidence in the PR description                 | P0.a (licensing part), P0.b, P0.f                                     |
| L1    | `feat/slug-uplift`       | L0      | The entire Slug uplift: metrics + baker-contract fix, layout/query engine, `SlugBatch`, `SlugShapeSet`/svg/serialization, `slug-text` example updates, slug README                                                                                                 | S1, S2, S3, S4, S4.b                                                  |
| L2    | `feat/uikit-core`        | L1      | `packages/uikit` vendored (core + react src); workspace plumbing (catalog additions, overrides, lockfile cascade, uikit turbo carve-out); panel TSL; text-on-slug; `uikit-bake` bin + `font`; react port code                                                      | P0.a (plumbing part), P0.c, U1.a, U1.b (impl files), U2.a, U2.b, U4.a |
| L3    | `feat/uikit-vector-kits` | L2      | `packages/uikit-{lucide,default,horizon}` vendored (+ their turbo carve-outs); `Svg` on `SlugShapeBatch` (edits `packages/uikit/src/components/svg.ts` — a deliberate cross-layer file edit, merge order preserves it); `uikit-bake icons`; kit-conformance slices | P0.d, U3.a, U3.b, K1–K10                                              |
| L4    | `feat/uikit-example`     | L3      | Example pair + gems registration + docs mdx; the example-thread row commits from every phase; kit-conformance harness + baselines; V-phase fixtures                                                                                                                | P0.e, all example-thread rows, U4.b, docs, V                          |

All five branches are created at P0 and fill as phases run. The example thread lives
at the tip (L4) so it always sees every layer beneath it.

**Fleet interlock — layer = merge unit, agent = work unit.** Each work unit's owned
files map to exactly one layer, with one sanctioned exception: units that both
implement (L2/L3) and light an example row (L4). Resolution: **agents never run git on
stack branches.** Agents produce diffs; the **orchestrator routes each diff to its
owning layer branch** as separate commits (impl commit on L2/L3, example-row commit on
L4). This is the same one-writer-git rule the fleet strategy already imposes, extended
to branch routing. A fan-out that would cross layers in a single commit is a brief
error — split the unit.

### Merge order and the gate that unlocks it

**Gate (all must hold before ANY merge):** every phase's acceptance criteria validated
by the orchestrator at the tip; codex review clean per layer (below); visual protocol
run (below); D5 ruled; kit-conformance harness passed.

**Then, in one sitting, top of main downward through the stack:**

1. Merge L0 → `main`. GitHub retargets L1 to `main`.
2. Rebase L1 onto `main`; push; **wait for CI** — the changeset job regenerates
   `auto-*` files scoped to L1's now-collapsed diff. This step matters:
   `generate-changesets.ts` runs with `--base origin/main`, so before the parent
   merges, a child PR's changesets transiently cover ancestor commits too; the
   post-retarget regeneration rescopes them (old files for the branch ID are deleted
   and rewritten). Verify no duplicate `auto-*` entries against `main`, then merge.
3. Repeat for L2, L3, L4.
4. **Release hold:** do not merge the changesets "Version Packages" release PR (or
   otherwise run the `release.yml` publish, `release.yml:71`) until L4 is on `main`.
   The release cut happens **once, after the full train lands** — this is what makes
   "slug proven by uikit before it publishes" literally true even though slug's code
   merges minutes earlier.

### Rebase protocol

**Orchestrator only** (one-writer git). Whenever a commit lands on layer N (review
fix, phase work), rebase upward in order: `git rebase feat/<layer-N>` in the L(N+1)
worktree, then L(N+2), … tip; force-push each; re-run the tip smoke suite. Cadence:
on every review-fix commit, at each layer's phase-freeze, and between the ordered
merges (onto `main`).

### Review gate per branch

Local adversarial review — CodeRabbit is rate-limited on this repo, so the local gate
is authoritative: `codex exec --sandbox read-only -c model_reasoning_effort=high`
against the layer's own diff (`git diff <parent-branch>...<layer-branch>`). Every
finding is verified against the code (no blind fixes); confirmed findings land as
`fix(<scope>): …` commits on that layer; then rebase the stack upward.

### Visual verification protocol (mandatory — this is a render-path change)

Run the examples MPA from `main` and from the stack tip simultaneously on two ports
(`EXAMPLES_PORT=<port> pnpm dev` in each checkout's `examples/`); screenshot the same
examples on both via the chrome-devtools MCP and compare **renders AND console
output** — the console diff is what catches shader warnings, which is exactly how a
WGSL uniformity or instancing regression announces itself. **Worktree bootstrap
gotcha:** a fresh worktree breaks `astro dev` — build `mini-breakout`, `presets`, and
the `devtools` bundle first and clear `.vite`, or the vite config fails to load. Docs
base is `/three-flatland/`, `trailingSlash: always`.

### Cross-PR touchpoints and issue closure

- ~~`packages/skia/**` (L0's isolated D1 commit)~~ **DESCOPED — no skia touchpoint on
  this train.** Historical note: it would have collided with **PR #172**, which owns
  `packages/skia/CLAUDE.md`. Different files, no direct conflict. If #172 merges
  first: rebase L0, verify the skia commit still applies clean. If the train merges
  first: report the skia commit SHA to #172's owner. Either way the isolated commit
  keeps it cherry-pickable/revertable.
- **`Closes #…` lines:** one PR per layer, each closing its layer's sub-issues; the
  epic itself closes on **L4** (the epic is done only when the whole train is). If
  issues are not yet seeded, seed them with one epic per layer before fan-out so the
  closure lines exist to write.

---

## Phase P0 — Scaffolding, experiments E1–E4, adjudicated tech debt

Tasks:

1. Vendor uikit core/react/kits(**default AND horizon** — D2 ruling)/icons(lucide)
   sources into `packages/uikit{,-default,-horizon,-lucide}` per spec §3, imports
   rewritten to workspace names, `./react` subpaths wired (hand-authored), upstream
   vitest specs carried over. Renderer-coupled seams (`createPanelMaterial`,
   `createInstancedText`, `loaders/ttf.ts`) stubbed behind their existing module
   boundaries with `throw new Error('ported in U1/U2')` so packages typecheck and
   pure-logic suites run green now.
2. Serialized "workspace plumbing" commits, one per owning layer (runbook): L0 gets
   `THIRD_PARTY_LICENSES` + the slug turbo carve-out; L2 gets catalog additions +
   `pnpm sync:pack`, overrides verification, package LICENSE files (both copyright
   lines), the uikit turbo carve-out, and the expected sync cascade (examples/minis
   manifests, lockfile) inside the same commit.
   **turbo.json build-graph fix (iron-law fold-in):** the global `build.dependsOn`
   (`turbo.json:26`) makes every package without a carve-out depend on
   `@three-flatland/skia#build` — a WASM compile. `@three-flatland/slug` has **no
   carve-out** today (pre-existing debt, now on uikit's critical build path) and the
   four new uikit packages would inherit the same chain. Add
   `"<pkg>#build": { "dependsOn": ["^build"], "outputs": ["dist/**"] }` carve-outs
   for `@three-flatland/slug` (with the debt fix) and for each uikit package as it
   is created. `turbo.json` is a single-writer serialization point
   (orchestrator-applied).
3. Example scaffold: `examples/three/uikit-hud` + `examples/react/uikit-hud` from
   `examples/{three,react}/template/`, registered in `examples/_shared/gems.config.ts`,
   `pnpm sync:examples` run (generates `gem.ts` files + `docs/src/data/example-gems.ts`),
   `package.json` per `examples/three/slug-text` + `pnpm sync:pack`. Content: the
   existing tilemap + Light2D base scene rendering alongside an empty uikit `Root`
   (spec §10 row 1).
4. **Experiments E1–E4** (spec §13.1) as standalone harness scenes/tests inside the
   example or a scratch mini, each with its recorded pass/fail:

   **E1 STATIC EVIDENCE — recorded 2026-07-10, R1 structurally retired.** The duck-typed
   instancing assumption is confirmed at four independent points in `three@0.183.1`, and
   none of them requires an `InstancedBufferGeometry`:
   - `materials/nodes/NodeMaterial.js:832` — instancing setup is gated on
     `object.isInstancedMesh && object.instanceMatrix && object.instanceMatrix.isInstancedBufferAttribute === true`.
     A property check, not `instanceof`.
   - `renderers/common/RenderObject.js:567-577` — `instanceCount = 1`; if
     `geometry.isInstancedBufferGeometry` use `geometry.instanceCount`, **else if
     `object.count !== undefined` use `Math.max(0, object.count)`**. uikit's
     `createPanelGeometry()` returns a plain `PlaneGeometry`, so the draw count comes
     from the duck-typed `count`. `instanceCount === 0` returns null (no draw), which
     matches uikit's initial `count = 0`.
   - `renderers/webgpu/utils/WebGPUAttributeUtils.js:259,264` — WebGPU `stepMode` is
     derived from the **attribute** (`isInstancedBufferAttribute` /
     `isInstancedInterleavedBuffer`), not the geometry.
   - `renderers/webgl-fallback/WebGLBackend.js:2457-2463` — WebGL2 `vertexAttribDivisor`
     is likewise keyed off the attribute.

   `uikit/src/panel/instance/mesh.ts` carries all three required properties
   (`isInstancedMesh = true` — `protected` erases at runtime — a real
   `instanceMatrix: InstancedBufferAttribute`, and `count`).

   **Still owed by E1:** the visual pass — N distinct instances actually drawn on WebGPU
   and on forceWebGL, zero console warnings, and an `addUpdateRange` write visible the
   next frame. Static evidence retires the structural risk, not the runtime one.

   **Harness note:** the repo's Playwright suite cannot be used. Its `webServer` runs
   `astro preview` over a prebuilt `docs/dist/`, which requires `pnpm build` →
   `turbo run build` → `skia#build`, and Skia cannot compile on this machine. Drive the
   examples Vite dev server directly instead.
   - E1 duck-typed instancing + vec4-lane mat4 attrs, both backends.
   - E2 `colorNode.a`+`alphaTest` shadow silhouette on an instanced duck-typed mesh;
     point-light variant recorded.
   - E3 coverage-graph compile: zero WGSL uniformity diagnostics, both backends render
     AA rounded corners within tolerance.
   - E4 yoga-layout published-TS + inlined-WASM through our vitest + example dev boot;
     fallback `noExternal: ['yoga-layout']` if it fails.

5. ~~Skia debt (D1)~~ — **DESCOPED from this PR (stakeholder ruling, 2026-07-10).**
   _"We can't compile skia right now on this machine… leave skia out of this PR because
   we are not even using it."_ **No fleet agent may touch `packages/skia/**`on this
train.** The`getFBOId`deletion and the`WebGLRenderTarget → RenderTarget` swap
   remain correct and D1-approved, but they move to a separate follow-up PR where Skia
   can actually be built and its example pair screenshot-verified. This also dissolves
   the PR #172 cross-touchpoint for this train.

   Two consequences that DO stay in scope, because they are what make the fork
   buildable without Skia:
   - The `@three-flatland/slug` turbo carve-out is already landed (`aecc2f21`).
     `slug#build` no longer has a `skia#build` edge — verified 2 tasks / 5.4 s, no WASM
     compile. This is now load-bearing, not just hygiene.
   - **Every new uikit package needs its own carve-out for the same reason.** The
     global `build.dependsOn` (`turbo.json:26`) adds `@three-flatland/skia#build` to any
     package lacking one, so without carve-outs the uikit packages would each demand a
     Skia WASM compile we cannot perform.

   **Never run bare `pnpm build` / `turbo run build`** on this machine — the root
   script is `turbo run build`, which includes `skia#build`. Use filtered builds
   (`pnpm --filter=@three-flatland/<pkg> build`) or `turbo run build --filter=…`.

Acceptance:

- [ ] `pnpm typecheck` green. Builds are **filtered** (`--filter`), never bare
      `turbo run build` — that pulls `skia#build`, which cannot compile here.
- [ ] **Format/lint gate is scoped to files this PR touches**, not the repo.
      Measured 2026-07-10: `pnpm format:check`
      (`prettier --check "packages/*/src/**/*.{ts,tsx}"`) fails on **196 files already
      present on `main`** — a `.prettierrc` printWidth/export-wrapping disagreement that
      predates this work and would be a 196-file reformat diff. Do NOT "fix" it here.
      Gate: `pnpm exec prettier --check <files changed by this PR>` + `pnpm lint`.
      Note `prettier --check .` (the criterion this replaces) was never achievable —
      there is no `.prettierignore`, so it scans generated output too (557 failures).
- [ ] Ported upstream specs (clone/schema/flex/allocation/color) pass in
      `packages/uikit`.
- [ ] E1–E4 all recorded with pass/fail + screenshots; any FAIL halts fan-out and
      escalates to the stakeholder with the measured evidence.
- [ ] Example pair scaffolded, registered in gems config, `pnpm sync:examples` and
      `pnpm sync:pack` idempotent (no diff on re-run); base scene renders on WebGPU
      and forceWebGL (spec §10 row 1 lit).
- [x] ~~Skia edits landed as one isolated commit~~ — **DESCOPED** (see task 5).
      `git diff HEAD -- packages/skia/` must be **empty** for the whole train.
- [ ] turbo carve-outs in place: `turbo run build --dry-run=json` shows `slug#build`
      (done, `aecc2f21`) and each `uikit*#build` depending only on `^build` — no
      `skia#build` edge, no cycles. Verify per-package with filtered builds, not a
      full build.
- [ ] New example registered in **both** places: `examples/_shared/gems.config.ts`
      (then `pnpm sync:examples`) **and** `turbo.json`'s `docs#build.dependsOn`, which
      enumerates every example explicitly (`example-three-slug-text#build`, …). The
      plan previously named only the former; `docs#build` would silently miss the new
      example otherwise. `turbo.json` is orchestrator-owned.
- [ ] No `CLAUDE.md`, `lefthook.yml`, or `sync-react-subpaths.ts` modifications by
      any fleet agent (the team lead's CLAUDE.md commits already on L0 —
      `c05f3d26`, `37c186dc` — are the only sanctioned CLAUDE.md changes in the
      train).

## Phase S1 — Slug public metrics API

Tasks: `SlugFont.getKerning(a, b)` + `SlugFont.getGlyphMetrics(codepoint)` (em units,
whitespace included, `hasOutline` flag), dispatched across runtime/baked/stack backends
like `shapeText` is today; glyph-id↔codepoint mapping exposed for layout. Exported from
the package index, documented in the Slug README (public API, not uikit helpers —
spec §6 mandate). Plus the slug baker-contract debt fix (D3 final, spec §8.3 — slug's
`cli.ts` has zero exports and no `flatland.bake` registration, violating the contract
`bake/src/types.ts` documents with slug as its canonical example): refactor
`slug/src/cli.ts` to `export default baker` (`name: 'font'`, `description`, `usage()`,
`run(args): Promise<number>` — follow `alphamap/src/cli.ts:35`); keep the `slug-bake`
bin as a thin wrapper calling `baker.run(process.argv.slice(2))`; add
`flatland.bake: [{ "name": "font", "description": "Bake SlugFont", "entry":
"./dist/cli.js" }]` to `packages/slug/package.json`.

Acceptance:

- [ ] Kerning parity test: runtime vs baked agree on a kerned-pair corpus (extends
      `baked.equivalence.test.ts`); stack backend documented-degraded at run
      boundaries (existing limitation, asserted not worsened).
- [ ] `getGlyphMetrics(0x20)` / tab return advances — the `textShaper.ts:94` outline
      filter demonstrably no longer blocks caret-after-space at the metrics layer.
- [ ] `flatland-bake --list` shows `font`; `flatland-bake font <ttf> --range ascii`
      produces the same `.slug.glb` as `slug-bake` (byte-compare or gltf-validator
      parity); `slug-bake` behavior unchanged.
- [ ] No public-API removals; `pnpm --filter=@three-flatland/slug test` green;
      prettier/eslint/typecheck green.

## Phase S2 — Slug layout engine + queries (`slug/layout`, `slug/query`)

Tasks: port uikit `text/layout/{normalize,measure,positioned,types}.ts` +
`text/wrapper/*.ts` + `text/layout/query.ts` onto the S1 metrics contract
(spec §6.3–6.4). Baseline math defined from `ascender`/`descender` (risk R4). Migrate
`SlugText`/`SlugStackText` onto the engine; `measureParagraph`/`wrapLines` remain as
compat wrappers (risk R6 — if migration balloons, wrappers ship and the migration
becomes a stakeholder-visible deferral item, never a silent cut). All of it public,
tested, documented independent of uikit.

Acceptance:

- [ ] Parity fixtures: ported layout reproduces upstream's line breaks, per-char x
      advances, and measure results on a stubbed metrics font (goldens generated from
      the vendored upstream implementation) for word/break-all/nowrap ×
      normal/collapse/pre/pre-line × tabSize × letterSpacing × justify.
- [ ] Query round-trip property test: `getCaretTransformation(getCharIndex(p))` lands
      within the char cell for randomized layouts.
- [ ] Measure results stable under uikit's ceil-by-PointScaleFactor rounding
      (`flex/node.ts:301-314` contract) at 1x/2x scale factors.
- [ ] `slug-text` example pair updated to exercise wrap + whitespace modes, both
      backends (screenshots recorded).
- [ ] Slug suite green; prettier/eslint/typecheck green.

## Phase S3 — Slug batch mode (`SlugBatch`: per-instance matrix, clip, writer API)

Tasks (spec §6.5): opt-in `instanceMatrix` (duck-typed instanced mesh + per-instance
dilation Jacobian — risk R2; see spec §6.5 item 1 for what this is: `slugDilate` expands
each quad by half a pixel in screen space via `glyphJac`, `SlugMaterial.ts:142-151`,
and with heterogeneous per-component transforms that Jacobian must derive from each
instance's matrix, not the mesh) and `glyphClip` (4-plane coverage-multiply mask per
Q2/Q4 in **both** `SlugMaterial` and `SlugStrokeMaterial`); vec4-lane mat4 reads (Q1);
`ensureCapacity/writeGlyph/writeRect/copyWithin/count` writer surface; per-glyph color
via writer (no shader change). Zero backend branches (spec §5.5). **This phase is
REQUIRED v1 scope (D4 ruling) — there is no per-Text-mesh fallback; a genuine stall is
a stakeholder escalation with the failing fixtures attached, not an exit.**

### Prior art to evaluate before implementing — Windfoil (timeboxed spike, S3 owner)

Reference: <https://publishing.tjw.dev/windfoil-vs-slug/>

Windfoil was reviewed previously and **mostly ruled out** for our general text case. That
evaluation predates this plan and very likely did not consider the `SlugBatch`
per-instance-transform case, which is exactly where R2 bites. Read the article before
writing the Jacobian.

**Why it might matter here.** Windfoil derives its pixel footprint from per-axis gradient
length — `length(vec2(dpdx, dpdy))` of the curve-space coordinate — which the article
describes as more principled under scale and translation. Slug instead uses `fwidth`
together with a _precomputed_ inverse Jacobian (`glyphJac`). R2 exists because that
precomputed Jacobian must be re-derived per instance once transforms are heterogeneous.

**Hypothesis worth a timebox, not a conclusion.** The em-space coordinate is already a
fragment varying (`SlugMaterial.ts:104`), so its screen-space derivatives encode each
instance's actual transform for free. If the coverage term is rebuilt on those
derivatives, the per-instance Jacobian may drop out of the _fragment_ stage entirely.

**The caveat that keeps this honest.** `glyphJac.x` also feeds the **vertex-stage**
dilation (`invScale`, `SlugMaterial.ts:142-151`), which runs before rasterization and
therefore cannot use derivatives. At best this removes the Jacobian from the coverage
term, not from dilation. **Do not assume it eliminates R2.**

**Scope discipline.** Evaluate the derivative/footprint term only. Do **not** adopt
Windfoil's Green's-theorem coverage integrator: Slug's hard-capped, zoom-flat cost and
its WebGL2 + WebGPU support are load-bearing for us, whereas Windfoil's cost climbs under
minification and its edges wobble under deep zoom. If the spike does not pay off inside
its timebox, ship the per-instance Jacobian exactly as specified above and record the
negative result here.

Acceptance:

- [ ] AA screenshot fixtures show no edge-quality regression vs the non-batched path,
      both backends, across the matrix where per-instance Jacobian errors surface:
      rotations (0°/37°/90°), **non-uniform scales** (1×2, 3×0.5), and **mixed
      `pixelSize`** within one batch (R2 gate — hard, no fallback).
- [ ] Clip: half-clipped glyph row renders smooth plane edges on both backends;
      the unclipped sentinel has zero visual diff vs clip-disabled material; no WGSL
      uniformity diagnostics (Q2 restructure holds).
- [ ] Writer API bucket-simulation test (activate/deactivate/compact via `copyWithin`)
      equals a from-scratch rebuild.
- [ ] Existing `SlugText` unaffected (opt-in cost model) — its tests and perf
      characteristics unchanged.
- [ ] Slug suite green; prettier/eslint/typecheck green.

## Phase S4 — `SlugShapeSet` / `SlugShapeBatch` / `slug/svg`

Tasks (spec §7): shape registry over growable curve/band DataTextures; SVG parse via
`SVGLoader.parse` (parser only) → **adaptive** `cubicToQuadratics` (same converter,
recursion until deviation < 0.25% of viewBox diagonal, depth-capped — F2 caveat) →
`bandBuilder`; per-path fill color capture; batch-level fill rule;
`SlugShapeBatch` = `SlugBatch` over the set. Plus (D3 final): **`SlugShapeSet`
serialization** — baked shape-set container reusing slug's GLB packing (`glb.ts`),
loadable without SVG parsing or band building at runtime (feeds `uikit-bake icons`
in U3).

Acceptance:

- [ ] All lucide post-fixer SVGs register without band-builder failures (batch script
      over the corpus); a sampled subset (≥ 24) screenshot-matches tessellated
      SVGLoader rendering within tolerance, both backends.
- [ ] Adaptive-split error-bound unit test: max deviation of emitted quadratics vs
      source cubics under the tolerance on a high-curvature corpus.
- [ ] Atlas growth preserves previously registered shapes (before/after screenshots
      identical).
- [ ] Multi-path multi-color SVG renders per-instance fill colors.
- [ ] Serialization round-trip: a baked shape set loads and renders pixel-identically
      to the same SVGs registered at runtime (screenshot compare).
- [ ] Grep-gate: zero `RenderTarget` construction in the new code — the
      no-render-target rule holds by construction.
- [ ] Slug suite green; prettier/eslint/typecheck green.

## Phase U1 — uikit panel TSL port (parallel with S1–S4)

Tasks (spec §5): `panel/material/nodes.ts` (`createPanelNodeMaterial`) — coverage in
vec4 `colorNode` alpha, `alphaTest = 0.01`, border-bend `normalNode`, vec4-lane mat4
reads for aData/aClipping, non-instanced uniform variant, Q2-safe derivative ordering;
delete `depth.ts` and all `customDepthMaterial`/`customDistanceMaterial` wiring;
`Fullscreen(renderer: Renderer)` type widening **with the signature kept verbatim
(spec §9.1 — do NOT normalize constructors)**; un-stub the P0 panel seam. Light the
example's U1 rows: Fullscreen HUD, lit world-space shadow-casting panel, transparent
UI over sprites.

Acceptance:

- [ ] Rounded/bordered/bent-border panels match upstream reference screenshots
      (tolerance-diffed) on WebGPU and forceWebGL; instanced and non-instanced
      (Image/Video) variants exercised.
- [ ] Shadow gate: rounded panel's cast silhouette matches main-pass silhouette for a
      directional light — **without** `shadowMap.transmitted`, without
      `castShadowNode`. Point-light result recorded (R3): pass, or documented v1
      limitation with stakeholder ack. Image/Content `clipShadows` verified or
      documented (R3).
- [ ] `panelMaterialClass: MeshStandardNodeMaterial` renders with border bend
      responding to a moving light.
- [ ] Example rows 2–4 lit (HUD, shadow panel, transparent-over-sprites) on both
      backends.
- [ ] Grep-gates: zero `onBeforeCompile|#include|WebGLProgramParameters` in
      `packages/uikit*/src`; zero constructor-signature diffs vs upstream `.d.ts`
      for exported classes (R8 check).
- [ ] Suites green; prettier/eslint/typecheck green.

## Phase U2 — uikit text on Slug (needs S3 + U1)

Tasks (spec §8): rewrite `text/render/**` on the `SlugBatch` writer; `text/cache.ts`
on `SlugFontLoader` — **runtime TTF/OTF is the default path, no pre-baked font ships**
(D3 ruling); uikit imports point at `slug/layout` + `slug/query`;
caret/selection/hidden-input untouched except import paths; `renderSolid` → rect
sentinel; delete `loaders/ttf.ts`, `@pmndrs/msdfonts`, `@zappar/msdf-generator` — **no
MSDF path survives anywhere** (spec §8.1). Execute **D5** (must be ruled before this
phase: default Inter source-TTF residence — bundled vs CDN vs explicit; spec §14).
Ship uikit's tooling (D3 final, spec §8.3): **`uikit-bake` bin** + `flatland.bake`
registration under baker name `uikit` (never `font` — slug owns it; `discoverBakers()`
warns on collisions), with the `font` subcommand calling slug's **exported**
`baker.run` directly (no subprocess) plus kit-aware weight/range defaults. The `icons`
subcommand lands in U3 (needs S4 serialization). Light the example's U2 rows: zoomable
text, scroll-container quest log.

Acceptance:

- [ ] Ported upstream text-dependent specs green; caret/selection/input flows scripted
      in e2e (click-to-caret, drag-select, type/delete).
- [ ] Scroll/overflow: text in a scrolled clipped container clips correctly on both
      backends (S3-clip → U2 proven end-to-end); example row 6 lit.
- [ ] Cross-component batching holds: N Text components sharing a font = 1 glyph draw
      (devtools stats assert). **No fallback exists (D4 ruling)** — failure here blocks
      the phase and escalates.
- [ ] Vertical metrics (R4): side-by-side vs upstream on the same TTF shows no
      perceptible baseline shift (diff overlay in PR); example row 5 (zoomable text)
      lit.
- [ ] Grep-gate: zero `msdf|distanceRange|@pmndrs/msdfonts|@zappar` hits in
      `packages/uikit*/`.
- [ ] D5 outcome recorded; `Text` renders with zero font configuration via the
      runtime path (per whichever D5 option is ruled).
- [ ] `flatland-bake --list` shows both `font` and `uikit` with no collision warning;
      `uikit-bake font Inter.ttf` and `flatland-bake uikit font Inter.ttf` emit the
      same `.slug.glb`, which `SlugFontLoader` loads and uikit renders (baked opt-in
      path proven, not required).
- [ ] Suites green; prettier/eslint/typecheck green.

## Phase U3 — uikit `Svg` on `SlugShapeBatch` (needs S4 + U1)

Tasks (spec §7): per-root shape-batch group manager (mirrors glyph groups); `Svg`
component rewrite; invisible bounds quad for pointer events; lucide + **both kits'**
builds consume it unchanged (generator untouched — icons pass `content` strings).
Add `uikit-bake icons <svg-dir>` (D3 final, spec §8.3) over S4's `SlugShapeSet`
serialization. Light the example's U3 row: lucide icons in the HUD.

Acceptance:

- [ ] Icon wall (≥ 200 lucide icons) renders correctly at ≤ 3 UI draw calls
      (panels + glyphs + shapes) via devtools stats; example row 7 lit.
- [ ] Svg `color`/`opacity` and multi-color SVGs behave as upstream.
- [ ] Pointer events on icons (kit buttons hover/click) work via bounds quads.
- [ ] `uikit-bake icons` over a lucide subset emits a shape-set asset that loads and
      renders identically to runtime registration (S4 round-trip exercised through
      the CLI).
- [ ] **Both kits** (`uikit-default`, `uikit-horizon` — D2 ruling) build and their
      components render; visual samples in PR.
- [ ] Suites green; prettier/eslint/typecheck green.

## Phase U4 — react subpath + packaging (needs U2 + U3)

Tasks (spec §9): port react sources against r3f `10.0.0-alpha.2` (Q7 verified
`extend()`/`args` survive; residual drift is R5 — divergences land in the spec §11
matrix, never silently); `./react` subpaths on all four packages (hand-authored);
changeset-visibility check (public, not ignored). Light the example's U4 row: the
React twin.

Acceptance:

- [ ] `examples/react/uikit-hud` runs on the `@react-three/fiber/webgpu` Canvas with
      all rows mirrored from the three example; hooks/refs/event props verified for
      Container/Text/Input/Svg; example row 8 lit.
- [ ] Constructor signatures still verbatim-upstream (R8 re-check after react port).
- [ ] Any r3f-v10-forced changes enumerated in spec §11 (edit the spec in-PR).
- [ ] `pnpm -r build` produces valid dual exports for `.` and `./react` on all four
      packages (publint or equivalent clean).
- [ ] Suites green; prettier/eslint/typecheck green.

## Phase V — final validation and PR readiness

Tasks: finish the example pair's polish + docs page
`docs/src/content/docs/examples/uikit-hud.mdx` (guide page optional; `slug-text` is
the template); playwright e2e + visual baselines in the existing harness; **the
kit-conformance harness** (D2, spec §12): render the same `default` and `horizon` kit
trees on upstream `@pmndrs/uikit` (WebGLRenderer, pinned npm releases) and on the fork
(WebGPURenderer), screenshot-diffed with tolerance — text regions masked or
loose-banded (MSDF vs Slug rasterization legitimately differs), layout boxes / panel
geometry / radius / borders / icon shapes / scroll behavior must match; perf gates as
local-only asserts (repo CI posture: CI logs, local asserts); package READMEs with the
migration section (incl. the §8.1 MSDF rationale verbatim); final compat-matrix pass;
upstream-diff review — every divergence from `0d4d887` maps to a spec §11 row or a
commit explaining it.

Acceptance:

- [ ] All 8 example-table rows lit; e2e green on WebGPU **and** forceWebGL.
- [ ] **Kit conformance: both kits pass the upstream visual-diff harness** within the
      agreed tolerances; every diff outside tolerance is either fixed or mapped to a
      spec §11 compat-matrix row.
- [ ] Full workspace: `pnpm typecheck`, `pnpm lint`, `pnpm exec prettier --check`
      over the PR's changed files (repo-wide prettier is red on `main` — see mechanics),
      `pnpm -r test`, examples build — green.
- [ ] Docs example page exists and renders; gems registration + `sync:examples` +
      `sync:pack` all idempotent.
- [ ] Perf gates pass locally; numbers in the PR description.
- [ ] Compat matrix final; every "broken" row has a README migration note.
- [ ] D1–D4 rulings executed as specified (spec §14); D5 ruled-and-recorded.
- [ ] Conventional-commit history clean (changesets auto-generate); no hand-written
      changesets; no `CLAUDE.md`/`lefthook.yml`/sync-script changes beyond the
      team lead's sanctioned L0 CLAUDE.md commits.
- [ ] Merge runbook executed: tip-green gate held, train merged in order with
      per-merge changeset regeneration verified, release cut once after L4 landed.

## Standing risk watch (spec §13)

E1–E4 retire the statically-unprovable set in P0, before fan-out. R1 retired by E1;
R2 owned by S3 — **required scope, no fallback (D4 ruling); a stall escalates to the
stakeholder with the failing fixtures**; R3 owned by E2 + U1's shadow gates; R4 owned
by S2 fixtures + U2 visual diff; R5 owned by U4; R6 owned by S2's wrapper strategy;
R7 requires no v1 action (Skia untouched; guidance owned by PR #172); R8 owned by the
spec §9.1 carve-out + U1/U4 signature-diff gates; R9 owned by S4's error-bound test;
R10 (horizon kit volume, D2 ruling) owned by kit-track parallelization + the V-phase
conformance harness.
