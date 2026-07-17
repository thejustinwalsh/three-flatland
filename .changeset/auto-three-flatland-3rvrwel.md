---
"three-flatland": patch
---

> Branch: fix/flatland-react-aspect
> PR: https://github.com/thejustinwalsh/three-flatland/pull/181

- Fix: `Flatland` camera aspect ratio now auto-derives from the renderer/render-target size every frame, instead of staying pinned at the constructor default (1) until something manually called `resize()`
- This fixes distorted/oversized rendering in React Three Fiber scenes that mount `<flatland>` without a manual resize bridge (previously required a hand-rolled `useThree(s => s.size)` -> `resize()` effect)
- `aspect` is now a real get/set accessor (was constructor-only), so it can be set as a JSX prop under R3F's no-arg-construction + property-setting pattern
- Passing an explicit `aspect` option/property, or calling `resize()`, switches to manual aspect control and disables the automatic sync going forward — existing callers are unaffected
- Auto-sync ignores zero/negative/NaN dimensions and short-circuits on unchanged sizes, so an unmeasured 0x0 first layout self-heals instead of latching a broken frustum, and LightEffect tile buffers only reallocate on real size changes

No breaking changes — this is a backwards-compatible bug fix. Camera aspect ratio in Three.js and R3F now tracks the actual render surface automatically, fixing distorted scenes that previously required manual resize wiring.
