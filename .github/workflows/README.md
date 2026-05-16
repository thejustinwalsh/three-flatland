# CI/CD Workflows

## Flow Overview

```mermaid
graph TD
    PR(["Pull Request event"])
    Push(["Push to main event"])
    Manual(["workflow_dispatch event"])
    ChangesetWF["changeset.yml"]
    ChangesetWF -->|"pushes .changeset/ files"| PR

    subgraph CIOrch ["ci.yml (orchestrator)"]
        CIChanges["changes.yml"]
        CIChanges --> CIBuild["build.yml (matrix: lts/*, lts/-1)"]
        CIChanges --> CISmoke["smoke.yml"]
        CIChanges --> CISize["size.yml (PRs only)"]
        CIBuild --> Gate["ci-passed (gate)"]
        CISmoke --> Gate
        CISize --> Gate
    end

    subgraph DocsOrch ["docs.yml (orchestrator)"]
        DocsChanges["changes.yml"]
        DocsChanges --> DocsSmoke["smoke.yml"]
        DocsSmoke -->|"gate: smoke success"| BuildPages["build-pages"]
        BuildPages --> DocsDeploy["deploy (Pages)"]
    end

    subgraph ReleaseFlow ["release.yml"]
        Release["release job"]
        Release --> Changesets{"pending changesets?"}
        Changesets -->|yes| Publish["publish to npm"]
        Changesets -->|no| ReleasePR["create/update release PR"]
    end

    PR ==> CIOrch
    PR ==> ChangesetWF
    Push ==> CIOrch
    Push ==> DocsOrch
    Manual ==> DocsOrch
    Manual ==> ReleaseFlow

    Gate -.->|"workflow_run (success)"| ReleaseFlow
    Gate -.->|"required by ruleset"| Merge["PR can merge"]
```

**Reading the graph:** rounded nodes are events; rectangles are workflows or jobs. Thick arrows (`==>`) are "this event triggers this workflow." Dotted arrows are dependencies between workflows (workflow_run, ruleset gate). Inside each orchestrator subgraph, the solid arrows are the job dependency chain.

## Composable Layout

`ci.yml` and `docs.yml` are slim orchestrators. The actual work lives in reusable workflows that orchestrators call via `uses: ./.github/workflows/<name>.yml`. Each reusable workflow declares `on: workflow_call:` only — they don't trigger directly.

| File | Role | Trigger |
|---|---|---|
| `ci.yml` | Orchestrator: paths-filter → build matrix → smoke/size → gate | `push`, `pull_request` |
| `docs.yml` | Orchestrator: paths-filter → smoke → build-pages → deploy | `push` to `main`, `workflow_dispatch` |
| `changes.yml` | dorny/paths-filter; emits `code` / `examples` / `docs` / `ci` bucket outputs | `workflow_call` |
| `build.yml` | Build + typecheck + lint + test + skia test (single node version, takes `node-version` + `node-tag` inputs) | `workflow_call` |
| `smoke.yml` | Playwright smoke tests against built docs site | `workflow_call` |
| `size.yml` | Bundle size diff via size-limit; comments on PR | `workflow_call` |

The matrix lives at the orchestrator layer (`ci.yml`) — `build.yml` is single-node and reusable. Release could call it directly for a clean publish build if we ever want to dedupe `release.yml`.

## Repository Ruleset

Branch protection is a **repository ruleset** with a single required status check: **`CI passed`** (the `ci-passed` job in `ci.yml`). That job runs after `changes`, `build`, `smoke`, and `size`, and succeeds when each upstream job is either `success` or `skipped` — only `failure` or `cancelled` makes it fail.

Doc-only or meta-only PRs (where build / smoke / size are skipped via paths-filter gating) still produce a passing `CI passed` check and can merge. Code-changing PRs wait for the real jobs to complete before `CI passed` resolves.

> **Ruleset name:** `Main Branch CI` — manage at Settings > Rules > Rulesets

## Workflows

| Workflow | File | Triggers | Purpose |
|---|---|---|---|
| **CI** | `ci.yml` (+ `changes.yml`, `build.yml`, `smoke.yml`, `size.yml`) | push to `main`, pull requests | Build matrix, lint, test, typecheck, smoke (Playwright), bundle size, gated by `ci-passed` |
| **Release** | `release.yml` | after CI succeeds on `main`, manual | Publish packages to npm via changesets |
| **Deploy Docs** | `docs.yml` (+ `changes.yml`, `smoke.yml`) | push to `main`, manual | Self-gated docs deploy: runs paths-filter + smoke before building the Pages artifact and deploying |
| **Generate Changeset** | `changeset.yml` | pull requests (opened, synchronize) | Auto-generate changeset files with Copilot enhancement |

## Path Filtering (CI)

