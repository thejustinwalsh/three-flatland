# @three-flatland/uikit

Performant 3D user interfaces for Three.js and [yoga](https://github.com/facebook/yoga),
ported to WebGPU + WebGL2 via TSL (Three Shader Language) and
[`@three-flatland/slug`](../slug) for text and vector-shape rendering.

Forked from [pmndrs/uikit](https://github.com/pmndrs/uikit) @ `0d4d887`.

## Status

This package is mid-port. The renderer-coupled seams (panel material, glyph
rendering, TTF loading) are stubbed pending the TSL + Slug uplift — see
`planning/superpowers/specs/2026-07-10-uikit-fork-tsl-slug-design.md` for the full
design and `planning/superpowers/plans/uikit-fork-tsl-slug-execution.md` for the
phase-by-phase execution plan.

## License

MIT — see [LICENSE](./LICENSE). Retains upstream's copyright notices (Bela Bohlender
2024, Coconut Capital 2023) alongside the fork's.
