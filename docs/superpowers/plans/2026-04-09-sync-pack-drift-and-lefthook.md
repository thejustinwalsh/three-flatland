# sync-pack Drift Prevention + Lefthook Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm-workspace.yaml` and `packages/*/package.json` the permanent source of truth for all shared versions in `examples/**` and `minis/*`, and retire `simple-git-hooks` + `lint-staged` in favor of lefthook.

**Architecture:** Refactor `scripts/sync-pack.ts` to build a unified `{ name → version }` lookup from the catalog + internal workspace packages and overwrite any matching dep in examples/minis (including `peerDependencies`) regardless of its current value. Replace `simple-git-hooks` + `lint-staged` with a single `lefthook.yml` that preserves all existing pre-commit triggers and adds two new full-sync triggers (`pnpm-workspace.yaml` and `packages/*/package.json`). lefthook's `stage_fixed: true` handles re-staging files mutated outside the original glob.

**Tech Stack:** TypeScript, tsx (script runner), vitest (test runner), lefthook (git hook manager), pnpm workspaces.

**Reference spec:** `docs/superpowers/specs/2026-04-09-sync-pack-drift-design.md`

---

## Pre-work: context reading

Before starting Task 1, skim these files so you have the mental model:

- `docs/superpowers/specs/2026-04-09-sync-pack-drift-design.md` — the full spec this plan implements.
- `scripts/sync-pack.ts` — the script you're rewriting.
- `pnpm-workspace.yaml` — source of truth for third-party versions (catalog block).
- `package.json` (repo root) — contains current `simple-git-hooks`, `lint-staged`, and `prepare` entries you'll modify.
- `examples/react/tilemap/package.json` — representative example of the drift (`vite: ^6.0.7` vs catalog `^6.4.1`).
- `minis/breakout/package.json` — has unresolved `"catalog:"` in `peerDependencies`.

---

## Task 1: Enable scripts test coverage and expose sync-pack functions

**Purpose:** Prep work so the existing logic functions in `scripts/sync-pack.ts` can be imported by a vitest test file. No behavior changes — just `export` keywords, a main-module guard, and a vitest include update.

**Files:**
- Modify: `vitest.config.ts`
- Modify: `scripts/sync-pack.ts`

- [ ] **Step 1: Add scripts test pattern to vitest config**

Open `vitest.config.ts` and extend the `include` array to pick up `scripts/**/*.test.ts`.

Current:
```ts
include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
```

New:
```ts
include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx', 'scripts/**/*.test.ts'],
```

- [ ] **Step 2: Add `export` to the four logic functions in sync-pack.ts**

Add `export` in front of each of these function declarations in `scripts/sync-pack.ts`:

- `function parseCatalog(): Record<string, string>` (around line 20)
- `function getInternalVersions(): Record<string, string>` (around line 50)
- `function syncDeps(...)` (around line 90)
- `function checkDeps(...)` (around line 134)

Do not change the function bodies or signatures in this step.

- [ ] **Step 3: Wrap the CLI main block in a main-module guard**

The bottom of `scripts/sync-pack.ts` runs CLI logic at module load. After this task the file will be imported by tests, so the CLI must only run when invoked directly.

Add this import near the top of the file (after the existing `node:path` import):

```ts
import { fileURLToPath } from 'node:url'
```

Find the line `// Main` (around line 147) and wrap everything from that line through the end of the file in:

```ts
// Only run CLI when invoked directly, not when imported by tests
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // ...existing CLI code from `// Main` through end of file, unchanged...
}
```

Indent the wrapped block by one level. Preserve all `process.exit(...)` calls — they still work inside the guard.

- [ ] **Step 4: Verify the script still runs directly**

Run: `pnpm sync:pack:verify examples minis`
Expected: Either exits 0 (if somehow already clean) or exits 1 and prints an error about files having unresolved `catalog:` / `workspace:*` strings. **This step is a smoke test of the main-module guard, not of the new behavior.** Do not panic if it exits 1 — `minis/breakout/package.json` still has unresolved `catalog:` strings and the old `checkDeps` will flag them.

- [ ] **Step 5: Verify the existing test suite still passes**

Run: `pnpm test`
Expected: All existing tests pass. No new tests exist yet, so this is a regression check.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts scripts/sync-pack.ts
git commit -m "chore(sync-pack): expose logic functions and enable scripts test coverage"
```

