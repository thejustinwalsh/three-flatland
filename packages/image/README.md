<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/image

WASM image codec for [three-flatland](https://www.npmjs.com/package/three-flatland) and [Three.js](https://threejs.org/). Encode and decode **PNG, WebP, AVIF, and KTX2** across the browser, Node, and a [`flatland-bake`](https://www.npmjs.com/package/@three-flatland/bake) CLI subcommand — plus a `Ktx2Loader` that keeps textures GPU-compressed to cut VRAM pressure.

> **Alpha Release** — this package is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/image)](https://www.npmjs.com/package/@three-flatland/image)
[![license](https://img.shields.io/npm/l/@three-flatland/image)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Why KTX2

PNG/WebP/AVIF all decode to raw RGBA on the GPU — a 2048×2048 texture costs ~16 MB of VRAM no matter how small the file was on disk. KTX2 (Basis Universal) stays **compressed on the GPU**, transcoded to the platform's native format (BC7, ASTC, ETC2, …) at load. Reach for it when textures are under GPU-memory pressure; reach for PNG/WebP/AVIF when disk size or fidelity is what matters.

## Install

```bash
npm install @three-flatland/image
```

`three` is a peer dependency.

## Encode / decode

`encodeImage` takes an `ImageData` (`{ width, height, data }`) and returns the compressed bytes; `decodeImage` goes the other way.

```ts
import { encodeImage, decodeImage } from '@three-flatland/image'

// ImageData → compressed bytes
const png = await encodeImage(pixels, { format: 'png' })
const avif = await encodeImage(pixels, { format: 'avif', quality: 60 })
const ktx2 = await encodeImage(pixels, {
  format: 'ktx2',
  basis: { mode: 'uastc', mipmaps: true }, // supercompression defaults to zstd
})

// compressed bytes → ImageData
const decoded = await decodeImage(bytes, 'png')
```

`estimateGpuMemory` reports the VRAM a source will cost per candidate format, so you can decide when KTX2 is worth it before committing a texture.

In Node, the `/node` subpath adds file and batch helpers:

```ts
import { encodeImageFile, encodeImageBatch } from '@three-flatland/image/node'
```

## KTX2 loader

`Ktx2Loader` extends `three.Loader`. Detect the renderer's supported transcode targets once, then load — the texture stays GPU-compressed.

```ts
import { Ktx2Loader } from '@three-flatland/image/loaders/ktx2'

const loader = new Ktx2Loader()
await loader.detectSupport(renderer) // required before load(): picks BC7/ASTC/ETC2/…
const texture = await loader.loadAsync('/sprite.ktx2')
```

## CLI

The package contributes an `encode` subcommand to the [`flatland-bake`](https://www.npmjs.com/package/@three-flatland/bake) CLI:

```bash
flatland-bake encode ./sprite.png sprite.ktx2
```

## Documentation

Full docs and guides at **[tjw.dev/three-flatland](https://tjw.dev/three-flatland/)**.

## License

[MIT](./LICENSE)
