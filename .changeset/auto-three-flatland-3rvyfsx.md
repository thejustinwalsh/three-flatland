---
"three-flatland": minor
---

> Branch: feat/flight-recorder
> PR: https://github.com/thejustinwalsh/three-flatland/pull/146

## Flight recorder (devtools) — core support

- Ring buffer for encoded chunks + stats log, windowed by wall-clock time, feeding the devtools freeze/scrub playback (`bus-worker.ts`)
- Registry checkpoint snapshots: periodic full re-sends of the registry feature so time-travel reconstruction never replays past one cadence window (`DebugRegistry`, `DevtoolsProvider`, `debug-protocol.ts`)
- Checkpoints that would otherwise degrade to metadata-only now retry before falling back to a `partial: true` checkpoint, instead of never completing
- Shared registry-delta fold logic between the live client and reconstruction so they can't diverge

## Fixes

- Registry checkpoint reliability: bounded retry + partial-checkpoint fallback for oversized entries

## Summary
Adds the core (three-flatland) side of the devtools flight recorder — rolling chunk/stats ring and registry checkpoint snapshots — plus reliability fixes so checkpoints never stall on oversized registry entries.
