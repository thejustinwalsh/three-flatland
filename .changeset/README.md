# Changeset and Release Flow

> **Agents & contributors:** this is the changeset guidance for the repo (the file that used to
> be `.changeset/CLAUDE.md`). It **must** live as `README.md` and nowhere else in this directory.
> `changesets` parses **every** `.md` file in `.changeset/` as a changeset **except `README.md`** —
> a `CLAUDE.md`, `AGENTS.md`, or any other doc here makes `changesets/action` (its own bundled
> reader) throw `could not parse changeset - invalid YAML in frontmatter` and **breaks the release**.
> Keep prose docs in this one file. Only `README.md`, `config.json`, `pre.json`, and real
> `---`-frontmatter changesets belong in `.changeset/`.

## How changesets are written

> **The CI generator is DISABLED as of 2026-07-20.** It exhausted its model
> tokens and failed, so it no longer runs on PRs. **Write your own changeset
> whenever you change a package** — a package change without one ships
> unreleased, and nothing will catch it for you.

```sh
pnpm changeset          # interactive: pick packages + bump, writes .changeset/<name>.md
```

Or hand-author the file — it is just frontmatter plus a summary:

```markdown
---
"three-flatland": patch
---

Fix sprite tint not applying on the first frame after a texture swap.
```

Commit it alongside the change it describes. The sections below document the
dormant generator as a local drafting aid; the commit-type → bump mapping is
still the convention to follow by hand.

### Dormant generator

`ci.yml` does not call `.github/workflows/changeset.yml`. Do not restore that job
to fix a missing changeset. The reusable workflow remains in the repository as
reference, but agents must create, inspect, and commit release notes themselves.

### Script

The deterministic generator can draft a changeset locally:

```
pnpm changeset:generate
  --branch <pr-branch>
  --repo <owner/repo>
  --pr <number>
  --base origin/main
  --cap-major
```

The script is `scripts/generate-changesets.ts`. The shorter local form is:

```
pnpm changeset:generate --branch <your-branch>
```

### Commit-to-bump mapping (`scripts/generate-changesets.ts` lines 52–60)

| Conventional-commit type                                  | Bump                                               |
| --------------------------------------------------------- | -------------------------------------------------- |
| `feat`                                                    | `minor`                                            |
| `fix`, `perf`, `refactor`                                 | `patch`                                            |
| breaking change (`!` suffix or `BREAKING CHANGE` in body) | `major` (capped to `minor` by `--cap-major` in CI) |
| `docs`, `test`, `ci`, `chore`, `style`, `build`           | **skipped** — no changeset                         |

Any type not in either list also produces no changeset.

### Package detection (lines 81–103)

`discoverPackages()` scans only the `packages/` directory. For each entry it reads `package.json`; a package is included if and only if `pkg.private !== true`. It builds a `Map<path-prefix, npm-name>`. Changed files in a commit are then matched against these prefixes to determine which packages a commit affects.

**Implication:** packages outside `packages/` (e.g. `skills/`, `minis/`) are **never** auto-detected. Changes to those packages require hand-written changesets.

### File naming

Generated files are named `auto-<sanitized-pkg-name>-<branch-id>.md`. The branch ID is a 7-char base36 inverted timestamp of the branch's first commit — deterministic per branch, sorts most-recent-first. On re-generation the old files for that branch ID are deleted and rewritten.

The dormant workflow's Copilot step enhanced each generated body without
modifying its frontmatter. Agents can instead read that prompt in
`.github/workflows/changeset.yml`, inspect the referenced commits and diffs, and
write the final release note directly.

### Dormant workflow behavior

The workflow previously committed generated files as `ci: generate changesets`.
That push no longer occurs. `changes.yml` retains its changeset-only fast path so
a manual follow-up commit containing only `.changeset/` files can reuse the
previous green CI result.

---

## Release workflow

`release.yml` runs after CI succeeds on `main` (or on `workflow_dispatch`). It uses `changesets/action@v1`:

- **version**: `pnpm changeset:version` (runs `changeset version` then `scripts/sync-versions.ts`)
- **publish**: `pnpm release` (runs `turbo run build && changeset publish`)

The repo is in **pre-release mode** (`pre.json` mode: `"pre"`, tag: `"alpha"`). All published versions carry the `-alpha.N` suffix until `changeset pre exit` is run.

---

## Making a package release-visible

The `discoverPackages()` function (`scripts/generate-changesets.ts:81–103`) is the sole gate for auto-generated changesets. A package in `packages/` becomes release-visible when:

1. **`private` is not `true`** in its `package.json`. That is the only field the script checks. No `publishConfig`, no allowlist.
2. **Not listed in `.changeset/config.json` `ignore` array** (`config.json:13–32`). The ignore list currently contains all `example-*` packages. Adding a package name here prevents `changeset version` and `changeset publish` from touching it even if a changeset names it.
3. **`access: "public"`** is set globally in `config.json:8`. Individual packages do not need `publishConfig.access`.

### Linked groups (`config.json:6–9`)

```json
"linked": [
  ["three-flatland", "@three-flatland/nodes", "@three-flatland/presets"],
  ["docs", "starlight-theme"]
]
```

Linked groups align the highest current version and highest requested bump among group members that
are already in the same release plan. A package is not added to a release solely because another
member of its linked group changed. Normal dependency propagation can add it first; for example,
`@three-flatland/presets` follows a `three-flatland` release because it depends on
`three-flatland`, while `@three-flatland/nodes` does not release unless it has its own change or a
dependency update.

### Checklist for a new publishable package in `packages/`

- [ ] `package.json` does **not** have `"private": true`
- [ ] Package name is **not** in `.changeset/config.json` `ignore` array
- [ ] If it should version-lock with existing packages, add it to the relevant `linked` group in `config.json`
- [ ] Add an initial hand-written changeset in `.changeset/` for the first release (the script will not auto-generate one until there are conventional commits against it on a PR)
- [ ] Verify `pnpm changeset:generate --branch <branch>` includes it in output after at least one `feat`/`fix`/`perf`/`refactor` commit touches its files

### Packages that need hand-written changesets always

- `skills/` — outside `packages/`; `discoverPackages()` never sees it
- `minis/` — outside `packages/`; same reason
- Any package with `"private": true` that needs a one-time manual bump

---

## Gotchas

- **Alpha breaking changes use a `minor` changeset plus an explicit `BREAKING CHANGES` section.** This preserves the former generator's `--cap-major` behavior. Use `major` only when the release plan explicitly requires it.
- **Pre-release mode is active.** `pre.json` has `mode: "pre"`, `tag: "alpha"`. All versions published via `changeset publish` will be `-alpha.N` until `changeset pre exit` is run and committed.
- **Reserve `auto-*` names for generator output.** Hand-authored changesets use descriptive names such as `three-flatland-hierarchy-aware-batching.md`.
- **`starlight-theme` is `private: true`** yet appears in the `linked` group and in `pre.json`. It is versioned by changesets but never published to npm. This is intentional — it is a workspace plugin.
- **`@three-flatland/skia` and `@three-flatland/bake`** have no `private` flag and no `publishConfig`, so they are treated as public. Confirm this matches intent before adding a new package in the same pattern.
- **`scripts/sync-versions.ts`** runs after `changeset version` to keep internal dependency versions in sync. If it fails, the release PR version step fails.
