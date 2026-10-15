---
"three-flatland": minor
---

> Branch: feat/devtools-texturepacker
> PR: https://github.com/thejustinwalsh/three-flatland/pull/143

## Features

- **TexturePacker support for rotated and trimmed frames** — atlases packed with size optimizations (rotation, trim) now render correctly without disabling those options at export. Rotated frames unrotate frame-local sampling via a new per-instance flag; trimmed frames position the quad at the true trimmed offset, with trim scale/offset baked into both the standalone and batched matrix paths so per-frame trim in animations no longer stretches or wobbles. `OcclusionPass` mirrors the same math. Docs updated to cover the supported TexturePacker feature set (rotation, trim, polygon trim).
- **WebSocket transport for remote/mobile debugging** — run the game on a device and attach the desktop devtools dashboard over WebSocket. Adds a wire codec for bus frames (JSON + binary sections, round-trip safe for typed arrays), direction-filtered bridges over the existing BroadcastChannel bus, `createDevtoolsProvider({ remote: 'ws://…' })`, and outbound frame queuing while the socket is connecting.

## Fixes

- Fixed a batching bug where batched sprites with a non-center anchor (`anchor != [0.5, 0.5]`) rendered at the wrong position — the batch path now bakes the anchor offset into the instance matrix identically to the standalone path. Added a regression test.
- Hardened remote-debug WebSocket handling: both socket message handlers are now guarded against malformed frames (a bad frame no longer crashes remote debugging), the consumer bridge opens a provider's data channel eagerly so early subscribes aren't dropped, and reconnecting a provider on an already-closed socket now warns instead of silently going dark.
- Fixed several adversarial-review findings on the remote-debug path: correct RFC 6455 fragmentation handling in the relay, a same-context echo guard to prevent provider/consumer bridges in one page from relay-ping-ponging forever, binary payloads now travel via an explicit path table instead of sentinel objects, and wire sends are properly bound to bridge lifetime.

## Summary

This release adds full TexturePacker atlas support (rotation + trim) and a WebSocket-based remote debugging transport, alongside anchor-offset and remote-debug robustness fixes.
