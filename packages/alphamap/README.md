# @three-flatland/alphamap

Offline alpha hitmask baker for pixel-perfect sprite hit testing.

Contributes an `alpha` subcommand to the [`flatland-bake`](../bake) CLI. It
reads an RGBA sprite PNG and writes `<input>.alpha.png` — the source alpha
stored in the R channel (replicated to G/B for viewability), stamped with a
descriptor hash so runtime loaders can detect stale bakes.

```sh
flatland-bake alpha sprites.png   # writes sprites.alpha.png
```

The sidecar backs `hitTestMode: 'alpha'` in `three-flatland`. It is optional:
the loader falls back to a runtime canvas readback when the sidecar is absent.
See the [Hit Testing guide](https://thejustinwalsh.com/three-flatland/guides/hit-testing/).

## API

```ts
import { bakeAlphaMapFile } from '@three-flatland/alphamap/node'

bakeAlphaMapFile('sprites.png') // → 'sprites.alpha.png'
```

`@three-flatland/alphamap` (browser-safe) exports only `ALPHA_DESCRIPTOR`; the
file-I/O baker lives under `/node` and the CLI baker under `/cli`.
