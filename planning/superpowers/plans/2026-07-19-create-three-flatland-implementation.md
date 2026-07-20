# `create-three-flatland` Implementation Plan

> **For agentic workers:** This plan is executed by a horde — parallel implementation agents under gates, with a lead orchestrating, diagnosing, reviewing, and owning the correctness floor. Use the `horde` skill for dispatch. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is a self-contained brief: an implementer sees only their own task plus the Global Constraints and Current-State Facts sections — copy those into every dispatch.

**Spec (authoritative):** `planning/superpowers/specs/2026-07-19-create-three-flatland-design.md` — every decision there is settled. This plan implements it; where the plan corrects the spec against code reality, the correction is called out explicitly in "Spec corrections."

**Goal:** `npm create three-flatland@latest my-game` produces a working, minimal, version-correct project (three.js or React flavor), with agent guidance, published skills, and four folded-in defect fixes.

**Architecture:** A new `packages/create-three-flatland/` package: a zero-runtime-dep bundled CLI (create-vite-compatible flags) plus two hand-authored templates that are also pnpm workspace members, kept version-fresh by `sync-pack` + the pre-commit hook + a CI verify, and validated by a per-PR scaffold smoke test that installs from packed tarballs.

**Tech Stack:** Node ≥ 20 ESM, tsdown (bundled CLI), `@clack/prompts` + `picocolors` (bundled devDeps), vitest, Vite templates, turbo, changesets (pre-mode `alpha`).

## Global Constraints

- **Repo:** `/Users/tjw/Developer/three-flatland/.claude/worktrees/pr-196-test-review-ebcd76`, branch `feat/create-three-flatland`. Do **not** rebase onto main mid-flight — rebase happens only after this work completes.
- Code style: no semicolons, single quotes, trailing commas where oxfmt puts them, 120-col (oxfmt). `type` keyword on type-only imports. Unused vars prefixed `_`. Run `pnpm format` on files you author.
- Conventional Commits. **Stage by exact path** — never `git add -A` / `git add .` / `git commit -a`.
- **No AI co-author trailers.** Plain commit messages, repo-configured identity.
- WebGPU + TSL only in template code: construct `WebGPURenderer` from `three/webgpu` (R3F: `@react-three/fiber/webgpu`). Never `WebGLRenderer`, GLSL, or `onBeforeCompile`.
- Examples-in-pairs rule applies to templates: three.js + React land together or not at all.
- **Hooks do not fire in this worktree.** This branch still has `lefthook.yml`, and lefthook cannot install/run in linked git worktrees (that is what upstream commit `1879b5ff` fixes). Every sync the hook would do must be run **manually** before committing: `pnpm sync:pack …`, `pnpm install --lockfile-only`, and verified with the matching `--verify` script. The lead re-verifies at every gate.
- Iron law: tech debt found while working is fixed in the same change, unless a named branch/PR/issue already owns it (then cross-reference).
- Changesets: CI auto-generates from `feat`/`fix` commits touching `packages/`. Hand-write only initial releases and packages outside `packages/` (`skills/`). Repo is in changesets **pre-mode, tag `alpha`**.

## Current-State Facts (verified against code, 2026-07-19)

Copy this section into every dispatch. Implementers must not re-derive these.

- `lefthook.yml` is live on this branch; `.githooks/pre-commit` exists only on `feat/nx-migration` / `ci/release-smoke-gate` (commit `1879b5ff`). Task 5 handles both states.
- `.github/workflows/build.yml` — the "Verify package versions" step (`pnpm sync:pack:verify examples minis`) is at ~line 57. CI order is **Lint → Typecheck → Build → Test**: typecheck runs before build.
- `turbo.json` `typecheck` task has **no `dependsOn`** — examples survive pre-build typecheck only because their tsconfigs carry `customConditions: ["source"]`, which is workspace-only wiring the templates must NOT have. Hence the per-template turbo `#typecheck` overrides in Task 2.
- `scripts/sync-pack.ts` modes: `pnpm sync:pack <dir>…` (walk), `--files <f>…`, `--verify <dir>…`. It rewrites `catalog:` and `workspace:*` (and stale ranges) in `dependencies`/`devDependencies`/`peerDependencies` from `pnpm-workspace.yaml` catalog + `packages/*/package.json` versions (top-level dirs only — nested template packages do not pollute the version table).
- Root `pnpm.overrides` maps `three-flatland` and every `@three-flatland/*` (incl. `skills`, `slug`, `devtools`) to `workspace:*`, so materialized real ranges in workspace members still link locally.
- `three-flatland@0.1.0-alpha.7`: dependencies `@three-flatland/bake`, `@three-flatland/normals`; **peers `koota` + `three`**; optional peers `react`, `@react-three/fiber`. Published exports carry a `source` condition pointing at `src/` which is **not** in the published tarball (`files: ["dist","codemods"]`) — any scaffolded tsconfig with `customConditions: ["source"]` breaks against the published package.
- Catalog pins that matter: `three ^0.183.1`, `@types/three ^0.183.1`, `typescript ^5.7.3`, `koota ^0.6.5`, `react ^19.2.0`, `react-dom ^19.2.0`, `@react-three/fiber 10.0.0-alpha.2` (exact pin, deliberate — see catalog comment), `@vitejs/plugin-react ^4.3.4`. Vite is **not** in the catalog (examples pin `^6.4.3` directly).
- `Flatland` API (`packages/three-flatland/src/Flatland.ts`): `new Flatland({ viewSize, clearColor, clearAlpha, postProcessing, aspect })`, `get camera(): OrthographicCamera` (line 405), `resize(width, height)` (line 1377), `render(renderer)`, `add()` routes `Sprite2D` into the **internal** `flatland.scene`/`spriteGroup` (line 490), not the outer graph.
- `Sprite2D`: `new Sprite2D({ texture, anchor: [0.5, 0.5] })`, `tint` (Color-backed), `hitTestMode: 'radius' | 'bounds' | 'alpha' | 'none'`, `raycast()` override against local Z=0 plane (Sprite2D.ts:1897). `TextureLoader.load(url)` is a static async method (see `examples/three/template/main.ts`).
- `packages/bake` dispatcher (`src/cli.ts`, `src/discovery.ts`, `src/types.ts`): discovery reads `flatland.bake: [{name, description, entry}]` from package.json across node_modules (pnpm-aware) + CWD package; the **entry module must default-export a `Baker`** (`{name, description, run(args): Promise<number>, usage?()}`). Registered today: `alphamap` (`alpha`), `normals` (`normal`), `image` (`encode`, private). `packages/slug/package.json` has `bin: {"slug-bake": "./dist/cli.js"}` and **no `flatland` field**.
- `packages/slug/src/cli.ts` is a **self-executing top-level script** (top-level `await`, `process.exit` calls) — pointing `flatland.bake` at it directly would run the CLI at import time inside the dispatcher. Task 8 wraps it instead of refactoring it.
- `packages/slug/tsdown.config.ts` has two configs: main (unbundled, excludes `src/cli.ts`) and a bundled CLI config (`alwaysBundle: ['@gltf-transform/core', 'opentype.js']`).
- Root `node_modules/.bin` has **no `slug-bake` entry** (verified) — the seed of the "`pnpm exec slug-bake` silently no-ops" report.
- `packages/skia` bin is `{"skia-wasm": "./bin/copy-wasm.mjs"}`; the script's usage comment names a `copy-wasm` subcommand the parser does not have (a positional would be eaten as target dir).
- `packages/slug/src/baked.ts:115` region: `bakedURLs()` emits a single `.slug.glb`. `planning/bake/loader-pattern.md` lines 20 and 97 still document `.slug.json` + `.slug.bin`.
- `skills/` package `@three-flatland/skills@0.1.0-alpha.2`, `files: ["*/", "README.md"]`, validate = `uvx --from skills-ref agentskills validate` per dir + `scripts/validate-skills.ts` (enforces frontmatter `name` == dirname and `description` starting "Use when"). README "Included skills" lists only `tsl`; `codemod` also ships. `.claude/skills/tsl` and `.claude/skills/codemod` are symlinks into `skills/`; `.claude/skills/flatland-r3f/` is a real directory with **no frontmatter** and a repo-internal path comment at SKILL.md line 291 (`// packages/react/src/types.ts`).
- Root vitest picks up `packages/*/src/**/*.test.ts` — new CLI tests are auto-included. CI `Test` step runs after `Build`.
- `.changeset/config.json`: `linked` groups exclude anything new; `ignore` lists every `example-*` package (private packages are still listed by convention). `pre.json` mode `alpha`.
- `smoke.yml` is a `workflow_call` workflow with one `smoke` job (Playwright example smoke). `release.yml` publishes via changesets action after CI success on main.
- Consumer-smoke via Verdaccio (`pnpm test:consumer`) exists **only on `feat/nx-migration`**, not on this branch — do not rebuild it here; Task 6 uses packed-tarball overrides instead and notes the future fold-in.

## Spec corrections (do not silently work around)

