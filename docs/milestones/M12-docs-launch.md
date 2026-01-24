# M12: Documentation & Launch

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 2 weeks |
| **Dependencies** | M0-M11 (All milestones) |
| **Outputs** | VitePress docs, API documentation, Tutorials, npm publish workflow, Marketing materials |
| **Risk Level** | Low |

---

## Objectives

1. Build comprehensive documentation site with VitePress
2. Generate API documentation with TypeDoc
3. Create step-by-step tutorials (Getting Started, Platformer, Card Game)
4. Set up npm publish workflow with changesets
5. Create marketing materials (README, badges, example gallery)

---

## Architecture

```
+---------------------------------------------------------------------------+
|                       DOCUMENTATION ARCHITECTURE                           |
+---------------------------------------------------------------------------+
|                                                                           |
|   Documentation Site (VitePress)                                          |
|   +-------------------------------------------------------------------+   |
|   |  /                     - Landing page                             |   |
|   |  /guide/               - Getting started, concepts                |   |
|   |  /tutorials/           - Step-by-step tutorials                   |   |
|   |  /api/                 - Auto-generated API docs                  |   |
|   |  /examples/            - Interactive examples                     |   |
|   |  /blog/                - Release notes, articles                  |   |
|   +-------------------------------------------------------------------+   |
|                              |                                            |
|                              v                                            |
|   API Documentation (TypeDoc)                                             |
|   +-------------------------------------------------------------------+   |
|   |  - Extracted from source code JSDoc                               |   |
|   |  - Type signatures                                                |   |
|   |  - Examples in comments                                           |   |
|   |  - Linked to source on GitHub                                     |   |
|   +-------------------------------------------------------------------+   |
|                              |                                            |
|                              v                                            |
|   Interactive Examples                                                    |
|   +-------------------------------------------------------------------+   |
|   |  - Embedded Sandpack/StackBlitz                                   |   |
|   |  - Live code editing                                              |   |
|   |  - Multiple frameworks (Vanilla, React)                           |   |
|   +-------------------------------------------------------------------+   |
|                                                                           |
+---------------------------------------------------------------------------+
```

---

## Detailed Implementation

### 1. Documentation Site Structure

```
docs/
+-- .vitepress/
|   +-- config.ts                 # VitePress configuration
|   +-- theme/
|   |   +-- index.ts              # Custom theme
|   |   +-- components/
|   |       +-- HomeHero.vue      # Landing page hero
|   |       +-- FeatureCard.vue   # Feature highlights
|   |       +-- ExampleEmbed.vue  # Interactive examples
|   |       +-- ApiRef.vue        # API reference component
+-- index.md                      # Landing page
+-- guide/
|   +-- index.md                  # Guide overview
|   +-- installation.md           # Installation guide
|   +-- quick-start.md            # Quick start
|   +-- concepts.md               # Core concepts
|   +-- sprites.md                # Sprite guide
|   +-- animation.md              # Animation guide
|   +-- tilemaps.md               # Tilemap guide
|   +-- text.md                   # Text rendering guide
|   +-- pipeline.md               # Render pipeline guide
|   +-- performance.md            # Performance optimization
|   +-- react.md                  # R3F integration guide
|   +-- presets.md                # Presets guide
+-- tutorials/
|   +-- index.md                  # Tutorials overview
|   +-- getting-started/          # Getting started tutorial
|   |   +-- index.md
|   |   +-- step-1.md
|   |   +-- step-2.md
|   |   +-- step-3.md
|   +-- platformer/               # Platformer tutorial
|   |   +-- index.md
|   |   +-- setup.md
|   |   +-- player.md
|   |   +-- tilemap.md
|   |   +-- animation.md
|   |   +-- physics.md
|   +-- card-game/                # Card game tutorial
|       +-- index.md
|       +-- setup.md
|       +-- cards.md
|       +-- 3d-integration.md
|       +-- effects.md
+-- api/
|   +-- index.md                  # API overview
|   +-- core/                     # @three-flatland/core
|   +-- react/                    # @three-flatland/react
|   +-- presets/                  # @three-flatland/presets
|   +-- nodes/                    # @three-flatland/nodes
+-- examples/
|   +-- index.md                  # Examples gallery
|   +-- basic-sprite.md           # Basic sprite example
|   +-- animation.md              # Animation example
|   +-- tilemap.md                # Tilemap example
|   +-- particles.md              # Particles example
|   +-- retro-game.md             # Retro game example
+-- blog/
|   +-- index.md                  # Blog index
|   +-- 2024-release.md           # Release announcement
+-- public/
    +-- logo.svg                  # Logo
    +-- og-image.png              # Social media image
    +-- favicon.ico               # Favicon
```

