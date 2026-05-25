<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/bake

Shared bake pipeline infrastructure for [three-flatland](https://www.npmjs.com/package/three-flatland) and Three.js WebGPU. Provides the `flatland-bake` CLI dispatcher, browser-safe loader utilities for assets with offline-baked siblings, and the baker discovery mechanism.

> **Alpha Release** — this package is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/bake)](https://www.npmjs.com/package/@three-flatland/bake)
[![license](https://img.shields.io/npm/l/@three-flatland/bake)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Install

```bash
npm install @three-flatland/bake@alpha
```

Install alongside any package that contributes a baker — e.g. [`@three-flatland/normals`](https://www.npmjs.com/package/@three-flatland/normals) for sprite normal maps.

## Quick Start

### Run a registered baker

```bash
npx flatland-bake normal public/sprites/knight.png
npx flatland-bake --list
```

The CLI walks `node_modules` and picks up any package that declares a `flatland.bake` manifest in its `package.json`. Install a baker package and its subcommand appears in `--list` automatically — no registration step.

### Use the browser-safe utilities

Loaders that follow the "try baked sibling → fall back to in-memory" pattern share a small utility surface from the default entry. Importable from any environment (browser, node, workers):

```typescript
import {
  bakedSiblingURL,
  probeBakedSibling,
  hashDescriptor,
  devtimeWarn,
  type BakedAssetLoaderOptions,
} from '@three-flatland/bake'
```

Node-only code (CLI, discovery, sidecar file writers) lives under the `/node` subpath:

```typescript
import { discoverBakers, writeSidecarPng, writeSidecarJson } from '@three-flatland/bake/node'
```

## Authoring a Baker

Packages contribute bakers via a `flatland.bake` manifest plus a default-exported `Baker`:

```jsonc
// package.json
{
  "flatland": {
    "bake": [
      {
        "name": "normal",
        "description": "Bake a tangent-space normal map from a sprite PNG",
        "entry": "./dist/cli.js"
      }
    ]
  }
}
```

```typescript
// src/cli.ts
import type { Baker } from '@three-flatland/bake'

const baker: Baker = {
  name: 'normal',
  description: 'Bake a tangent-space normal map from a sprite PNG',
  run: async (args) => {
    // your CLI logic here — return 0 for success
    return 0
  },
}
export default baker
```

[`@three-flatland/normals`](https://github.com/thejustinwalsh/three-flatland/tree/main/packages/normals) is a reference implementation.

## Options

### CLI

```
flatland-bake <name> [args...]    Run a registered baker
flatland-bake --list              List registered bakers
flatland-bake --help              Show usage
```

### Shared loader option

Every loader that speaks the baked-sibling pattern extends `BakedAssetLoaderOptions`, which adds a single opt-out:

```typescript
interface BakedAssetLoaderOptions {
  /** Skip the baked-sibling probe; always generate in-memory. */
  skipBakedProbe?: boolean
}
```

Consumers pass `skipBakedProbe: true` during asset iteration to silence the devtime "no baked sibling" warning.

## Using with plain Three.js

`@three-flatland/bake` is renderer-agnostic. Run the CLI from any project's `npm scripts` to bake assets, or import the browser-safe helpers to write your own sidecar-aware loaders — no three-flatland dependency required.

## Related

- **[three-flatland](https://www.npmjs.com/package/three-flatland)** — the 2D engine. High-level loaders consume this package's helpers internally.
- **[@three-flatland/normals](https://www.npmjs.com/package/@three-flatland/normals)** — reference baker: sprite / tileset normal map generation.

## Documentation

Full docs, interactive examples, and API reference at **[thejustinwalsh.com/three-flatland](https://thejustinwalsh.com/three-flatland/)**

## License

[MIT](./LICENSE)

---

<sub>This README was created with AI assistance. AI can make mistakes — please verify claims and test code examples. Submit corrections [here](https://github.com/thejustinwalsh/three-flatland/issues).</sub>