`changes.yml` uses [`dorny/paths-filter`](https://github.com/dorny/paths-filter) to bucket the PR diff (or the latest push's diff). Each bucket is a boolean output consumed by downstream jobs in `ci.yml` and `docs.yml`.

| Bucket | Patterns |
|---|---|
| `packages` | `packages/**`, `skills/**` |
| `minis` | `minis/**` |
| `examples` | `examples/**`, `e2e/**`, `playwright.config.*` |
| `docs` | `docs/**` |
| `configs` | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig*.json`, `eslint.config.*`, `vitest.config.*`, `scripts/**` |
| `ci` | `.github/workflows/**` |

(`skills/` is `@three-flatland/skills`, a publishable workspace package outside `packages/`. `scripts/` contains CI verification helpers, size-limit, changeset generator, and a vitest-collected test — all affect build behavior, so they live in `configs`.)

Job gating:

| Job | Runs when |
|---|---|
| `ci.build` (matrix) | `packages` ∨ `minis` ∨ `examples` ∨ `docs` ∨ `configs` ∨ `ci` — lint/typecheck/test are too valuable to bucket-gate; turbo cache makes the no-ops cheap |
| `ci.smoke` | `packages` ∨ `minis` ∨ `examples` ∨ `docs` ∨ `configs` ∨ `ci` (and upstream `build` didn't fail) |
| `ci.size` | `packages` ∨ `configs` ∨ `ci` (PR events only; size-limit only tracks published packages) |
| `ci-passed` | always — gates the merge |
| `docs.smoke` | `packages` ∨ `minis` ∨ `examples` ∨ `docs` ∨ `configs` ∨ `ci` — docs#build pulls in all of them (API reference from `packages`, showcases from `minis`, embedded demos from `examples`) |
| `docs.build-pages` / `docs.deploy` | gated on `docs.smoke` success |

A change in `ci` or `configs` triggers everything — CI/config changes need to validate themselves.

## Node Version Policy

| Slot | Resolves to (May 2026) | Purpose |
|---|---|---|
| `lts/*` | Node 22 | Release target. `release.yml` ships from this. |
| `lts/-1` | Node 20 | Compatibility canary. Catches breakage for users on the older still-supported LTS before it bites them. |

`package.json` declares `engines.node: >=20.0.0`, matching the older end of the matrix.

## Turbo Cache

| Job | Cache key | Notes |
|---|---|---|
| `build (lts/*, current)` | `Linux-turbo-current-${sha}` | Per-node-version namespace |
| `build (lts/-1, previous)` | `Linux-turbo-previous-${sha}` | `pnpm install` resolves different platform deps per node version |
| `smoke` | `Linux-turbo-current-${sha}` | Shares with `current` build leg — primary-key hit |
| `size` | `Linux-turbo-current-${sha}` | Shares with `current` build leg |
| `release` | `Linux-turbo-current-${sha}` | Shares with `current` build leg |
| `docs.build-pages` | `Linux-turbo-current-${sha}` | Shares with `current` build leg; usually a cache hit since `smoke` already built `docs#build` |

Restore-keys mirror the primary key prefix so a fresh SHA inherits from the nearest prior commit's cache via prefix fallback; turbo's content-hashing decides per-task hits.

## Workflow Dependencies

```mermaid
graph LR
    CI["CI (push to main)"] -->|workflow_run| Release
    Release -.->|"only if CI succeeds"| NPM["npm publish"]
    Docs["Deploy Docs (push to main / dispatch)"] -.->|"self-gated on smoke"| Pages["GitHub Pages"]
```

**Release** waits for CI via `workflow_run` and only runs when CI completes successfully on `main`. Manual `workflow_dispatch` bypasses the CI dependency (useful for version corrections).

**Deploy Docs** is self-contained: it runs its own paths-filter + smoke (via the same reusable workflows) before building the Pages artifact and deploying. The deploy is gated on smoke success — `workflow_dispatch` runs the same gate, so hot patches and manual redeploys never bypass validation.

## Concurrency Controls

| Workflow | Concurrency Group | Behavior |
|---|---|---|
| CI | `ci-{PR number or ref}` | Latest push cancels in-progress run for same PR |
| Release | `Release-refs/heads/main` | Only one release at a time per branch |
| Deploy Docs | `pages` | Latest deploy cancels in-progress deploys |
| Generate Changeset | none | Self-skips via commit message check |

## Manual Triggers

These workflows support `workflow_dispatch` (run from the Actions tab):

- **Release** — Re-run release process without waiting for CI
- **Deploy Docs** — Force a docs redeploy

---

## LLM Prompts

### Updating This Document

Use this prompt after making changes to any workflow file to keep this README in sync:

<details>
<summary>Prompt: Update CI/CD README</summary>

```
Read all workflow files in .github/workflows/ and the current .github/workflows/README.md.

Audit the README against the actual workflow definitions. For each workflow, verify:
- Triggers (on: events, branches, workflow_call) match the documented triggers
- Composable layout table matches the actual files (orchestrator + reusables)
- Path-filter bucket patterns and per-job gating match the actual ci.yml `needs` + `if:` against changes.yml outputs
- Turbo cache key table matches the actual cache key strings used per job
- Node version policy table reflects the actual matrix in ci.yml and engines.node in root package.json
- Workflow dependency graph (mermaid) reflects actual workflow_run chains
- Concurrency groups match actual concurrency config
- Manual triggers section lists all workflows with workflow_dispatch
- Repository ruleset section names the actual required check (the ci-passed gate job in ci.yml)

Update any sections that are out of date. Add new workflows if any exist that aren't documented. Remove documentation for workflows that no longer exist.

Preserve the existing document structure:
1. Flow Overview (mermaid graph)
2. Composable Layout
3. Repository Ruleset
4. Workflows table
5. Path Filtering (bucket table + per-job gating)
6. Node Version Policy
7. Turbo Cache (key table)
8. Workflow Dependencies (mermaid graph)
9. Concurrency Controls
10. Manual Triggers

Keep tables, mermaid graphs, and descriptions concise. Do not add commentary outside the established format.
```

</details>

### Implementing CI Changes

Use this prompt when adding new workflows, modifying triggers, or changing the CI architecture:

<details>
<summary>Prompt: CI/CD Implementation Guide</summary>

```
You are implementing CI/CD changes for a GitHub Actions monorepo. Before making changes, read:
- .github/workflows/README.md — full architecture reference
- All .github/workflows/*.yml files — current workflow definitions
- CLAUDE.md — project structure and build commands

Follow these rules when modifying or creating workflows:

COMPOSABLE LAYOUT
- ci.yml is a slim orchestrator. Real work lives in reusable workflows declared with `on: workflow_call:` only
- Reusable workflows in this repo: changes.yml, build.yml, smoke.yml, size.yml
- The orchestrator calls them via `uses: ./.github/workflows/<name>.yml` and passes inputs/secrets
- New steps that fit an existing reusable workflow go there; otherwise add a new reusable workflow and call it from ci.yml
- Matrix lives at the orchestrator layer — reusable workflows are single-instance and take parameters as inputs

BRANCH PROTECTION
- The repository ruleset requires ONE status check: `CI passed` (the ci-passed job in ci.yml)
- ci-passed runs `if: always()`, needs [changes, build, smoke, size], and succeeds when each upstream job is success or skipped (fails only on failure or cancelled)
- New jobs that should block merge must be added to ci-passed's `needs` AND its gate-check loop
- Do NOT introduce per-job required checks in the ruleset — ci-passed is the single gate

PATH FILTERING & JOB GATING
- changes.yml uses dorny/paths-filter@v3 to emit per-bucket booleans: code, examples, docs, ci
- Downstream jobs in ci.yml gate via `if:` expressions on those bucket outputs
- A bucket change in `ci` (.github/workflows/**) triggers everything so a CI change validates itself
- When adding a new job, decide which bucket(s) should trigger it and write the `if:` accordingly
- When adding a new top-level directory, add it to the appropriate bucket pattern in changes.yml

JOB DEPENDENCIES & SMOKE / SIZE
- smoke and size both `needs: [changes, build]` and use `if: !cancelled() && needs.build.result != 'failure' && (bucket conditions)` — this lets them run when build is skipped (e.g., docs-only PRs) but skips them when build fails
- New jobs that depend on built artifacts should follow the same pattern

NODE VERSION & MATRIX
- lts/* is the release target (release.yml ships from this); lts/-1 is the compatibility canary
- engines.node in root package.json must match the older end of the matrix (currently >=20.0.0)
- When the LTS schedule rolls (e.g., Node 24 becomes Active LTS), bump engines accordingly

TURBO CACHE
- Per-node-version cache namespace: `${{ runner.os }}-turbo-${{ inputs.node-tag }}-${{ github.sha }}` in build.yml
- Smoke, size, release, and any new single-node-version job pin to the `current` leg's namespace: `${{ runner.os }}-turbo-current-${{ github.sha }}`
- Restore-keys use the same prefix so prefix-fallback inherits from prior SHAs; turbo content-hashing decides per-task hits

WORKFLOW DEPENDENCIES
- Use workflow_run to chain workflows that must wait for another to complete
- Always add if: github.event.workflow_run.conclusion == 'success' to skip on upstream failure
- If the workflow also supports manual trigger, use: if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'

CONCURRENCY
- Use concurrency groups to prevent duplicate runs of the same workflow
- For deploy workflows, use cancel-in-progress: true
- For release workflows, do NOT cancel in progress — let the current release finish

CONVENTIONS
- actions/checkout@v6, actions/setup-node@v5, actions/cache@v5, actions/upload-artifact@v5, pnpm/action-setup@v5
- setup-node: `node-version: lts/*` and `cache: pnpm` (or pass node-version as input for build.yml)
- pnpm install --frozen-lockfile
- Name jobs clearly — the job name appears in GitHub UI status checks

AFTER MAKING CHANGES
- Update .github/workflows/README.md to reflect all changes (composable layout, path-filter buckets, gating, dependencies, concurrency, cache keys, node policy)
- Verify both mermaid graphs still accurately represent the workflow topology
```

</details>