---

### 2. VitePress Configuration

**docs/.vitepress/config.ts:**

```typescript
import { defineConfig } from 'vitepress';
import { tabsMarkdownPlugin } from 'vitepress-plugin-tabs';

export default defineConfig({
  title: 'three-flatland',
  description: '2D rendering library for Three.js',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'three-flatland' }],
    ['meta', { property: 'og:description', content: '2D rendering library for Three.js' }],
    ['meta', { property: 'og:image', content: '/og-image.png' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Tutorials', link: '/tutorials/' },
      { text: 'API', link: '/api/' },
      { text: 'Examples', link: '/examples/' },
      {
        text: 'v0.1.0',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Contributing', link: '/contributing' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is three-flatland?', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Sprites', link: '/guide/sprites' },
            { text: 'Animation', link: '/guide/animation' },
            { text: 'Tilemaps', link: '/guide/tilemaps' },
            { text: 'Text Rendering', link: '/guide/text' },
            { text: 'Render Pipeline', link: '/guide/pipeline' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Performance', link: '/guide/performance' },
            { text: 'R3F Integration', link: '/guide/react' },
            { text: 'Presets', link: '/guide/presets' },
          ],
        },
      ],
      '/tutorials/': [
        {
          text: 'Tutorials',
          items: [
            { text: 'Overview', link: '/tutorials/' },
            { text: 'Getting Started', link: '/tutorials/getting-started/' },
            { text: 'Platformer Game', link: '/tutorials/platformer/' },
            { text: 'Card Game', link: '/tutorials/card-game/' },
          ],
        },
      ],
      '/api/': [
        {
          text: '@three-flatland/core',
          items: [
            { text: 'Sprite2D', link: '/api/core/sprite2d' },
            { text: 'AnimatedSprite2D', link: '/api/core/animated-sprite2d' },
            { text: 'Tilemap', link: '/api/core/tilemap' },
            { text: 'Text2D', link: '/api/core/text2d' },
            { text: 'Renderer2D', link: '/api/core/renderer2d' },
          ],
        },
        {
          text: '@three-flatland/react',
          items: [
            { text: 'Extend Functions', link: '/api/react/extend' },
            { text: 'useResource', link: '/api/react/use-resource' },
            { text: 'Hooks', link: '/api/react/hooks' },
          ],
        },
        {
          text: '@three-flatland/presets',
          items: [
            { text: 'RetroPreset', link: '/api/presets/retro' },
            { text: 'HDPreset', link: '/api/presets/hd' },
            { text: 'VFXPreset', link: '/api/presets/vfx' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/your-org/three-flatland' },
      { icon: 'discord', link: 'https://discord.gg/your-discord' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/your-org/three-flatland/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },

  markdown: {
    config(md) {
      md.use(tabsMarkdownPlugin);
    },
  },

  vite: {
    // Vite configuration for examples
  },
});
```

---

### 3. Landing Page

**docs/index.md:**

