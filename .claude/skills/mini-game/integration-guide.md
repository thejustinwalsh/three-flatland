# Docs Site Integration Guide

This document covers integrating mini-games into the three-flatland documentation site.

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│  Docs Site (Astro + Starlight)          │
│  ┌─────────────────────────────────┐    │
│  │  Hero.astro                      │    │
│  │  ┌─────────┐  ┌──────────────┐  │    │
│  │  │ Text    │  │ HeroGame.tsx │  │    │
│  │  │ Content │  │ (React)      │  │    │
│  │  └─────────┘  └──────────────┘  │    │
│  └─────────────────────────────────┘    │
│                    │                     │
│  ┌─────────────────▼─────────────────┐  │
│  │  sounds.ts (createZzfxProxy)      │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Cache Map<params, buffer>   │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
           │
           │ zzfx prop
           ▼
┌─────────────────────────────────────────┐
│  Mini-Game Package (@three-flatland/    │
│  mini-breakout)                         │
│  ┌─────────────────────────────────────┐│
│  │  <MiniBreakout zzfx={proxy} />      ││
│  │  - Uses raw ZzFX params internally  ││
│  │  - Calls zzfx(...params)            ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

---

## Sound Bridge

### In sounds.ts

The docs site provides a `createZzfxProxy` function that:
1. Accepts raw ZzFX parameter arrays
2. Caches generated audio buffers by parameter hash
3. Plays through the docs audio system (respects volume settings)

```typescript
// docs/src/scripts/sounds.ts

export type ZzFXParams = [
  volume?: number,
  randomness?: number,
  frequency?: number,
  // ... all 21 params
]

export type PlaySoundFn = (...params: ZzFXParams) => void

/**
 * Creates a ZzFX-compatible function that plays through the docs sound system.
 * Caches generated audio buffers for performance.
 */
export function createZzfxProxy(): PlaySoundFn {
  const cache = new Map<string, AudioBuffer>()

  return (...params: ZzFXParams) => {
    if (!isSoundEnabled()) return

    const key = JSON.stringify(params)

    // Check cache first
    let buffer = cache.get(key)
    if (!buffer) {
      // Generate using existing zzfx logic
      buffer = generateZzfxBuffer(params)
      cache.set(key, buffer)
    }

    // Play through docs audio context
    playBuffer(buffer)
  }
}
```

### In Mini-Game

Mini-games receive the proxy as a prop:

```typescript
export interface MiniGameProps {
  zzfx?: (...params: ZzFXParams) => void
  isVisible?: boolean
  className?: string
}

export default function MiniBreakout({
  zzfx = defaultZzfx,
  isVisible = true,
}: MiniGameProps) {
  // Use zzfx directly - works in both embedded and standalone modes
  const playBounce = () => zzfx(0.4, 0, 400, 0, 0.015, 0.035, 3)

  return (
    <Canvas>
      <Game onBounce={playBounce} />
    </Canvas>
  )
}

// Default for standalone mode - uses actual zzfx library
const defaultZzfx: PlaySoundFn = async (...params) => {
  const { zzfx } = await import('zzfx')
  zzfx(...params)
}
```

---

## HeroGame React Island

### Component Structure

```tsx
// docs/src/components/HeroGame.tsx
import { lazy, Suspense, useState, useEffect } from 'react'
import type { PlaySoundFn } from '../scripts/sounds'

// Lazy load the mini-game
const MiniBreakout = lazy(() => import('@three-flatland/mini-breakout'))

// Placeholder while loading
function GamePlaceholder() {
  return (
    <div className="hero-game-placeholder">
      <div className="hero-game-loading">Loading...</div>
    </div>
  )
}

export default function HeroGame() {
  const [zzfxProxy, setProxy] = useState<PlaySoundFn | null>(null)
  const [isVisible, setVisible] = useState(true)

  // Load sound bridge on mount
  useEffect(() => {
    import('../scripts/sounds').then((sounds) => {
      setProxy(() => sounds.createZzfxProxy())
    })
  }, [])

  // Track visibility for pause/resume
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.1 }
    )

    const el = document.querySelector('.hero-game')
    if (el) observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return (
    <Suspense fallback={<GamePlaceholder />}>
      <MiniBreakout
        zzfx={zzfxProxy ?? (() => {})}
        isVisible={isVisible}
      />
    </Suspense>
  )
}
```

