---
'@three-flatland/image': minor
---

Initial release. Publishes the image pipeline that was already complete but never
un-privated: PNG/WebP/AVIF/KTX2 encode and decode, the `Ktx2Loader`, and the
`flatland-bake encode` baker.

This makes KTX2 reachable by consumers for the first time — both the loader and
the compression CLI (`flatland-bake encode --format ktx2 --basis-mode etc1s|uastc`),
which previously existed only behind the VS Code extension's Image Encoder.