---

## Task 2: Implement `buildVersionTable` helper

**Purpose:** Introduce the unified `{ name → version }` lookup. Pure function, easy to TDD. Catalog values pass through as-is; internal workspace package versions get `^` prepended.

**Files:**
- Create: `scripts/sync-pack.test.ts`
- Modify: `scripts/sync-pack.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/sync-pack.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { buildVersionTable } from './sync-pack'

describe('buildVersionTable', () => {
  it('merges catalog and internal entries', () => {
    const catalog = { three: '^0.183.1', react: '^19.0.0' }
    const internal = { 'three-flatland': '0.1.0-alpha.2' }
    const table = buildVersionTable(catalog, internal)
    expect(table).toEqual({
      three: '^0.183.1',
      react: '^19.0.0',
      'three-flatland': '^0.1.0-alpha.2',
    })
  })

  it('prefixes internal versions with ^', () => {
    const table = buildVersionTable({}, { pkg: '1.2.3' })
    expect(table.pkg).toBe('^1.2.3')
  })

  it('uses catalog values verbatim (they already include range prefix)', () => {
    const table = buildVersionTable({ a: '^1.0.0', b: '~2.0.0', c: '>=3.0.0' }, {})
    expect(table).toEqual({ a: '^1.0.0', b: '~2.0.0', c: '>=3.0.0' })
  })

  it('lets internal override catalog on name collision', () => {
    const table = buildVersionTable({ shared: '^1.0.0' }, { shared: '2.0.0' })
    expect(table.shared).toBe('^2.0.0')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test scripts/sync-pack.test.ts`
Expected: FAIL with an import error — `buildVersionTable` is not exported from `sync-pack.ts`.

- [ ] **Step 3: Implement `buildVersionTable`**

Add this function to `scripts/sync-pack.ts`, immediately after `getInternalVersions`:

```ts
// Build a unified {name → version} lookup from the catalog and internal
// workspace packages. Catalog values pass through verbatim (they already
// include a range prefix like ^). Internal workspace versions get ^ prepended.
// Internal wins on collision.
export function buildVersionTable(
  catalog: Record<string, string>,
  internal: Record<string, string>,
): Record<string, string> {
  const table: Record<string, string> = { ...catalog }
  for (const [name, version] of Object.entries(internal)) {
    table[name] = `^${version}`
  }
  return table
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test scripts/sync-pack.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-pack.ts scripts/sync-pack.test.ts
git commit -m "feat(sync-pack): add buildVersionTable helper"
```

---

## Task 3: Rewrite `syncDeps` to be table-driven and walk `peerDependencies`

**Purpose:** Change the core rewrite behavior. Old `syncDeps` only replaced literal `"catalog:"` / `"workspace:*"` strings. New `syncDeps` overwrites any dep whose name appears in the version table, regardless of the current value. This fixes the drift problem. Then wire the CLI to also walk `peerDependencies`.

**Files:**
- Modify: `scripts/sync-pack.test.ts`
- Modify: `scripts/sync-pack.ts`

- [ ] **Step 1: Write failing tests for the new `syncDeps`**

Append to `scripts/sync-pack.test.ts`:

