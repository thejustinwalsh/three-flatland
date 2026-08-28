---
title: 'Koota is no longer a peer dependency'
slug: 'koota-peer-dependency-removal'
package: 'three-flatland'
version: 'next'
type: 'breaking'
audience: 'consumers'
---

# Koota is no longer a peer dependency

`three-flatland` used to require `koota` as a peer dependency, so applications installed it whether or
not they used it themselves. The renderer now uses a private entity runtime and does not import Koota
at all.

Koota remains a good choice for application and gameplay state. This codemod removes the dependency
only when it was installed to satisfy the old peer requirement, and leaves it in place when the
application uses it directly.

## Migration

| Before | After |
| --- | --- |
| `koota` in `dependencies`, unused in application source | entry removed |
| `koota` in `dependencies`, imported by application source | entry kept, unchanged |

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

For each manifest that declares `koota`, search that package's own source for direct Koota use:

```bash
rg -n "from ['\"]koota|require\(['\"]koota" --type ts --type tsx --type js --type jsx \
   --glob '!**/node_modules/**' --glob '!**/dist/**'
```

Decide per manifest:

- **Zero matches in that package's source** — the dependency existed only for the old peer
  requirement. In scope. Remove it.
- **One or more matches** — the application uses Koota directly. Out of scope. Leave the entry
  exactly as it is and report the manifest as skipped.

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

Reinstall so the lockfile updates, then run the project's normal typecheck and tests:

```bash
npm install
npx tsc --noEmit
npm test
```

The migration is successful when both pass and every remaining `koota` entry belongs to a package
whose own source imports it.

## Edge cases

- **A workspace where one package uses Koota and another does not**: remove the entry only from the
  manifest whose source has no import. Report both decisions.
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
