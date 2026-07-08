---
"@three-flatland/devtools": minor
---

> Branch: feat/devtools-texturepacker
> PR: https://github.com/thejustinwalsh/three-flatland/pull/143

## Remote debugging
- New WebSocket transport wires the dashboard to a game running on a separate device — `connectRemoteDevtools(url)` on the dashboard side, `createDevtoolsProvider({ remote: 'ws://…' })` on the game side.
- New `flatland-devtools-relay` CLI: a zero-dependency RFC 6455 broadcast relay for bridging provider and consumer connections. Dev tool only — no auth/TLS.
- Frames queued while the socket is still connecting now flush once it opens instead of being dropped.

## Time-travel debugging (Phase A)
- New frame-link scrubber: park the dashboard at a past engine frame and every panel (stats, protocol log, buffers, registry) snaps to that moment.
  - Scrubber UI: play/pause, step, slider, live indicator; per-provider parked position is remembered when switching producers.
  - Click a protocol-log row to park at that frame; return to live via the LIVE button, double-click, or Esc.
  - Stat cards and protocol log render the nearest sample at or before the parked frame.
  - Buffers panel freezes canvas playback while parked (video decode continues so the delta chain stays valid).
  - Full historical playback remains a future phase.

## Relay hardening
- Fixed multiple RFC 6455 spec-compliance and robustness issues in the WebSocket relay found during review:
  - Unmasked client frames are now rejected instead of relayed (spec requires masked client frames).
  - Oversized or fragmented control frames (ping/pong/close) are rejected instead of producing invalid oversized pongs.
  - A new frame can no longer interrupt an in-progress fragmented message.
  - HTTP error responses now flush before the socket closes, avoiding dropped responses under backpressure.
  - Reassembled fragment size is now bounded (previously only per-frame size was capped), closing a memory-growth DoS via drip-fed continuation frames.
  - `Sec-WebSocket-Version` is validated; mismatched versions are rejected instead of silently accepted.
  - Broadcast now preserves the originating opcode (text frames stay text) instead of always sending binary.
  - Close is now acknowledged with a close frame per spec before ending the connection.
  - Broadcast writes are guarded against writing to a closed/closing socket.
  - `startRelay` now returns `{ close, server }` instead of a bare stop function, exposing the bound server (useful for ephemeral-port setups).
- Fixed a same-context echo loop, binary payload corruption, and stale-frame delivery after bridge disposal on the remote-debug transport (shared with `three-flatland`).

## Summary
This release adds a WebSocket-based remote debugging transport with a companion relay CLI, introduces Phase A of time-travel debugging (a frame-link scrubber across dashboard panels), and closes out a series of RFC 6455 compliance and hardening fixes in the relay found during review.
