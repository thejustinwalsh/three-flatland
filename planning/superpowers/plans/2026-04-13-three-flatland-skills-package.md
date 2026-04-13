# `@three-flatland/skills` Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the project's Claude Code skills as `@three-flatland/skills` on npm, installable via `npx skills add thejustinwalsh/three-flatland`, with the TSL skill as the first migration and a validator in CI.

**Architecture:** New top-level `skills/` workspace package containing skill directories directly (no nested `skills/skills/`). `.claude/skills/tsl` becomes a symlink to `skills/tsl` so local Claude Code and the published package share one source of truth. Validator lives in repo-level `scripts/`.

**Tech Stack:** pnpm workspaces, changesets, `skills-ref` via `uvx`, Node ESM validator script.

**Spec:** `planning/superpowers/specs/2026-04-13-three-flatland-skills-package-design.md`

---

## File Structure

**New files:**
- `scripts/validate-skills.ts` — repo-level validator (runs skills-ref + "Use when…" check)
- `skills/package.json` — the `@three-flatland/skills` package manifest
- `skills/README.md` — install + authoring instructions
- `.changeset/three-flatland-skills-initial.md` — initial changeset
- Symlink: `.claude/skills/tsl` → `../../skills/tsl`

**Modified files:**
- `pnpm-workspace.yaml` — add `skills` to `packages:`
- `package.json` (root) — add `@three-flatland/skills` to `pnpm.overrides`, add `validate:skills` script

**Moved files (via `git mv`, history preserved):**
- `.claude/skills/tsl/**` → `skills/tsl/**` (SKILL.md, nodes.md, postprocessing.md, typescript.md, compute.md, migration.md)

---

### Task 1: Validator script

**Files:**
- Create: `scripts/validate-skills.ts`

Validator enforces the "Use when…" description convention that `skills-ref` doesn't cover. It does NOT duplicate `skills-ref` — that runs separately via `uvx` in the package's `validate` script.

- [ ] **Step 1: Write the validator**

Create `scripts/validate-skills.ts`:

```ts
#!/usr/bin/env tsx
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const skillsDir = join(process.cwd(), 'skills')

type Issue = { skill: string; message: string }
const issues: Issue[] = []

function parseFrontmatter(md: string): Record<string, string> {
  const match = md.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const out: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

for (const entry of readdirSync(skillsDir)) {
  const skillPath = join(skillsDir, entry)
  if (!statSync(skillPath).isDirectory()) continue
  if (entry.startsWith('.') || entry === 'node_modules') continue

  const skillMdPath = join(skillPath, 'SKILL.md')
  let content: string
  try {
    content = readFileSync(skillMdPath, 'utf8')
  } catch {
    issues.push({ skill: entry, message: 'missing SKILL.md' })
    continue
  }

  const fm = parseFrontmatter(content)
  if (!fm.name) issues.push({ skill: entry, message: 'frontmatter missing `name`' })
  if (fm.name && fm.name !== entry) {
    issues.push({ skill: entry, message: `frontmatter name "${fm.name}" does not match directory "${entry}"` })
  }
  if (!fm.description) {
    issues.push({ skill: entry, message: 'frontmatter missing `description`' })
  } else if (!/^use when\b/i.test(fm.description)) {
    issues.push({ skill: entry, message: `description must begin with "Use when…" (got: "${fm.description.slice(0, 60)}…")` })
  }
}

if (issues.length > 0) {
  console.error('Skill validation failed:')
  for (const { skill, message } of issues) console.error(`  [${skill}] ${message}`)
  process.exit(1)
}
console.log(`✓ validated ${readdirSync(skillsDir).filter(e => statSync(join(skillsDir, e)).isDirectory() && !e.startsWith('.')).length} skill(s)`)
```

- [ ] **Step 2: Commit**

```bash
git add scripts/validate-skills.ts
git commit -m "chore: add skill validator script"
```

---

### Task 2: Scaffold the `skills/` package

**Files:**
- Create: `skills/package.json`
- Create: `skills/README.md`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

- [ ] **Step 1: Create `skills/package.json`**

