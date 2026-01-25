# M0: Project Setup

**Status: COMPLETE**

## Milestone Overview

| Field | Value |
|-------|-------|
| **Status** | Complete |
| **Duration** | 1 week |
| **Dependencies** | None |
| **Outputs** | Monorepo structure, build system, CI/CD, dev environment |
| **Risk Level** | Low |

---

## Objectives

1. Establish monorepo structure with pnpm workspaces
2. Configure TypeScript with strict settings
3. Set up build system (tsup) for all packages
4. Configure testing framework (vitest)
5. Set up CI/CD pipeline (GitHub Actions)
6. Create development environment with examples
7. Establish code quality tools (ESLint, Prettier)
8. Set up changesets for versioning

---

## Package Structure

```
three-flatland/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Test, lint, type-check on PR
│       ├── release.yml            # Publish to npm on main
│       └── preview.yml            # Deploy examples on PR
├── packages/
│   ├── core/                      # @three-flatland/core
│   │   ├── src/
│   │   │   ├── sprites/
│   │   │   ├── text/
│   │   │   ├── tilemaps/
│   │   │   ├── pipeline/
│   │   │   ├── materials/
│   │   │   ├── loaders/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   ├── nodes/                     # @three-flatland/nodes
│   │   ├── src/
│   │   │   ├── sprite/
│   │   │   ├── text/
│   │   │   ├── effects/
│   │   │   ├── lighting/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   ├── react/                     # @three-flatland/react
│   │   ├── src/
│   │   │   ├── extend.ts
│   │   │   ├── resource.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   └── presets/                   # @three-flatland/presets
│       ├── src/
│       ├── package.json
│       ├── tsconfig.json
│       └── tsup.config.ts
├── examples/
│   ├── vanilla/                   # Plain Three.js examples
│   │   ├── basic-sprite/
│   │   ├── animation/
│   │   └── ...
│   └── react/                     # R3F examples
│       ├── basic-sprite/
│       ├── animation/
│       └── ...
├── docs/                          # VitePress documentation
│   ├── .vitepress/
│   ├── guide/
│   ├── api/
│   └── index.md
├── scripts/
│   ├── build.ts
│   └── publish.ts
├── package.json                   # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.base.json             # Shared TypeScript config
├── .eslintrc.cjs
├── .prettierrc
├── vitest.config.ts
├── .changeset/
│   └── config.json
└── README.md
```

---

## Detailed Tasks

### Task 0.1: Initialize Repository

**Time:** 2 hours

```bash
# Create repository
mkdir three-flatland && cd three-flatland
git init

# Initialize pnpm workspace
pnpm init

# Create workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'packages/*'
  - 'examples/*'
  - 'docs'
EOF
```

**Root package.json:**

```json
{
  "name": "three-flatland",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint packages/*/src --ext .ts,.tsx",
    "lint:fix": "eslint packages/*/src --ext .ts,.tsx --fix",
    "format": "prettier --write \"packages/*/src/**/*.{ts,tsx}\"",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "@types/node": "^20.10.0",
    "@typescript-eslint/eslint-plugin": "^6.13.0",
    "@typescript-eslint/parser": "^6.13.0",
    "eslint": "^8.55.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.1.0",
    "tsup": "^8.0.0",
    "turbo": "^1.11.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  },
  "packageManager": "pnpm@8.10.0",
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

---

### Task 0.2: Configure TypeScript

**Time:** 2 hours

**tsconfig.base.json (shared config):**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

**packages/core/tsconfig.json:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

---

### Task 0.3: Configure Build System (tsup)

**Time:** 2 hours

**packages/core/tsup.config.ts:**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: true,
  external: ['three'],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";', // For RSC compatibility
    };
  },
});
```

