---
"three-flatland": minor
---

> Branch: feat/devtools-texturepacker
> PR: https://github.com/thejustinwalsh/three-flatland/pull/143

## Features

- Full TexturePacker support: rotated frames and trimmed frames now render correctly without disabling rotation/trim at export
  - Rotated-frame atlas rects are unrotated in-shader (batched and standalone paths, plus `OcclusionPass`)
  - Trimmed frames render at their true offset/size instead of stretching to the source bounds; trim is baked into the matrix for both batched and standalone sprites, fixing wobble in trimmed-frame animations
  - Docs: loaders guide documents supported TexturePacker features (rotation, trim, polygon trim)
- WebSocket transport for remote/mobile debugging: run the game on a device and attach the desktop dashboard over `ws://`
  - New `bus-websocket` wire codec (JSON + binary TLV framing) for `DevtoolsProvider`, with `remote: 'ws://…'` option
  - Pairs with `@three-flatland/devtools`' new `connectRemoteDevtools()` and `flatland-devtools-relay` bin

## Fixes

- Batched sprites now bake anchor + trim offsets identically to standalone sprites — previously the batch path dropped the anchor term, causing incorrect placement for any batched sprite with `anchor != (0.5, 0.5)`
- Remote-debug hardening: WebSocket bus frames now handle RFC 6455 fragmentation correctly, avoid echo/relay loops when a provider and consumer bridge share a page, keep binary payloads intact, and stop emitting stale frames from disposed bridges

This release completes TexturePacker compatibility (rotated + trimmed atlas frames) and ships a WebSocket-based remote debugging transport, alongside a batching correctness fix for anchored sprites.
