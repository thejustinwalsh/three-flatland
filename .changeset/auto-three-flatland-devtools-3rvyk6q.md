---
"@three-flatland/devtools": minor
---

> Branch: feat/devtools-texturepacker
> PR: https://github.com/thejustinwalsh/three-flatland/pull/143

## Features

- WebSocket transport for remote/mobile debugging: `connectRemoteDevtools(url)` connects the dashboard to a device running the game, and a new zero-dependency `flatland-devtools-relay` bin relays frames between them (dev tool only — no auth/TLS)
- Time-travel debugging Phase A: frame-link scrubber lets you park the dashboard at a past engine frame and have every panel (stats, protocol log, buffers, registry) snap to that moment
  - Scrubber UI with drag/step controls, per-provider parked position memory, and a LIVE button/Esc to resume
  - Stat cards, protocol log, and buffers panel all respect the parked frame cursor

## Fixes

- WebSocket relay hardened against multiple RFC 6455 spec violations found in adversarial review:
  - Unmasked client frames are now rejected instead of relayed
  - Oversized/fragmented control frames (ping/pong/close) are rejected per spec
  - Data frames can no longer interrupt an in-progress fragmented message
  - Version mismatch (`Sec-WebSocket-Version !== 13`) is rejected instead of silently accepted
  - Reassembled-fragment size is now bounded, closing a fragment-based DoS vector
  - Broadcast now preserves the originating opcode (text stays text) and guards writes against closed/closing sockets
  - 426 handshake-rejection responses now flush reliably before closing the socket
- Fixed same-context echo loops when a provider and consumer bridge run in the same page, binary payloads that resembled internal markers, and stale frames sent from disposed bridges
- Scrubber cursor restoration moved out of render into an effect; parking at a frame older than the protocol log's cache now falls back to an IndexedDB query instead of silently failing

This release adds a WebSocket-based remote/mobile debugging transport and a time-travel frame scrubber, backed by a hardened, spec-compliant relay implementation.
