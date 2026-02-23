# Pass Effects — React Three Fiber

Demonstrates dynamic post-processing PassEffects using the Flatland pipeline with R3F.

## What It Shows

- **`createPassEffect()`** factory for defining reusable pass effects
- **Preset switching** — dynamically add/remove passes at runtime via React state
- **Effect chaining** — multiple passes composed in order
- **Zero-cost uniforms** — time-driven effects update without rebuilding the shader graph
- **Flatland as R3F component** — `<flatland>` JSX element with pass management

## Presets

| Preset | Passes | Description |
|--------|--------|-------------|
| Clean | 0 | No post-processing |
| CRT Arcade | 1 | Full CRT composite (curvature, scanlines, bloom, vignette, color bleed) |
| Handheld | 4 | Posterize + LCD grid + backlight bleed + vignette |
| VHS Tape | 3 | VHS distortion + static noise + chromatic aberration |
| Retro PC | 3 | Color quantize + scanlines + vignette |

## Run

```bash
pnpm --filter=example-react-pass-effects dev
```
