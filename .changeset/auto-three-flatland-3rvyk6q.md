---
"three-flatland": minor
---

> Branch: feat/devtools-texturepacker
> PR: https://github.com/thejustinwalsh/three-flatland/pull/143

## Sprites
- Fixed batched sprites not baking anchor offset into the instance matrix — sprites with a non-center anchor (e.g. `[0, 1]`) rendered in the wrong position when batched, even though the standalone (non-batched) path was correct. Trimmed + rotated frames are also covered by the fix.

## Loaders
- TexturePacker atlases now fully support "Allow rotation" and "Trim mode" export options — previously these had to be disabled at export time or sprites rendered incorrectly.
  - Rotated frames: shader unrotates frame-local UV sampling to match the packed atlas rect.
  - Trimmed frames: quads render at the trimmed size/offset instead of stretching to the full source bounds; trim scale/offset bake correctly into per-frame animations.
  - Docs updated with the supported TexturePacker feature set (rotation, trim, polygon trim).

## Remote debugging
- New WebSocket transport lets the devtools dashboard attach to a game running on a separate device (e.g. mobile) instead of only same-page `BroadcastChannel`.
  - `createDevtoolsProvider({ remote: 'ws://…' })` to opt in on the game side.
  - Binary and JSON payloads (including typed arrays) round-trip correctly over the wire.
  - Provider disconnect is reported to the dashboard promptly on page unload.
- Fixed several correctness and robustness issues found in review of the remote-debug track: WebSocket frame fragmentation handling, an echo loop when a page runs both provider and consumer bridges, binary payload corruption for payloads containing marker-shaped objects, stale frames being sent after a bridge is disposed, and a scrubber state bug during render.

## Summary
This release lands full TexturePacker rotation/trim support, fixes an anchor-offset rendering bug in batched sprites, and adds a WebSocket-based remote debugging transport for the devtools dashboard, along with several stability fixes found during review of that transport.
