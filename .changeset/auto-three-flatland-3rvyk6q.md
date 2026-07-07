---
"three-flatland": minor
---

> Branch: feat/devtools-texturepacker
> PR: https://github.com/thejustinwalsh/three-flatland/pull/143

## Features

- **TexturePacker support** — atlases exported with rotation and/or trim optimizations enabled now render correctly (previously required disabling those options at export):
  - Rotated frames: batched and standalone sprites unrotate frame-local UV sampling to match the packer's swapped width/height convention; `OcclusionPass` mirrors the same math
  - Trimmed frames: quads are sized/positioned to the trimmed rect with the true offset baked into the instance matrix, fixing stretch/wobble on trimmed animation frames
  - Docs: loaders guide now documents the supported TexturePacker feature set (rotation, trim, polygon trim)
- **Remote/mobile debugging over WebSocket** — attach the desktop devtools dashboard to a game running on a device:
  - New wire codec (16-byte header + TLV sections) carries messages and binary payloads (typed arrays/ArrayBuffers) over the wire with round-trip fidelity
  - `createDevtoolsProvider({ remote: 'ws://…' })` opens/closes the remote bridge alongside the provider lifecycle
  - `@three-flatland/devtools` exports `connectRemoteDevtools(url)` for the dashboard side, plus a `flatland-devtools-relay` CLI bin (zero-dependency, RFC 6455-compliant broadcast relay)

## Bug Fixes

- Batched sprites with a non-center anchor (`anchor != (0.5, 0.5)`) now render at the correct position — the batch transform path previously dropped the anchor offset from the instance matrix, only baking the trim offset
- Fixed several remote-debug correctness issues found in adversarial review: WebSocket message fragmentation (RFC 6455) is now handled correctly, same-page provider/consumer bridges no longer relay messages to themselves in a loop, binary payloads no longer collide with marker-shaped user data, stale bridges no longer emit frames after dispose, and the protocol log now falls back to IndexedDB when scrubbing past the in-memory cache

## Summary

This release adds full TexturePacker compatibility (rotated and trimmed atlas frames) and a new WebSocket-based remote debugging transport for mobile/device testing, alongside fixes for a batched-sprite anchor rendering bug and several remote-debug protocol edge cases.
