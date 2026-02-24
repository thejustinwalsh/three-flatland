# Mini-Game Development Skill

> **Philosophy:** Ambient arcade experiences that **showcase three-flatland's APIs and features** while entertaining visitors.
> **Core Stack:** React + React Three Fiber + **@three-flatland/react** + Koota ECS

---

## Critical Rules

### 1. USE THREE-FLATLAND API ONLY

**NEVER use core Three.js features directly when implementing game logic.** If something is missing from three-flatland, plan an update to the core API instead.

```typescript
// ❌ WRONG - Using Three.js directly
import { Mesh, PlaneGeometry, MeshBasicMaterial } from 'three'
const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial())

// ✅ CORRECT - Using three-flatland
import { Sprite2D, Sprite2DMaterial, Renderer2D } from '@three-flatland/react'
<sprite2D material={material} position={[x, y, 0]} />
```

### 2. FOLLOW THREE-FLATLAND EXAMPLES

Always reference the existing examples in `/examples/react/` for patterns:
- `batch-demo` - Renderer2D batching, materials, textures
- `basic-sprite` - Single sprite rendering, tinting
- `tsl-nodes` - TSL shader effects

### 3. KOOTA WORLD CREATION - STATIC MODULE

**The Koota world MUST be created in a separate module statically** to avoid HMR issues and "too many worlds" errors.

```typescript
// ❌ WRONG - Creating world in component
function Game() {
  const world = useMemo(() => createWorld(), [])  // HMR recreates this!
}

// ✅ CORRECT - Static module with HMR guard
// world.ts
import { createWorld, type World } from 'koota'
import { GameState } from './traits'

declare global {
  var __breakoutWorld: World | undefined
}

export function getWorld(): World {
  if (typeof window === 'undefined') {
    throw new Error('World can only be accessed on the client')
  }
  // Reuse existing world if valid (survives HMR)
  if (globalThis.__breakoutWorld && globalThis.__breakoutWorld.has(GameState)) {
    return globalThis.__breakoutWorld
  }
  const world = createWorld()
  initWorld(world)
  globalThis.__breakoutWorld = world
  return world
}
```

### 4. RENDERER2D BATCHING

When using `Renderer2D` for batched sprites, you **MUST call `invalidateAll()` before `update()`** if sprites move or change each frame:

```typescript
useFrame(() => {
  // Tell batches to re-read sprite data (position, tint, scale)
  renderer2DRef.current?.invalidateAll()
  renderer2DRef.current?.update()
})
```

### 5. INLINE TEXTURES AS DATA URLs

Textures must be inlined as base64 data URLs to work when the package is imported as a library:

```typescript
// ❌ WRONG - External assets don't work in library mode
const texture = useLoader(TextureLoader, '/assets/ball.png')

// ✅ CORRECT - Inline SVG as data URL
const BALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
  <circle cx="16" cy="16" r="14" fill="#ff6b9d"/>
</svg>`

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

const texture = new TextureLoader().load(svgToDataUrl(BALL_SVG))
```

---

## Purpose

Mini-games serve as **interactive showcases** for three-flatland's capabilities:

- **Sprite2D & Renderer2D** - Batched sprite rendering with layer sorting
- **TSL Node Effects** - Custom shader effects (hue shift, tint, dissolve, glow)
- **Sprite2DMaterial** - Tinting, alpha, and texture sampling
- **R3F Integration** - JSX-based sprite composition with `extend()`

Each mini-game demonstrates real-world usage of three-flatland's systems in a fun, interactive way.

---

## When to Use This Skill

**Triggers:**
- mini-game, arcade, attract mode
- one-button game, ambient demo
- Koota ECS, game state management
- ZzFX sound design, retro sounds
- hero game, docs game integration
- three-flatland demo, sprite effects showcase

**Use cases:**
- Building mini-games for the docs hero section
- Creating interactive demos that showcase three-flatland features
- Implementing one-button arcade mechanics
- Designing attract mode animations
- Demonstrating TSL shader effects in a game context

---

## Required Reading

| File | Status | When to Read |
|------|--------|--------------|
| [ecs-patterns.md](ecs-patterns.md) | **REQUIRED** | Always - core game architecture |
| [sound-design.md](sound-design.md) | **REQUIRED** | Always - audio feedback |
| [integration-guide.md](integration-guide.md) | Optional | Docs site integration |

---

## Quick Reference

### Package Structure

```
minis/{name}/
├── package.json          # Dual lib+app exports
├── tsconfig.json
├── vite.config.ts        # Dev server
├── index.html            # Standalone entry
├── src/
│   ├── index.ts          # Library export (component + types)
│   ├── main.tsx          # Dev app entry
│   ├── App.tsx           # Dev wrapper (provides mock sounds)
│   ├── Game.tsx          # Main game component
│   ├── world.ts          # STATIC Koota world creation
│   ├── types.ts          # ZzFXParams, MiniGameProps
│   ├── traits.ts         # Koota trait definitions
│   ├── materials.ts      # Sprite2DMaterials with inlined textures
│   ├── systems/          # Game update systems
│   └── components/       # R3F sprite components
```

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsup src/index.ts --format esm,cjs --dts --external react --external three --external @react-three/fiber --external koota --watch",
    "dev:app": "vite dev --port ${TURBO_MFE_PORT:-5200}",
    "build": "tsup src/index.ts --format esm,cjs --dts --external react --external three --external @react-three/fiber --external koota"
  }
}
```

