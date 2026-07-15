---
"@three-flatland/devtools": minor
---

> Branch: feat-vscode-tools
> PR: https://github.com/thejustinwalsh/three-flatland/pull/117

## Remote debugging

- `connectRemoteDevtools(url)` and `createDevtoolsProvider({ remote: 'ws://…' })` add a WebSocket transport for attaching the dashboard to a game running on a separate device (mobile/remote debugging)
- New zero-dependency `flatland-devtools-relay` CLI bin — a minimal RFC 6455 broadcast relay for bridging provider/consumer connections (dev tool only, no auth/TLS)
- Frames queued while the socket is `CONNECTING` flush automatically on open; `provider:gone` is sent synchronously on dispose

## Time-travel scrubber (Phase A)

- Shared frame cursor lets you park the dashboard at a past engine frame — every panel (stats, protocol log, buffers) snaps to that moment, with per-provider parked-position memory
- New scrubber control under the stats strip (prev/next step, slider, live indicator); protocol-log rows and the LIVE button/double-click/Esc all provide entry/exit points
- Stats series track a parallel per-frame ring buffer so stat cards can show the value at the parked frame instead of only the live tail

## WebSocket relay hardening

- Closed multiple RFC 6455 compliance gaps: unmasked client frames are now rejected (frames must be masked per spec), oversized/fragmented control frames are rejected, and a new frame can no longer interrupt an in-progress fragmented message
- Reassembled-fragment size is now bounded (not just per-frame size), closing a drip-fed memory-growth DoS vector
- Handshakes with `Sec-WebSocket-Version !== 13` are now rejected instead of silently accepted
- Broadcast now preserves the originating opcode (text stays text, binary stays binary) instead of hardcoding binary
- Close frames are echoed per spec before ending the connection; broadcast writes are guarded against a peer closing mid-broadcast
- `startRelay()` now returns `{ close, server }` instead of a bare stop function, so callers can observe the bound port (needed for ephemeral-port test setups)
- Fixed a same-context echo loop when a provider and consumer bridge coexist in one page (e.g. a dashboard debugging itself remotely)

Adds full remote/WebSocket debugging support with a time-travel scrubber, backed by a hardened, spec-compliant relay implementation.
