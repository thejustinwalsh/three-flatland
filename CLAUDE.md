# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This?

High-performance 2D sprite and effects library for Three.js using WebGPU and TSL (Three Shader Language). Monorepo with library packages, example apps, mini-games, and a documentation site.

## Development Commands

```bash
pnpm install                        # Install all dependencies
pnpm build                          # Build all packages
pnpm dev                            # Start docs + examples at http://localhost:5173
pnpm typecheck                      # TypeScript type checking
pnpm lint                           # ESLint (packages only)
pnpm lint:fix                       # Fix ESLint issues
pnpm format                         # Prettier
pnpm test                           # Vitest
pnpm test:watch                     # Vitest watch mode
pnpm clean                          # Clean all build artifacts
```

### Filtered Commands

```bash
pnpm --filter=@three-flatland/core build        # Build single package
pnpm --filter=example-vanilla-tilemap dev        # Run single example
pnpm --filter=@three-flatland/mini-breakout dev  # Watch-build a mini-game library
```

### Syncpack (Version Synchronization)

Examples and minis use real npm version strings (not `workspace:*` or `catalog:`), but `pnpm.overrides` in root `package.json` maps `@three-flatland/*` to workspace packages during development. After changing catalog versions in `pnpm-workspace.yaml`:

```bash
pnpm syncpack:examples    # Sync example package.json versions
pnpm syncpack:minis       # Sync mini-game package.json versions
```

## Project Structure

```
three-flatland/
├── packages/           # Library packages (npm-published)
│   ├── core/           # Sprite2D, Renderer2D, materials, loaders, tilemap
│   ├── nodes/          # TSL shader nodes (placeholder)
│   ├── react/          # R3F integration — re-exports core + type augmentation
│   └── presets/        # Effect presets (placeholder)
├── examples/           # Standalone Vite apps (both vanilla/ and react/ variants)
│   ├── vanilla/        # Plain Three.js examples
│   └── react/          # React Three Fiber examples
├── minis/              # Mini-game library packages (tsup-built, importable)
│   └── breakout/       # Breakout game — used in docs hero section
├── docs/               # Astro/Starlight documentation site
├── scripts/            # sync-pack.ts (version sync), make-icon.py
└── .claude/skills/     # AI skill definitions (see Skills section)
```

## Architecture

### Package Dependency Graph

```
@three-flatland/react  →  @three-flatland/core
@three-flatland/presets →  @three-flatland/core + @three-flatland/nodes
```

### Import Pattern: React vs Vanilla

R3F users import from `@three-flatland/react` (re-exports all of core + JSX type augmentation). Vanilla users import from `@three-flatland/core`. The react package's `index.ts` has a side-effect import of `./types` that augments R3F's `ThreeElements` interface.

### R3F-Compatible Constructor Pattern

All Three.js objects used as R3F JSX elements must have:
1. **Optional constructor parameters** — R3F calls `new Object()` with no args, then sets properties
2. **Property setters** — all props settable after construction
3. **Array-compatible setters** — R3F passes `[x, y]` arrays, not `Vector2` instances

### Build Pipeline

- **Library packages** (`packages/*`, `minis/*`): Built with tsup → ESM + CJS + `.d.ts`
- **Examples** (`examples/**`): Standalone Vite apps, not built for npm
- **Docs**: Astro/Starlight with TypeDoc auto-generating API reference from source JSDoc

### Dependency Management

Shared versions live in `pnpm-workspace.yaml` catalog section. Packages reference them with `"catalog:"`. Examples use real version strings (synced via `pnpm syncpack:examples`). Root `pnpm.overrides` maps all `@three-flatland/*` to `workspace:*` for local dev.

### Microfrontends (Dev Server)

`pnpm dev` starts docs (port 4000) and all examples via Turbo microfrontends proxy on port 5173. Each example gets a unique port in `microfrontends.json` (4001–4012+). Examples are also embedded in docs via StackBlitz.

## Examples

Examples always exist in **pairs** — a vanilla variant and a React variant. Template examples (`examples/vanilla/template/` and `examples/react/template/`) are the starting point for new examples.

### Creating a New Example

1. Copy both template directories to `examples/vanilla/{name}/` and `examples/react/{name}/`
2. Update `name` in each `package.json` to `example-{type}-{name}`
3. Update `base` in each `vite.config.ts` to `/{type}/{name}/`
4. Register both in `microfrontends.json` with next sequential ports
5. Run `pnpm install && pnpm syncpack:examples`
6. Test: `pnpm --filter=example-vanilla-{name} dev`

### UI Components

Examples use **Web Awesome** (`@awesome.me/webawesome`) with `wa-dark` theme class on `<html>`. Vanilla examples import component JS directly; React examples import from the React subdirectory.

## Minis (Mini-Games)

Mini-games are library packages in `minis/` that export React components. They differ from examples:
- Built with tsup as importable npm packages (dual ESM/CJS)
- Imported by docs site (e.g., hero section loads `@three-flatland/mini-breakout`)
- Use Koota ECS for game state, inline textures as base64 data URLs
- Have both `dev` (tsup watch) and `dev:app` (standalone Vite server) scripts

## Skills (`.claude/skills/`)

Skills provide specialized instructions for specific tasks. Key skills:

| Skill | Trigger |
|-------|---------|
| `example` | Creating new examples |
| `mini-game` | Building mini-games for docs |
| `docs-audit` | Verifying docs match source code |
| `frontend-design` | UI/UX design decisions |
| `types` | TypeScript patterns and toolchain |

## Coding Standards

- Strict TypeScript with `verbatimModuleSyntax`
- ESM-first with CJS compatibility
- Consistent `type` keyword for type-only imports (enforced by ESLint `consistent-type-imports`)
- Tree-shakeable exports
- Flat ESLint 9 config with `typescript-eslint` type-checked rules
- Examples directory excluded from root ESLint — each is self-contained

## Release Process

1. `pnpm changeset` — describe changes
2. Commit changeset files
3. Push to main — GitHub Actions creates a release PR
4. Merge release PR to publish to npm

## README Maintenance

When completing roadmap milestones, update `README.md` checkboxes from `[ ]` to `[x]`. Keep Quick Start examples accurate and update the packages table when adding new packages.