- `dev` - Watch mode for library build (used by `pnpm dev` at root)
- `dev:app` - Standalone vite dev server for testing

### Game Component API

```typescript
type ZzFXParams = [volume?: number, randomness?: number, frequency?: number, ...]

export interface MiniGameProps {
  /** ZzFX-compatible function - receives raw params like zzfx() */
  zzfx?: (...params: ZzFXParams) => void
  /** Whether game is visible (for pausing when off-screen) */
  isVisible?: boolean
  /** Custom class name for styling */
  className?: string
}
```

### Game Mode State Machine

```
ATTRACT → (tap) → PLAYING → (lose) → GAME_OVER → (timeout) → ATTRACT
                     ↑                              ↓
                     └────────── (tap) ─────────────┘
```

---

## Checklist for New Mini-Games

### Setup
1. [ ] Create package in `minis/{name}/`
2. [ ] Add `@three-flatland/react` dependency
3. [ ] Extend R3F with `Sprite2D`, `Sprite2DMaterial`, `Renderer2D`
4. [ ] Create `world.ts` with static world creation (HMR-safe)

### Game Logic
5. [ ] Define traits in `src/traits.ts` (world traits for singletons)
6. [ ] Implement systems for each game mode
7. [ ] Add attract mode animations (idle state)
8. [ ] Implement input handling (mouse follow / touch drag)

### three-flatland Integration
9. [ ] Use `Renderer2D` for batched sprites
10. [ ] Call `invalidateAll()` before `update()` each frame
11. [ ] Inline textures as base64 data URLs in `materials.ts`
12. [ ] Use `Sprite2DMaterial` for all sprites

### Polish
13. [ ] Add sound effects using ZzFX params
14. [ ] Test standalone dev server (`pnpm dev:app`)
15. [ ] Test docs integration
16. [ ] Verify mobile responsiveness

---

## three-flatland Integration

### Setup Pattern

```typescript
import { Canvas, extend } from '@react-three/fiber/webgpu'
import {
  Sprite2D,
  Sprite2DMaterial,
  Renderer2D,
  Layers,
} from '@three-flatland/react'

// Extend R3F with three-flatland classes
extend({ Sprite2D, Sprite2DMaterial, Renderer2D })
```

### Batched Rendering

```tsx
function GameScene() {
  const renderer2DRef = useRef<Renderer2DType>(null)

  useFrame(() => {
    // REQUIRED: Tell batches to re-read sprite data
    renderer2DRef.current?.invalidateAll()
    renderer2DRef.current?.update()
  })

  return (
    <renderer2D ref={renderer2DRef}>
      <sprite2D material={material} layer={Layers.GROUND} zIndex={0} />
      <sprite2D material={material} layer={Layers.ENTITIES} zIndex={10} />
    </renderer2D>
  )
}
```

### Inlined Textures Pattern

```typescript
// materials.ts
const BALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
  <circle cx="16" cy="16" r="14" fill="#ff6b9d"/>
</svg>`

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function loadTexture(dataUrl: string) {
  const loader = new TextureLoader()
  const texture = loader.load(dataUrl)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function useGameMaterials() {
  return useMemo(() => {
    const ballTex = loadTexture(svgToDataUrl(BALL_SVG))
    return {
      ball: new Sprite2DMaterial({ map: ballTex }),
    }
  }, [])
}
```

---

## Key Principles

### One-Button Design
- Single input type (tap/click)
- No directional controls needed
- Instant game start on first tap
- Clear feedback for each action

### Attract Mode
- Visually interesting without interaction
- Shows off game mechanics
- Emergent game start (no "TAP TO PLAY" text)
- Loops smoothly

### Performance
- Fixed timestep for consistent physics
- Entity pooling for repeated objects
- Minimal allocations in update loops
- Respect `isVisible` prop for off-screen pause

---

## Reference Files

For detailed guidance:
- [ecs-patterns.md](ecs-patterns.md) - Koota ECS architecture and patterns
- [sound-design.md](sound-design.md) - ZzFX parameter design and presets
- [integration-guide.md](integration-guide.md) - Docs site integration and sound bridge