1. **"Workspace membership typechecks the templates against library *source*"** — cannot hold as written. That mechanism is `customConditions: ["source"]`, which is exactly the workspace-only leak the templates must not ship (it breaks scaffolded projects — the published `source` condition targets unpacked `src/`). Templates instead typecheck against the **built public types** via turbo `#typecheck` → `three-flatland#build` overrides (Task 2). This is strictly closer to consumer reality and still fails CI the day an API break lands. Layer-1's intent survives; its stated mechanism does not.
2. **React template pointer events "free from R3F raycasting"** is at risk as specced: `Flatland.add()` routes sprites into an internal scene and renders with its own orthographic camera, while R3F's event raycaster uses the Canvas default camera. The template therefore syncs the Canvas default camera to Flatland's view (see Task 2's `App.tsx`), and browser verification at Gate B is the decider. If events still miss, the lead resolves (fallback documented in Task 2) and records the deviation.
3. Minor: the spec cites `build.yml:58`; the step is at ~57 on this branch. Same step, cosmetic drift.

## Decisions on the spec's open items (made here, flag to stakeholder in the PR)

| Open item | Decision |
| --- | --- |
| Scaffold smoke per-PR vs release-only | **Per-PR.** The smoke installs from locally packed tarballs (`pnpm pack` + scaffolded `pnpm.overrides` `file:` entries), so it needs no registry state and cannot deadlock on the release-version PR (a registry install of a just-bumped, not-yet-published `^0.1.0-alpha.N` would fail exactly when it matters). This also validates published-tarball contents (`files`, exports) — the actual layer-2 goal. When `feat/nx-migration`'s Verdaccio consumer-smoke merges, fold this into it (cross-reference: consumer-smoke registry redesign on that branch). |
| Starter sprite asset | Reuse the FL pixel-art `icon.svg` from `examples/react/template/icon.svg`, copied to each template's `public/sprite.svg`. The mark is the brand; no new asset authoring. |
| Hooks-merge sequencing | Not sequenced first (GitHub outage stalls it). Task 5 is dual-path: edits whichever hook file is live at execution time, and carries an explicit rebase translation table for the other state. |
| Repo root CLAUDE.md → AGENTS.md pair | **Deferred** — flagged as a stakeholder follow-up. Converting root guidance mid-flight collides with in-flight branches (`feat/nx-migration` edits CLAUDE.md). The routing map itself DOES land in root CLAUDE.md now (Task 10), which is what the spec requires ("the routing map … is the same content in both places"). |
| `@three-flatland/image` publishing | **Deferred** — a release-policy decision, not implementable here. Flagged in the PR body as the unlock for consumer-reachable KTX2. |
| create-vite upstream PR | **Follow-up after first npm publish** (can't upstream a customCommand for an unpublished package). The exact entry to propose is documented at the end of this plan. |

## File map

```
packages/create-three-flatland/
  package.json                 # name create-three-flatland, version 0.0.0, bin, files: ["dist","templates"]
  tsdown.config.ts             # single bundled entry, clack+picocolors alwaysBundle
  tsconfig.json
  src/index.ts                 # bin entry: argv parse, prompts, calls scaffold()
  src/scaffold.ts              # pure scaffolding core (testable, no prompts)
  src/scaffold.test.ts         # unit + integration tests incl. leak guards
  templates/three/             # _gitignore, index.html, package.json, tsconfig.json,
                               #   src/main.ts, public/sprite.svg, AGENTS.md, CLAUDE.md
  templates/react/             # _gitignore, index.html, package.json, tsconfig.json, vite.config.ts,
                               #   src/main.tsx, src/App.tsx, public/sprite.svg, AGENTS.md, CLAUDE.md
scripts/scaffold-smoke.ts      # pack → scaffold → file: overrides → install → vite build → assert
skills/flatland-r3f/SKILL.md   # promoted from .claude/skills/ (+ .claude symlink back)
skills/flatland-bake/SKILL.md  # new skill
Modified:
  pnpm-workspace.yaml            (+ packages/create-three-flatland/templates/*)
  turbo.json                     (+ 2 template #typecheck overrides)
  .changeset/config.json         (+ 2 template names in ignore)
  lefthook.yml OR .githooks/pre-commit   (templates dir in sync-pack steps)
  .github/workflows/build.yml    (templates dir in sync:pack:verify)
  .github/workflows/smoke.yml    (+ scaffold job)
  package.json                   (+ "test:scaffold" script)
  packages/slug/package.json     (+ flatland.bake, + @three-flatland/bake devDep)
  packages/slug/src/baker.ts     (new), packages/slug/tsdown.config.ts (+ baker entry)
  packages/skia/bin/copy-wasm.mjs        (usage comment fix)
  planning/bake/loader-pattern.md        (.slug.glb fix)
  skills/README.md               (included-skills list)
  CLAUDE.md                      (root: package routing map section)
  .changeset/create-three-flatland-initial.md, .changeset/skills-starter-kit.md  (hand-written)
```

## Orchestration shape (lead's runbook)

**Wave 1 — five parallel units, no cross-dependencies:**
- U1: Task 1 (CLI scaffolder)
- U2: Task 2 (both templates + workspace registration) — highest-risk unit, strongest agent
- U3: Task 7 (flatland-r3f promotion + skills README defect)
- U4: Task 8 (slug baker registration + bin investigation)
- U5: Task 9 (loader-pattern + copy-wasm doc fixes)

**Gate A (lead, after Wave 1):** `pnpm build` green; `pnpm typecheck` green; `pnpm lint` 0 errors; `pnpm test` green; `pnpm validate:skills` green; `pnpm sync:pack:verify examples minis packages/create-three-flatland/templates` green. Review each unit's diff before opening Wave 2.

**Gate A corrections made during execution (2026-07-19):**

- **The baker gate as originally written was wrong.** `node packages/bake/dist/cli.js --list` run from the *repo root* shows only `normal`, because discovery is cwd-relative — it walks `node_modules` upward from cwd, and at repo root only `@three-flatland/normals` is linked (via `three-flatland`'s dependency chain). `alpha` and `encode` don't appear either, and never did. Run it from a directory where slug is an actual dependency: `cd examples/three/slug-text && node ../../../packages/bake/dist/cli.js --list`. **And listing is not the gate** — the real proof is an end-to-end bake: `flatland-bake slug <font.ttf> --range ascii` must emit a `.slug.glb`. Verified passing (219 KB output, exit 0).
- **`pnpm install`'s exit code is not usable as a gate here.** The root `prepare` (`lefthook install`) fails on `core.hooksPath`, so install exits 1 even when dependency resolution fully succeeded. Check that deps linked, not the exit code.
- **Global Constraint #21 is wrong: hooks DO fire in this worktree.** The worktree-level `core.hooksPath` resolves to the absolute shared `.git/hooks`, which is lefthook-managed, so `sync:pack examples minis` runs on every commit here. Task 5's hook edit will therefore be genuinely exercised locally — do not skip local verification on the assumption that it can't be.
- Two `scaffold.test.ts` failures (`copies the {three,react} template…`, asserting `AGENTS.md`/`CLAUDE.md` at lines 40-41) are a **known cross-wave seam**: Task 3 creates those files in Wave 2. They must go green when U6 lands. Do not weaken the assertions.
- `packages/image/src/basisu-bench.test.ts` fails only under parallel load (7524 ms vs a 5 s bar); it passes standalone at ~4350 ms. Environmental, not ours — `packages/image` was untouched.

**Wave 2 — five parallel units:**
- U6: Task 3 (template AGENTS.md/CLAUDE.md — needs template dirs from Task 2)
- U7: Task 4 (scaffolder ↔ template integration tests — needs Tasks 1+2)
- U8: Task 5 (version-freshness wiring — needs template dir path final)
- U9: Task 6 (scaffold smoke script + CI job — needs Tasks 1+2)
- U10: Task 7b/10 (flatland-bake skill + root routing map — flatland-bake skill needs Tasks 8+9 landed so it documents `.slug.glb` and the `slug` subcommand truthfully)

**Gate B (lead, final):** the full Verification Matrix at the end of this plan, including live browser checks of both templates and a local run of `scripts/scaffold-smoke.ts`.

Commit as you go, atomic, staged by exact path. The lead owns conflict-free file partitioning: no two Wave-1 units touch the same file; in Wave 2 only the lead merges `package.json`/workflow edits if two units collide.

---

### Task 1: `create-three-flatland` CLI package

**Files:**
- Create: `packages/create-three-flatland/package.json`
- Create: `packages/create-three-flatland/tsconfig.json`
- Create: `packages/create-three-flatland/tsdown.config.ts`
- Create: `packages/create-three-flatland/src/scaffold.ts`
- Create: `packages/create-three-flatland/src/index.ts`
- Test: `packages/create-three-flatland/src/scaffold.test.ts`
- Create: `.changeset/create-three-flatland-initial.md`

**Interfaces:**
- Produces: `scaffold(options: ScaffoldOptions): ScaffoldResult` from `src/scaffold.ts` where
  `ScaffoldOptions = { targetDir: string; template: 'three' | 'react'; packageName: string; overwrite?: boolean; templatesRoot: string }` and
  `ScaffoldResult = { root: string; written: string[] }`. Task 4's integration tests and Task 6's smoke script consume the built bin `packages/create-three-flatland/dist/index.js`.
- CLI contract (create-vite-compatible, consumed by the eventual upstream PR): positional target dir; `--template <name>` / `-t`; `--overwrite`; `--help`/`-h`; **fully non-interactive when target dir and template are both supplied**; prompts (via `@clack/prompts`) only for what is missing.

- [ ] **Step 1: Package manifest + configs**

`packages/create-three-flatland/package.json`:

```json
{
  "name": "create-three-flatland",
  "version": "0.0.0",
  "description": "Scaffold a three-flatland project — minimal three.js or React starters for WebGPU 2D",
  "type": "module",
  "license": "MIT",
  "author": "Justin Walsh (https://thejustinwalsh.com)",
  "repository": {
    "type": "git",
    "url": "https://github.com/thejustinwalsh/three-flatland.git",
    "directory": "packages/create-three-flatland"
  },
  "keywords": ["three-flatland", "three", "webgpu", "create", "scaffold", "vite", "2d", "sprites"],
  "bin": {
    "create-three-flatland": "./dist/index.js"
  },
  "files": ["dist", "templates"],
  "engines": { "node": ">=20.19.0" },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "prepack": "rm -rf templates/three/dist templates/react/dist templates/three/.turbo templates/react/.turbo"
  },
  "devDependencies": {
    "@clack/prompts": "^0.11.0",
    "picocolors": "^1.1.1",
    "tsdown": "catalog:",
    "typescript": "catalog:"
  },
  "publishConfig": { "access": "public" }
}
```

Check the repo catalog first: if `tsdown`/`typescript` are `catalog:` entries in `pnpm-workspace.yaml`, use `catalog:`; otherwise copy the version another package (e.g. `packages/bake/package.json`) uses. `@clack/prompts` and `picocolors` are new devDeps — pick current stable versions from npm and add them **to the catalog** in `pnpm-workspace.yaml` only if another package will share them (they won't — keep them package-local, exact-file devDeps are fine since they're bundled).

`prepack` matters: templates are workspace members, so `templates/*/dist` and `.turbo` will exist locally from turbo builds; npm always excludes `node_modules` but not `dist`. Task 6's smoke asserts the tarball is clean.

`tsconfig.json` (match `packages/bake/tsconfig.json` shape — copy it and adjust): `module`/`moduleResolution` per repo norm, `strict`, `noEmit` false is irrelevant (tsdown builds), include `src`.

`tsdown.config.ts`:

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: false,
  clean: true,
  fixedExtension: false,
  // Zero runtime dependencies: bundle the interactive-prompt deps into dist.
  deps: { alwaysBundle: ['@clack/prompts', 'picocolors'] },
})
```

Confirm the bundled `dist/index.js` retains the `#!/usr/bin/env node` shebang from `src/index.ts` (slug's bundled `dist/cli.js` does — same pipeline).

- [ ] **Step 2: Write failing tests first**

`packages/create-three-flatland/src/scaffold.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scaffold, isValidPackageName, toValidPackageName, formatTargetDir, isEmptyDir } from './scaffold'

const TEMPLATES_ROOT = join(import.meta.dirname, '..', 'templates')

let work: string
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'ctf-'))
})
afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('name helpers', () => {
  it('validates npm package names', () => {
    expect(isValidPackageName('my-game')).toBe(true)
    expect(isValidPackageName('@scope/my-game')).toBe(true)
    expect(isValidPackageName('My Game')).toBe(false)
  })
  it('coerces invalid names', () => {
    expect(toValidPackageName('My Game!')).toBe('my-game-')
    expect(isValidPackageName(toValidPackageName('My Game!'))).toBe(true)
  })
  it('trims trailing slashes from target dirs', () => {
    expect(formatTargetDir('my-game/')).toBe('my-game')
  })
})

describe('scaffold', () => {
  for (const template of ['three', 'react'] as const) {
    it(`copies the ${template} template with the rename map applied`, () => {
      const root = join(work, 'app')
      scaffold({ targetDir: root, template, packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
      expect(existsSync(join(root, '.gitignore'))).toBe(true)
      expect(existsSync(join(root, '_gitignore'))).toBe(false)
      expect(existsSync(join(root, 'index.html'))).toBe(true)
      expect(existsSync(join(root, 'AGENTS.md'))).toBe(true)
      expect(existsSync(join(root, 'CLAUDE.md'))).toBe(true)
      expect(existsSync(join(root, 'public', 'sprite.svg'))).toBe(true)
    })

    it(`rewrites package.json name for ${template}`, () => {
      const root = join(work, 'app')
      scaffold({ targetDir: root, template, packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('my-game')
      expect(pkg.private).toBe(true)
      expect(pkg.version).toBe('0.0.0')
    })

    it(`emits no workspace-only wiring for ${template} (leak guard)`, () => {
      const root = join(work, 'app')
      scaffold({ targetDir: root, template, packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
      const banned = [
        'catalog:', 'workspace:*', 'workspace:^', 'customConditions', "conditions: ['source']",
        'TURBO_MFE_PORT', 'FL_DEVTOOLS', 'GemBackground', '@three-flatland/devtools', 'tweakpane',
      ]
      for (const file of walkFiles(root)) {
        const text = readFileSync(file, 'utf-8')
        for (const needle of banned) {
          expect(text, `${file} leaked "${needle}"`).not.toContain(needle)
        }
      }
    })

    it(`never copies node_modules, dist, or .turbo for ${template}`, () => {
      const root = join(work, 'app')
      scaffold({ targetDir: root, template, packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
      for (const dir of ['node_modules', 'dist', '.turbo']) {
        expect(existsSync(join(root, dir))).toBe(false)
      }
    })
  }

  it('refuses a non-empty target without overwrite', () => {
    const root = join(work, 'app')
    mkdirSync(root)
    writeFileSync(join(root, 'existing.txt'), 'x')
    expect(() =>
      scaffold({ targetDir: root, template: 'three', packageName: 'my-game', templatesRoot: TEMPLATES_ROOT })
    ).toThrow(/not empty/)
  })

  it('empties a non-empty target with overwrite, preserving .git', () => {
    const root = join(work, 'app')
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main')
    writeFileSync(join(root, 'stale.txt'), 'x')
    scaffold({ targetDir: root, template: 'three', packageName: 'my-game', overwrite: true, templatesRoot: TEMPLATES_ROOT })
    expect(existsSync(join(root, '.git', 'HEAD'))).toBe(true)
    expect(existsSync(join(root, 'stale.txt'))).toBe(false)
    expect(existsSync(join(root, 'index.html'))).toBe(true)
  })

  it('isEmptyDir treats .git-only dirs as empty', () => {
    const root = join(work, 'app')
    mkdirSync(join(root, '.git'), { recursive: true })
    expect(isEmptyDir(root)).toBe(true)
  })
})

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out
}
```

Note: the leak-guard and file-presence tests will only fully pass once Task 2's templates exist. Until then they fail on the missing `templates/` dir — that's the correct TDD state for Wave 1; Gate A runs after both tasks land. The name-helper and target-dir tests must pass standalone within this task (use a fixture mini-template under the test tmpdir if you want them green before Task 2 lands — do **not** commit fixtures that shadow real templates).

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run packages/create-three-flatland --root .`
Expected: FAIL — `scaffold` not defined.

- [ ] **Step 4: Implement `src/scaffold.ts`**

Pure, no prompts, no `process.exit` — mirrors create-vite's helpers:

```ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface ScaffoldOptions {
  targetDir: string
  template: 'three' | 'react'
  packageName: string
  overwrite?: boolean
  templatesRoot: string
}

export interface ScaffoldResult {
  root: string
  written: string[]
}

export const TEMPLATES = ['three', 'react'] as const

/** npm strips real dotfiles from tarballs — templates store them prefixed. */
const RENAME_FILES: Record<string, string> = {
  _gitignore: '.gitignore',
}

/** Workspace artifacts that must never reach a scaffolded project. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo'])

export function formatTargetDir(dir: string): string {
  return dir.trim().replace(/\/+$/g, '')
}

export function isValidPackageName(name: string): boolean {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(name)
}

export function toValidPackageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-')
}

export function isEmptyDir(dir: string): boolean {
  const files = readdirSync(dir)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function emptyDir(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git') continue
    rmSync(join(dir, entry), { recursive: true, force: true })
  }
}

function copyDir(src: string, dest: string, written: string[]): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    if (SKIP_DIRS.has(entry)) continue
    const srcPath = join(src, entry)
    const destName = RENAME_FILES[entry] ?? entry
    const destPath = join(dest, destName)
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, written)
    } else {
      copyFileSync(srcPath, destPath)
      written.push(destPath)
    }
  }
}

export function scaffold(options: ScaffoldOptions): ScaffoldResult {
  const root = resolve(options.targetDir)
  const templateDir = join(options.templatesRoot, options.template)
  if (!existsSync(templateDir)) {
    throw new Error(`unknown template "${options.template}" (expected one of: ${TEMPLATES.join(', ')})`)
  }

  if (existsSync(root)) {
    if (!isEmptyDir(root)) {
      if (!options.overwrite) throw new Error(`target directory "${root}" is not empty`)
      emptyDir(root)
    }
  } else {
    mkdirSync(root, { recursive: true })
  }

  const written: string[] = []
  copyDir(templateDir, root, written)

  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
  pkg.name = options.packageName
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  return { root, written }
}
```

- [ ] **Step 5: Implement `src/index.ts` (bin entry)**

```ts
#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync } from 'node:fs'
import * as prompts from '@clack/prompts'
import pc from 'picocolors'
import { TEMPLATES, formatTargetDir, isValidPackageName, scaffold, toValidPackageName } from './scaffold'

const HELP = `create-three-flatland — scaffold a three-flatland project

Usage: create-three-flatland [TARGET_DIR] [--template three|react] [--overwrite]

Options:
  -t, --template <name>   Template to use: ${TEMPLATES.join(' | ')}
  --overwrite             Empty a non-empty target directory (preserves .git)
  -h, --help              Show this help`

function pkgManagerFromUserAgent(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const ua = process.env.npm_config_user_agent ?? ''
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('bun')) return 'bun'
  return 'npm'
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      template: { type: 'string', short: 't' },
      overwrite: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(HELP)
    return 0
  }

  let targetDir = positionals[0] ? formatTargetDir(positionals[0]) : undefined
  let template = values.template

  // Vite interop contract: fully non-interactive when both are supplied.
  const interactive = targetDir === undefined || template === undefined || !TEMPLATES.includes(template as never)

  if (interactive) {
    prompts.intro(pc.bold('create-three-flatland'))
    if (targetDir === undefined) {
      const answer = await prompts.text({
        message: 'Project name:',
        placeholder: 'my-flatland-game',
        defaultValue: 'my-flatland-game',
      })
      if (prompts.isCancel(answer)) return cancelled()
      targetDir = formatTargetDir(answer)
    }
    if (template === undefined || !TEMPLATES.includes(template as never)) {
      if (template !== undefined) {
        prompts.log.warn(`"${template}" is not a valid template`)
      }
      const answer = await prompts.select({
        message: 'Select a template:',
        options: [
          { value: 'three', label: 'three.js', hint: 'plain Vite + three-flatland' },
          { value: 'react', label: 'React', hint: 'React Three Fiber + three-flatland' },
        ],
      })
      if (prompts.isCancel(answer)) return cancelled()
      template = answer
    }
  }

  const root = resolve(targetDir!)
  let packageName = basename(root)
  if (!isValidPackageName(packageName)) {
    if (interactive) {
      const answer = await prompts.text({
        message: 'Package name:',
        defaultValue: toValidPackageName(packageName),
        validate: (v) => (isValidPackageName(v) ? undefined : 'Invalid package.json name'),
      })
      if (prompts.isCancel(answer)) return cancelled()
      packageName = answer
    } else {
      packageName = toValidPackageName(packageName)
    }
  }

  let overwrite = values.overwrite ?? false
  if (interactive && existsSync(root) && readdirSync(root).some((f) => f !== '.git')) {
    const answer = await prompts.select({
      message: `Target directory "${targetDir}" is not empty. How should we proceed?`,
      options: [
        { value: 'cancel', label: 'Cancel' },
        { value: 'overwrite', label: 'Remove existing files and continue' },
        { value: 'ignore', label: 'Ignore files and continue' },
      ],
    })
    if (prompts.isCancel(answer) || answer === 'cancel') return cancelled()
    overwrite = answer === 'overwrite'
    if (answer === 'ignore') {
      // fall through: scaffold() throws on non-empty without overwrite, so bypass the check
      overwrite = false
    }
  }

  const templatesRoot = fileURLToPath(new URL('../templates', import.meta.url))
  const result = scaffold({
    targetDir: root,
    template: template as 'three' | 'react',
    packageName,
    overwrite,
    templatesRoot,
  })

  const pm = pkgManagerFromUserAgent()
  const cd = relative(process.cwd(), result.root)
  const lines = [`cd ${cd}`, pm === 'yarn' ? 'yarn' : `${pm} install`, pm === 'npm' ? 'npm run dev' : `${pm} dev`]
  if (interactive) {
    prompts.outro(`Done. Now run:\n\n${lines.map((l) => `  ${l}`).join('\n')}`)
  } else {
    console.log(`\nScaffolded ${template} template in ${result.root}\n\n${lines.map((l) => `  ${l}`).join('\n')}\n`)
  }
  return 0
}

function cancelled(): number {
  prompts.cancel('Cancelled.')
  return 1
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  }
)
```

Implementation note for the `ignore` branch: `scaffold()` as written throws on non-empty targets without `overwrite`. Add an `ignoreExisting?: boolean` to `ScaffoldOptions` that skips the emptiness check (create-vite's "ignore" semantics: copy over the top). Add a unit test for it.

Check `@clack/prompts`' current API surface against the installed version (use the `opensrc` skill if unsure) — the shapes above (`intro/outro/text/select/isCancel/cancel/log`) are the v0.x surface; adjust to reality, don't force the plan's spelling.

- [ ] **Step 6: Run the standalone tests**

Run: `pnpm install` (registers nothing new yet — workspace glob comes in Task 2, but pnpm must link the new devDeps; if pnpm refuses because the package isn't a workspace member yet, coordinate with the lead to land Task 2's `pnpm-workspace.yaml` line first — it is a one-line, conflict-free edit)
Run: `pnpm exec vitest run packages/create-three-flatland`
Expected: name-helper and target-dir tests PASS; template-dependent tests fail only on the missing `templates/` directory (Task 2).

- [ ] **Step 7: Build and hand-check the bin**

Run: `pnpm --filter create-three-flatland build && head -1 packages/create-three-flatland/dist/index.js`
Expected: build green; first line is the shebang.
Run: `node packages/create-three-flatland/dist/index.js --help`
Expected: the HELP text, exit 0.

- [ ] **Step 8: Hand-write the initial-release changeset**

`.changeset/create-three-flatland-initial.md`:

```md
---
'create-three-flatland': minor
---

Initial release: `npm create three-flatland@latest` scaffolds a minimal, version-correct
three-flatland project from hand-authored three.js and React templates. create-vite-compatible
flags (positional target dir, `--template three|react` / `-t`, `--overwrite`, non-interactive
when both are supplied).
```

- [ ] **Step 9: Format, lint, commit**

Run: `pnpm format && pnpm lint`
Then commit by exact path:

```bash
git add packages/create-three-flatland/package.json packages/create-three-flatland/tsconfig.json \
  packages/create-three-flatland/tsdown.config.ts packages/create-three-flatland/src/index.ts \
  packages/create-three-flatland/src/scaffold.ts packages/create-three-flatland/src/scaffold.test.ts \
  .changeset/create-three-flatland-initial.md
git commit -m "feat(create): add create-three-flatland scaffolder CLI"
```

---

### Task 2: The two templates + workspace registration

**Files:**
- Create: `packages/create-three-flatland/templates/three/{_gitignore,index.html,package.json,tsconfig.json,src/main.ts,public/sprite.svg}`
- Create: `packages/create-three-flatland/templates/react/{_gitignore,index.html,package.json,tsconfig.json,vite.config.ts,src/main.tsx,src/App.tsx,public/sprite.svg}`
- Modify: `pnpm-workspace.yaml` (packages list, ~line 8)
- Modify: `turbo.json` (typecheck overrides, near the `"typecheck"` task at ~line 118)
- Modify: `.changeset/config.json` (`ignore` array)
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces:**
- Produces: workspace packages `flatland-template-three` and `flatland-template-react` (both `private: true`, version `0.0.0`) whose dependency ranges are materialized real npm ranges after `sync:pack`. Task 1's copy machinery renames `_gitignore → .gitignore` and skips `node_modules`/`dist`/`.turbo`. Task 3 adds `AGENTS.md`/`CLAUDE.md` into these same dirs. Task 6 vite-builds scaffolds of these.
- Templates must contain **none** of: `resolve.conditions: ['source']`, `customConditions`, MFE `base`, `TURBO_MFE_PORT`, `FL_DEVTOOLS`, devtools/Tweakpane deps, `GemBackground`.

- [ ] **Step 1: Register the workspace glob**

In `pnpm-workspace.yaml`, add under `packages:` (after `- packages/*`):

```yaml
  - packages/create-three-flatland/templates/*
```

- [ ] **Step 2: Author `templates/three/`**

`package.json` — author with `catalog:`/`workspace:*`; Step 6 materializes them:

```json
{
  "name": "flatland-template-three",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "koota": "catalog:",
    "three": "catalog:",
    "three-flatland": "workspace:*"
  },
  "devDependencies": {
    "@three-flatland/skills": "workspace:*",
    "@types/three": "catalog:",
    "typescript": "catalog:",
    "vite": "^6.4.3"
  }
}
```

(`koota` is a required-but-easy-to-miss peer of `three-flatland` — spec mandates both templates declare it. `vite` is not in the catalog; pin to the examples' range. `@three-flatland/skills` is the spec's distribution mechanism for skills — a devDependency, not a copy.)

`_gitignore`:

```
node_modules
dist
*.local
.DS_Store
```

`tsconfig.json` — the examples' tsconfig **minus `customConditions`** (that key is workspace-only wiring; see Spec corrections #1):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

No `vite.config.ts` — the plain-three template needs none (maximally minimal, matching create-vite's vanilla templates).

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>three-flatland</title>
    <style>
      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #16191e;
      }
      #app {
        position: relative;
        width: 100%;
        height: 100%;
      }
      canvas {
        display: block;
      }
      #loader {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: #9aa4b2;
        font: 14px system-ui, sans-serif;
      }
      #fullscreen {
        position: absolute;
        top: 12px;
        right: 12px;
        padding: 6px 10px;
        border: 1px solid #2c3340;
        border-radius: 6px;
        background: transparent;
        color: #9aa4b2;
        font: 12px system-ui, sans-serif;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <div id="loader">Loading…</div>
      <button id="fullscreen" type="button">Fullscreen</button>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts` (~75 lines; verify each API call against `packages/three-flatland/src/Flatland.ts` and `src/sprites/Sprite2D.ts` before accepting divergence — `Flatland.resize(width, height)`, `get camera()`, `Sprite2D.raycast` all verified present):

```ts
import { WebGPURenderer } from 'three/webgpu'
import { Color, Raycaster, Vector2 } from 'three'
import { Flatland, Sprite2D, TextureLoader } from 'three-flatland'

/* HMR teardown state — without this, every dev save stacks another
 * renderer + animation loop. Dev-only: `import.meta.hot` is undefined in prod. */
let rafId = 0
let activeRenderer: WebGPURenderer | null = null

async function main() {
  const container = document.querySelector<HTMLDivElement>('#app')!

  // Flatland is the front door: it owns the orthographic camera,
  // sprite batching, resize, and disposal.
  const flatland = new Flatland({ viewSize: 400, clearColor: 0x16191e })

  // Always WebGPURenderer — it selects the backend itself (WebGPU where
  // supported, WebGL2 fallback where not). Never construct WebGLRenderer.
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  container.appendChild(renderer.domElement)

  await renderer.init()
  const texture = await TextureLoader.load('/sprite.svg')

  // Renderer + texture ready — drop the loading overlay.
  document.querySelector('#loader')?.remove()

  const sprite = new Sprite2D({ texture, anchor: [0.5, 0.5] })
  sprite.scale.set(150, 150, 1)
  flatland.add(sprite)

  // Pointer interactivity — a standard three.js Raycaster. Sprite2D
  // implements raycast() (see hitTestMode for radius/bounds/alpha/none).
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let hovered = false
  let pressed = false

  renderer.domElement.addEventListener('pointermove', (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(pointer, flatland.camera)
    hovered = raycaster.intersectObject(sprite).length > 0
  })
  renderer.domElement.addEventListener('pointerdown', () => {
    pressed = hovered
  })
  window.addEventListener('pointerup', () => {
    pressed = false
  })

  document.querySelector('#fullscreen')?.addEventListener('click', () => {
    void container.requestFullscreen()
  })

  const resize = () => {
    flatland.resize(container.clientWidth, container.clientHeight)
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', resize)
  resize()

  const idleTint = new Color(0xffffff)
  const hoverTint = new Color(0x47cca9)

  function animate() {
    rafId = requestAnimationFrame(animate)
    sprite.rotation.z += 0.005
    const target = pressed ? 130 : hovered ? 170 : 150
    const next = sprite.scale.x + (target - sprite.scale.x) * 0.15
    sprite.scale.set(next, next, 1)
    sprite.tint.lerp(hovered ? hoverTint : idleTint, 0.15)
    flatland.render(renderer)
  }
  animate()
}

void main()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (activeRenderer) {
      activeRenderer.dispose?.()
      activeRenderer.domElement.remove()
      activeRenderer = null
    }
  })
}
```

`public/sprite.svg`: copy `examples/react/template/icon.svg` verbatim (`cp examples/react/template/icon.svg packages/create-three-flatland/templates/three/public/sprite.svg`).

- [ ] **Step 3: Author `templates/react/`**

`package.json`:

```json
{
  "name": "flatland-template-react",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@react-three/fiber": "catalog:",
    "koota": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "three": "catalog:",
    "three-flatland": "workspace:*"
  },
  "devDependencies": {
    "@three-flatland/skills": "workspace:*",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@types/three": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "typescript": "catalog:",
    "vite": "^6.4.3"
  }
}
```

`_gitignore`: identical to the three template's.

`tsconfig.json`: the three template's plus `"jsx": "react-jsx"` in `compilerOptions`.

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

`index.html`: same skeleton as the three template but the body is:

```html
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
```

and the `<style>` block keeps only the `html, body` and `#root { width: 100%; height: 100%; position: relative; }` rules (loader + button are React-rendered).

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

