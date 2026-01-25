# three-flatland

High-performance 2D sprite and effects library for Three.js using WebGPU and TSL (Three Shader Language).

## Project Structure

```
three-flatland/
├── packages/
│   ├── core/          # Core sprite system and pipeline
│   ├── nodes/         # TSL shader nodes
│   ├── react/         # React Three Fiber integration
│   └── presets/       # Pre-configured effect presets
├── examples/
│   ├── vanilla/       # Plain Three.js examples
│   └── react/         # R3F examples
└── .github/workflows/ # CI/CD configuration
```

## Development Commands

```bash
pnpm install           # Install all dependencies
pnpm build             # Build all packages
pnpm dev               # Start dev server at http://localhost:5173
pnpm typecheck         # Run TypeScript type checking
pnpm lint              # Run ESLint
pnpm lint:fix          # Fix ESLint issues
pnpm format            # Format code with Prettier
pnpm test              # Run tests
pnpm test:watch        # Run tests in watch mode
pnpm clean             # Clean all build artifacts
```

## Package Dependencies

The packages have internal dependencies:
- `@three-flatland/react` depends on `@three-flatland/core`
- `@three-flatland/presets` depends on `@three-flatland/core` and `@three-flatland/nodes`

## Peer Dependencies

- **three**: >=0.182.0 (required for TSL/WebGPU support)
- **react**: >=19.0.0 (for react package, required for `use()` hook)
- **@react-three/fiber**: >=10.0.0-alpha.0 (for react package, required for WebGPU support)

## Key Technologies

- **pnpm workspaces**: Monorepo package management
- **pnpm catalog**: Centralized dependency versions in `pnpm-workspace.yaml`
- **Turbo**: Build orchestration with caching
- **tsup**: TypeScript bundling (ESM + CJS + types)
- **Vitest**: Testing framework
- **Changesets**: Version management and changelogs

## Microfrontends (Examples)

Examples use Turborepo's microfrontends feature (requires Turbo 2.6+) for a unified dev server with automatic routing.

### Configuration Files

**`microfrontends.json`** (root) - Defines applications, ports, and routing:

```json
{
  "$schema": "https://turborepo.dev/microfrontends/schema.json",
  "options": {
    "localProxyPort": 5173
  },
  "applications": {
    "example-react-basic-sprite": {
      "development": {
        "local": {
          "port": 4001
        }
      },
      "routing": [
        {
          "group": "react-examples",
          "paths": ["/react/basic-sprite", "/react/basic-sprite/:path*"]
        }
      ]
    }
  }
}
```

### Adding a New Example

1. **Create the example package** with naming convention `example-{type}-{name}`:

```json
// examples/{type}/{name}/package.json
{
  "name": "example-{type}-{name}",
  "scripts": {
    "dev": "vite dev --port $TURBO_MFE_PORT"
  }
}
```

2. **Create vite.config.ts** with static base path:

```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/{type}/{name}',
  server: {
    strictPort: true,
  },
})
```

3. **Register in microfrontends.json** - Add entry with unique port (4005+) and routing:

```json
"example-{type}-{name}": {
  "development": {
    "local": {
      "port": 4005
    }
  },
  "routing": [
    {
      "group": "{type}-examples",
      "paths": ["/{type}/{name}", "/{type}/{name}/:path*"]
    }
  ]
}
```

### Port Assignments

| Port | Application |
|------|-------------|
| 5173 | Turbo proxy (user-facing URL) |
| 4000 | docs (Starlight documentation site) |

### Default Application

The `docs` site (Starlight) serves as the default application and includes all examples as embedded StackBlitz demos.

### How It Works

- `pnpm dev` starts the docs site on port 5173
- Examples are embedded in the docs site via StackBlitz
- To run individual examples directly, use `pnpm --filter=example-vanilla-basic-sprite dev`

## Dependency Management

Shared dependencies are defined in the catalog section of `pnpm-workspace.yaml`:

```yaml
catalog:
  three: ^0.182.0
  "@types/three": ^0.182.0
  react: ^19.0.0
  "@react-three/fiber": ^10.0.0-alpha.2
  # ... etc
```

Packages reference catalog versions with `"catalog:"` in their package.json (works for both dependencies and peerDependencies):

```json
{
  "peerDependencies": {
    "three": "catalog:"
  },
  "devDependencies": {
    "three": "catalog:",
    "@types/three": "catalog:"
  }
}
```

To update a shared dependency version, change it in `pnpm-workspace.yaml` and run `pnpm install`.

## Architecture Notes

### Core Package
- Sprite pooling for efficient memory management
- Batch rendering for performance
- Pipeline abstraction for post-processing effects

