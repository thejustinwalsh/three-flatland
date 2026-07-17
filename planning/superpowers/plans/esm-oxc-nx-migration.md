# ESM / oxc / NX Migration — Execution Plan (LIVING DOC)

> **Autonomous /loop initiative. Started 2026-07-17.** User is asleep; I (Claude/Opus)
> am driving the whole thing solo and recording every decision here. Loop until: all
> cleanup errors/issues resolved, code reviewers agree, CI green. Do PR A fully, then PR B.
> PushNotification the user at big milestones + on completion.
>
> **This is the authoritative continuation doc.** If context is lost, read this + the
> memory file `project_esm_oxc_nx_migration.md` and resume from the Running Log.

## Authorization & rules

- User answered all scoping questions, then said "driving this whole thing tonight, record your decisions."
- **Iron rules (non-negotiable):**
  - NEVER disable a lint rule to make CI pass. Run autofix (`--fix`), then hand-fix real violations.
  - Column width **120** (was prettier printWidth 100).
  - Conventional Commits. **Stage by exact path** (this tree has unrelated WIP). NO co-author trailer. Auto-changesets only (never hand-write).
  - Don't touch pre-existing WIP (`skills/tsl/SKILL.md`, `skills/tsl/performance.md`, unrelated untracked planning docs on main).
  - "Same rules" apply to PR B (NX) as to PR A.

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Copilot PR #31 (stale) | **Supersede** — redo ESM/tsdown fresh, then CLOSE #31 |
| 2 | Lint depth | **oxlint-only clean cut** (latest 1.74.0). Remove eslint entirely. |
| 3 | Formatter | **oxfmt-only** (0.59.0). Remove prettier entirely. |
| 4 | Blast radius | Format all `.ts/.tsx` repo-wide @120; lint packages+minis+tools+examples src |

**oxlint capability verification (2026-07-17):** oxlint 1.74 has built-in `react/react-compiler`
rule (compiler analysis in lint-only mode), type-aware linting via Go `tsgolint` port
(recovers no-floating-promises / no-misused-promises / no-unsafe-\*), built-in `react` +
react-hooks rules, and can load `eslint-plugin-react-hooks` via jsPlugins if exact compiler
rules are needed. Clean cut is viable.

## Base