```ts
import { syncDeps } from './sync-pack'

describe('syncDeps (table-driven)', () => {
  const table = {
    three: '^0.183.1',
    'three-flatland': '^0.1.0-alpha.2',
    react: '^19.0.0',
  }

  it('overwrites a stale pinned version', () => {
    const deps = { three: '^0.182.0', lodash: '^4.17.21' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(true)
    expect(deps).toEqual({ three: '^0.183.1', lodash: '^4.17.21' })
  })

  it('resolves the catalog: shorthand', () => {
    const deps = { three: 'catalog:' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(true)
    expect(deps.three).toBe('^0.183.1')
  })

  it('resolves the workspace:* shorthand', () => {
    const deps = { 'three-flatland': 'workspace:*' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(true)
    expect(deps['three-flatland']).toBe('^0.1.0-alpha.2')
  })

  it('leaves out-of-table deps alone', () => {
    const deps = { 'chart.js': '^4.4.0' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(false)
    expect(deps['chart.js']).toBe('^4.4.0')
  })

  it('returns false when every dep already matches the table', () => {
    const deps = { three: '^0.183.1', react: '^19.0.0' }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(false)
  })

  it('handles undefined deps object gracefully', () => {
    expect(syncDeps(undefined, table)).toBe(false)
  })

  it('mixes all behaviors in one call', () => {
    const deps = {
      three: '^0.182.0', // stale → overwrite
      react: 'catalog:', // shorthand → resolve
      'chart.js': '^4.4.0', // out-of-table → leave
      'three-flatland': '^0.1.0-alpha.2', // already matches → no-op
    }
    const changed = syncDeps(deps, table)
    expect(changed).toBe(true)
    expect(deps).toEqual({
      three: '^0.183.1',
      react: '^19.0.0',
      'chart.js': '^4.4.0',
      'three-flatland': '^0.1.0-alpha.2',
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/sync-pack.test.ts`
Expected: FAIL. The existing `syncDeps` signature is `(deps, catalog, internal, strict, filePath)` — calling it with `(deps, table)` will either misinterpret `table` as `catalog` and produce wrong results, or fail type checking. Either way, the new tests will fail.

- [ ] **Step 3: Replace the old `syncDeps` implementation**

In `scripts/sync-pack.ts`, replace the entire existing `syncDeps` function (which currently takes 5 parameters and handles strict mode) with:

```ts
// Overwrite any dep whose name is in the version table with the table value.
// Deps not in the table are left untouched. Returns true iff at least one
// value changed.
export function syncDeps(
  deps: Record<string, string> | undefined,
  table: Record<string, string>,
): boolean {
  if (!deps) return false
  let changed = false

  for (const [name, current] of Object.entries(deps)) {
    const target = table[name]
    if (target !== undefined && current !== target) {
      deps[name] = target
      changed = true
    }
  }

  return changed
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/sync-pack.test.ts`
Expected: PASS (all `buildVersionTable` tests + all `syncDeps` tests).

- [ ] **Step 5: Update the `--files` CLI branch to use the table and walk `peerDependencies`**

In `scripts/sync-pack.ts`, locate the `} else if (fileMode) {` branch. Make three surgical edits inside that branch body:

(a) Add one new line immediately after `let totalChanged = 0`:

```ts
const table = buildVersionTable(catalog, internal)
```

