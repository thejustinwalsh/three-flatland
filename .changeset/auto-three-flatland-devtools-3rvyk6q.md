---
"@three-flatland/devtools": minor
---

> Branch: feat/devtools-texturepacker
> PR: https://github.com/thejustinwalsh/three-flatland/pull/143

## Features

- **Remote/mobile debugging over WebSocket** — attach the dashboard to a game running on a device or phone:
  - `connectRemoteDevtools(url)` on the dashboard side, `createDevtoolsProvider({ remote: 'ws://…' })` on the game side
  - New `flatland-devtools-relay` bin — a zero-dependency, spec-compliant RFC 6455 broadcast relay for bridging devices to the dashboard
  - Binary payloads (typed arrays, ArrayBuffers) round-trip over the wire alongside JSON messages
- **Time-travel debugging (Phase A) — frame-link scrubber**: park the dashboard at a past engine frame and every panel snaps to that moment
  - New scrubber control (drag, step, click a protocol-log row, jump to live) with per-provider parked-position memory
  - Stat cards, protocol log, and buffers panel all respect the parked frame cursor; canvas playback while parked lands in a later phase

## Bug Fixes

- Hardened the WebSocket relay against several RFC 6455 violations found in review: unmasked client frames are now rejected instead of relayed, oversized/fragmented control frames are rejected, a new frame can no longer interrupt an in-progress fragmented message, and the fragment-reassembly buffer is now bounds-checked (not just per-frame size) to prevent a slow-drip DoS
- Relay now rejects handshakes with an unsupported `Sec-WebSocket-Version`, preserves the original text/binary opcode on broadcast instead of hardcoding binary, echoes a close frame before disconnecting per spec, and guards broadcast writes against a peer closing mid-broadcast
- Fixed the 426 (version mismatch) response being dropped under backpressure by flushing before closing the socket
- Same-page provider/consumer bridges no longer relay messages to themselves in a loop; stale/disposed bridges no longer emit queued frames; the protocol log now falls back to an IndexedDB query when scrubbing past its in-memory tail cache

## Summary

This release adds a WebSocket-based remote debugging transport (with a hardened, spec-compliant relay) and the first phase of time-travel debugging via a frame-link scrubber, alongside a series of fixes closing RFC 6455 conformance gaps and remote-debug protocol edge cases.
