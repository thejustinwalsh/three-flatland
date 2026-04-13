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