- Worktree: `.claude/worktrees/feat+esm-oxc-migration`, branch **`feat/esm-oxc-migration`**.
- Base: **origin/main `3a4f9a96`** (local main was 28 commits behind; upstream = merged skia PR #164 + changeset churn, nothing tooling-relevant).
- node v24.18.0, pnpm 10.28.1.

## Current baseline being replaced

- **prettier** `.prettierrc`: `semi:false, singleQuote:true, tabWidth:2, trailingComma:es5, printWidth:100`. Root scripts `format`/`format:check` target only `packages/*/src` + `minis/*/src` `.ts,.tsx`.
- **eslint** `eslint.config.js` (flat): `@eslint/js` recommended + typescript-eslint `recommendedTypeChecked` + react-hooks (recommended, `set-state-in-effect:warn`). Custom: `no-unused-vars`(argsIgnore `^_`, varsIgnore `^_`), `consistent-type-imports`(inline), `no-import-type-side-effects`. Ignores: dist, node_modules, vendor, `*.config.{ts,js}`, `*.setup.ts`, `*.test.{ts,tsx}`, `examples/**`, `tools/vscode/e2e/fixtures/**`. Root `lint`=`eslint packages/*/src minis/*/src`.
- **turbo `//#lint`** task inputs reference `eslint.config.*`.
- **lefthook** pre-commit = sync scripts only (NO lint/format hook today).

## PR A — ESM-only + tsdown + oxc clean cut

### A1. tsup → tsdown (ESM-only builds)  — 16 build configs
Packages (12): alphamap, atlas, bake, devtools, image, nodes, normals, presets, schemas, skia, slug, three-flatland.
Tools (4): audio-play, bridge, codelens-service, io. Minis (1): breakout (inline tsup CLI → tsdown.config.ts).
- Canonical tsdown config translation (establish on 1–2 pkgs, then fan out via horde):
  ```ts
  import { defineConfig } from 'tsdown'
  export default defineConfig({
    format: ['esm'],           // drop 'cjs'
    unbundle: true,            // was bundle:false
    fixedExtension: false,     // keep .js/.d.ts to match exports
    deps: { neverBundle: [...] } // was external:[...]
  })
  ```
  Per-package: preserve entry globs, dts, tsconfig, banner, esbuildOptions→rolldown equivalents, onSuccess→hooks['build:done']. skia is special (root:'src/ts', wgpu-layouts.json copy hook, exclude `*.test.tsx`).
- **package.json (6 with require conds: devtools, nodes, presets, skia, slug, three-flatland):** remove all `require` conditions from `exports`; `"main"` `./dist/index.cjs`→`./dist/index.js`.
- Update all `build`/`dev` scripts `tsup`→`tsdown`. Root devDeps: remove `tsup`, add `tsdown` (workspace catalog pin, latest ~0.21+; verify newest).
- `turbo.json`: any `tsup.config.ts` input → `tsdown.config.ts` (skia#build inputs list).
- Gate: `pnpm build` green; `dist/` ESM-only; exports resolve.

### A2. oxlint + oxfmt clean cut
- Remove devDeps: `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `typescript-eslint`, `globals`, `prettier`. Delete `eslint.config.js`, `.prettierrc`.
- Add devDeps (latest): `oxlint@^1.74`, and oxfmt (verify package name: likely `oxfmt`@^0.59 — CONFIRM at install; oxc formatter may be `oxfmt` or shipped via `oxlint`/`@oxc-project`). Add to workspace catalog if shared.
- **`.oxlintrc.json`** — map current ruleset:
  - plugins: typescript, react, react-hooks, import, unicorn(?) — start minimal = correctness + the specific rules below, expand only to match eslint intent.
  - type-aware ON (tsgolint) → recover no-floating-promises, no-misused-promises, no-unsafe-\*.
  - rules: `no-unused-vars` (argsIgnorePattern/varsIgnorePattern `^_`), `consistent-type-imports`, `no-import-type-side-effects`, react-hooks rules-of-hooks/exhaustive-deps, `react/react-compiler`. `set-state-in-effect`→warn (via jsPlugins eslint-plugin-react-hooks if built-in absent).
  - ignore/override: examples get lint but relax type-aware where no tsconfig; keep tools/vscode/e2e/fixtures ignored; dist/node_modules/vendor ignored.
  - lint scope: packages+minis+tools+examples `src`.
- **oxfmt config** (`.oxfmtrc`/`oxfmt.json` — CONFIRM format): printWidth **120**, semicolons false, singleQuote true, trailingComma (oxfmt default vs es5 — CONFIRM, prettier used es5). Match no-semi/single-quote/2-space.
- Root scripts: `lint`→`oxlint ...`, `lint:fix`→`oxlint --fix ...`, `format`→`oxfmt ...`(write), `format:check`→`oxfmt --check`. minis/breakout `lint` script too.
- `turbo.json` `//#lint` inputs: `eslint.config.*`→`.oxlintrc.json`.
- lefthook: (optional) add oxlint/oxfmt pre-commit? Keep minimal — CI is the gate. Decide during impl.
- Gate: `pnpm lint` runs, `pnpm format:check` runs.

### A3. Repo-wide reflow + autofix + hand-fix
- `oxfmt --write` all `.ts/.tsx` repo-wide (120-col reflow — huge diff, its own commit).
- `oxlint --fix` (autofix mechanical).
- **Hand-fix remaining violations** (the big manual/horde phase — dispatch Sonnet agents on well-scoped dir batches; Opus owns correctness + tricky type-aware ones). NEVER suppress.
- Gate: `pnpm lint` clean (0 errors), `pnpm typecheck`, `pnpm build`, `pnpm test`, smoke (as feasible locally).

### A4. Docs / skills references
- Update CLAUDE.md Code Style bullet (prettier→oxfmt, eslint→oxlint), any skill docs referencing eslint/prettier/tsup (`.claude/skills/mini-game`, turborepo skill stays until PR B). Fold-in at point of discovery.

### A5. Push + CI + review loop
- Push branch, open PR A (supersedes #31; note that in body). Close #31.
- Monitor CI; fix red until green.
- Run adversarial code review (local /code-review + agent panel; codex if available). Resolve until reviewers agree.

## PR B — Turbo → NX (stacked on A)

Branch `feat/nx-migration` off `feat/esm-oxc-migration`. Read NX docs (nx.dev latest). Scope:
- `nx init` / add `nx` + `@nx/js` (+ plugins). Translate `turbo.json` tasks → NX `targetDefaults` / inferred targets / project.json (or package.json `nx` field). Preserve dependsOn graph, outputs (`dist/**`, `bundle/**`), inputs, caching, the special edges (gen:types, skia#build, docs#build fan-in, three-flatland#build).
- **Enforce oxc, not eslint**: find/verify NX oxlint plugin or a custom target so `nx lint` runs oxlint (never eslint). No `@nx/eslint`.
- **Module boundary rules**: NX tags + `@nx/enforce-module-boundaries` (via oxlint? or NX's own graph constraints) to encode the loader-architecture layering (no-registry, cross-package policy). Map to existing dependency policy in `.library/three-flatland/loader-architecture.md`.
- **Project graph viz**: `nx graph` wired; document.
- **Remove turbo completely**: delete `turbo.json`, remove `turbo` devDep, update all scripts + CI workflows (`build.yml` `turbo run //#lint`→nx, size.yml/smoke.yml/release.yml turbo cache steps→nx cache), `.gitignore` `.turbo`, lefthook turbo-cache-compact hooks, scripts/turbo-cache-compact.ts. Update turborepo skill doc or remove.
- Same gates + review loop as PR A.

## Verification / gates (both PRs)

Local mirror of CI: `pnpm sync:pack:verify examples minis`, `pnpm sync:react:verify`, `pnpm sync:versions:verify`, `pnpm gen:types:verify`, `pnpm sync:docs:schemas:verify`, `pnpm lint` (oxlint), `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:smoke` (Playwright — heavy; run if feasible). size-limit uses `.size-limit.cjs` (keep .cjs — valid in type:module).

## RUNNING LOG (append newest at bottom)

- **2026-07-17 T0** — Brainstormed, verified oxlint caps, mapped CI, wrote memory + this plan. Created worktree `feat/esm-oxc-migration` off origin/main 3a4f9a96. Confirmed 16 tsup configs (not 6 — #31 stale). Next: A1 tsdown migration, starting with a canonical config on a leaf package (schemas or io), then fan out.
- **2026-07-17 T1 — A1 BUILD GREEN (46/46 turbo tasks, ESM-only, docs incl.).** Locked versions: tsdown 0.22.9, oxlint 1.74.0, oxfmt 0.59.0. tsdown API confirmed from shipped types: `unbundle:true` (was bundle:false), `fixedExtension:false` (keep .js), `deps.neverBundle` (external/noExternal DEPRECATED), `deps.alwaysBundle` (was noExternal), `hooks:{'build:done'(){}}` (was onSuccess), `root:'src/ts'` (skia outbase), `dts:true`. **Gotchas fixed (each a real fold-in):**
  1. **Local `.json` imports must be external** under unbundle or rolldown emits an invalid `[name]` chunk (abs worktree path). schemas (`schema.json`, `../package.json`) + skia (`wgpu-layouts.json`) → added `neverBundle:[/\.json$/]`; files still copied via build:done. schemas kept object-entry names.
  2. **`.test-d.ts` type-test files leaked into build entries** (glob `!*.test.ts` doesn't match `.test-d.ts`); `three-flatland/src/pipeline/sortLayers.test-d.ts` imports `vitest`→`tinyrainbow`→invalid chunk. Added `!**/*.test-d.ts` to ALL glob configs; gave `presets` the `.test.ts`+`.test-d.ts` excludes it never had. (Only 1 `.test-d.ts` exists today, but the trap was latent everywhere.)
  3. **Vite worker imports** (`image`: `./x?worker&inline`, `?worker`) must stay external (Vite resolves them app-side) → `neverBundle:[/\?worker/]`.
  4. tsdown **auto-externalizes** `@three-flatland/*` workspace deps correctly (resolves by bare specifier before source-condition) — no regex needed; verified bake NOT inlined into three-flatland.
  5. tsdown now emits `.d.ts.map` declaration maps (tsup didn't) — harmless, kept.
  - **oxfmt config** = prettier-compatible keys (`--migrate=prettier` maps 1:1): set `printWidth:120`, semi false, singleQuote, tabWidth 2, trailingComma es5, sortPackageJson false. Config file `.oxfmtrc.json`.
  - **oxlint config** = `.oxlintrc.json` with `plugins:[]` (typescript/unicorn/oxc default; `react` off-by-default → `--react-plugin`/add to plugins), `categories:{correctness:error}`, `rules:{}`, `--type-aware` flag for typed rules (tsgolint).
  - A1 committed `2719b0a9`. typecheck + all 5 sync-verifies green.
- **2026-07-17 T2 — A2 + A3a/b done, A3c (hand-fix) in flight.** Commits: A2 `d67ea06e` (oxlint/oxfmt clean cut), A3a `5ada93d6` (606-file 120col reflow, typecheck 45/45), A3b `79cf5514` (autofix + e2e/spec scope). Key learnings/decisions:
  - **oxfmt is a FULL prettier replacement** — with no path args it formatted 966 files incl. `.md`/`.json`/tried `.c` (exit 2). Scoped format scripts to `oxfmt '**/*.ts' '**/*.tsx'` only (decision #4 = ts/tsx). Excluded generated `.ts` from oxfmt+oxlint (`*.gen.ts`, `*.generated.ts`, `gem.ts`, `example-gems.ts`) — their generators content-verify in CI (gen:types) or pre-commit (sync:examples).
  - **type-aware needs `oxlint-tsgolint`** devDep (0.25.0) — added; recovers no-floating-promises/unbound-method/restrict-template-expressions/etc.
  - oxlint rule keys: `no-unused-vars` (core, NOT typescript/…), `typescript/consistent-type-imports`, `typescript/no-import-type-side-effects`. `--fix-suggestions` needed beyond `--fix` (void on floating-promise, import type).
  - Lint scope refined: exclude `**/*.spec.*` + `**/e2e/**` (test harness the old `eslint packages/*/src minis/*/src` script never covered). Faithful; decision #4 adds tools+examples *source*.
  - **exhaustive-deps → `warn`** (matches old flat config's react-hooks-recommended severity; force-fixing 42 in webview/demo React risks breaking behavior). oxlint exits 0 on warnings-only → CI green. NOT disabled — kept visible.
  - Violation math: 172 total → autofix → 120 real-source → exhaustive-deps→warn → **78 ERRORS** to hand-fix + 42 advisory warnings. 78 errors = unbound-method 32, consistent-type-imports 12, restrict-template 11, no-unused-vars 8, erasing-op 4 (FALSE-POS: intentional Bayer `0/N` zeros → `0`), no-new-array 3, misc.
  - **A3c dispatched 5 parallel agents** (preview / examples / vscode-ext+audio / packages / vscode-webview+design-system) under guardrails (never disable a rule, fix root cause, verify oxlint+typecheck in scope). Awaiting results → then verify aggregate (full lint 0 errors + typecheck + build) + commit A3c. `.oxlintrc.json` exhaustive-deps:warn + spec/e2e ignore still UNCOMMITTED (goes in A3c).
  - Next after A3c: A4 (CLAUDE.md/skill-doc eslint→oxlint/prettier→oxfmt/tsup→tsdown refs), then A5 (push, PR, CI, review). Then PR B (NX).
