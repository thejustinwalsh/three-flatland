---
source: CLAUDE.md
path: /Users/tjw/Developer/three-flatland/CLAUDE.md
hash: a6a5aabb
keywords: [examples, skills, minis, architecture, built, cjs, claude, claude.md, coding, commands, development, eslint, maintenance, mini-games, packages]
categories: [context]
sections: 10
rules: 13
summary: CLAUDE.md
generated: 2026-04-09T06:01:58Z
---

## Context Rules
1. Library packages** (`packages/*`, `minis/*`): Built with tsup → ESM + CJS + `.d.ts`
2. Examples** (`examples/**`): Standalone Vite apps, not built for npm
3. Docs**: Astro/Starlight with TypeDoc auto-generating API reference from source JSDoc
4. Built with tsup as importable npm packages (dual ESM/CJS)
5. Imported by docs site (e.g., hero section loads `@three-flatland/mini-breakout`)
6. Use Koota ECS for game state, inline textures as base64 data URLs
7. Have both `dev` (tsup watch) and `dev:app` (standalone Vite server) scripts
8. Strict TypeScript with `verbatimModuleSyntax`
9. ESM-first with CJS compatibility
10. Consistent `type` keyword for type-only imports (enforced by ESLint `consistent-type-imports`)
11. Tree-shakeable exports
12. Flat ESLint 9 config with `typescript-eslint` type-checked rules
13. Examples directory excluded from root ESLint — each is self-contained

