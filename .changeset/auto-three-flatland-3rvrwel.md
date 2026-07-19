---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

### 18b86211f02088a85cab467d28f724da637e5054
fix: derive the camera aspect from the render surface
`Flatland` defaulted `_aspect` to 1 and left it there until someone called
`resize()`. Nothing inside the library ever did. In plain three.js that is
survivable — the vanilla examples wire a window resize handler — but in R3F there
is no obvious place to hang that call, and the type surface gives no hint one is
required.

Of the three React examples that mount `<flatland>`, two hand-roll the missing
bridge (lighting resizes in a useEffect on `useThree(s => s.size)`; pass-effects
re-resizes every frame inside useFrame) and the third does not, so its scene
rendered at aspect 1: an 800-unit-wide frustum on a 1280x720 canvas, everything
1.78x too large. Every consumer was silently required to know a handshake that
nothing documented.

The renderer is already Flatland's per-frame source of truth for viewport state —
`_syncGlobals` reads `renderer.getSize()` every render to feed `globals.viewportSize`.
The camera frustum was the one viewport-dependent value not synced from it. So
`render()` now derives the aspect from the render surface: the RenderTarget's
dimensions when rendering to texture, otherwise the renderer's. Unchanged sizes
short-circuit, so LightEffect tile buffers only reallocate on a real change.

An explicit `resize()` or `aspect =` switches to manual mode permanently, leaving
every existing caller byte-for-byte identical. Zero/negative/NaN dimensions are a
no-op that neither latches a broken frustum nor disables auto-sync, so a 0x0 first
commit self-heals on the next frame instead of pinning aspect 1 forever.

`aspect` also becomes a real accessor. It was constructor-only, and therefore
unreachable from JSX under R3F's no-arg-construction + property-setting pattern.

Verified in Chrome on WebGPU: the React and three.js twins of examples/uikit now
render pixel-identical geometry with no example-side changes.

Tests: 792 -> 803.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/flatland-resize.test.ts
Stats: 2 files changed, 255 insertions(+), 3 deletions(-)
