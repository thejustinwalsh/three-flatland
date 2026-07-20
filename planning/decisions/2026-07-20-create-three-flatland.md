# Decisions — create-three-flatland starter kit

Reasoning behind choices in the scaffolder, its templates, and the AGENTS.md
swap. Source keeps one-line comments; the argument lives here.

Spec: `planning/superpowers/specs/2026-07-19-create-three-flatland-design.md`

## AGENTS.md is canonical; CLAUDE.md is generated

`scripts/sync-agents-pairs.ts` writes a CLAUDE.md beside every AGENTS.md, in two
modes over disjoint path sets:

- **Repo** — a one-line `@AGENTS.md` import. Cheap, cannot drift. Gitignored,
  regenerated on Claude session start, guarded pre-commit.
- **Templates** (`--templates`) — a byte-identical copy. A scaffolded user
  project must not depend on Claude Code resolving an `@` import; it just gets
  both files. Generated at the package's build and prepack so the scaffold tests
  see them and they ship in the tarball. Deliberately not run by the session
  hook — those files are product, not developer ergonomics.

CI runs `sync:agents && sync:agents:verify`, generate-then-verify, because the
pointers are gitignored and a bare `--verify` always fails on a fresh checkout.
What that leaves is the check that matters: no CLAUDE.md tracked outside the
shipped templates, where it would silently shadow its AGENTS.md. The pre-commit
hook alone doesn't cover it — `--no-verify` bypasses it.

## Templates omit `customConditions: ["source"]`

That condition resolves imports to unpacked `src/`, which is exactly the
workspace-only wiring a scaffolded project must not carry. Two consequences:

- Templates typecheck against **built** types. Nx's `typecheck: dependsOn
  ["^build"]` orders that correctly, so the per-project Turbo override the spec
  proposed was unnecessary.
- Repo lint runs *before* build in CI, so template imports resolve to
  non-existent dist types and type-aware lint reports an error type. Templates
  are therefore in `.oxlintrc.json`'s `ignorePatterns`. Examples escape this only
  because they *do* carry the source condition. Note oxlint ignores negation
  globs for explicitly-passed directories — `ignorePatterns` is the mechanism
  that works.

## React template: Suspense goes inside the Canvas

Wrapping `<Canvas>` in a Suspense boundary unmounts and remounts the Canvas when
`useLoader` suspends, which trips `R3F.createRoot should only be called once!`
under StrictMode. Suspense lives inside the Canvas; the loading overlay is the
`#loader` element in `index.html`, as in the three.js template. StrictMode stays
enabled.

## Leak guard is split by what it can legitimately appear in

`src/leak-guard.ts` exports two lists because they mean different things:

- `BANNED_EVERYWHERE` — workspace-only wiring (`catalog:`, `workspace:*`,
  `customConditions`, `TURBO_MFE_PORT`, …). Never legitimate in any file.
- `BANNED_AS_DEPENDENCY` — packages excluded from the starter
  (`@three-flatland/devtools`, `tweakpane`). Checked against `package.json`
  only, because AGENTS.md's routing map is *required* to name devtools in prose.

Shared by `scaffold.test.ts` (guards the templates as authored) and
`consumer-smoke.mjs` (guards what a consumer receives after a registry install).
One list, two checks, so they cannot drift.

## The scaffold check lives in the consumer smoke

An earlier standalone smoke installed via `pnpm.overrides` `file:` paths — the
dependency-path rewriting `consumer-smoke.mjs` exists to avoid. A `file:` install
can pass while a real registry install fails on a bad `files` array,
`publishConfig`, or an unresolvable range. Scaffolds are now a consumer kind: the
CLI is installed from Verdaccio and *that* copy is executed, and the scaffolded
project installs with its manifest untouched.

Verdaccio package patterns are minimatch, and `three-flatland` does not match
`create-three-flatland` — without its own local-only entry the scaffolder falls
through to the npmjs uplink and the smoke silently tests whatever is published
there.

## Version resolution splits by distribution mode

- `create-three-flatland` is a published package: `pnpm pack` rewrites
  `catalog:` / `workspace:*` via publishConfig.
- Its templates are **copied source** written into a user's directory. Nothing
  rewrites them at copy time, so `sync-pack` materializes them ahead.

This is why the templates are separate workspace packages, and why they are in
`sync:pack`'s scope in both `.githooks/pre-commit` and CI.

## Nx tagging

`create-three-flatland` is `type:tool`, outside the `scope:` ladder. That ladder
encodes dependency direction among our packages, and the CLI imports none of
them. Every `tools/*` package is untagged for the same reason. The templates are
`type:template`, treated like examples.

## Changeset generator disabled (2026-07-20)

It exhausts its model tokens and fails, so `ci.yml`'s `changeset` job is gated
off. Changesets are hand-written: whoever changes a package commits one with it.
Re-enable by dropping the `false &&` once the generator is fixed.