### Astro Integration

```astro
---
// docs/src/components/Hero.astro
import HeroGame from './HeroGame'
---

<div class="hero-content-wrapper">
  <div class="hero-text">
    <Default {...Astro.props}><slot /></Default>
  </div>
  <div class="hero-game">
    <HeroGame client:visible />
  </div>
</div>

<style>
  .hero-content-wrapper {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
  }

  .hero-text {
    flex: 1 1 400px;
    min-width: 300px;
  }

  .hero-game {
    flex: 0 0 300px;
    aspect-ratio: 3 / 2;
    /* Retro border styling */
    border: 4px solid var(--retro-navy);
    border-radius: 4px;
    background: var(--retro-navy);
    box-shadow: 4px 4px 0 var(--retro-pink);
  }

  /* Mobile: game below text (natural flow) */
  @media (max-width: 768px) {
    .hero-content-wrapper {
      flex-direction: column;
    }

    .hero-game {
      flex: 0 0 auto;
      width: 100%;
      max-width: 300px;
    }
  }
</style>
```

---

## Responsive Layout

### Desktop (> 768px)
```
┌─────────────────────────────────────────────────┐
│  Hero Section                                    │
│  ┌──────────────────────┐  ┌─────────────────┐  │
│  │                      │  │                 │  │
│  │  Welcome to          │  │   [Mini-Game]   │  │
│  │  three-flatland      │  │                 │  │
│  │                      │  │                 │  │
│  │  [Get Started]       │  │                 │  │
│  │                      │  │                 │  │
│  └──────────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Mobile (< 768px)
```
┌─────────────────────────┐
│  Hero Section           │
│  ┌───────────────────┐  │
│  │                   │  │
│  │  Welcome to       │  │
│  │  three-flatland   │  │
│  │                   │  │
│  │  [Get Started]    │  │
│  │                   │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │                   │  │
│  │    [Mini-Game]    │  │
│  │                   │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

---

## Standalone Development

Mini-games can run independently for rapid iteration:

### index.html
```html
<!DOCTYPE html>
<html>
<head>
  <title>Flatland Breakout - Dev</title>
  <style>
    body { margin: 0; background: #0a0a23; }
    #root { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

### main.tsx
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

### App.tsx (Dev wrapper)
```tsx
import MiniBreakout from './Game'

// In standalone mode, use actual zzfx library
async function loadZzfx() {
  const { zzfx } = await import('zzfx')
  return zzfx
}

export default function App() {
  const [zzfx, setZzfx] = useState<PlaySoundFn>(() => () => {})

  useEffect(() => {
    loadZzfx().then(setZzfx)
  }, [])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <MiniBreakout zzfx={zzfx} isVisible={true} />
    </div>
  )
}
```

---

## Package Exports

Mini-game packages export both library and types:

```typescript
// minis/breakout/src/index.ts

export { default } from './Game'
export type { MiniGameProps, ZzFXParams } from './types'
```

### package.json
```json
{
  "name": "@three-flatland/mini-breakout",
  "exports": {
    ".": {
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "dev": "tsdown --watch",
    "dev:app": "vite dev --port ${TURBO_MFE_PORT:-5200}",
    "build": "tsdown"
  }
}
```

**Important:** The `dev` script runs tsdown in watch mode so that `pnpm dev` at the root automatically rebuilds the library when source files change. Use `dev:app` for the standalone vite dev server.

---

## Testing Integration

### Local Development

**Option 1: Embedded in docs (recommended)**
```bash
pnpm dev  # Runs docs + all mini-game watch builds
```
This starts the docs site and watches all mini-game packages for changes.

**Option 2: Standalone testing**
```bash
pnpm --filter=@three-flatland/mini-breakout dev:app
```
Opens the mini-game in isolation on port 5200.

### Verification Checklist
- [ ] Game loads in docs hero without errors
- [ ] Attract mode plays automatically
- [ ] Tap/click starts gameplay
- [ ] Sounds play through docs sound system
- [ ] Volume toggle affects game sounds
- [ ] Game pauses when scrolled off-screen
- [ ] Responsive layout works on mobile
- [ ] No memory leaks on navigation
