# Rebase guide: `lighting-stochastic-adoption` → `main` + `fix-sprite-sort-regression`

**Authored:** 2026-05-19 (alongside the `fix-sprite-sort-regression` cherry-pick PR)

**For:** the developer rebasing `lighting-stochastic-adoption` after `fix-sprite-sort-regression` lands on `main`.

**TL;DR:**

- Most of the cherry-pick is **additive** (new files, new symlinks) — adopt as-is.
- Three file-level conflict zones to resolve carefully: `Sprite2D.ts` (anchor-in-matrix surgery), `index.ts` (barrel), and `package.json` (test script).
- One bonus fix to adopt: `skills/package.json` validate script (iterates over skills).

---

## What landed in `fix-sprite-sort-regression`

Beyond its core sprite-sort fixes (untouched here), the branch cherry-picked the following from the abandoned `feat/with-props-sync` work:

| Item                                                                       | Why it landed                                                                                                                                                                                         | Type                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `packages/three-flatland/src/observable/` (whole directory)                | Shared mutation-hook strategies for Color/Vector2/Vector3/Euler; `Sprite2D` and external extenders call `observable.color.attach(value, notify)` directly (the `WithPropsSync` installer was removed) | **New**                 |
| `skills/codemod/` (single skill with authoring + applying routing)         | Authoring + applying flow for breaking-change migrations                                                                                                                                              | **New**                 |
| `.claude/skills/codemod` (symlink to `../../skills/codemod`)               | Standard skills-package convention                                                                                                                                                                    | **New**                 |
| `planning/dirty-bits-unify-with-ecs.md`                                    | Direction doc for the future always-on-ECS work                                                                                                                                                       | **New**                 |
| `vitest.config.ts` typecheck block                                         | Enables `.test-d.ts` discovery                                                                                                                                                                        | **Additive**            |
| `package.json` `test` script `--typecheck` flag                            | Bundles type tests into the default `pnpm test` run                                                                                                                                                   | **Additive**            |
| `packages/three-flatland/src/index.ts` `export * from './observable'`      | Wires the new observable module into the barrel                                                                                                                                                       | **Additive**            |
| `packages/three-flatland/src/sprites/Sprite2D.ts` anchor-in-matrix surgery | Removes per-anchor-change geometry rebuild; bakes anchor offset into `updateMatrix` translation                                                                                                       | **Modifies existing**   |
| `skills/package.json` validate script fix                                  | `for d in */` loop instead of relying on glob-to-multi-arg                                                                                                                                            | **Bug fix in existing** |

---

## Adopt as-is (no conflict)

All of these are NEW files. They land cleanly on rebase; nothing to merge:

- `packages/three-flatland/src/observable/index.ts`
- `packages/three-flatland/src/observable/observable.test.ts`
- `skills/codemod/SKILL.md`
- `skills/codemod/artifact-template.md`
- `skills/codemod/dogfooding.md`
- `.claude/skills/codemod` (symlink)
- `planning/dirty-bits-unify-with-ecs.md`
- `planning/superpowers/plans/2026-05-19-rebase-lighting-onto-sprite-sort.md` (this file)

After rebase, verify `git status` shows these as part of `main` (no untracked, no modified).

---

## Conflict zone 1: `packages/three-flatland/src/sprites/Sprite2D.ts`

**Severity:** medium. Lighting adds ~574 lines; sprite-sort changes ~4 specific spots. The hunks don't directly overlap, but git may need help with context.

### What sprite-sort changed (and why)

Lighting's main branched from the same Sprite2D as sprite-sort, so the BEFORE state is shared. Sprite-sort applies these four surgical edits:

#### Edit 1 — `observeVector2(this._anchor, …)` callback

**Before (both branches):**

```ts
observeVector2(this._anchor, () => this.updateAnchor())
```

**After (sprite-sort):**

```ts
// Anchor mutation triggers a matrix recompose — `updateMatrix`
// bakes the anchor offset into the translation component, so the
// GPU sees the new offset on the next frame without any geometry
// rebuild. The empty callback exists to keep the observer wired
// (in case future code wants to react), but no work is needed
// since `updateMatrix` reads the current `_anchor` every frame.
observeVector2(this._anchor, () => {
  this.matrixWorldNeedsUpdate = true
})
```

**Resolution:** adopt sprite-sort's version verbatim. Lighting doesn't touch this line.

#### Edit 2 — `setAnchor(x, y)` body

**Before (both branches):**

```ts
setAnchor(x: number, y: number): this {
  this._anchor.set(x, y)
  this.updateAnchor()
  return this
}
```

**After (sprite-sort):**

```ts
setAnchor(x: number, y: number): this {
  this._anchor.set(x, y)
  return this
}
```

(With an updated JSDoc explaining anchor-in-matrix.)

**Resolution:** delete `this.updateAnchor()` line. Lighting doesn't touch this method.

#### Edit 3 — `private updateAnchor()` method (deleted entirely)

