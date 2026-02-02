# React Best Practices for three-flatland

> **Core Principle:** Use modern React 19 async patterns with Suspense boundaries.

---

## Asset Loading with useLoader

All three-flatland loaders extend Three.js's `Loader` class and work with R3F's `useLoader`. This provides:
- Automatic Suspense integration (component suspends while loading)
- Texture presets automatically applied
- Extension callback for per-load customization

### TextureLoader

```tsx
import { useLoader } from '@react-three/fiber/webgpu';
import { TextureLoader } from '@three-flatland/react';

function Sprite() {
  // Presets automatically applied (pixel-art by default)
  const texture = useLoader(TextureLoader, '/sprites/player.png');
  return <sprite2D texture={texture} />;
}

// Multiple textures
const TEXTURE_URLS = ['/house.png', '/tree.png', '/tower.png'];

function Buildings() {
  const [house, tree, tower] = useLoader(TextureLoader, TEXTURE_URLS);
  // All textures have presets applied
}
```

### SpriteSheetLoader

```tsx
import { useLoader } from '@react-three/fiber/webgpu';
import { SpriteSheetLoader, AnimatedSprite2D } from '@three-flatland/react';

function Player() {
  const sheet = useLoader(SpriteSheetLoader, '/sprites/player.json');
  return <animatedSprite2D spriteSheet={sheet} animation="idle" />;
}

// Multiple spritesheets (array URL pattern)
const SHEET_URLS = ['/sprites/player.json', '/sprites/enemy.json', '/sprites/items.json'];

function Game() {
  const [playerSheet, enemySheet, itemsSheet] = useLoader(SpriteSheetLoader, SHEET_URLS);
  // ...
}

// Override preset
const hdSheet = useLoader(SpriteSheetLoader, '/sprites/hd-ui.json', (loader) => {
  loader.preset = 'smooth';
});
```

### TiledLoader

```tsx
import { useLoader } from '@react-three/fiber/webgpu';
import { TiledLoader, TileMap2D } from '@three-flatland/react';

function Level() {
  const mapData = useLoader(TiledLoader, '/maps/level1.json');
  return <tileMap2D data={mapData} />;
}

// Preload multiple levels
const LEVEL_URLS = ['/maps/level1.json', '/maps/level2.json', '/maps/level3.json'];

function Game() {
  const [level1, level2, level3] = useLoader(TiledLoader, LEVEL_URLS);
  // Switch between levels without loading delay
}

// Override preset
const hdMap = useLoader(TiledLoader, '/maps/hd-level.json', (loader) => {
  loader.preset = 'smooth';
});
```

### LDtkLoader

```tsx
import { useLoader } from '@react-three/fiber/webgpu';
import { LDtkLoader, TileMap2D } from '@three-flatland/react';

function Level() {
  // Loads first level by default
  const mapData = useLoader(LDtkLoader, '/maps/world.ldtk');
  return <tileMap2D data={mapData} />;
}

// Specify level and preset via extension
const mapData = useLoader(LDtkLoader, '/maps/world.ldtk', (loader) => {
  loader.levelId = 'Level_1';
  loader.preset = 'pixel-art';
});
```

### Extension Callback with Arrays

When using arrays, R3F calls the extension callback for each loader instance:

```tsx
const URLS = ['/a.png', '/b.png', '/c.png'];

// Extension is called 3 times - once per URL
const textures = useLoader(TextureLoader, URLS, (loader) => {
  loader.preset = 'smooth';  // Applied to all
});
```

### Preset Hierarchy

All loaders follow the same preset resolution order:

1. **Instance `preset`** - Set via extension callback (highest priority)
2. **`Loader.options`** - Static class-level default
3. **`TextureConfig.options`** - Global config default
4. **`'pixel-art'`** - System default (NearestFilter + SRGBColorSpace)

---

## Async Data Loading

### The Problem with Module-Level Promises

**Never create promises at module level** - this causes side effects on import:

```tsx
// ❌ BAD: Fetch starts immediately when module is imported
// System may not be initialized, paths may be wrong, etc.
const spriteSheetPromise = SpriteSheetLoader.load('/sprites/player.json');
```

### Pattern 1: Static Loader Function + useState Initializer

Create a loader **function** at module level, then call it in `useState` initializer:

```tsx
// ✅ GOOD: Function at module level, called in useState initializer
// Note: SpriteSheetLoader already applies texture presets automatically
const loadSpriteSheet = () => SpriteSheetLoader.load('/sprites/player.json');

function Player() {
  const [spriteSheetPromise] = useState(loadSpriteSheet);
  const spriteSheet = use(spriteSheetPromise);

  return <animatedSprite2D spriteSheet={spriteSheet} />;
}
```

**Why this works:**
- No side effects on module import
- Fetch starts when component first renders
- Promise is stable across re-renders (useState only calls initializer once)
- Texture presets are automatically applied by the loader

### Pattern 2: Call Loader Directly in useState

For simple cases without transformations:

```tsx
// ✅ GOOD: Loader called directly in useState initializer
function Level() {
  const [mapPromise] = useState(() => TiledLoader.load('/maps/level1.json'));
  const mapData = use(mapPromise);

  return <tileMap2D data={mapData} />;
}
```

**Rules for this pattern:**
- All loader arguments must be static (literals or module-level constants)
- No dependencies on props or state

### Pattern 3: Props-Dependent Resources

For resources that depend on props:

```tsx
// ✅ GOOD: useState initializer with prop dependency + startTransition for updates
function Level({ levelUrl }) {
  const [resourcePromise, setResourcePromise] = useState(
    () => TiledLoader.load(levelUrl)
  );
  const mapData = use(resourcePromise);

  // Update resource with startTransition for smooth transitions
  const handleLevelChange = (newUrl: string) => {
    startTransition(() => {
      setResourcePromise(TiledLoader.load(newUrl));
    });
  };

  return <tileMap2D data={mapData} />;
}
```