```markdown
---
layout: home

hero:
  name: three-flatland
  text: 2D for Three.js
  tagline: Pixi.js-style 2D rendering with Three.js power
  image:
    src: /logo.svg
    alt: three-flatland
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/your-org/three-flatland

features:
  - icon: 🎮
    title: Game-Ready Sprites
    details: Animated sprites, tilemaps, and text with batched rendering for 100,000+ sprites at 60fps.
  - icon: ⚡
    title: WebGPU Native
    details: Built on Three.js WebGPU with TSL (Three.js Shading Language) for next-gen performance.
  - icon: ⚛️
    title: React Three Fiber
    details: First-class R3F integration with tree-shakeable components and Suspense support.
  - icon: 🎨
    title: Visual Presets
    details: RetroPreset for pixel art, HDPreset for smooth graphics, VFXPreset for particles.
  - icon: 🔧
    title: Fully Typed
    details: Complete TypeScript support with strict types and excellent IntelliSense.
  - icon: 🌳
    title: Tree-Shakeable
    details: Import only what you need. Zero overhead for unused features.
---

<script setup>
import HomeDemo from './.vitepress/theme/components/HomeDemo.vue'
</script>

<HomeDemo />

## Quick Example

:::tabs
== Vanilla
```typescript
import * as THREE from 'three/webgpu';
import { Sprite2D, SpriteSheetLoader } from '@three-flatland/core';

const sheet = await SpriteSheetLoader.load('/sprites/player.json');

const player = new Sprite2D({
  texture: sheet.texture,
  frame: sheet.getFrame('player_idle'),
});

scene.add(player);
```

== React
```tsx
import { extendAll, spriteSheet, useResource } from '@three-flatland/react';

extendAll();

const playerSheet = spriteSheet('/sprites/player.json');

function Player() {
  const sheet = useResource(playerSheet);
  return <sprite2D texture={sheet.texture} />;
}
```
:::

## Trusted By

<TrustedBy />
```

---

### 4. Installation Guide

**docs/guide/installation.md:**

```markdown
# Installation

## Package Manager

:::tabs
== npm
```bash
npm install @three-flatland/core three
```

== pnpm
```bash
pnpm add @three-flatland/core three
```

== yarn
```bash
yarn add @three-flatland/core three
```
:::

## Peer Dependencies

three-flatland requires Three.js r170 or later:

```bash
npm install three@^0.170.0
```

## Optional Packages

### React Three Fiber Integration

```bash
npm install @three-flatland/react @react-three/fiber react
```

### Presets

```bash
npm install @three-flatland/presets
```

### TSL Nodes

```bash
npm install @three-flatland/nodes
```

## CDN

For quick prototyping, you can use a CDN:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
    "three/webgpu": "https://unpkg.com/three@0.170.0/build/three.webgpu.js",
    "@three-flatland/core": "https://unpkg.com/@three-flatland/core/dist/index.js"
  }
}
</script>
```

## TypeScript

three-flatland includes TypeScript declarations. No additional `@types` packages needed.

Recommended `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

## Next Steps

- [Quick Start](/guide/quick-start) - Build your first sprite
- [Concepts](/guide/concepts) - Understand core concepts
- [Examples](/examples/) - See what's possible
```

---

### 5. Tutorial: Getting Started

**docs/tutorials/getting-started/index.md:**

```markdown
# Getting Started Tutorial

In this tutorial, you'll learn the basics of three-flatland by creating a simple animated character.

## What You'll Build

By the end of this tutorial, you'll have:

- A sprite displayed on screen
- Animation playing
- Movement controls
- Layer-based rendering

<TutorialPreview src="/examples/getting-started" />

## Prerequisites

- Basic JavaScript/TypeScript knowledge
- Node.js 18+ installed
- A code editor (VS Code recommended)

## Setup

### 1. Create Project

```bash
npm create vite@latest my-game -- --template vanilla-ts
cd my-game
npm install
```

### 2. Install Dependencies

```bash
npm install three @three-flatland/core
```

### 3. Project Structure

```
my-game/
+-- public/
|   +-- sprites/
|       +-- player.json     # Spritesheet JSON
|       +-- player.png      # Spritesheet image
+-- src/
|   +-- main.ts             # Entry point
|   +-- game.ts             # Game logic
+-- index.html
+-- package.json
```

## Steps

1. [Step 1: Basic Setup](/tutorials/getting-started/step-1) - Create renderer and scene
2. [Step 2: Load Sprites](/tutorials/getting-started/step-2) - Load spritesheet and create sprite
3. [Step 3: Add Animation](/tutorials/getting-started/step-3) - Animate the character

[Start Tutorial →](/tutorials/getting-started/step-1)
```