**Before (both branches):** ~22-line method that disposes the geometry, creates a new translated `PlaneGeometry`, reassigns it, calls `_setupInstanceAttributes`.

**After (sprite-sort):** the method is gone.

**Resolution:** delete the whole `updateAnchor()` method. Lighting doesn't touch it.

**Note:** the method's only callers are inside Sprite2D (the observeVector2 callback and setAnchor — both removed in edits 1 + 2). No external callers. If lighting added a new caller (unlikely, but check), remove that caller too.

#### Edit 4 — `override updateMatrix()` bakes anchor offset

**Before (both branches):**

```ts
override updateMatrix(): void {
  const te = this.matrix.elements
  const px = this.position.x
  const py = this.position.y
  const pz = this.position.z + this.layer * 10 + this.zIndex * 0.001
  const sx = this.scale.x
  const sy = this.scale.y
  // ... rest of fast 2D matrix compose
}
```

**After (sprite-sort):**

```ts
override updateMatrix(): void {
  const te = this.matrix.elements
  const sx = this.scale.x
  const sy = this.scale.y

  // Anchor offset baked into translation. Anchor (0.5, 0.5) ⇒
  // center ⇒ zero offset. Anchor (0, 1) ⇒ top-left ⇒ shifts the
  // quad +0.5*sx, -0.5*sy. Removes the per-anchor-change geometry
  // rebuild entirely; the unit PlaneGeometry never changes.
  const ax = (0.5 - this._anchor.x) * sx
  const ay = (0.5 - this._anchor.y) * sy
  const px = this.position.x + ax
  const py = this.position.y + ay
  const pz = this.position.z + this.layer * 10 + this.zIndex * 0.001
  // ... rest unchanged
}
```

**Resolution:** apply the 3 added lines (`ax`/`ay` + `px`/`py` with offsets) before `pz`. The rotation + matrix-element writes below are unchanged from main. Lighting may have touched lines below `updateMatrix` (its hunks include line 1034) — keep lighting's changes intact; only edit the position computation prelude.

### Verification after Sprite2D resolution

```bash
# After resolving Sprite2D.ts conflicts:
grep -n "updateAnchor\b" packages/three-flatland/src/sprites/Sprite2D.ts
# Expected: zero matches in source code (it's gone)

# Anchor offset arithmetic must be present in updateMatrix:
grep -n "0.5 - this._anchor" packages/three-flatland/src/sprites/Sprite2D.ts
# Expected: 2 lines (ax and ay computation)
```

---

## Conflict zone 2: `packages/three-flatland/src/index.ts`

**Severity:** low. Both branches APPEND to the barrel.

### What sprite-sort added

```ts
// Flatland
export * from './Flatland'

// Observable mutation strategies for three.js value types
export * from './observable'
```

(The `observable` export goes after `Flatland`.)

### What lighting added

Lighting adds ~25 lines of new exports (likely `debug`, `devtools`, `lighting`-related modules).

### Resolution

Take BOTH sets of exports. Order doesn't matter for a barrel file. Recommended layout:

```ts
// ... existing main-branch exports
// Flatland
export * from './Flatland'

// Observable mutation strategies for three.js value types  ← from sprite-sort
export * from './observable'

// ... lighting's new exports                              ← from lighting branch
```

### Verification

```bash
grep "export \* from './observable'" packages/three-flatland/src/index.ts
# Expected: 1 match

# Plus your lighting-specific exports — verify each is present
```

---

## Conflict zone 3: `vitest.config.ts`

**Severity:** low. Different sections of the config.

### What sprite-sort added

```ts
// At the end of `test: { ... }`:
typecheck: {
  include: [
    'packages/*/src/**/*.test-d.ts',
    'packages/*/src/**/*.test-d.tsx',
  ],
  exclude: ['packages/skia/**', 'packages/tweakpane/**', '**/node_modules/**'],
  tsconfig: './packages/three-flatland/tsconfig.json',
},
```

### What lighting changed