(b) Inside the `for (const file of files)` loop, delete the line `const relative = absPath.replace(ROOT + '/', '')` (the new implementation doesn't need `relative` for error messages since strict-mode warnings are gone).

(c) Replace the two existing `syncDeps(..., catalog, internal, true, relative)` calls with three table-based calls and update the change check:

Old (lines 227-233):
```ts
const depsChanged = syncDeps(pkg.dependencies, catalog, internal, true, relative)
const devDepsChanged = syncDeps(pkg.devDependencies, catalog, internal, true, relative)

if (depsChanged || devDepsChanged) {
  writeFileSync(absPath, JSON.stringify(pkg, null, 2) + '\n')
  totalChanged++
}
```

New:
```ts
const depsChanged = syncDeps(pkg.dependencies, table)
const devDepsChanged = syncDeps(pkg.devDependencies, table)
const peerDepsChanged = syncDeps(pkg.peerDependencies, table)

if (depsChanged || devDepsChanged || peerDepsChanged) {
  writeFileSync(absPath, JSON.stringify(pkg, null, 2) + '\n')
  totalChanged++
}
```

- [ ] **Step 6: Update the default (directory) CLI branch the same way**

In `scripts/sync-pack.ts`, locate the `} else {` directory-mode branch (right after the `} else if (fileMode) {` block, around line 239). Make three surgical edits inside that branch body:

(a) Replace the three header log lines:

Old (lines 240-243):
```ts
// Directory mode: walk directories (existing behavior)
console.log('Catalog versions:', catalog)
console.log('Internal versions:', internal)
console.log()
```

New:
```ts
// Directory mode: walk directories (existing behavior)
const table = buildVersionTable(catalog, internal)
console.log('Version table:', table)
console.log()
```

(b) Inside the inner `for (const pkgPath of packages)` loop, replace the two `syncDeps` calls:

Old (lines 263-264):
```ts
const depsChanged = syncDeps(pkg.dependencies, catalog, internal)
const devDepsChanged = syncDeps(pkg.devDependencies, catalog, internal)
```

New:
```ts
const depsChanged = syncDeps(pkg.dependencies, table)
const devDepsChanged = syncDeps(pkg.devDependencies, table)
const peerDepsChanged = syncDeps(pkg.peerDependencies, table)
```

(c) Update the change check on the following line:

Old:
```ts
if (depsChanged || devDepsChanged) {
```

New:
```ts
if (depsChanged || devDepsChanged || peerDepsChanged) {
```

Leave the `✓ Updated` / `(no changes)` log lines as-is.

- [ ] **Step 7: Run the full test suite to verify nothing regressed**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 8: Smoke-test the script end-to-end against real examples**

Run: `pnpm sync:pack examples minis`
Expected: Prints version table, scans `examples/` and `minis/`, and reports updates for every example that currently pins `"vite": "^6.0.7"` (18 files) plus `minis/breakout/package.json` (peer deps). Do **not** commit the resulting file changes yet — they're handled by Task 6's cleanup commit.

- [ ] **Step 9: Revert the uncommitted example/mini updates**

Run: `git checkout -- examples minis`
Expected: The script's file changes are discarded; only `scripts/sync-pack.ts` and `scripts/sync-pack.test.ts` remain modified.

- [ ] **Step 10: Commit**

```bash
git add scripts/sync-pack.ts scripts/sync-pack.test.ts
git commit -m "feat(sync-pack): rewrite syncDeps as table-driven, walk peerDependencies"
```

---

## Task 4: Rewrite `checkDeps` for drift reporting in `--verify` mode

**Purpose:** Old `--verify` only flagged unresolved `catalog:` / `workspace:*` strings — it would pass cleanly even when pinned versions drifted from the catalog. New `--verify` compares every in-table dep against the table value and reports mismatches. Also walks `peerDependencies`.

**Files:**
- Modify: `scripts/sync-pack.test.ts`
- Modify: `scripts/sync-pack.ts`

- [ ] **Step 1: Write failing tests for the new `checkDeps`**

Append to `scripts/sync-pack.test.ts`:

```ts
import { checkDeps } from './sync-pack'

describe('checkDeps (drift detection)', () => {
  const table = {
    three: '^0.183.1',
    'three-flatland': '^0.1.0-alpha.2',
  }

  it('returns no issues when every in-table dep matches', () => {
    const deps = { three: '^0.183.1', 'three-flatland': '^0.1.0-alpha.2', lodash: '^4.17.21' }
    expect(checkDeps(deps, table)).toEqual([])
  })

  it('reports drift with expected and actual values', () => {
    const deps = { three: '^0.182.0' }
    const issues = checkDeps(deps, table)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('three')
    expect(issues[0]).toContain('^0.183.1')
    expect(issues[0]).toContain('^0.182.0')
  })

  it('reports unresolved catalog: as drift', () => {
    const deps = { three: 'catalog:' }
    const issues = checkDeps(deps, table)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('catalog:')
  })

  it('reports unresolved workspace:* as drift', () => {
    const deps = { 'three-flatland': 'workspace:*' }
    const issues = checkDeps(deps, table)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('workspace:*')
  })

  it('ignores out-of-table deps entirely', () => {
    const deps = { 'chart.js': '^4.4.0' }
    expect(checkDeps(deps, table)).toEqual([])
  })

  it('handles undefined deps object gracefully', () => {
    expect(checkDeps(undefined, table)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/sync-pack.test.ts`
Expected: FAIL. Current `checkDeps` signature is `(deps)` — a single parameter. The new tests call `checkDeps(deps, table)` and expect drift reporting, which the old implementation does not do.

- [ ] **Step 3: Replace the old `checkDeps` implementation**

In `scripts/sync-pack.ts`, replace the entire existing `checkDeps` function with:

```ts
// Check for drift: for each dep whose name is in the table, report a human
// readable string when the current value differs from the table value.
// Returns an empty array on a clean tree. Out-of-table deps are ignored.
export function checkDeps(
  deps: Record<string, string> | undefined,
  table: Record<string, string>,
): string[] {
  if (!deps) return []
  const issues: string[] = []

  for (const [name, current] of Object.entries(deps)) {
    const target = table[name]
    if (target !== undefined && current !== target) {
      issues.push(`  "${name}": expected "${target}", got "${current}"`)
    }
  }

  return issues
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/sync-pack.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the `--verify` CLI branch to use the table and walk `peerDependencies`**

In `scripts/sync-pack.ts`, locate the `if (verifyMode) {` branch. Make two surgical edits:

(a) Add one new line immediately after the opening comment (`// Verify mode: check for unresolved catalog:/workspace:* refs (used by CI)`). Update the comment too:

Old:
```ts
if (verifyMode) {
  // Verify mode: check for unresolved catalog:/workspace:* refs (used by CI)
  const dirs = args.slice(1)
```

New:
```ts
if (verifyMode) {
  // Verify mode: report drift between example/mini pins and the catalog + internal packages (used by CI)
  const table = buildVersionTable(catalog, internal)
  const dirs = args.slice(1)
```

(b) Inside the inner `for (const pkgPath of packages)` loop, replace the three existing `checkDeps`-and-merge lines:

Old:
```ts
const depsIssues = checkDeps(pkg.dependencies)
const devDepsIssues = checkDeps(pkg.devDependencies)
const allIssues = [...depsIssues, ...devDepsIssues]
```

New:
```ts
const depsIssues = checkDeps(pkg.dependencies, table)
const devDepsIssues = checkDeps(pkg.devDependencies, table)
const peerDepsIssues = checkDeps(pkg.peerDependencies, table)
const allIssues = [...depsIssues, ...devDepsIssues, ...peerDepsIssues]
```

Leave the `totalOutOfSync` counter, the per-file output block, and the final `Run 'pnpm sync:pack ...'` error message unchanged — they still work.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Smoke-test `--verify` against the current tree**

Run: `pnpm sync:pack:verify examples minis`
Expected: Exits non-zero and prints drift entries — at least 18 `"vite"` drift lines (examples pinned to `^6.0.7`, catalog at `^6.4.1`) plus the unresolved `catalog:` entries in `minis/breakout/package.json`'s `peerDependencies`. This output **confirms the verify mode now detects the drift the spec's problem statement identifies**.

- [ ] **Step 8: Commit**

```bash
git add scripts/sync-pack.ts scripts/sync-pack.test.ts
git commit -m "feat(sync-pack): rewrite checkDeps to report drift in --verify mode"
```

---

## Task 5: Migrate pre-commit hooks from simple-git-hooks + lint-staged to lefthook

**Purpose:** Replace the current hook stack with lefthook. `stage_fixed: true` is the mechanism that makes the new full-sync triggers safe. Preserve all existing hook behavior (sync-react-subpaths, check-skia-pin, per-file sync-pack), then add the two new full-sync triggers.

**Files:**
- Create: `lefthook.yml`
- Modify: `package.json`

- [ ] **Step 1: Install lefthook and remove the old hook tools with scripts disabled**

`--ignore-scripts` is required here because the current `prepare` script runs `simple-git-hooks`. During the transition the prepare script will briefly reference tools that aren't installed; the flag avoids running `prepare` until we're ready.

Run:
```bash
pnpm remove --ignore-scripts simple-git-hooks lint-staged
pnpm add --ignore-scripts -D lefthook
```

Expected: `lefthook` appears in `package.json` `devDependencies`; `simple-git-hooks` and `lint-staged` are removed from the same block. No `prepare` script errors during install.

- [ ] **Step 2: Update the `prepare` script**

Open `package.json` and change:

```json
"prepare": "simple-git-hooks"
```

to:

```json
"prepare": "lefthook install"
```

- [ ] **Step 3: Remove the `simple-git-hooks` and `lint-staged` config blocks**

Still in `package.json`, delete these two top-level blocks entirely:

```json
"simple-git-hooks": {
  "pre-commit": "pnpm lint-staged"
},
"lint-staged": {
  "packages/three-flatland/src/index.ts": "tsx scripts/sync-react-subpaths.ts",
  "packages/three-flatland/src/*/index.ts": "tsx scripts/sync-react-subpaths.ts",
  "packages/skia/src/ts/three/index.ts": "tsx scripts/sync-react-subpaths.ts",
  "examples/**/package.json": "tsx scripts/sync-pack.ts --files",
  "minis/**/package.json": "tsx scripts/sync-pack.ts --files",
  "packages/skia/third_party/skia": "tsx scripts/check-skia-pin.ts"
},
```

Fix any trailing-comma issues the deletion causes.

- [ ] **Step 4: Create `lefthook.yml` at the repo root**

Create a new file `lefthook.yml` with exactly this content:

```yaml
# Pre-commit hook configuration. Replaces the former simple-git-hooks +
# lint-staged combination. stage_fixed: true re-stages files that a command
# mutates, which is essential for the sync-pack-full triggers that may edit
# files under examples/** and minis/* that were never in the original glob.
pre-commit:
  parallel: false
  commands:
    sync-pack-full:
      glob: "{pnpm-workspace.yaml,packages/*/package.json}"
      run: pnpm sync:pack examples minis
      stage_fixed: true
    sync-pack-files:
      glob: "{examples,minis}/**/package.json"
      run: tsx scripts/sync-pack.ts --files {staged_files}
      stage_fixed: true
    sync-react-subpaths:
      glob: "{packages/three-flatland/src/index.ts,packages/three-flatland/src/*/index.ts,packages/skia/src/ts/three/index.ts}"
      run: tsx scripts/sync-react-subpaths.ts
      stage_fixed: true
    check-skia-pin:
      glob: "packages/skia/third_party/skia"
      run: tsx scripts/check-skia-pin.ts
```

Why each field:
- `parallel: false` → deterministic ordering. `sync-pack-full` runs before `sync-pack-files` so combined commits (catalog bump + example edit) don't race.
- `stage_fixed: true` on every mutating command → lefthook re-stages any file the command touched, regardless of whether it was in the original glob. This is how catalog bumps propagate into the same commit.
- `check-skia-pin` omits `stage_fixed` intentionally — it's a verification-only script that doesn't mutate files.
- Brace expansion `{a,b,c}` is supported by lefthook's `gobwas/glob` matcher and preserves the semantics of the old multi-entry `lint-staged` patterns.

- [ ] **Step 5: Install the lefthook git-hook shims**

Now that `package.json` points `prepare` at `lefthook install` and the `lefthook` binary exists in `node_modules`, run the prepare script manually:

Run: `pnpm run prepare`
Expected: Prints something like `lefthook  v1.x.x  install …` and reports hooks installed. No errors.

- [ ] **Step 6: Verify the lefthook shim replaced the simple-git-hooks one**

Run: `head -5 .git/hooks/pre-commit`
Expected: The first few lines reference `lefthook` (not `simple-git-hooks`). If the file still references `simple-git-hooks`, delete it and re-run `pnpm run prepare`.

- [ ] **Step 7: Confirm the working tree only contains migration-related changes**

Run: `git status --short`
Expected: `lefthook.yml` (new), `package.json` (modified), `pnpm-lock.yaml` (modified). Nothing under `examples/` or `minis/` — those are handled in Task 6.

- [ ] **Step 8: Commit the migration**

```bash
git add lefthook.yml package.json pnpm-lock.yaml
git commit -m "chore: migrate pre-commit hooks from simple-git-hooks + lint-staged to lefthook"
```

Note: this commit runs through the new lefthook pre-commit hook. Only `package.json`, `lefthook.yml`, and `pnpm-lock.yaml` are staged; none match any of the configured globs (`pnpm-workspace.yaml`, `packages/*/package.json`, `{examples,minis}/**/package.json`, the sync-react globs, `packages/skia/third_party/skia`), so every command is skipped and the hook is a no-op. If the commit is blocked by an unexpected command, stop and investigate the glob match before forcing through.

---

## Task 6: One-time cleanup — heal existing drift

**Purpose:** Run the rewritten sync-pack against the current tree to fix the live drift. Separate commit so the propagation diff is isolated and reviewable.

**Files:**
- Modify: Many files under `examples/**/package.json` and `minis/*/package.json`

- [ ] **Step 1: Run the full sync**

Run: `pnpm sync:pack examples minis`
Expected: Prints the version table, then a per-file status. Every file that previously pinned `"vite": "^6.0.7"` gets updated to `"^6.4.1"`. `minis/breakout/package.json` has its `peerDependencies` rewritten from `"catalog:"` literals to concrete versions.

- [ ] **Step 2: Verify drift is gone**

Run: `pnpm sync:pack:verify examples minis`
Expected: Exits 0 with `Package versions are in sync.`

- [ ] **Step 3: Inspect the diff before committing**

Run: `git diff --stat examples minis`
Expected: ~18 example files modified (vite bump) plus `minis/breakout/package.json` (peerDependencies resolved). Spot-check two or three diffs:

```bash
git diff examples/react/tilemap/package.json
git diff minis/breakout/package.json
```

Both should show only expected-version changes. If any diff shows an unexpected field being touched (name, scripts, etc.), stop and investigate — the script may have a bug.

- [ ] **Step 4: Commit the cleanup**

```bash
git add examples minis
git commit -m "chore(examples): heal existing sync-pack drift

Propagates the catalog's vite ^6.4.1 bump across all examples and
resolves minis/breakout peerDependencies that were still stuck on
unresolved catalog: literals."
```

---

## Task 7: End-to-end hook verification

**Purpose:** Exercise the new hooks from a real `git commit` to confirm the re-staging flow works for the cases the spec promises. This is a hands-on verification task — no new code, but concrete commands and expected outputs.

**Files:**
- None (test-only; any accidental edits must be reverted)

- [ ] **Step 1: Catalog-only bump end-to-end test**

Create a tiny throwaway catalog edit to verify propagation:

```bash
# Edit pnpm-workspace.yaml to bump vite to a fake newer version
```

Open `pnpm-workspace.yaml` and change the `vite:` line from `^6.4.1` to `^6.4.2` (fake bump — safe because we'll revert).

```bash
git add pnpm-workspace.yaml
git commit -m "test: fake vite bump (will revert)"
```

Expected during the commit:
- lefthook runs `sync-pack-full` (the glob `{pnpm-workspace.yaml,packages/*/package.json}` matches).
- `sync-pack-full` rewrites every example/mini that depends on vite from `^6.4.1` to `^6.4.2`.
- `stage_fixed: true` re-stages those mutations.
- The final commit contains `pnpm-workspace.yaml` **and** all the propagated example/mini updates.

Verify by inspecting the commit:
```bash
git show --stat HEAD
```
Expected: `pnpm-workspace.yaml` + ~18 example files + `minis/breakout/package.json` (the pin update lands there too) all in the same commit.

- [ ] **Step 2: Revert the fake bump**

```bash
git reset --hard HEAD~1
```

Expected: Working tree back to the state after Task 6. `pnpm sync:pack:verify examples minis` still exits 0.

- [ ] **Step 3: Combined-commit test (catalog + example edit)**

Edit `pnpm-workspace.yaml` again — bump `typescript: ^5.7.3` to `typescript: ^5.7.4` (fake). In the same commit, add a trivial whitespace edit to `examples/react/tilemap/package.json` (e.g. reorder two keys, or add and remove a trailing newline — anything that shows as a staged change without breaking the JSON).

```bash
git add pnpm-workspace.yaml examples/react/tilemap/package.json
git commit -m "test: combined catalog + example edit (will revert)"
```

Expected:
- `sync-pack-full` runs first (due to `parallel: false` and declaration order), propagating `typescript` from `^5.7.3` to `^5.7.4` across all examples/minis that declare it — including `examples/react/tilemap/package.json`, which ends up containing both the user edit and the typescript bump.
- `sync-pack-files` runs second on the (now already-synced) tilemap file and finds no further changes. No double writes.
- The resulting commit contains `pnpm-workspace.yaml`, `examples/react/tilemap/package.json` (with both changes), and every other example/mini that the typescript bump touched.

Verify:
```bash
git show HEAD -- examples/react/tilemap/package.json
```
Expected: both your whitespace edit and the `typescript` version change in the same commit.

- [ ] **Step 4: Revert the combined test**

```bash
git reset --hard HEAD~1
```

- [ ] **Step 5: Existing-hooks regression test for sync-react-subpaths**

Touch one of the files covered by the sync-react glob with a no-op edit:

```bash
# Add then remove a trailing newline, or add a comment line and remove it.
# The point is to produce a staged change without altering generated output.
```

Open `packages/three-flatland/src/index.ts`, add a trailing blank line, save.

```bash
git add packages/three-flatland/src/index.ts
git commit -m "test: touch three-flatland/src/index.ts (will revert)"
```

Expected: lefthook runs `sync-react-subpaths`. If the generated files are already up to date, no extra files are added to the commit. If they aren't, the regenerated files are staged automatically via `stage_fixed: true`.

- [ ] **Step 6: Revert the regression test**

```bash
git reset --hard HEAD~1
```

- [ ] **Step 7: Final clean-state verification**

```bash
pnpm sync:pack:verify examples minis
git status --short
pnpm test
```

Expected:
- `sync:pack:verify` exits 0 (clean tree).
- `git status` shows no unintended modifications from the hook tests.
- `pnpm test` passes — all unit tests for sync-pack still green.

- [ ] **Step 8: Final commit (if none of the tests left artifacts)**

No commit needed — Task 7 is verification-only. If any artifacts remain in the working tree from a test that went sideways, investigate before discarding.

---

## Self-review checklist (for the implementer, not the plan author)

After Task 7 completes, the implementer should confirm:

1. `scripts/sync-pack.ts` exports `buildVersionTable`, `syncDeps`, `checkDeps`, `parseCatalog`, `getInternalVersions`.
2. `scripts/sync-pack.test.ts` exists and `pnpm test` runs it as part of the root suite.
3. `pnpm sync:pack examples minis` is idempotent: a second run immediately after the first produces zero file changes.
4. `pnpm sync:pack:verify examples minis` exits 0.
5. `lefthook.yml` exists at repo root; `.git/hooks/pre-commit` is a lefthook-managed shim.
6. `package.json` no longer contains `simple-git-hooks` or `lint-staged` in `devDependencies` or as top-level config blocks.
7. `lefthook` is listed in `devDependencies`.
8. `prepare` script reads `"lefthook install"`.
9. Every example that previously pinned `vite: ^6.4.1` now matches the catalog.
10. `minis/breakout/package.json` `peerDependencies` are concrete versions (no `catalog:` strings remain).