`src/App.tsx` (~85 lines):

```tsx
import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import type { OrthographicCamera } from 'three'
import { Flatland, Sprite2D, TextureLoader } from 'three-flatland/react'

// R3F requires registration before Flatland classes appear as JSX elements.
extend({ Flatland, Sprite2D })

/**
 * Flatland renders with its own orthographic camera. Mirror its frustum onto
 * R3F's default camera so pointer events raycast in the same space Flatland
 * draws in.
 */
function SyncEventCamera({ flatland }: { flatland: React.RefObject<Flatland | null> }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)
  useEffect(() => {
    const source = flatland.current?.camera
    if (!source) return
    camera.copy(source)
    camera.updateProjectionMatrix()
  }, [camera, size, flatland])
  return null
}

function Scene() {
  // Suspends until the texture resolves — the Suspense fallback OUTSIDE the
  // Canvas renders a DOM loading overlay meanwhile.
  const texture = useLoader(TextureLoader, '/sprite.svg')
  const flatlandRef = useRef<Flatland>(null)
  const spriteRef = useRef<Sprite2D>(null)
  const { gl, size } = useThree()
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  // Flatland owns an internal scene + camera, so it renders manually.
  useFrame(() => {
    const sprite = spriteRef.current
    if (sprite) {
      sprite.rotation.z += 0.005
      const target = pressed ? 130 : hovered ? 170 : 150
      const next = sprite.scale.x + (target - sprite.scale.x) * 0.15
      sprite.scale.set(next, next, 1)
    }
    flatlandRef.current?.render(gl)
  })

  return (
    <>
      <SyncEventCamera flatland={flatlandRef} />
      <flatland ref={flatlandRef} viewSize={400} clearColor={0x16191e}>
        <sprite2D
          ref={spriteRef}
          texture={texture}
          anchor={[0.5, 0.5]}
          scale={[150, 150, 1]}
          tint={hovered ? '#47cca9' : '#ffffff'}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
        />
      </flatland>
    </>
  )
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Suspense fallback={<Loading />}>
        <Canvas renderer={{ antialias: false }}>
          <Scene />
        </Canvas>
      </Suspense>
      <button type="button" style={fullscreenStyle} onClick={() => void containerRef.current?.requestFullscreen()}>
        Fullscreen
      </button>
    </div>
  )
}

function Loading() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9aa4b2' }}>
      Loading…
    </div>
  )
}

const fullscreenStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  padding: '6px 10px',
  border: '1px solid #2c3340',
  borderRadius: 6,
  background: 'transparent',
  color: '#9aa4b2',
  font: '12px system-ui, sans-serif',
  cursor: 'pointer',
}
```