---

### 6. TypeDoc Configuration

**typedoc.json:**

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": [
    "packages/core/src/index.ts",
    "packages/react/src/index.ts",
    "packages/presets/src/index.ts",
    "packages/nodes/src/index.ts"
  ],
  "out": "docs/api/generated",
  "plugin": ["typedoc-plugin-markdown", "typedoc-vitepress-theme"],
  "readme": "none",
  "githubPages": false,
  "excludePrivate": true,
  "excludeInternal": true,
  "categorizeByGroup": true,
  "navigationModel": {
    "excludeGroups": false,
    "excludeCategories": false,
    "excludeFolders": false
  }
}
```

---

### 7. npm Publish Workflow

**.github/workflows/publish.yml:**

```yaml
name: Publish

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Run tests
        run: pnpm test

      - name: Create Release Pull Request or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          title: 'chore: version packages'
          commit: 'chore: version packages'
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Build docs
        if: steps.changesets.outputs.published == 'true'
        run: pnpm docs:build

      - name: Deploy docs
        if: steps.changesets.outputs.published == 'true'
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/.vitepress/dist
```

---

### 8. README

**README.md:**

```markdown
<p align="center">
  <img src="docs/public/logo.svg" width="120" alt="three-flatland logo">
</p>

<h1 align="center">three-flatland</h1>

<p align="center">
  <strong>2D rendering library for Three.js</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@three-flatland/core">
    <img src="https://img.shields.io/npm/v/@three-flatland/core.svg?style=flat-square" alt="npm version">
  </a>
  <a href="https://github.com/your-org/three-flatland/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/your-org/three-flatland/ci.yml?style=flat-square" alt="build status">
  </a>
  <a href="https://www.npmjs.com/package/@three-flatland/core">
    <img src="https://img.shields.io/npm/dm/@three-flatland/core.svg?style=flat-square" alt="npm downloads">
  </a>
  <a href="https://github.com/your-org/three-flatland/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/@three-flatland/core.svg?style=flat-square" alt="license">
  </a>
</p>

<p align="center">
  <a href="https://three-flatland.dev">Documentation</a> |
  <a href="https://three-flatland.dev/examples">Examples</a> |
  <a href="https://discord.gg/your-discord">Discord</a>
</p>

---

## Features

- **Game-Ready Sprites** - Animated sprites, tilemaps, bitmap fonts, nine-slice
- **100,000+ Sprites** - Batched rendering for massive sprite counts at 60fps
- **WebGPU Native** - Built on Three.js WebGPU with TSL shaders
- **React Three Fiber** - First-class R3F integration with Suspense
- **Visual Presets** - RetroPreset, HDPreset, VFXPreset out of the box
- **Fully Typed** - Complete TypeScript support with strict types
- **Tree-Shakeable** - Import only what you need

## Installation

```bash
npm install @three-flatland/core three
```

## Quick Start

```typescript
import * as THREE from 'three/webgpu';
import { Sprite2D, SpriteSheetLoader, Renderer2D } from '@three-flatland/core';

// Setup
const renderer = new THREE.WebGPURenderer();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);

// Create 2D renderer
const renderer2D = new Renderer2D();

// Load spritesheet
const sheet = await SpriteSheetLoader.load('/sprites/player.json');

// Create sprite
const player = new Sprite2D({
  texture: sheet.texture,
  frame: sheet.getFrame('player_idle'),
});
player.position.set(400, 300, 0);
scene.add(player);
renderer2D.add(player);

// Render loop
function animate() {
  requestAnimationFrame(animate);
  renderer2D.render(renderer, camera);
}
animate();
```

## React Three Fiber

```tsx
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { extendAll, spriteSheet, useResource } from '@three-flatland/react';

extendAll();

const playerSheet = spriteSheet('/sprites/player.json');

function Player() {
  const sheet = useResource(playerSheet);
  return <sprite2D texture={sheet.texture} position={[400, 300, 0]} />;
}

export default function App() {
  return (
    <Canvas orthographic>
      <Suspense fallback={null}>
        <Player />
      </Suspense>
    </Canvas>
  );
}
```

