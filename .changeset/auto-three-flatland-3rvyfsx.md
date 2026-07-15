---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder — registry checkpoints and buffer ring (#29 Phase C)

- Registry payloads now periodically re-send every registered entry as a full checkpoint (`RegistryPayload.checkpoint: true`, additive), so time-travel reconstruction only has to replay forward from the nearest checkpoint instead of the whole session.
- Added an always-on rolling ring buffer for encoded chunks and stats, windowed by wall-clock time, so a frozen frame can always decode from its own start.
- Tightened the VP9 encoder keyframe cadence from 2000ms to 500ms so a scrub cursor is never far from a decodable frame.
- Fixed: a registry checkpoint that had to degrade an entry to metadata-only no longer falsely reports as a complete checkpoint — it retries and marks itself `partial: true`; reconstruction skips partial checkpoints and falls back to the nearest complete one.
- Fixed: protocol log persistence to IndexedDB no longer depends on the Protocol Log panel being mounted or unpaused — it's now unconditional at dashboard bootstrap.
- Fixed: registry reconstruction now re-queries after a write batch actually commits to IndexedDB, closing a race that could show stale state right after freezing.

Devtools consumers get more reliable flight-recorder scrubbing and registry time-travel; no action needed for typical library usage.
