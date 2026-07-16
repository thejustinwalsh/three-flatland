---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

## Bug Fixes

- `Flatland` now auto-derives camera aspect from the render surface (RenderTarget dimensions when rendering to texture, otherwise the renderer's) instead of defaulting to `1` and staying stuck until an explicit `resize()` call
- Fixes distorted/oversized rendering in R3F apps that never manually called `resize()` — previously required an undocumented manual handshake, silently breaking scenes at non-1:1 aspect ratios
- Auto-sync short-circuits on unchanged sizes, so LightEffect tile buffers only reallocate on real viewport changes
- Zero/negative/NaN dimensions are now a no-op, letting a `0x0` first frame self-heal instead of permanently latching aspect `1`
- `aspect` is now a real accessor (previously constructor-only), so it can be set as a JSX prop under R3F's no-arg-construction + property-setting pattern
- Calling `resize()` or setting `aspect` explicitly still switches to manual mode, preserving existing caller behavior

Summary: fixes camera aspect ratio so it correctly tracks the render surface automatically, removing the need for consumers (especially R3F users) to manually wire resize handling.