## Packages

| Package | Description |
|---------|-------------|
| [@three-flatland/core](packages/core) | Core sprites, animation, tilemaps, pipeline |
| [@three-flatland/react](packages/react) | React Three Fiber integration |
| [@three-flatland/presets](packages/presets) | Visual presets (Retro, HD, VFX) |
| [@three-flatland/nodes](packages/nodes) | TSL node-based effects |

## Documentation

Visit [three-flatland.dev](https://three-flatland.dev) for:

- [Getting Started Guide](https://three-flatland.dev/guide/quick-start)
- [Tutorials](https://three-flatland.dev/tutorials)
- [API Reference](https://three-flatland.dev/api)
- [Examples](https://three-flatland.dev/examples)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
```

---

### 9. Contributing Guide

**CONTRIBUTING.md:**

```markdown
# Contributing to three-flatland

Thank you for your interest in contributing!

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 8+

### Getting Started

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Build packages: `pnpm build`
4. Run tests: `pnpm test`
5. Start dev server: `pnpm dev`

### Project Structure

```
three-flatland/
+-- packages/
|   +-- core/       # @three-flatland/core
|   +-- react/      # @three-flatland/react
|   +-- presets/    # @three-flatland/presets
|   +-- nodes/      # @three-flatland/nodes
+-- examples/       # Example projects
+-- docs/           # Documentation site
```

## Pull Request Process

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Add tests for new functionality
4. Run `pnpm test` and `pnpm lint`
5. Create a changeset: `pnpm changeset`
6. Push and open a PR

## Coding Standards

- Use TypeScript strict mode
- Follow existing code style (Prettier/ESLint)
- Write JSDoc comments for public APIs
- Add tests for new features

## Commit Messages

Follow conventional commits:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `chore:` Maintenance
- `test:` Tests

## Questions?

Join our [Discord](https://discord.gg/your-discord) or open an issue.
```

---

## Acceptance Criteria

- [ ] VitePress documentation site builds and deploys
- [ ] All guides are complete and accurate
- [ ] API documentation is auto-generated from source
- [ ] Tutorials are step-by-step and work correctly
- [ ] Interactive examples function properly
- [ ] npm publish workflow works correctly
- [ ] README is comprehensive and welcoming
- [ ] CONTRIBUTING guide is clear
- [ ] All links work correctly
- [ ] Social media preview images are set up

---

## Example Gallery Requirements

| Example | Description | Frameworks |
|---------|-------------|------------|
| Basic Sprite | Single sprite display | Vanilla, React |
| Animation | Animated character | Vanilla, React |
| Tilemap | Tile-based level | Vanilla, React |
| Particles | Particle effects | Vanilla, React |
| Retro Game | Complete retro-style game | Vanilla |
| Card Game | 3D card game with 2D faces | React |
| Platformer | Side-scrolling platformer | Vanilla |
| UI Demo | Nine-slice and text | React |

---

## Launch Checklist

### Before Launch

- [ ] All packages build successfully
- [ ] All tests pass
- [ ] Documentation site is complete
- [ ] Examples work correctly
- [ ] npm accounts configured
- [ ] GitHub Actions secrets set

### Launch Day

- [ ] Publish to npm
- [ ] Deploy documentation
- [ ] Create GitHub release
- [ ] Announce on social media
- [ ] Post to relevant communities

### After Launch

- [ ] Monitor for issues
- [ ] Respond to feedback
- [ ] Update based on user needs
- [ ] Plan next iteration

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation gaps | Medium | Medium | Review by multiple people |
| npm publish issues | Low | High | Test with dry-run |
| Broken examples | Medium | Medium | Automated testing |
| SEO issues | Low | Low | Follow best practices |

---

## Estimated Effort

| Task | Hours |
|------|-------|
| VitePress setup | 4 |
| Guide content | 12 |
| Tutorial content | 12 |
| API documentation | 4 |
| Interactive examples | 8 |
| README and marketing | 4 |
| npm publish workflow | 2 |
| Testing and review | 4 |
| **Total** | **50 hours** (~2 weeks) |

---

*End of M12: Documentation & Launch*
