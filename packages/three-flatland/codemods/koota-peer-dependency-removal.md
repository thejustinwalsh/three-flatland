---
title: 'Koota is no longer a peer dependency'
slug: 'koota-peer-dependency-removal'
package: 'three-flatland'
version: '0.1.0-alpha.11'
type: 'breaking'
audience: 'consumers'
---

# Koota is no longer a peer dependency

`three-flatland` used to require `koota` as a peer dependency, so applications installed it whether or
not they used it themselves. The renderer now uses a private entity runtime and does not import Koota
at all.

This specialization grew from [Koota](https://github.com/pmndrs/koota). Koota's typed traits,
structure-of-arrays storage, queries, and systems made the specialized design possible. Koota remains
the recommended general-purpose ECS for application and gameplay state. Keep Koota when your
application uses it; removing the former renderer peer does not replace its application role.

## Migration

| Before | After |
| --- | --- |
| `koota` in `dependencies` or `peerDependencies`, confirmed to exist only for the former renderer peer requirement | entry removed |
| Application/tooling use or uncertain installation provenance | entry kept, unchanged |

## Codemod prompt (LLM-applicable)

You are migrating a TypeScript/JavaScript codebase that depends on `three-flatland`. Remove the
`koota` dependency only if the application does not use Koota itself.

### 1. Discover candidate sites

Find every manifest that declares `koota`:

```bash
rg -n '"koota"' --glob '**/package.json' --glob '!**/node_modules/**'
```

In a monorepo or workspace, expect more than one manifest. Handle each independently.

**Always skip:**
- `node_modules/`
- Build output (`dist/`, `build/`, `.next/`, `out/`)
- Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) — the package manager regenerates these
- This codemod artifact itself
- Any vendored copy of `three-flatland` source

### 2. Verify each candidate is in scope

For each manifest, establish that the package depends on `three-flatland` and that Koota was
installed only for its former peer requirement. A missing textual import alone is not proof.
Search that package's source, tests, scripts, configuration, entrypoints, and internal dependencies.
Exclude nested workspace packages: each manifest is a separate decision.

```bash
rg -n 'koota' path/to/package --glob '!**/node_modules/**' --glob '!**/dist/**' \
  --glob '!**/build/**' --glob '!**/*lock*'
```

This broad search finds side-effect imports (`import 'koota'`), static imports/re-exports, dynamic
imports (`import('koota')`), CommonJS `require`, subpaths such as `koota/...`, mocks, and import-map
or alias configuration. Inspect multiline syntax and follow aliases and internal re-exports; do
not use this search as an automatic deletion rule. Computed imports and untraceable indirection
must be flagged and left unchanged.

Decide per manifest:

- **Confirmed peer-only installation with no application/tooling use** — remove the entry only
  from this package's `dependencies` and/or `peerDependencies`.
- **Any direct use, including side-effect, dynamic, type-only, or CommonJS imports** — keep it.
- **Mocks, indirect use, or uncertain provenance** — `[FLAG]` for review and keep it.
- **Another workspace uses Koota** — preserve that workspace's manifest and code. Never run a
  root-level or recursive remove that would affect other packages.

**Out of scope:**
- A package that declares `koota` and imports it. Keep the dependency.
- Any transitive dependency on `koota` from a package other than `three-flatland`.
- `koota` declared in `devDependencies` for a tool the application runs itself.

### 3. Apply the transformation

Delete the `koota` entry from `dependencies` or `peerDependencies` in the manifests you judged in
scope. Change nothing else: preserve key order, indentation, and trailing-comma style exactly as the
file already has them.

```diff
  "dependencies": {
-   "koota": "^0.6.5",
    "three": "^0.185.1"
  }
```

Do not edit lockfiles. Tell the user to reinstall so their package manager updates the lockfile.

**Edge cases:**
- `koota` listed under both `dependencies` and `peerDependencies`: apply the same in-scope test once,
  and remove from both or neither.
- A version range pinned to something other than `^0.6.x`: the range does not affect the decision.
  Apply the same test.

### 4. Update related artifacts

Remove `koota` from install instructions in the application's own README or setup docs where those
instructions exist only to satisfy the old peer requirement. Leave CHANGELOG entries, migration
notes, and any historical record unchanged.

### 5. Do NOT touch

- `node_modules/`
- Build output directories
- Lockfiles
- This codemod artifact (the file you are reading)
- Any vendored copy of `three-flatland` source
- Application code that imports Koota

## Verification

Use the consumer's package manager (npm examples below), reinstall so the lockfile updates, then run the project's normal typecheck and tests:

```bash
npm install
npx tsc --noEmit
npm test
```

The migration is successful when the project's checks pass and each changed manifest has a
recorded peer-only decision. Kept entries may belong to application, tooling, or uncertain use.
Run the recipe a second time: it must produce no additional diff and report previously removed
entries as already migrated. The user or agent invokes the project's package manager from the
intended package directory (or with its exact workspace filter); never edit a lockfile by hand.

## Edge cases

- **A workspace where one package uses Koota and another does not**: remove the entry only from the
  manifest with a confirmed peer-only installation and no application or tooling use. Report both decisions.
- **Koota reached through a re-export from an internal shared package**: the importing package may
  have no literal `from 'koota'`. If a manifest declares `koota` and you cannot establish whether its
  source reaches Koota indirectly, FLAG it and leave the entry.
- **Dynamic import (`await import('koota')`)**: counts as use. Keep the dependency.
- **Mocks (`vi.mock('koota')`, `jest.mock('koota')`)**: FLAG for human review. A mock suggests the
  application exercises Koota somewhere, but the mock alone does not prove a runtime dependency.
- **`koota` in `devDependencies` only**: out of scope. The old requirement was a peer dependency.

## Related

- Codemod index: `codemods/README.md`
- Effect vector migration from the same release: `codemods/effect-vector-whole-tuple.md`
