---
"three-flatland": patch
---

> Branch: fix/observable-single-pattern
> PR: https://github.com/thejustinwalsh/three-flatland/pull/113

- `Sprite2D` now delegates tint and anchor reactivity to `observable.color.attach` / `observable.vector2.attach` — removes ~100 lines of inline duplicate property-descriptor logic
- `observable.color.attach` and `observable.vector2.attach` are now used internally; the public module is no longer orphaned
- `attach` is idempotent: re-attaching a value swaps its `notify` closure safely, making values reusable across ownership changes
- R3F in-place mutation path (`sprite.tint.set(r, g, b)`) now reliably flushes to the batch color buffer without a systems pass; locked by a new `SpriteGroup` test
- `observable` module docs updated: `WithPropsSync` tuple-form example replaced with the direct-attach pattern that external extenders should use

Removes the last inline duplicate of the observe-in-place strategy from `Sprite2D`, consolidating all reactive property wiring behind the public `observable` module.