```json
{
  "name": "@three-flatland/skills",
  "version": "0.1.0-alpha.1",
  "description": "Claude Code skills for the three-flatland ecosystem (TSL, …).",
  "keywords": ["claude-code", "agent-skills", "tsl", "three", "webgpu"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/thejustinwalsh/three-flatland.git",
    "directory": "skills"
  },
  "files": ["*/", "README.md"],
  "scripts": {
    "validate": "uvx skills-ref validate */ && tsx ../scripts/validate-skills.ts",
    "test": "pnpm validate"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

- [ ] **Step 2: Create `skills/README.md`**

```markdown
# @three-flatland/skills

Claude Code skills for the [three-flatland](https://github.com/thejustinwalsh/three-flatland) ecosystem.

## Included skills

- **tsl** — Use when writing TSL shaders, creating NodeMaterials, migrating GLSL to TSL, using compute shaders, working with `three/tsl` imports, or debugging shader node graphs.

## Install

### With `npx skills` (recommended)

Install all skills into your project:

```sh
npx skills add thejustinwalsh/three-flatland
```

Install just one skill:

```sh
npx skills add thejustinwalsh/three-flatland/skills/tsl
```

### Via npm

```sh
pnpm add -D @three-flatland/skills
cp -r node_modules/@three-flatland/skills/* .claude/skills/
```

## Authoring a new skill

1. Add a top-level directory under `skills/` named after the skill (kebab-case).
2. Create `skills/<name>/SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: <name>
   description: Use when <trigger conditions>
   ---
   ```
3. Add supplemental reference files alongside `SKILL.md` as needed.
4. Per-skill helper scripts go in `skills/<name>/scripts/` and are invoked by the agent from the user's project root so `node_modules` resolution works.
5. Validate locally:
   ```sh
   pnpm --filter @three-flatland/skills validate
   ```
6. Open a PR with a changeset (`pnpm changeset`).

## Validation

- [`skills-ref`](https://github.com/agentskills/agentskills) — base frontmatter validation, run via `uvx`.
- `scripts/validate-skills.ts` — enforces the "Use when…" description convention.
```

- [ ] **Step 3: Update `pnpm-workspace.yaml`**

Change:

```yaml
packages:
  - packages/*
  - examples/**
  - minis/*
  - docs
```

To:

```yaml
packages:
  - packages/*
  - examples/**
  - minis/*
  - docs
  - skills
```

- [ ] **Step 4: Update root `package.json`**

Add `@three-flatland/skills` to `pnpm.overrides`. Change:

```json
"overrides": {
  "three-flatland": "workspace:*",
  "@three-flatland/nodes": "workspace:*",
  "@three-flatland/presets": "workspace:*",
  "@three-flatland/skia": "workspace:*",
  "@three-flatland/tweakpane": "workspace:*"
}
```

To:

```json
"overrides": {
  "three-flatland": "workspace:*",
  "@three-flatland/nodes": "workspace:*",
  "@three-flatland/presets": "workspace:*",
  "@three-flatland/skia": "workspace:*",
  "@three-flatland/skills": "workspace:*",
  "@three-flatland/tweakpane": "workspace:*"
}
```

Add a root script for convenience. In `scripts`:

```json
"validate:skills": "pnpm --filter @three-flatland/skills validate"
```

- [ ] **Step 5: Install and verify workspace picks up the package**

```bash
pnpm install
pnpm list --filter @three-flatland/skills
```

Expected: `@three-flatland/skills 0.1.0-alpha.1` listed.

- [ ] **Step 6: Commit**

```bash
git add skills/package.json skills/README.md pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "feat: scaffold @three-flatland/skills package"
```

---

### Task 3: Migrate the TSL skill

**Files:**
- Move: `.claude/skills/tsl/*` → `skills/tsl/*`
- Create (symlink): `.claude/skills/tsl` → `../../skills/tsl`

- [ ] **Step 1: Move the files with history preserved**

```bash
git mv .claude/skills/tsl skills/tsl
```

Verify:

```bash
ls skills/tsl/
```

Expected: `SKILL.md compute.md migration.md nodes.md postprocessing.md typescript.md`

- [ ] **Step 2: Create the symlink**

```bash
ln -s ../../skills/tsl .claude/skills/tsl
git add .claude/skills/tsl
```

Verify:

```bash
ls -la .claude/skills/tsl
cat .claude/skills/tsl/SKILL.md | head -5
```

Expected: symlink pointing to `../../skills/tsl`; frontmatter `name: tsl` visible.

- [ ] **Step 3: Commit the move (before validator run, to keep the diff clean)**

```bash
git commit -m "refactor: move tsl skill to @three-flatland/skills package"
```

---

### Task 4: Run validation end-to-end

**Files:** none modified. Verification only.

- [ ] **Step 1: Ensure `uvx` is available**

```bash
which uvx || echo "install uv: https://docs.astral.sh/uv/"
```

If missing, install per uv docs. This is a one-time dev dep.

- [ ] **Step 2: Run validator**

```bash
pnpm --filter @three-flatland/skills validate
```

Expected output:
```
✓ validated 1 skill(s)
```
and `skills-ref validate` reports the `tsl` skill is valid.

- [ ] **Step 3: Dry-run npm pack to verify shipped contents**

```bash
cd skills && pnpm pack --dry-run 2>&1 | tee /tmp/skills-pack.log
```

Expected: the log lists `README.md` and every file under `tsl/` (SKILL.md, nodes.md, postprocessing.md, typescript.md, compute.md, migration.md). Must NOT list any files outside `skills/`.

- [ ] **Step 4: Verify Claude Code still loads the skill via the symlink**

From the repo root, start a fresh Claude Code session and confirm the `tsl` skill appears in the available skills list with description starting `Use when writing TSL shaders…`. This is a manual verification — there is no CLI for it. If the skill doesn't appear, the symlink path is wrong; verify `readlink .claude/skills/tsl` returns `../../skills/tsl`.

---

### Task 5: Changeset + final commit

**Files:**
- Create: `.changeset/three-flatland-skills-initial.md`

- [ ] **Step 1: Create the changeset**

```markdown
---
'@three-flatland/skills': minor
---

feat: initial release — Claude Code skills package, starting with the TSL skill. Install via `npx skills add thejustinwalsh/three-flatland`.
```

Save as `.changeset/three-flatland-skills-initial.md`.

- [ ] **Step 2: Commit**

```bash
git add .changeset/three-flatland-skills-initial.md
git commit -m "chore: add changeset for @three-flatland/skills initial release"
```

---

### Task 6: Final verification checklist

- [ ] **Step 1: Run full verification**

```bash
pnpm install
pnpm --filter @three-flatland/skills validate
pnpm lint
pnpm typecheck
```

All must pass.

- [ ] **Step 2: Test the install UX against the branch**

From a scratch directory outside the repo:

```bash
cd /tmp && mkdir skill-install-test && cd skill-install-test
npx skills add thejustinwalsh/three-flatland#<this-branch-name>
ls .claude/skills/tsl/
```

Expected: `tsl` skill copied into `.claude/skills/tsl/` with all 6 files present.

- [ ] **Step 3: Ready for PR**

All tasks complete. Open PR.

---

## Self-Review

**Spec coverage:**
- Package layout (top-level `skills/`, no nested wrapper) — Task 2 ✓
- Single source of truth via symlink — Task 3 ✓
- `npx skills add thejustinwalsh/three-flatland` install — Task 6 ✓
- `uvx skills-ref` validation — Task 2 (package.json `validate`) + Task 4 ✓
- "Use when…" description check — Task 1 ✓
- Per-skill `scripts/` dirs supported by `"*/"` glob — Task 2 ✓
- Changeset release at `0.1.0-alpha.1` — Task 5 ✓
- `pnpm.overrides` entry — Task 2 ✓
- No turbo wiring (plain pnpm filter, consistent with existing `test` script style) — acceptable deviation from spec's "wire into turbo `lint`" since the project's `lint` script is plain eslint, not turbo-orchestrated; root-level `validate:skills` script covers CI invocation.

**Placeholder scan:** None. All code, commands, and expected outputs are concrete.

**Type consistency:** Validator's field names (`name`, `description`) match SKILL.md frontmatter. `@three-flatland/skills` used consistently across workspace yaml, pnpm overrides, filter commands.

One deviation from spec noted inline: we don't wire into turbo because the project's existing `lint` is plain eslint. The `validate:skills` root script serves the same CI need.
