<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/skills

Claude Code skills for the [three-flatland](https://www.npmjs.com/package/three-flatland) ecosystem — TSL shaders, WebGPU, and related domain knowledge packaged for agent use.

> **Alpha Release** — this package is in active development. Skills will evolve alongside the libraries they document. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/skills)](https://www.npmjs.com/package/@three-flatland/skills)
[![license](https://img.shields.io/npm/l/@three-flatland/skills)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Install

### With `npx skills` (recommended)

```bash
npx skills add thejustinwalsh/three-flatland
```

Install a single skill:

```bash
npx skills add thejustinwalsh/three-flatland/skills/tsl
```

### Via npm

```bash
npm install --save-dev @three-flatland/skills@alpha
cp -r node_modules/@three-flatland/skills/* .claude/skills/
```

## Included skills

- **tsl** — Use when writing TSL shaders, creating NodeMaterials, migrating GLSL to TSL, using compute shaders, working with `three/tsl` imports, or debugging shader node graphs.

### Requirements

- **Claude Code** (or any agent compatible with the [Agent Skills specification](https://agentskills.io))

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
   ```bash
   pnpm --filter @three-flatland/skills validate
   ```
6. Open a PR with a changeset (`pnpm changeset`).

Validation combines [`skills-ref`](https://github.com/agentskills/agentskills) (base frontmatter) with a local check enforcing the "Use when…" description convention.

## Documentation

Full docs at **[thejustinwalsh.com/three-flatland](https://thejustinwalsh.com/three-flatland/)**

## License

[MIT](./LICENSE)

---

<sub>This README was created with AI assistance. AI can make mistakes — please verify claims and test code examples. Submit corrections [here](https://github.com/thejustinwalsh/three-flatland/issues).</sub>