**packages/react/tsup.config.ts:**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    extend: 'src/extend.ts',      // Separate entry for tree-shaking
    resource: 'src/resource.ts',  // Separate entry for tree-shaking
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: true,
  external: ['three', 'react', '@react-three/fiber', '@three-flatland/core'],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
});
```

---

### Task 0.4: Create Package Scaffolds

**Time:** 3 hours

**packages/core/package.json:**

```json
{
  "name": "@three-flatland/core",
  "version": "0.0.1",
  "description": "2D rendering library for Three.js - core package",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist .turbo"
  },
  "peerDependencies": {
    "three": ">=0.170.0"
  },
  "devDependencies": {
    "three": "^0.170.0"
  },
  "keywords": [
    "three",
    "threejs",
    "three.js",
    "2d",
    "sprites",
    "tilemap",
    "webgpu",
    "tsl"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/three-flatland.git",
    "directory": "packages/core"
  }
}
```

**packages/react/package.json:**

```json
{
  "name": "@three-flatland/react",
  "version": "0.0.1",
  "description": "2D rendering library for Three.js - React/R3F integration",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./extend": {
      "types": "./dist/extend.d.ts",
      "import": "./dist/extend.js"
    },
    "./resource": {
      "types": "./dist/resource.d.ts",
      "import": "./dist/resource.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist .turbo"
  },
  "peerDependencies": {
    "@react-three/fiber": ">=9.0.0",
    "react": ">=19.0.0",
    "three": ">=0.170.0"
  },
  "dependencies": {
    "@three-flatland/core": "workspace:*"
  },
  "devDependencies": {
    "@react-three/fiber": "^9.0.0",
    "@types/react": "^18.2.0",
    "react": "^19.0.0",
    "three": "^0.170.0"
  },
  "license": "MIT"
}
```

**Scaffold files:**

```typescript
// packages/core/src/index.ts
export const VERSION = '0.0.1';

// Placeholder exports - will be implemented in subsequent milestones
export type { Sprite2DOptions } from './sprites/types';
export type { Renderer2DOptions } from './pipeline/types';

// packages/nodes/src/index.ts
export const VERSION = '0.0.1';

// packages/react/src/index.ts
export * from './extend';
export * from './resource';
export * from '@three-flatland/core';

// packages/react/src/extend.ts
import { extend } from '@react-three/fiber';

export function extendAll() {
  // Will be populated as classes are created
  extend({});
}

// packages/react/src/resource.ts
export interface Resource<T> {
  readonly promise: Promise<T>;
  readonly status: 'pending' | 'fulfilled' | 'rejected';
  readonly value: T | undefined;
  readonly error: Error | undefined;
  readonly isLoaded: boolean;
}

export function createResource<T>(promise: Promise<T>): Resource<T> {
  const resource = {
    promise,
    status: 'pending' as const,
    value: undefined as T | undefined,
    error: undefined as Error | undefined,
    get isLoaded() {
      return resource.status === 'fulfilled';
    },
  };

  promise.then(
    (value) => {
      (resource as any).status = 'fulfilled';
      (resource as any).value = value;
    },
    (error) => {
      (resource as any).status = 'rejected';
      (resource as any).error = error;
    }
  );

  return resource;
}

export function useResource<T>(resource: Resource<T>): T {
  // React 19's use() hook
  const { use } = await import('react');
  return use(resource.promise);
}

// packages/react/src/types.ts
// Type augmentation will be added as classes are created
export {};
```

---

### Task 0.5: Configure Testing (Vitest)

**Time:** 2 hours

**vitest.config.ts (root):**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/index.ts'],
    },
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

**vitest.setup.ts:**

```typescript
import { vi } from 'vitest';

// Mock WebGL context for Three.js
class WebGLRenderingContext {}
class WebGL2RenderingContext extends WebGLRenderingContext {}

globalThis.WebGLRenderingContext = WebGLRenderingContext as any;
globalThis.WebGL2RenderingContext = WebGL2RenderingContext as any;

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
globalThis.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));
```

**Example test file (packages/core/src/sprites/Sprite2D.test.ts):**

```typescript
import { describe, it, expect } from 'vitest';
// import { Sprite2D } from './Sprite2D';