`public/sprite.svg`: same copy as the three template.

**Known risk (owned by this task, decided at Gate B):** whether R3F pointer events fire on a `<sprite2D>` routed into Flatland's internal scene, and whether `SyncEventCamera` is sufficient (the default R3F camera may need `<Canvas orthographic>` or `camera.copy` may need frustum-only assignment — `copy` on mismatched camera types will throw; if the default camera is a PerspectiveCamera, switch to `<Canvas orthographic>` so `copy` is ortho→ortho). If events cannot be made to fire through `<flatland>`, escalate to the lead with evidence; the documented fallback is R3F's `raycaster.camera` override or hoisting the sprite out of `<flatland>` with an explicit ortho Canvas camera (the `examples/react/template` proven pattern) — the latter deviates from the spec's `<flatland>` root and must be recorded as a deviation, not silently adopted.

- [ ] **Step 4: turbo typecheck ordering**

In `turbo.json`, next to the existing `"typecheck"` task, add:

```json
    "flatland-template-three#typecheck": {
      "dependsOn": ["three-flatland#build"],
      "outputs": []
    },
    "flatland-template-react#typecheck": {
      "dependsOn": ["three-flatland#build"],
      "outputs": []
    },
```

Rationale (copy into the commit body): templates deliberately omit `customConditions: ["source"]`, so their typecheck resolves `three-flatland`'s published `import` condition → `dist/index.d.ts`, which must exist. CI runs Typecheck before Build; the dependsOn makes turbo build the library (cached) first.

