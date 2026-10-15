---
"@three-flatland/devtools": minor
---

> Branch: feat/devtools-texturepacker
> PR: https://github.com/thejustinwalsh/three-flatland/pull/143

## Features

- **WebSocket transport for remote/mobile debugging** — run the game on a device, attach the desktop dashboard over WebSocket. Adds `connectRemoteDevtools(url)` and a zero-dependency `flatland-devtools-relay` bin (minimal RFC 6455 broadcast relay for development use — no auth/TLS by design).
- **Time-travel debugging, Phase A: frame-link scrubber** — a shared, per-provider frame cursor lets you park the whole dashboard at a past engine frame. New scrubber control (drag, step, click a protocol-log row to jump to its frame, LIVE button / double-click / Esc to resume). Stat cards and the protocol log now render values relative to the parked frame; the buffers panel freezes its canvas while parked with a "parked at frame N" notice (full historical playback lands in a later phase).

## Fixes

- Hardened the WebSocket relay against several RFC 6455 violations and edge cases: rejects unmasked client frames and Sec-WebSocket-Version mismatches, caps both per-frame and reassembled-fragment size, rejects malformed/oversized control frames and mid-fragmentation interleaving, preserves the original opcode (text vs binary) on broadcast, echoes close frames per spec, and guards broadcast writes so a peer disconnecting mid-broadcast can't throw. `startRelay` now returns `{ close, server }` instead of a bare stop function.
- Fixed remote-debug WebSocket robustness: malformed frames no longer crash the socket message handlers, the consumer bridge opens a provider's data channel eagerly so early subscribes aren't dropped, and a closed socket passed on (re)start now warns instead of silently going dark.
- Fixed a same-context echo guard so a provider bridge and consumer bridge coexisting in one page (dashboard debugging itself) no longer relay-ping-pong forever; binary payloads now travel via an explicit path table instead of sentinel objects; wire sends are bound to bridge lifetime so a disposed bridge can't emit stale frames.
- Scrubber and protocol-log cursor state now update via effects instead of mid-render, fixing a one-frame flash of the previous provider's cursor when switching producers.

## Summary

This release adds a WebSocket-based remote debugging transport and a time-travel frame scrubber, backed by a hardened, spec-compliant relay implementation.