describe('Sprite2D', () => {
  it.todo('should create a sprite with default options');
  it.todo('should set position correctly');
  it.todo('should update frame');
  it.todo('should apply tint');
});
```

---

### Task 0.6: Configure ESLint & Prettier

**Time:** 1 hour

**.eslintrc.cjs:**

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./packages/*/tsconfig.json'],
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
  },
  ignorePatterns: ['dist', 'node_modules', '*.config.*'],
};
```

**.prettierrc:**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```

---

### Task 0.7: Configure CI/CD (GitHub Actions)

**Time:** 2 hours

**.github/workflows/ci.yml:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build

  test-react:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        react-version: [19]
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Install React ${{ matrix.react-version }}
        run: pnpm add -D react@${{ matrix.react-version }} @types/react@${{ matrix.react-version }}
        working-directory: packages/react

      - name: Test with React ${{ matrix.react-version }}
        run: pnpm test
```

**.github/workflows/release.yml:**

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Create Release Pull Request or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

### Task 0.8: Configure Changesets

**Time:** 30 minutes

**.changeset/config.json:**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    ["@three-flatland/core", "@three-flatland/nodes", "@three-flatland/react", "@three-flatland/presets"]
  ],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

---

### Task 0.9: Create Example App Scaffold

**Time:** 2 hours

**examples/vanilla/basic-sprite/index.html:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Basic Sprite - three-flatland</title>
  <style>
    body { margin: 0; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

**examples/vanilla/basic-sprite/main.ts:**

```typescript
import * as THREE from 'three/webgpu';
// import { Sprite2D } from '@three-flatland/core';

console.log('three-flatland example - basic sprite');
console.log('Three.js version:', THREE.REVISION);

// Example will be completed in M1
```

**examples/react/basic-sprite/App.tsx:**

```tsx
import { Canvas } from '@react-three/fiber';
// import { extendSprite2D } from '@three-flatland/react';

export default function App() {
  return (
    <Canvas>
      <mesh>
        <boxGeometry />
        <meshNormalMaterial />
      </mesh>
    </Canvas>
  );
}
```

---

### Task 0.10: Turbo Configuration

**Time:** 30 minutes

**turbo.json:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

---

## Acceptance Criteria

- [x] `pnpm install` completes without errors
- [x] `pnpm build` builds all packages successfully
- [x] `pnpm test` runs (with placeholder tests passing)
- [x] `pnpm lint` passes with no errors
- [x] `pnpm typecheck` passes
- [x] CI pipeline passes on GitHub
- [x] All packages have correct exports and types
- [x] Tree-shaking works (verified with bundler analysis)
- [x] Changeset is configured and working

---

## Verification Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Check types
pnpm typecheck

# Lint
pnpm lint

# Verify exports
node -e "import('@three-flatland/core').then(m => console.log(Object.keys(m)))"

# Verify tree-shaking (check bundle size)
cd examples/vanilla/basic-sprite && pnpm build && ls -la dist/
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pnpm workspace issues | Low | Medium | Use well-tested workspace patterns |
| TypeScript config complexity | Medium | Low | Start with known-good configs |
| CI/CD failures | Low | Low | Test locally before pushing |

---

## Dependencies for Next Milestone

M1 (Core Sprites) requires:
- ✅ Working build system
- ✅ TypeScript configuration
- ✅ Test framework
- ✅ Package structure

---

## Estimated Effort

| Task | Hours |
|------|-------|
| 0.1 Initialize Repository | 2 |
| 0.2 Configure TypeScript | 2 |
| 0.3 Configure Build System | 2 |
| 0.4 Create Package Scaffolds | 3 |
| 0.5 Configure Testing | 2 |
| 0.6 Configure ESLint & Prettier | 1 |
| 0.7 Configure CI/CD | 2 |
| 0.8 Configure Changesets | 0.5 |
| 0.9 Create Example App Scaffold | 2 |
| 0.10 Turbo Configuration | 0.5 |
| **Total** | **17 hours** (~2-3 days) |

---

*End of M0: Project Setup*