- [ ] **Step 5: changesets ignore**

In `.changeset/config.json` `ignore` array, add (keep the array's grouping style):

```json
    "flatland-template-three",
    "flatland-template-react"
```

- [ ] **Step 6: Install, materialize versions, verify**

```bash
pnpm install
pnpm sync:pack packages/create-three-flatland/templates
pnpm sync:pack:verify packages/create-three-flatland/templates
```

Expected: install links both templates (check `packages/create-three-flatland/templates/three/node_modules/three-flatland` is a symlink into `packages/three-flatland`); sync rewrites every `catalog:`/`workspace:*` to a real range (e.g. `three-flatland` → `^0.1.0-alpha.7`, `@three-flatland/skills` → `^0.1.0-alpha.2`, `koota` → `^0.6.5`); verify exits 0. Re-run `pnpm install` after sync so the lockfile matches the rewritten ranges (overrides keep them workspace-linked).

- [ ] **Step 7: Typecheck + build + run**

```bash
pnpm exec turbo run typecheck --filter=flatland-template-three --filter=flatland-template-react
pnpm exec turbo run build --filter=flatland-template-three --filter=flatland-template-react
```

Expected: both green (turbo builds `three-flatland` first). Fix real API mismatches in the template code (the plan's code is normative in structure, the source is normative in signatures — note any fix in your report).

- [ ] **Step 8: Format, commit**

```bash
pnpm format
git add pnpm-workspace.yaml turbo.json .changeset/config.json pnpm-lock.yaml \
  packages/create-three-flatland/templates
git commit -m "feat(create): hand-authored three + react starter templates as workspace packages"
```

(`git add` of the templates directory is by exact path — it is entirely new, nothing else can be swept in. Confirm with `git status` that no stray WIP files are staged.)

---

### Task 3: Template agent guidance — `AGENTS.md` + `CLAUDE.md`

**Files:**
- Create: `packages/create-three-flatland/templates/three/AGENTS.md`
- Create: `packages/create-three-flatland/templates/three/CLAUDE.md`
- Create: `packages/create-three-flatland/templates/react/AGENTS.md`
- Create: `packages/create-three-flatland/templates/react/CLAUDE.md`

**Interfaces:**
- Consumes: template dirs from Task 2. The spec's "Agent guidance" section (`planning/superpowers/specs/2026-07-19-create-three-flatland-design.md` lines 182–409) is the **content source of truth** — the sections below fix the structure and the load-bearing verbatim rules; pull the remaining prose (Skia vs Slug, baking, asset workflow, extension table) from the spec, tightened for a consumer README register (second person, no repo-internal paths, no monorepo references).
- Produces: files copied verbatim into every scaffolded project by Task 1's `scaffold()`.

- [ ] **Step 1: `CLAUDE.md` (both templates, identical, one line)**

```md
@AGENTS.md
```

- [ ] **Step 2: `AGENTS.md` structure (both templates)**

Required section order (the renderer rule near the top, per spec):

1. `# Agent guide — <project type>` + one-line framing ("This project was scaffolded by create-three-flatland.")
2. **Build & dev** — `npm install` / `npm run dev` / `npm run build` / `npm run preview` / `npm run typecheck` (plain npm spellings; users may use pnpm/yarn — say so in one line).
3. **The renderer rule** — verbatim, affirmative framing (spec lines 213–235). Must include, word-for-word in bold: **"Always construct `WebGPURenderer` and always write TSL. Never `WebGLRenderer`, never GLSL, never `onBeforeCompile`."** Followed by: `WebGPURenderer` owns backend selection itself (real WebGPU where supported, WebGL2 fallback where not; TSL compiles to both); "requires WebGPURenderer" is about which class you construct, not a hardware/browser requirement; never add a `WebGLRenderer` fallback path and never gate features on WebGPU detection; WebGL 1 is ignored entirely. State the rule affirmatively — do not enumerate unsupported paths beyond the bolded sentence (negative framing produces the bad inference).
4. **The opinionated default** — a `Flatland` root owns the orthographic camera, sprite batching, resize, and disposal; reach below it only for the low-level path. Include the template's own root pattern as the 5-line reference snippet (three: `new Flatland({ viewSize })` + `flatland.render(renderer)`; react: `extend({ Flatland, Sprite2D })` + `<flatland>` + manual `useFrame` render).
5. **Package routing map** — the exact table from the spec (lines 244–253), all ten publishable packages, plus the two follow-on paragraphs: never recommend `@three-flatland/image`/`schemas`/`io` (private, unpublished; KTX2 not consumer-reachable today), and the two calibration notes (`private: true` is not a "don't recommend" signal by itself — check the distribution channel; version numbers are not maturity signals).
6. **Skia vs Slug** — spec lines 267–295: different problems, one overlap (text), the mechanical rule (camera moves relative to text → Slug; static UI at known resolution → Skia), both follow the renderer rule, the two-WASM-builds note framed as an internal copy-step detail (`npx skia-wasm public/skia`, `--gl-only`/`--wgpu-only`) that is NOT a renderer choice, and the Vite-dev-is-zero-config / production-needs-copy+`wasmUrl` gotcha.
7. **Baking** — spec lines 297–329: nothing requires baking (probe → runtime generate → one dev-time warning → carry on); baking only moves cost from browser-runtime to build-time; every baker self-discovers via `flatland.bake` (`flatland-bake --list`); subcommands `alpha`, `normal`, `slug` (+ direct bins `slug-bake`, `flatland-atlas`); `skia-wasm` is an asset-copy step, not a baker; bake for production, always for fonts with a known glyph set (ASCII + Brotli ≈ 32 KB vs 724 KB and drops opentype.js from the bundle), and for textures under GPU memory pressure; don't bake procedurally-varied content or throwaway prototypes; `forceRuntime` is not a dev-iteration knob.
8. **Asset authoring workflow** — spec lines 331–376, with its framing rule applied throughout: state what the workflow **is**, never what tooling is absent. Tilemaps: LDtk and Tiled are the editors; `LDtkLoader`/`TiledLoader` read `.ldtk`/`.json`/`.tmj` natively. Atlases: `native | texturepacker | aseprite` all first-class, `detectAtlasFormat()` sniffs; the native format's `meta.animations` (frame-key references, explicit fps, optional events) is the upgrade path with `frameTags` fallback; conversion is bidirectional and round-trip safe.
9. **The VS Code extension** — spec lines 378–409: Flatland Tools, marketplace ID `three-flatland.fl-tools`, both marketplace URLs, `code --install-extension three-flatland.fl-tools`, VS Code `^1.94.0`, the by-intent table (Sprite Atlas editor on `*.png`, Merge Atlases…, Image Encoder + FL KTX2 Viewer, Normal Baker, ZzFX Editor + ▶ Play CodeLens). Do not mention `threeFlatland.wasmTest.open`. Offer CLI + extension as peer paths (CLI for repeatable/CI, extension for visual iteration), no platform caveats.
10. **Skills** — this project depends on `@three-flatland/skills` (devDependency). Wire skills up with `npx skills add thejustinwalsh/three-flatland` (or copy from `node_modules/@three-flatland/skills/` into `.claude/skills/`). Name the shipped skills: `tsl`, `codemod`, `flatland-r3f`, `flatland-bake`.
11. **Reference links** — `https://tjw.dev/three-flatland/` docs, and the llms files with the spec's explicit warning: `https://tjw.dev/three-flatland/llms.txt` (also `llms-full.txt`, `llms-small.txt`) — these are **not** at the origin root; `https://tjw.dev/llms.txt` 404s.

- [ ] **Step 3: Per-template deltas**

- `templates/three/AGENTS.md`: section 4 shows the imperative pattern; note the template hand-writes its loading overlay and raycasting (the React starter gets both nearly free — this asymmetry is real and shown deliberately).
- `templates/react/AGENTS.md`: section 4 shows the `extend()`/JSX pattern; add the two R3F rules from the repo's conventions: classes must be registered with `extend()` before JSX use, and imports come from `three-flatland/react` / `@react-three/fiber/webgpu` (never bare `@react-three/fiber`). Point at the `flatland-r3f` skill for the full integration guide.

- [ ] **Step 4: Verify copy-through and register-check**

```bash
pnpm exec vitest run packages/create-three-flatland
```

Expected: Task 1's `AGENTS.md`/`CLAUDE.md` presence tests now PASS. Then self-review each AGENTS.md against the framing rule: grep them for "There is no", "not supported", "doesn't have" — each hit must be either one of the two sanctioned negatives (the bolded renderer sentence, the llms.txt 404 warning, the private-packages warning) or rewritten affirmatively.

- [ ] **Step 5: Commit**

```bash
git add packages/create-three-flatland/templates/three/AGENTS.md packages/create-three-flatland/templates/three/CLAUDE.md \
  packages/create-three-flatland/templates/react/AGENTS.md packages/create-three-flatland/templates/react/CLAUDE.md
git commit -m "feat(create): agent guidance (AGENTS.md + CLAUDE.md) in both templates"
```

---### Task 4: Scaffolder ↔ template integration tests (bin-level)

**Files:**
- Create: `packages/create-three-flatland/src/cli.test.ts`

**Interfaces:**
- Consumes: built `dist/index.js` from Task 1; templates from Task 2.

- [ ] **Step 1: Write the bin-contract tests**

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BIN = join(import.meta.dirname, '..', 'dist', 'index.js')
const hasDist = existsSync(BIN)

// Bin-level contract tests need the built CLI. `pnpm build` produces it; CI
// runs Test after Build. Locally, run `pnpm --filter create-three-flatland build` first.
describe.skipIf(!hasDist)('create-three-flatland bin (vite-interop contract)', () => {
  let work: string
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'ctf-bin-'))
  })
  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it('is fully non-interactive when target dir and template are both supplied', () => {
    // No TTY, no stdin — would hang or crash if it prompted.
    execFileSync(process.execPath, [BIN, 'my-game', '--template', 'three'], {
      cwd: work,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    })
    expect(existsSync(join(work, 'my-game', 'index.html'))).toBe(true)
    expect(existsSync(join(work, 'my-game', '.gitignore'))).toBe(true)
    const pkg = JSON.parse(readFileSync(join(work, 'my-game', 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('my-game')
  })

  it('honors -t alias and react template', () => {
    execFileSync(process.execPath, [BIN, 'my-app', '-t', 'react'], {
      cwd: work,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    })
    expect(existsSync(join(work, 'my-app', 'src', 'App.tsx'))).toBe(true)
  })

  it('fails loudly on a non-empty dir without --overwrite, succeeds with it', () => {
    execFileSync(process.execPath, [BIN, 'my-game', '--template', 'three'], { cwd: work, stdio: 'ignore', timeout: 15_000 })
    expect(() =>
      execFileSync(process.execPath, [BIN, 'my-game', '--template', 'three'], { cwd: work, stdio: 'pipe', timeout: 15_000 })
    ).toThrow()
    execFileSync(process.execPath, [BIN, 'my-game', '--template', 'three', '--overwrite'], {
      cwd: work,
      stdio: 'ignore',
      timeout: 15_000,
    })
    expect(existsSync(join(work, 'my-game', 'index.html'))).toBe(true)
  })

  it('coerces an invalid dir-derived package name non-interactively', () => {
    execFileSync(process.execPath, [BIN, 'My Game', '--template', 'three'], { cwd: work, stdio: 'ignore', timeout: 15_000 })
    const pkg = JSON.parse(readFileSync(join(work, 'My Game', 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('my-game')
  })
})
```

- [ ] **Step 2: Build, run, verify**

Run: `pnpm --filter create-three-flatland build && pnpm exec vitest run packages/create-three-flatland`
Expected: all PASS (including Task 1's suite).

- [ ] **Step 3: Commit**

```bash
git add packages/create-three-flatland/src/cli.test.ts
git commit -m "test(create): bin-level create-vite interop contract tests"
```

---

### Task 5: Version-freshness wiring (hooks + CI verify)

**Files:**
- Modify: `lefthook.yml` **or** `.githooks/pre-commit` — whichever exists at execution time (check first: `ls .githooks/pre-commit lefthook.yml`)
- Modify: `.github/workflows/build.yml` (~line 57, "Verify package versions")

**Interfaces:**
- Consumes: templates dir path `packages/create-three-flatland/templates` (Task 2).
- Produces: any commit that touches `pnpm-workspace.yaml` or `packages/*/package.json` (which includes `changeset version` bumps) re-materializes template dep ranges; CI fails red if a stale template ever lands.

- [ ] **Step 1: Hook edit — pre-merge state (`lefthook.yml` present, the current state of this branch)**

In `lefthook.yml`:

`sync-pack-full` (line 12–15) — extend run + add:

```yaml
    sync-pack-full:
      glob: "{pnpm-workspace.yaml,packages/*/package.json}"
      run: pnpm sync:pack examples minis packages/create-three-flatland/templates && git add examples minis packages/create-three-flatland/templates
      stage_fixed: true
```

`sync-pack-files` (line 16–19) — extend glob:

```yaml
    sync-pack-files:
      glob: "{examples/**/package.json,minis/**/package.json,packages/create-three-flatland/templates/**/package.json}"
      run: pnpm exec tsx scripts/sync-pack.ts --files {staged_files}
      stage_fixed: true
```

(Note the glob rewrite from `{examples,minis}/**/package.json` to an explicit list — brace alternation with a nested path needs the expanded form. Verify lefthook matches it: stage a scratch edit to a template package.json and run `pnpm exec lefthook run pre-commit` on a non-worktree checkout, or eyeball with `pnpm exec lefthook dump`.)

- [ ] **Step 1-alt: Hook edit — post-merge state (`.githooks/pre-commit` present)**

Step 1 of the script (the `sync:pack (examples minis)` block):

```bash
if match '^(pnpm-workspace\.yaml|packages/[^/]+/package\.json)$'; then
  echo "pre-commit: sync:pack (examples minis templates)"
  pnpm sync:pack examples minis packages/create-three-flatland/templates
  git add examples minis packages/create-three-flatland/templates
fi
```

Step 2's matcher:

```bash
PKG_FILES="$(matched '^(examples|minis|packages/create-three-flatland/templates)/.*/package\.json$')"
```

**If the hooks merge lands mid-flight** (the stuck PR merges while this branch is in progress): do nothing now — this branch rebases only after completion. At rebase time, `lefthook.yml` will conflict as deleted-upstream; resolve by dropping the lefthook edit and re-applying Step 1-alt to `.githooks/pre-commit`. Record this translation in the PR body so the rebaser doesn't lose it. (Same note applies if the rebase lands on nx: `turbo.json` template `#typecheck` overrides translate to `nx` keys in the template package.jsons.)

- [ ] **Step 2: CI verify**

In `.github/workflows/build.yml`, "Verify package versions" step:

```yaml
      - name: Verify package versions
        run: pnpm sync:pack:verify examples minis packages/create-three-flatland/templates
```

This is not optional (spec): hooks only run on local commits; this gate is what stops a CI-side version bump from publishing a stale template.

- [ ] **Step 3: Fire-drill verification (manual — hooks don't run in this worktree)**

```bash
# Simulate a release bump: temporarily edit packages/three-flatland/package.json version,
# run the hook's command by hand, confirm the templates move, then revert everything.
python3 - <<'EOF'
import json, pathlib
p = pathlib.Path('packages/three-flatland/package.json')
d = json.loads(p.read_text())
d['version'] = '0.1.0-alpha.99'
p.write_text(json.dumps(d, indent=2) + '\n')
EOF
pnpm sync:pack packages/create-three-flatland/templates
grep '"three-flatland"' packages/create-three-flatland/templates/*/package.json
git checkout -- packages/three-flatland/package.json packages/create-three-flatland/templates
pnpm sync:pack:verify examples minis packages/create-three-flatland/templates
```

Expected: grep shows `^0.1.0-alpha.99` in both templates mid-drill; final verify (after revert) exits 0.

- [ ] **Step 4: Commit**

```bash
git add lefthook.yml .github/workflows/build.yml   # or .githooks/pre-commit
git commit -m "build(create): propagate version bumps into starter templates via sync-pack hook + CI verify"
```

---

### Task 6: Scaffold smoke test (per-PR)

**Files:**
- Create: `scripts/scaffold-smoke.ts`
- Modify: `package.json` (root scripts: add `"test:scaffold": "tsx scripts/scaffold-smoke.ts"`)
- Modify: `.github/workflows/smoke.yml` (new job)

**Interfaces:**
- Consumes: built CLI `packages/create-three-flatland/dist/index.js`, built workspace packages (assumes `pnpm build` ran).
- Produces: the only layer that can catch a workspace-only field leaking into the published template (spec Validation layer 2), per-PR, registry-independent.

- [ ] **Step 1: Write `scripts/scaffold-smoke.ts`**

Shape (implement with `node:child_process` `execFileSync`, `node:fs`, `node:os`; ~150 lines; no new deps):

```ts
/**
 * Scaffold smoke — validation layer 2 for create-three-flatland.
 *
 * 1. `pnpm pack` every public workspace package (+ the CLI) into a scratch dir.
 *    pnpm pack materializes catalog:/workspace: refs, so tarballs match what
 *    a real publish ships.
 * 2. Assert the CLI tarball is clean: contains templates/*/_gitignore and
 *    AGENTS.md, contains NO templates/*/dist, node_modules, or .turbo entries.
 * 3. Run the built CLI non-interactively for each template into a temp dir.
 * 4. Inject pnpm.overrides mapping every packed package name → file:<tarball>
 *    into the scaffolded package.json (simulates installing the published set
 *    without needing the registry to hold unpublished versions).
 * 5. `pnpm install` (env COREPACK off, `--ignore-workspace`) then `pnpm run build`.
 * 6. Assert dist/index.html exists and the scaffolded tree contains none of the
 *    leak strings (same banned list as scaffold.test.ts — import it? No: this
 *    script must run standalone under tsx; duplicate the list with a comment
 *    pointing at scaffold.test.ts as the twin).
 * Exit non-zero with a readable diff of failures.
 */
```

Concrete requirements the implementation must hit:

- Enumerate public packages: read `packages/*/package.json`, skip `private: true`; also pack `packages/create-three-flatland` itself. Use `pnpm pack --pack-destination <scratch>` in each package dir; `packages/skia` may be slow — it's public, include it only if a template ever references it (they don't) → restrict the pack set to the transitive `@three-flatland`/`three-flatland` closure of the two template dependency lists (today: `three-flatland`, `@three-flatland/bake`, `@three-flatland/normals`, `@three-flatland/skills`, plus any deps those declare on other `@three-flatland/*` — compute the closure from the manifests, don't hardcode).
- Tarball inspection: `tar -tzf <cli-tarball>` and assert on entry paths.
- Scaffold: `execFileSync(process.execPath, [cliDist, 'smoke-app', '--template', template], { cwd: tmp })`.
- Overrides injection: read scaffolded `package.json`, set `pkg.pnpm = { overrides: { [name]: 'file:' + tarballPath } }` for each closure member, write back.
- Install/build: `pnpm install --ignore-workspace --no-frozen-lockfile` then `pnpm run build`, both with `cwd` = scaffold root and a scratch `XDG`/store dir if needed to avoid polluting the workspace store (acceptable to share the store — faster; decide by what works in CI).
- Run both templates; aggregate failures; always clean up temp dirs in `finally`.

- [ ] **Step 2: Root script + local run**

Add to root `package.json` scripts (alphabetical near `test:smoke`): `"test:scaffold": "tsx scripts/scaffold-smoke.ts"`.

Run: `pnpm build && pnpm test:scaffold`
Expected: `[scaffold-smoke] three: OK` and `[scaffold-smoke] react: OK`, exit 0. Budget: first run ~2–4 min (network for three/react/vite deps).

- [ ] **Step 3: CI job**

Append to `.github/workflows/smoke.yml` (sibling of the existing `smoke` job — it is `workflow_call`, the new job is picked up wherever smoke is invoked):

```yaml
  scaffold:
    name: Scaffold smoke (create-three-flatland)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          submodules: true
      - name: Install pnpm
        uses: pnpm/action-setup@v5
      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: lts/*
          cache: 'pnpm'
      - name: Setup Zig
        uses: mlugg/setup-zig@v2
        with:
          version: 0.15.1
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Cache Turbo
        uses: actions/cache@v5
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-current-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-current-
      - name: Build
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: pnpm build
      - name: Scaffold smoke
        run: pnpm test:scaffold
```

(Zig + the GITHUB_TOKEN env mirror build.yml because `pnpm build` includes skia; turbo cache makes it a cache hit in practice. If the closure computation excludes skia, this still needs the full build for `three-flatland` — keep the mirror.)

- [ ] **Step 4: Commit**

```bash
git add scripts/scaffold-smoke.ts package.json .github/workflows/smoke.yml
git commit -m "ci(create): per-PR scaffold smoke — pack, scaffold, install from tarballs, vite build"
```

Cross-reference in the commit body: fold into the Verdaccio consumer-smoke from `feat/nx-migration` when that branch merges (it owns registry-install testing).

---

### Task 7: Promote `flatland-r3f` into the published skills package (+ README defect)

**Files:**
- Move: `.claude/skills/flatland-r3f/SKILL.md` → `skills/flatland-r3f/SKILL.md`
- Create: symlink `.claude/skills/flatland-r3f` → `../../skills/flatland-r3f`
- Modify: `skills/flatland-r3f/SKILL.md` (frontmatter + line-291 leak)
- Modify: `skills/README.md` ("Included skills")

- [ ] **Step 1: Move + symlink (matching the tsl/codemod pattern)**

```bash
git mv .claude/skills/flatland-r3f skills/flatland-r3f
ln -s ../../skills/flatland-r3f .claude/skills/flatland-r3f
git add .claude/skills/flatland-r3f
```

- [ ] **Step 2: Add frontmatter**

Prepend to `skills/flatland-r3f/SKILL.md` (validator contract: `name` must equal the directory name; `description` must start "Use when"):

```yaml
---
name: flatland-r3f
description: Use when integrating three-flatland with React Three Fiber — registering classes with extend(), rendering sprites declaratively in JSX, Flatland child routing, post-processing via addEffect, resize/render wiring in useFrame/useThree, or avoiding imperative R3F anti-patterns
---
```

- [ ] **Step 3: Strip the repo-internal leak**

At (former) line 291, the code fence opens with `// packages/react/src/types.ts` — a repo-internal path (and a wrong one at that; the real file is `packages/three-flatland/src/react/types.ts`). Delete the comment line entirely; the fence's surrounding prose ("The `three-flatland/react` package includes type augmentation:") already carries the context. Scan the rest of the file for any other repo-internal path or monorepo reference — there should be none.

- [ ] **Step 4: Fix the README included-skills list (spec defect 4)**

In `skills/README.md`, replace the "Included skills" list with all four shipped skills (`codemod` ships today via `files: ["*/"]` and was never listed; `flatland-bake` is Task 7b — list it here in the same edit, its directory lands before this PR merges):

```md
## Included skills

- **tsl** — Use when writing TSL shaders, creating NodeMaterials, migrating GLSL to TSL, using compute shaders, working with `three/tsl` imports, or debugging shader node graphs.
- **codemod** — Use when authoring or applying three-flatland breaking-change codemods.
- **flatland-r3f** — Use when integrating three-flatland with React Three Fiber: `extend()` registration, declarative JSX sprites, Flatland routing, post-processing, anti-patterns.
- **flatland-bake** — Use when baking derived assets (alpha hitmasks, normal maps, Slug fonts) or deciding whether to bake at all: `flatland-bake` subcommands, direct bins, and the baked → runtime fallback contract.
```

(Match each description to the actual frontmatter of the skill it names — if Task 7b's final description differs, the lead reconciles at Gate B.)

- [ ] **Step 5: Validate + commit**

Run: `pnpm validate:skills`
Expected: every skill dir passes (`uvx` required — if unavailable locally, run `pnpm exec tsx scripts/validate-skills.ts skills` for the local half and note that CI runs the full validate).

```bash
git add skills/flatland-r3f/SKILL.md skills/README.md .claude/skills/flatland-r3f
git commit -m "feat(skills): promote flatland-r3f into the published package; list all shipped skills"
```

- [ ] **Step 6: Hand-write the skills changeset** (`skills/` is outside `packages/` — the generator never sees it)

`.changeset/skills-starter-kit.md`:

```md
---
'@three-flatland/skills': minor
---

Ship two new skills for the starter kit: `flatland-r3f` (React Three Fiber integration,
promoted from repo-internal guidance) and `flatland-bake` (bake decision rule, every
subcommand and bin, the baked → runtime fallback contract). README now lists every
included skill.
```

```bash
git add .changeset/skills-starter-kit.md
git commit -m "chore(skills): changeset for the starter-kit skills release"
```

---

### Task 7b: Author the `flatland-bake` skill

**Files:**
- Create: `skills/flatland-bake/SKILL.md`
- Create: symlink `.claude/skills/flatland-bake` → `../../skills/flatland-bake`

**Interfaces:**
- Consumes: Task 8 (slug registration — the skill documents the `slug` subcommand as registered) and Task 9 (`.slug.glb` is the documented format). Sequence after both.
- Content sources (read all before writing — "every CLI's flag set currently exists only in source"): `packages/bake/src/cli.ts` + `src/types.ts` + `src/discovery.ts`; `packages/alphamap/src/cli.ts`; `packages/normals/src/cli.ts`; `packages/image/src/cli.ts` (or equivalent — find the `encode` entry named by `packages/image/package.json`'s `flatland.bake` field); `packages/slug/src/cli.ts` (the full `--range`/`--stroke-*` flag set and named ranges ascii/latin/latin+); `packages/atlas`'s `flatland-atlas` bin source; `planning/bake/loader-pattern.md` (post-Task-9); `packages/bake/src/types.ts` `BakedAssetLoaderOptions.forceRuntime` doc comment (the authoritative forceRuntime framing — quote its intent, not its text).

- [ ] **Step 1: Write `skills/flatland-bake/SKILL.md`**

Frontmatter:

```yaml
---
name: flatland-bake
description: Use when baking derived assets for three-flatland (alpha hitmasks, normal maps, KTX2 encodes, Slug fonts, sprite atlases), deciding whether to bake at all, wiring the baked → runtime fallback, or authoring a new baker
---
```

Required sections (this is the structure; flag tables come from the sources above):

1. **The decision rule** (top of file, verbatim framing from the spec): nothing requires baking — loaders probe for a baked sibling, generate at runtime on a miss, warn once via `devtimeWarn` (suppressed in production), and continue. Baking moves the computation from browser-runtime to build-time; it chooses **where the cost lands**, never capability. Bake when shipping to production; always for fonts with a known glyph set (ASCII + Brotli ≈ 32 KB vs 724 KB, drops opentype.js from the bundle); for textures under GPU memory pressure. Don't bake procedurally-varied content or throwaway prototypes.
2. **`forceRuntime` is not a dev-iteration knob** — the default probe-then-generate path already handles iteration; `forceRuntime` commits to "the browser is always where generation happens for this asset" (procedural content, throwaway prototypes, bundles where sidecar bytes aren't worth it).
3. **Self-discovery** — `flatland-bake` discovers bakers from `flatland.bake` fields in installed packages' package.json; `flatland-bake --list` enumerates; every baker registers (a baker without registration is a bug, not a variant). Authoring a new baker: the `Baker` contract (`{name, description, run(args), usage?()}`, default-exported from the registered entry) with the registration JSON shape from `packages/bake/src/types.ts`.
4. **Subcommand reference** — one subsection per registered baker (`alpha`, `normal`, `encode`, `slug`) with the full flag table and 1–2 example invocations lifted from each CLI source. Note `encode` comes from a private package (present in this repo's workspace; consumers reach the same ground via the VS Code Image Encoder).
5. **Direct bins** — `slug-bake` (same flags as the `slug` subcommand) and `flatland-atlas` (standalone-only today); bins are conveniences on top of registration, never substitutes.
6. **`skia-wasm` is not a baker** — it copies WASM assets (`npx skia-wasm public/skia`, `--gl-only`/`--wgpu-only`); the name reads like a baker, it isn't one.
7. **The baked → runtime fallback contract** — sidecar naming (`.alpha.png`, normals sidecars, `.slug.glb` via `bakedURLs()`), the `flatland` tEXt-chunk hash stamp that invalidates stale bakes, and the load-order (probe → validate → generate on miss → warn once).

- [ ] **Step 2: Symlink, validate, commit**

```bash
ln -s ../../skills/flatland-bake .claude/skills/flatland-bake
pnpm validate:skills
git add skills/flatland-bake/SKILL.md .claude/skills/flatland-bake
git commit -m "feat(skills): flatland-bake skill — decision rule, subcommands, bins, fallback contract"
```

(The `@three-flatland/skills` changeset from Task 7 already covers this skill.)

---

### Task 8: Register the slug baker (spec defect 1) + `slug-bake` bin investigation

**Files:**
- Create: `packages/slug/src/baker.ts`
- Test: `packages/slug/src/baker.test.ts`
- Modify: `packages/slug/package.json` (add `flatland.bake`, add `@three-flatland/bake` devDependency)
- Modify: `packages/slug/tsdown.config.ts` (baker entry)

**Interfaces:**
- Consumes: `Baker` type from `@three-flatland/bake` (`packages/bake/src/types.ts`): `{name, description, run(args: string[]): Promise<number>, usage?(): string}`, default-exported.
- Constraint: `packages/slug/src/cli.ts` is self-executing at import (top-level await + `process.exit`) — the baker must **not** import it. Wrap via child process instead; the `slug-bake` bin stays untouched.
- Produces: `flatland-bake --list` shows `slug`; `flatland-bake slug <font.ttf> …` works identically to `slug-bake`.

- [ ] **Step 1: Write the failing tests**

`packages/slug/src/baker.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import baker from './baker'

describe('slug baker registration', () => {
  it('default-exports a Baker named slug', () => {
    expect(baker.name).toBe('slug')
    expect(typeof baker.run).toBe('function')
    expect(typeof baker.description).toBe('string')
    expect(baker.usage!()).toContain('slug-bake')
  })

  it('is registered in package.json flatland.bake pointing at the built entry', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8'))
    expect(pkg.flatland.bake).toEqual([
      {
        name: 'slug',
        description: expect.stringContaining('Slug'),
        entry: './dist/baker.js',
      },
    ])
  })
})
```

Run: `pnpm exec vitest run packages/slug/src/baker.test.ts` — Expected: FAIL (no `baker.ts`, no `flatland` field).

- [ ] **Step 2: Implement `packages/slug/src/baker.ts`**

```ts
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Baker } from '@three-flatland/bake'

const USAGE = `Usage:
  flatland-bake slug <font.ttf|.otf|.woff> [options]

Bakes a .slug.glb sidecar next to the font: glyph outlines pre-parsed and
packed for GPU rendering, so the runtime skips opentype.js entirely.

Same flags as the slug-bake bin — run \`flatland-bake slug --help\` for the
full set (--range ascii|latin|latin+|0x..-0x.., --output, --stroke-widths,
--stroke-join, --stroke-cap, --miter-limit).`

/**
 * The slug CLI (dist/cli.js) is a self-executing bin — importing it would run
 * it. Dispatch through a child process so the same entry serves both the
 * `slug-bake` bin and `flatland-bake slug`.
 */
const baker: Baker = {
  name: 'slug',
  description: 'Bake a .slug.glb font sidecar (pre-parsed glyphs, optional baked strokes)',
  usage() {
    return USAGE
  },
  run(args) {
    const cliPath = fileURLToPath(new URL('./cli.js', import.meta.url))
    return new Promise((resolvePromise) => {
      const child = spawn(process.execPath, [cliPath, ...args], { stdio: 'inherit' })
      child.on('close', (code) => resolvePromise(code ?? 1))
      child.on('error', () => resolvePromise(1))
    })
  },
}

export default baker
```

(`new URL('./cli.js', import.meta.url)` resolves in dist at runtime; in src during tests it resolves to a nonexistent path — fine, the tests don't invoke `run`.)

- [ ] **Step 3: Wire the manifest and build**

`packages/slug/package.json` — add after `"bin"`:

```json
  "flatland": {
    "bake": [
      {
        "name": "slug",
        "description": "Bake a .slug.glb font sidecar (pre-parsed glyphs, optional baked strokes)",
        "entry": "./dist/baker.js"
      }
    ]
  },
```

and add `"@three-flatland/bake": "workspace:*"` to `devDependencies` (type-only import, erased by `verbatimModuleSyntax` — no runtime edge, so not a dependency; note this in the commit body since `normals` carries it as a runtime dep for real runtime imports).

`packages/slug/tsdown.config.ts`: `src/baker.ts` matches the first (unbundled) config's `src/**/*.ts` glob already — verify `dist/baker.js` appears after build and imports nothing heavier than `node:` builtins. No config change should be needed; if the glob excludes it for any reason, add it explicitly.

- [ ] **Step 4: Verify end-to-end**

```bash
pnpm exec vitest run packages/slug/src/baker.test.ts        # PASS
pnpm --filter @three-flatland/slug build
pnpm --filter @three-flatland/bake build
node packages/bake/dist/cli.js --list
```

Expected: `slug` listed alongside `alpha`, `normal`, `encode` with the description above. Then a live bake through the dispatcher (use any small TTF, e.g. one under `examples/` or a system font copied to tmp):

```bash
node packages/bake/dist/cli.js slug /tmp/TestFont.ttf --range ascii
ls /tmp/TestFont.slug.glb
```

Expected: the `.slug.glb` sidecar exists; exit 0. Note: the dispatcher's help text (`packages/bake/src/cli.ts:23` and `:66`) names `@three-flatland/slug` as the example — **once registered it becomes true as written; do not edit it** (spec).

- [ ] **Step 5: `pnpm exec slug-bake` no-op investigation (timeboxed: 30 min)**

Verified starting evidence: root `node_modules/.bin` has no `slug-bake` entry. Hypotheses to test in order: (1) root package.json doesn't depend on `@three-flatland/slug`, so pnpm never links its bin at the root — `pnpm exec` from repo root then resolves nothing (but should error loudly, not no-op — check whether some other `slug-bake` shadows, and what `pnpm exec slug-bake --help; echo $?` actually does); (2) pnpm skips bin-stub creation when the bin target (`dist/cli.js`) didn't exist at install time — test by `rm -rf` + rebuild + `pnpm install` ordering in a scratch check. Outcome contract: if the cause is fixable in-repo (e.g. a missing devDependency edge from a package that legitimately invokes `slug-bake`, or an install-ordering note), fix it here; if it's inherent pnpm behavior for consumers-of-the-monorepo only (published consumers get dist in the tarball, so their bins link fine), document the finding in the Task's report and add one line to `packages/slug/README.md`'s bake section if it has one. Confirm it is NOT masking a discovery bug: `flatland-bake --list` from Step 4 already proves discovery works.

- [ ] **Step 6: Format, commit**

```bash
pnpm format
git add packages/slug/src/baker.ts packages/slug/src/baker.test.ts packages/slug/package.json \
  packages/slug/tsdown.config.ts pnpm-lock.yaml
git commit -m "fix(slug): register the slug baker for flatland-bake self-discovery"
```

(CI's changeset generator derives the `@three-flatland/slug` patch from this `fix(slug):` commit — do not hand-write one.)

---

### Task 9: Doc-defect fixes (spec defects 2 + 3)

**Files:**
- Modify: `planning/bake/loader-pattern.md` (lines 20, 97)
- Modify: `packages/skia/bin/copy-wasm.mjs` (usage comment, lines 3–20)

- [ ] **Step 1: `.slug.json`/`.slug.bin` → `.slug.glb`**

Ground truth: `packages/slug/src/baked.ts` `bakedURLs()` — `/fonts/Inter-Regular.ttf` → `/fonts/Inter-Regular.slug.glb` (single file). Fix line 20 (`SlugFontLoader` tries `.slug.json` + `.slug.bin`) and line 97 (the mapping example) to the single `.slug.glb`, and grep the whole file for any other `.slug.json`/`.slug.bin` mention:

```bash
grep -n "slug\.\(json\|bin\)" planning/bake/loader-pattern.md
```

Expected after edit: no matches.

- [ ] **Step 2: copy-wasm usage comment**

The script's parser takes only positionals + `--gl-only`/`--wgpu-only`; the bin name is `skia-wasm` (`packages/skia/package.json`). A `copy-wasm` token would be consumed as the target directory, writing WASM into `./copy-wasm/`. Replace the usage block:

```js
/**
 * Copy Skia WASM files to your project's public directory.
 *
 * Usage:
 *   npx skia-wasm [target-dir]
 *   npx skia-wasm public/wasm
 *   npx skia-wasm --gl-only public/wasm
 *   npx skia-wasm --wgpu-only public/wasm
 *
 * Default target: ./public/skia
 * ...(keep the bundler-config tail of the comment unchanged)
 */
```

Cross-check `packages/skia/README.md` still matches (spec says it is already correct — verify, don't touch if so).

- [ ] **Step 3: Commit (two commits — different release surfaces)**

```bash
git add planning/bake/loader-pattern.md
git commit -m "docs(bake): loader-pattern documents the real .slug.glb baked format"
git add packages/skia/bin/copy-wasm.mjs
git commit -m "fix(skia): copy-wasm usage comment matches the parser (no copy-wasm subcommand)"
```

(The `fix(skia):` commit yields an auto patch changeset — correct: the comment ships in the published bin.)

---

### Task 10: Root CLAUDE.md package routing map

**Files:**
- Modify: `CLAUDE.md` (repo root)

- [ ] **Step 1: Add the routing map section**

Insert a new section after "## Architecture" titled `## Package routing map (what to recommend to consumers)` containing: one framing line ("Same content ships in the starter templates' AGENTS.md — keep the two in sync when editing either"), the exact ten-row table from the spec (lines 244–253), the private-packages warning (`@three-flatland/image`/`schemas`/`io` are unpublished — never recommend installing; KTX2 is not consumer-reachable today), and the two calibration notes (private flag vs distribution channel — `tools/vscode` is correctly private while fully public via marketplace; version numbers are not maturity signals — `presets` at `0.1.0-alpha.7` via the changesets `linked` group, `schemas` at `1.0.0` never released).

Also add the matching cross-reference line to both template `AGENTS.md` files? **No** — scaffolded projects must not reference this repo's internals. The sync note lives on the repo side only.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: package routing map in root agent guidance (twin of the template AGENTS.md map)"
```

---

## Final gate — Verification Matrix (lead, Gate B)

Run in order; every line must be green before the branch is declared done:

- [ ] `pnpm install` — clean, lockfile stable (`git status` shows no unexpected drift)
- [ ] `pnpm build` — green (includes both templates' vite builds and the CLI)
- [ ] `pnpm typecheck` — green (template `#typecheck` overrides pull the library build first)
- [ ] `pnpm lint` && `pnpm format:check` — green
- [ ] `pnpm test` — green (scaffold unit + bin-contract + slug baker suites included)
- [ ] `pnpm sync:pack:verify examples minis packages/create-three-flatland/templates` — green
- [ ] `pnpm sync:react:verify`, `pnpm sync:versions:verify`, `pnpm gen:types:verify` — green (regression guard: nothing here should touch them)
- [ ] `node packages/bake/dist/cli.js --list` — shows `alpha`, `normal`, `encode`, `slug`
- [ ] `pnpm validate:skills` — green (4 skills)
- [ ] `pnpm test:scaffold` — both templates scaffold, install from tarballs, and `vite build` green; CLI tarball contains templates (`_gitignore`, `AGENTS.md`) and no `dist`/`node_modules`/`.turbo` entries
- [ ] `pnpm exec changeset status` — resolves without error (new package + hand-written changesets valid in pre-mode; if changesets pre-mode rejects the unknown `create-three-flatland`, add `"create-three-flatland": "0.0.0"` to `.changeset/pre.json` `initialVersions` and re-run)
- [ ] **Browser check, three template:** scaffold to a temp dir via the built CLI, `pnpm install` + `pnpm dev`, open it (Claude Browser / `vitexec` skill): loading overlay appears then clears; sprite renders and slowly rotates; hover scales up + tints cyan with a visible lerp; press scales down; fullscreen button works; window resize keeps the sprite centered and unstretched; console free of errors (the one acceptable warning class: devtime bake pointers)
- [ ] **Browser check, react template:** same checklist, plus: the Suspense fallback renders as a DOM overlay before the texture resolves; pointer events fire on the sprite **through** `<flatland>` (this is Spec-correction #2's decision point — if they do not, the lead executes the Task 2 fallback and records the deviation in the PR body)
- [ ] HMR sanity on both dev servers: edit a source line, confirm no stacked render loops (three template's dispose block works)
- [ ] Both template `AGENTS.md` files pass the framing-rule grep (Task 3 Step 4)
- [ ] Diff review: `git log --oneline main..HEAD` tells a clean conventional-commit story; `git diff main...HEAD --stat` touches nothing outside this plan's file map

## Follow-ups (PR body — not executed here)

1. **create-vite upstream PR** (after first npm publish): propose adding to create-vite's `FRAMEWORKS` array:
   ```ts
   {
     name: 'three-flatland',
     display: 'three-flatland',
     color: cyan,
     customCommand: 'npm create three-flatland@latest TARGET_DIR',
   }
   ```
   (Exact shape/placement per create-vite's contribution guide at PR time; our CLI already honors the contract — positional dir, `--template`/`-t`, `--overwrite`, non-interactive when fully specified, `_gitignore` rename.)
2. **`@three-flatland/image` publishing decision** (stakeholder): publishing would make KTX2 consumer-reachable and complete the Tier-1 texture dispatch story; until then the VS Code Image Encoder is the only consumer path.
3. **Root CLAUDE.md → AGENTS.md + `@AGENTS.md` pair** (stakeholder): deferred to avoid collision with in-flight branches editing CLAUDE.md.
4. **Fold `test:scaffold` into the Verdaccio consumer-smoke** when `feat/nx-migration` merges (that branch owns registry-install testing).
5. **Rebase translation table** (for whoever rebases this branch onto main): `lefthook.yml` edits → `.githooks/pre-commit` steps 1–2 (Task 5 Step 1-alt has the exact text) if the hooks merge landed; `turbo.json` template `#typecheck` overrides → package.json `nx` keys if the nx migration landed.

## Risks the lead should watch

1. **R3F events through `<flatland>`** (Spec correction #2) — highest-probability deviation; decided by evidence at Gate B, with a documented fallback and an explicit deviation record. Do not let an implementer silently ship broken hover.
2. **`@react-three/fiber` catalog pin is exact (`10.0.0-alpha.2`) for a canary-resolution reason** — the react template inherits the exact pin via `catalog:` → sync-pack. That is correct and deliberate; do not "fix" it to a caret.
3. **Tarball hygiene** — templates being workspace members means local `dist`/`node_modules` exist inside them; three independent guards (copyDir skip-list, `prepack` clean, smoke tarball assertion) must all land. If any one is dropped, the published tarball or local scaffolds get polluted.
4. **Worktree hook blindness** — nothing in this worktree runs pre-commit hooks; every "the hook will fix it" assumption is false here. The `--verify` scripts at the gates are the only net.
5. **`pnpm install --ignore-workspace` semantics** in the smoke script — pnpm versions differ on flag spelling (`--ignore-workspace` vs env `npm_config_ignore_workspace`); the smoke implementer must prove the scaffolded install truly resolves from `file:` tarballs and not the enclosing workspace (assert `node_modules/three-flatland/package.json` in the scaffold has no `source` export leaking `src/`... it will have it — assert instead that `node_modules/three-flatland` is NOT a symlink).