```ts
// In `test: { exclude: [...] }`:
exclude: ['packages/skia/**', 'packages/devtools/**', '**/node_modules/**'],
//                              ^^^^^^^^^^^^^^^^^^^^^ replaced `packages/tweakpane/**`
```

### Resolution

Adopt both:

- Keep lighting's new `exclude` value (`packages/devtools/**` instead of `packages/tweakpane/**`) in the main `exclude`
- Add sprite-sort's `typecheck` block
- **Update the `typecheck` block's `exclude` to also use the lighting convention** if needed — i.e., `'packages/devtools/**'` instead of `'packages/tweakpane/**'`

Final:

```ts
test: {
  // ...
  exclude: ['packages/skia/**', 'packages/devtools/**', '**/node_modules/**'],
  // ...
  typecheck: {
    include: [...],
    exclude: ['packages/skia/**', 'packages/devtools/**', '**/node_modules/**'],
    tsconfig: './packages/three-flatland/tsconfig.json',
  },
},
```

### Verification

```bash
pnpm test
# Expected: tests run AND type tests run (no "TypeScript errors" missing line)
```

---

## Conflict zone 4: `package.json`

**Severity:** low. Different lines.

### What sprite-sort changed

```json
"test": "vitest --typecheck --run",
"test:watch": "vitest --typecheck",
```

### What lighting changed

- `dev` echo port (5173 → 4321)
- Adds `size:why`, `graph:*` scripts
- Modifies `pnpm.overrides` (adds `@three-flatland/slug`, `@three-flatland/devtools`; removes `@three-flatland/tweakpane`)
- Adds dev dependencies (`@three-flatland/normals`, `three-flatland`, etc.)

### Resolution

Take ALL changes from both branches. They're at non-overlapping line ranges. Specifically:

- Keep sprite-sort's `test` / `test:watch` script changes
- Keep lighting's dev port, graph scripts, pnpm.overrides changes, dev dependencies

### Verification

```bash
pnpm test          # should run with --typecheck (no "Type Errors" line missing)
pnpm dev           # should echo port 4321
pnpm graph         # lighting's graph script should work
```

---

## Bonus: `skills/package.json` validate script

**Severity:** low. Sprite-sort fixed a pre-existing tooling bug that lighting may not have hit yet.

### What sprite-sort changed

```diff
- "validate": "uvx --from skills-ref agentskills validate */ && tsx ../scripts/validate-skills.ts .",
+ "validate": "for d in */; do uvx --from skills-ref agentskills validate \"$d\" || exit 1; done && tsx ../scripts/validate-skills.ts .",
```

### Why

`agentskills validate` accepts ONE skill path. The `*/` glob expansion broke the moment a second skill was added to the package (the existing version worked by coincidence because `tsl/` was the only skill). With sprite-sort's `codemod/` addition, the script breaks. The loop fixes it.

### Resolution

Adopt sprite-sort's loop verbatim. Lighting likely doesn't touch `skills/package.json`.

### Verification

```bash
pnpm --filter=@three-flatland/skills test
# Expected: "Valid skill: codemod", "Valid skill: tsl", "✓ validated 2 skill(s)"
```

---

## Post-rebase verification

After resolving the four conflict zones, run the full sweep:

```bash
pnpm --filter=three-flatland typecheck        # 27 packages, all green
pnpm --filter=three-flatland lint              # clean
pnpm test                                      # all tests pass, type errors = 0
pnpm --filter=@three-flatland/skills test      # 2 valid skills
pnpm build                                     # 28 tasks, all successful
```

Then run the two affected demos:

```bash
pnpm dev
# Open http://localhost:4321/animation        — knightmark animation runs at 12 fps, no float
# Open http://localhost:4321/batch-demo       — tiles render, shadows correct, trees scale right
```

If knightmark animation looks stuck on one frame, or tiles don't render: revisit conflict zone 1 (Sprite2D anchor-in-matrix). Specifically, verify the anchor offset is applied IN ADDITION to your lighting-related transform work — both must contribute to the matrix.

---

## Why we're confident this rebase is safe

1. **Anchor was already buggy on `main`** — `updateAnchor()` rebuilds geometry on every `_anchor.x = ...` mutation, which is expensive AND wrong (anchor is a transform concern, not a shape concern). Sprite-sort's surgery removes the bug; lighting inherits the fix.

2. **No public API changes.** `setAnchor(x, y)` still works the same from the caller's perspective. `sprite.anchor` is still a `Vector2`. Mutating `sprite.anchor.x` still produces the right visual result, just via a cheaper code path.

3. **Type tests now run via `pnpm test`.** Lighting's existing tests gain a typecheck pass automatically, so the rebase actually adds verification coverage rather than reducing it.

4. **Observable utility is unused but available.** Lighting's existing code doesn't need it. It's there for the always-on-ECS work that comes later.

5. **The codemod skill is independent of any specific codemod.** No `sprite2d-setframe-removal.md` artifact ships yet (parked for the always-on-ECS PR that actually removes `setFrame`). The skill exists; consumers can use it when codemods do ship.

---

## What's NOT in this PR (intentionally parked)

- `setFrame` removal — depends on always-on-ECS resolving the synchronous-setter contract. Codemod authored but not shipped.
- WithPropsSync reactive mixin (event-driven OR dirty-bit) — confirmed the wrong tool for Sprite2D's ECS-bridge case and since removed. Prop reactivity now goes through the shared `observable` strategies (`observable.color.attach(value, notify)`); the deeper ECS-bridge coordination pivots to always-on-ECS instead.
- Sprite2D's `texture`/`frame`/`material` reactive coordination — same reason.

See [`planning/dirty-bits-unify-with-ecs.md`](../../dirty-bits-unify-with-ecs.md) for the always-on-ECS roadmap. That's the next major refactor; this PR clears the runway.
