<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/alphamap

Offline alpha hitmask baker for pixel-perfect sprite hit testing in [three-flatland](https://www.npmjs.com/package/three-flatland). Bake a sprite's alpha channel to a sidecar once at build time, and `hitTestMode: "alpha"` picks against real pixels — clicks land on the sprite, not the transparent corners of its quad — with no runtime readback cost.

> **Alpha Release** — this package is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/alphamap)](https://www.npmjs.com/package/@three-flatland/alphamap)
[![license](https://img.shields.io/npm/l/@three-flatland/alphamap)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## CLI

Contributes an `alpha` subcommand to the [`flatland-bake`](https://www.npmjs.com/package/@three-flatland/bake) CLI. It reads an RGBA sprite PNG and writes `<input>.alpha.png` — the source alpha stored in the R channel (replicated to G/B for viewability), stamped with a descriptor hash so runtime loaders can detect stale bakes.

```sh
flatland-bake alpha sprites.png   # writes sprites.alpha.png
```

The sidecar backs `hitTestMode: 'alpha'` in `three-flatland`, and it is optional: the loader probes for the baked sibling (hash-checked) and falls back to a runtime readback when it is absent or stale — baking simply moves that cost from every user's first load to your build. See the [Hit Testing guide](https://tjw.dev/three-flatland/guides/hit-testing/).

## API

```ts
import { bakeAlphaMapFile } from '@three-flatland/alphamap/node'

bakeAlphaMapFile('sprites.png') // → 'sprites.alpha.png'
```

`@three-flatland/alphamap` (browser-safe) exports only `ALPHA_DESCRIPTOR` — the versioned sidecar descriptor the hash stamp derives from, kept in lockstep with the core loader's probe. The file-I/O baker lives under `/node` and the CLI baker under `/cli`.

## Documentation

Full docs, guides, and interactive examples at **[tjw.dev/three-flatland](https://tjw.dev/three-flatland/)**.

## License

[MIT](./LICENSE)
