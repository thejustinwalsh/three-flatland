# `@three-flatland/skills` — Distribution Package

**Date:** 2026-04-13
**Status:** Draft → pending user review
**Owner:** thejustinwalsh

## Goal

Publish the project's authored Claude Code skills (starting with `tsl`) as the npm package `@three-flatland/skills`, distributable via `npx skills add thejustinwalsh/three-flatland`, with one source of truth and lightweight validation in CI.

## Background

- The TSL skill currently lives at `.claude/skills/tsl/` (the user's "PR #23" / `feat-tsl-skill` branch). Six files: `SKILL.md`, `nodes.md`, `postprocessing.md`, `typescript.md`, `compute.md`, `migration.md`.
- The de-facto installer is `vercel-labs/skills` (npm `skills`, invoked as `npx skills`). Verified from source (`src/skills.ts` `discoverSkills`, `src/source-parser.ts`):
  - GitHub shorthand regex `/^([^/]+)\/([^/]+)(?:\/(.+?))?\/?$/` — no `/tree/<branch>/` needed.
  - Default search priority includes `<repo>/skills/` directly. A top-level `skills/` dir in the repo is found with no subpath.
  - It also accepts a directory that IS a skill, or a directory of multiple skill dirs — the nested `skills/` wrapper is not required, it's one of several recognized layouts.
- `skills-ref` (PyPI, `agentskills/agentskills`) is the canonical validator. Enforces frontmatter presence, `name`/dir match, name format. Doesn't enforce the "Use when…" convention; doesn't accept Claude Code extended frontmatter.

## Non-goals

- Authoring new skills — scope is migrate `tsl`, scaffold for future additions.
- Building a custom skill-manager CLI.
- Bundling into a Claude Code plugin / `marketplace.json`.

## Design

### Repo layout

Add a top-level `skills/` directory as a sibling of `packages/`. It is itself the publishable npm package. Package-level tooling (the validator) lives at the repo-level `scripts/` dir, consistent with existing project tooling like `sync-react-subpaths.ts`, so it does not collide with per-skill `<skill>/scripts/` directories that agents execute.

```
three-flatland/
├── packages/
├── scripts/
│   └── validate-skills.mjs            ← repo tooling, NOT shipped
├── skills/                            ← workspace package, publishable
│   ├── package.json                   # name: "@three-flatland/skills"
│   ├── README.md
│   └── tsl/
│       ├── SKILL.md
│       ├── nodes.md
│       ├── postprocessing.md
│       ├── typescript.md
│       ├── compute.md
│       ├── migration.md
│       └── scripts/                   ← ships with the skill (empty for tsl today; reserved)
└── .claude/
    └── skills/
        └── tsl → ../../skills/tsl    # symlink
```

No nested `skills/skills/` wrapper. The CLI finds `skills/tsl/SKILL.md` from the repo root without any subpath. Per-skill `<skill>/scripts/` directories are preserved and ship to users — skill authors own their contents.

`package.json` essentials:

```json
{
  "name": "@three-flatland/skills",
  "version": "0.1.0-alpha.1",
  "description": "Claude Code skills for the three-flatland ecosystem (TSL, …).",
  "files": ["*/", "README.md"],
  "scripts": {
    "validate": "uvx skills-ref validate */ && node ../scripts/validate-skills.mjs",
    "test": "pnpm validate"
  },
  "publishConfig": { "access": "public" },
  "keywords": ["claude-code", "agent-skills", "tsl", "three", "webgpu"],
  "repository": {
    "type": "git",
    "url": "https://github.com/thejustinwalsh/three-flatland.git",
    "directory": "skills"
  }
}
```

The `"*/"` glob ships each skill directory wholesale, including its `scripts/` subdir. Verify via `npm pack --dry-run` during implementation.

Add `skills` to `pnpm-workspace.yaml` `packages:`.

### Per-skill scripts: authoring guidance (documented in README)

Skills may include a `scripts/` directory with ESM Node helpers the agent invokes. Conventions:

- Write ESM (`.mjs` or `"type": "module"`), Node 20+.
- Declare any Three/TSL runtime deps as **peer deps** in the package `package.json` so they're resolvable for `pnpm add`-style installs. Users who install via `npx skills add` get files only; for those users the SKILL.md must list required packages and the agent prompts the user to install them in the target project.
- Document invocation in the SKILL.md as running from the **user's project root** so `node_modules` resolution Just Works: `node .claude/skills/<name>/scripts/<script>.mjs`.
- The TSL skill today has no extracted scripts — its `migration.md` keeps its inlined helper as-is. Extracting it is a follow-up, not part of this PR.

### Single source of truth

`skills/tsl/` is canonical. `.claude/skills/tsl` is replaced with a symlink to `../../skills/tsl`. Local Claude Code loads via `.claude/skills/`, editors write to `skills/tsl/`, one copy on disk.

Migration preserves history via `git mv .claude/skills/tsl skills/tsl` followed by `ln -s ../../skills/tsl .claude/skills/tsl` (and `git add` the symlink).

### Install UX

| Command | Behavior |
|---|---|
| `npx skills add thejustinwalsh/three-flatland` | Installs all skills in `skills/`. Works the moment the PR lands. |
| `npx skills add thejustinwalsh/three-flatland/skills/tsl` | Installs only the `tsl` skill. |
| `pnpm add -D @three-flatland/skills` + manual copy | Fallback / scripted use. |

README documents all three. The primary, promoted command is the first one.

### Validation

Two layers, both gated behind `pnpm --filter @three-flatland/skills validate`:

1. **`uvx skills-ref validate */`** — reference validator, no install needed (uv auto-fetches). Catches missing/malformed frontmatter, name/dir mismatch.
2. **`node scripts/check-description-prefix.mjs`** — ~30 lines, parses each `SKILL.md`, asserts `description` begins with `Use when` (case-insensitive). The superpowers convention the project follows; skills-ref can't check it.

Wired into the root turbo `lint` task so CI fails on regressions.

### Release flow

- Changeset entry: `@three-flatland/skills` → `0.1.0-alpha.1`.
- Existing changesets workflow publishes to npm.
- No `size-limit` entry (markdown only).

### README outline

1. **What's inside** — list of skills with one-line descriptions.
2. **Install with `npx skills`** — `npx skills add thejustinwalsh/three-flatland`.
3. **Install a single skill** — deep-link form.
4. **Install via npm** — `pnpm add -D @three-flatland/skills`, copy from `node_modules`.
5. **Authoring a new skill** — add a top-level dir with `SKILL.md`, run `pnpm --filter @three-flatland/skills validate`, open a PR.

## Migration checklist (executive summary, full plan to follow)

1. Create top-level `skills/` with `package.json` and README. Create repo-level `scripts/validate-skills.mjs`.
2. Add `skills` to `pnpm-workspace.yaml`.
3. `git mv .claude/skills/tsl skills/tsl`.
4. `ln -s ../../skills/tsl .claude/skills/tsl`, `git add` the symlink.
5. Wire `validate` into turbo `lint` task.
6. Add changeset.
7. Verify Claude Code still loads the skill locally via the symlink.
8. Verify `npx skills add thejustinwalsh/three-flatland` from a scratch dir installs `tsl` correctly (pre-merge: test from the branch via `thejustinwalsh/three-flatland#feat-skills-package`).

## Risks & open items

- **Symlink on Windows**: requires `core.symlinks=true`. Project is Unix-leaning; acceptable.
- **`uvx` in CI**: available on modern GitHub runners; add `astral-sh/setup-uv` step if the image doesn't have it.
- **`files` glob**: `"*/"` should ship every skill dir (including per-skill `scripts/`) and nothing else. Verify with `npm pack --dry-run` during implementation.
- **Future**: if `npx skills` gains npm-registry resolution, `npx skills add @three-flatland/skills` works with zero changes.

## Out of scope

- Migrating skills that live under `~/.claude/skills/` (mini-game, flatland-r3f, docs-audit, etc.) — those are user-global, not repo-owned.
- A `@three-flatland/skills` CLI of our own.
- Automated nightly publish.