### Nodes Package
- TSL (Three Shader Language) nodes for WebGPU
- Custom sprite shaders
- Billboard transformations

### React Package
- Re-exports everything from `@three-flatland/core` plus React-specific utilities
- Type augmentation via `ThreeElements` interface for TypeScript JSX support
- React 19 resource utilities for Suspense

#### Import Pattern: React vs Vanilla

**R3F users** import from `@three-flatland/react` - this provides all core classes plus automatic JSX type augmentation:

```tsx
import { Canvas, extend } from '@react-three/fiber/webgpu'
import { Sprite2D, Renderer2D, Layers } from '@three-flatland/react'

extend({ Sprite2D, Renderer2D })

function App() {
  return (
    <Canvas>
      <renderer2D>
        <sprite2D texture={myTexture} />
      </renderer2D>
    </Canvas>
  )
}
```

**Vanilla users** import from `@three-flatland/core` - no React dependencies:

```typescript
import { Sprite2D, Renderer2D, Layers } from '@three-flatland/core'

const sprite = new Sprite2D({ texture: myTexture })
renderer2D.add(sprite)
```

This pattern mirrors how `@react-three/drei` works - users import from the React package which re-exports core functionality plus React-specific features and type augmentation.

#### R3F Integration Details

**WebGPU Renderer**: R3F v10+ is required for proper WebGPU support. Import from `@react-three/fiber/webgpu` for TSL/WebGPU features.

Type augmentation in `packages/react/src/types.ts` uses the standard R3F pattern:

```typescript
import type { ThreeElement } from '@react-three/fiber'
import type { Sprite2D, Sprite2DMaterial, Renderer2D } from '@three-flatland/core'

declare module '@react-three/fiber' {
  interface ThreeElements {
    sprite2D: ThreeElement<typeof Sprite2D>
    sprite2DMaterial: ThreeElement<typeof Sprite2DMaterial>
    renderer2D: ThreeElement<typeof Renderer2D>
  }
}
```

The augmentation is automatically included when users import from `@three-flatland/react` because `index.ts` includes a side-effect import of the types file.

Reference: https://r3f.docs.pmnd.rs/api/typescript#extending-threeelements

### Presets Package
- Pre-configured effect combinations
- Pixel art, neon, particle, UI presets

## Release Process

1. Create changes with `pnpm changeset`
2. Commit the changeset files
3. Push to main - GitHub Actions will create a release PR
4. Merge the release PR to publish to npm

## Coding Standards

- Strict TypeScript with `verbatimModuleSyntax`
- ESM-first with CJS compatibility
- Tree-shakeable exports
- Consistent type imports with `type` keyword

## README Maintenance

Keep `README.md` up to date as milestones are completed:

1. **Roadmap Checklist** - When completing a milestone, update the roadmap checkboxes from `[ ]` to `[x]`
2. **Feature Examples** - When adding major features, ensure the Quick Start examples remain accurate
3. **Package Table** - When adding new packages, update the packages table
4. **Requirements** - When changing peer dependency versions, update the Requirements section

The README should remain concise and focused on getting users started quickly. Detailed documentation belongs in the docs site (`/docs` folder, built with Starlight/Astro).

### R3F-Compatible Constructor Pattern

All Three.js objects that will be used as R3F JSX elements must follow this pattern:

1. **Optional constructor parameters** - R3F creates objects with `new Object()` then sets properties via the reconciler
2. **Property setters** - All props must be settable after construction
3. **Array-compatible setters** - R3F passes arrays for vector props, not Vector2/Vector3

```typescript
export class MyObject extends Mesh {
  private _texture: Texture | null = null
  private _anchor: Vector2 = new Vector2(0.5, 0.5)

  // Optional constructor - R3F calls with no args
  constructor(options?: MyObjectOptions) {
    super(sharedGeometry, new MyMaterial())

    // Early return if no options (R3F path)
    if (!options) return

    // Apply options if provided (direct usage path)
    if (options.texture) this.texture = options.texture
    // ...
  }

  // Setter for R3F reconciler
  set texture(value: Texture | null) {
    this._texture = value
    if (value) this.material.setTexture(value)
  }

  // Accept arrays for vector props (R3F passes arrays)
  set anchor(value: Vector2 | [number, number]) {
    if (Array.isArray(value)) {
      this._anchor.set(value[0], value[1])
    } else {
      this._anchor.copy(value)
    }
  }
}
```

This enables both direct usage and R3F JSX:
```typescript
// Direct
const sprite = new Sprite2D({ texture: tex, anchor: [0.5, 0.5] })

// R3F JSX
<sprite2D texture={tex} anchor={[0.5, 0.5]} />
```