### Pattern 4: Parent Passes Promise as Prop

Start fetch in parent, pass promise to child:

```tsx
// ✅ GOOD: Parent creates promise, child consumes it
function GameScreen() {
  const [spriteSheetPromise] = useState(
    () => SpriteSheetLoader.load('/sprites/player.json')
  );

  return (
    <Suspense fallback={<Loading />}>
      <Player spriteSheetPromise={spriteSheetPromise} />
    </Suspense>
  );
}

function Player({ spriteSheetPromise }) {
  const spriteSheet = use(spriteSheetPromise);
  return <animatedSprite2D spriteSheet={spriteSheet} />;
}
```

---

## Anti-Pattern: useEffect + useState

Never use `useEffect` + `useState` for data fetching:

```tsx
// ❌ BAD: useEffect + useState pattern
function Level({ levelUrl }) {
  const [mapData, setMapData] = useState(null);

  useEffect(() => {
    TiledLoader.load(levelUrl).then(setMapData);
  }, [levelUrl]);

  if (!mapData) return null;  // Manual loading state
  return <tileMap2D data={mapData} />;
}
```

**Problems:**
- Extra render cycle (null → data)
- Manual loading state management
- Race conditions with rapid prop changes
- Can't leverage Suspense boundaries

---

## Suspense Boundaries

Always wrap components using `use()` with Suspense:

```tsx
function App() {
  return (
    <Canvas>
      <Suspense fallback={<LoadingSpinner />}>
        <Level />
      </Suspense>
    </Canvas>
  );
}
```

For nested loading states:

```tsx
function Game() {
  return (
    <Canvas>
      <Suspense fallback={<LoadingScreen />}>
        <World />
        <Suspense fallback={null}>
          <Player />
        </Suspense>
      </Suspense>
    </Canvas>
  );
}
```

---

## R3F Integration

### Always use `extend()` for custom elements

```tsx
import { extend } from '@react-three/fiber/webgpu';
import { Sprite2D, SpriteGroup, AnimatedSprite2D, TileMap2D } from '@three-flatland/react';

// Register once at module level
extend({ Sprite2D, SpriteGroup, AnimatedSprite2D, TileMap2D });
```

### Use refs for imperative updates

```tsx
function AnimatedCharacter({ spriteSheet }) {
  const spriteRef = useRef<AnimatedSprite2D>(null);

  useFrame((_, delta) => {
    spriteRef.current?.update(delta * 1000);
  });

  return <animatedSprite2D ref={spriteRef} spriteSheet={spriteSheet} />;
}
```

---

## Complete Example

```tsx
import { Suspense, useRef, useState, use } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber/webgpu';
import { AnimatedSprite2D, SpriteSheetLoader, Layers } from '@three-flatland/react';

// Register with R3F
extend({ AnimatedSprite2D });

// Loader function at module level (no side effects)
// Texture presets (NearestFilter, SRGBColorSpace) are applied automatically
const loadPlayerSheet = () => SpriteSheetLoader.load('/sprites/player.json');

function Player() {
  // Call loader in useState initializer - starts fetch on first render
  const [spriteSheetPromise] = useState(loadPlayerSheet);
  const spriteSheet = use(spriteSheetPromise);
  const ref = useRef<AnimatedSprite2D>(null);

  useFrame((_, delta) => {
    ref.current?.update(delta * 1000);
  });

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={spriteSheet}
      animationSet={{
        animations: {
          idle: { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'], fps: 8 },
        },
      }}
      animation="idle"
      layer={Layers.ENTITIES}
      scale={[64, 64, 1]}
    />
  );
}

export default function App() {
  return (
    <Canvas orthographic camera={{ zoom: 5, position: [0, 0, 100] }}>
      <Suspense fallback={null}>
        <Player />
      </Suspense>
    </Canvas>
  );
}
```

---

## Quick Reference

| Pattern | When to Use |
|---------|-------------|
| `useLoader(TextureLoader, url)` | Single texture with automatic presets |
| `useLoader(TextureLoader, urls)` | Multiple textures (returns array) |
| `useLoader(SpriteSheetLoader, url)` | Spritesheet for animations |
| `useLoader(TiledLoader, url)` | Tiled map data |
| `useLoader(LDtkLoader, url)` | LDtk project (first level) |
| `useLoader(Loader, url, (l) => l.preset = 'smooth')` | Override preset via extension |
| `useLoader(LDtkLoader, url, (l) => l.levelId = 'Level_1')` | Load specific LDtk level |
| `useState(() => loader())` | When `useLoader` won't work (dynamic URLs from props) |
| Parent passes promise as prop | Shared resources, coordinated loading |

## Anti-Patterns to Avoid

| ❌ Anti-Pattern | ✅ Correct Pattern |
|----------------|-------------------|
| Promise created at module level | `useLoader(Loader, url)` or loader function in `useState` |
| `useEffect` + `setState` for data fetching | `useLoader()` (suspends automatically) |
| `if (!data) return null` loading checks | `<Suspense fallback={...}>` |
| Creating promises inside render | `useLoader()` or `useState` initializer |
| Multiple `useState` for loading/error/data | `useLoader()` + Suspense + ErrorBoundary |
| Manual `texture.minFilter = NearestFilter` | Use our loaders (presets applied automatically) |
| Three.js `TextureLoader` for textures | `@three-flatland/react` `TextureLoader` with `useLoader` |
| `useState` + `use()` for static URLs | `useLoader()` (simpler, same result) |
