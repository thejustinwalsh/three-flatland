# Issue #32 — Audio restore + theme cleanup (in-scope work)

**Parent issue:** #32 (docs refresh foundation)
**Branch:** `docs-refresh-foundation`
**PR:** #33

Continuation of the docs-refresh foundation. Audio + jukebox was scope from the start; the prior phase didn't carry it forward when ThemeSelect was consolidated. This plan closes that gap, removes the manual theme switcher (system-pref drives theme now), and lays in the music player.

The full design document lives at `planning/issues/32/audio-theme-refresh.md` (§1–§9). This file is the **executable plan** — phase ordering, acceptance per phase, file list.

## Goal

Header audio cluster restored. SFX/master volume icon at rightmost slot, music player popover left of it. Audio + music both start **off**; first SoundToggle unmute enables SFX and auto-starts music at a low BG volume; user can pause music and that preference persists. Music popover surfaces as a brief toast on track start / change.

## Approach

- **Theme**: remove the manual switcher entirely. Boot script reads `prefers-color-scheme`, defaults dark. `data-theme` attribute stays as the load-bearing CSS selector across the existing palette + light-mode polish work (§7 of design doc — Decision A).
- **Audio engine**: install `@zzfx-studio/zzfxm` + `zzfx` (catalog entries — Path B). Collapse the 2× duplicated ZzFX synth in `docs/src/scripts/sounds.ts` into a single `zzfx` import. Music uses `ZZFXM.build()` piped through an `AudioBuffer` on our own context so we control master/music gain.
- **Audio bridge** lives at `docs/src/audio/` (NOT a new workspace package — only docs consumes it). One AudioContext at module scope on `window.__threeFlatlandAudio`, survives `astro:after-swap`. Three gain nodes: `master → { sfx, music }`. SFX never ducks; music ducks 100ms→200ms→100% over 200ms/400ms when a game-side `playMusic` takes over.
- **Lazy-load**: all audio code is dynamically imported on first user gesture (SoundToggle click / popover open / `[data-sound]` hover). Idle prefetch hints via `<link rel="modulepreload">` + `<link rel="prefetch">`. Goal: Lighthouse Performance stays ≥95; zero audio bytes in the main bundle.
- **Track ingestion**: `pnpm tracks:add` script parses zzfxm one-liner snippets into `docs/public/audio/tracks.json` (static asset, fetched after first paint).
- **UI surface**:
  - **SFX/volume icon** = rightmost in header audio cluster. Shows state (muted / low / medium / high). Click cycles. **Master mute affects both SFX and music.**
  - **Music player icon** = left of SFX icon. Shows state (off / playing / paused / ducked-by-game). Click toggles popover.
  - **Music popover** contents: track title + credit, prev / play-pause / next, volume slider, progress line. Next-track and prev-track are **disabled when a game-via-bridge is driving the music bus** (game owns playback; UI defers).
  - **Toast behavior**: when music auto-starts on first enable, AND when the active track changes (either via user click-next or via auto-advance), the popover auto-opens for ~3s as a toast, then auto-closes unless the user interacts.

## Phases

1. **Theme cleanup** — boot script sets `data-theme` from `prefers-color-scheme` (defaults dark); manual ThemeSelect removed.
2. **Audio engine install + dedup** — catalog deps, audio-bridge module created, `sounds.ts` rewritten to use it (no behavior change yet; existing UI sounds keep working).
3. **SoundToggle restored** — rendered in header at the rightmost audio slot, drives master mute via audio-bridge.
4. **Music player + popover** — popover trigger left of SoundToggle, controls, ducking, toast-on-change behavior.
5. **Track library + ingestion script** — `pnpm tracks:add` + first 1-N tracks landed.
6. **Lazy-load + Lighthouse verify** — confirm code-split chunks, run Lighthouse on landing + a docs page; Performance ≥95.

Each phase ends with a verified, working state. The PR description's status section ticks per phase.

## UX rules (acceptance-critical)

- **Audio default state**: muted. SoundToggle renders `volume-x` icon. No audio plays until first interaction.
- **First unmute behavior**: clicking SoundToggle from muted → low transitions to "audio enabled." Music auto-starts at default BG volume (~0.30 of music-bus) IF `flatland-music-user-stopped` is not set in localStorage.
- **Music user-stop memory**: when user clicks pause in the music popover, set `flatland-music-user-stopped: true`. On subsequent SoundToggle unmutes, music does NOT auto-start. Clearing the flag requires the user to click play explicitly.
- **Track-change toast**: when `playMusic(track)` is called from any source AND popover is currently closed, auto-open the popover for 3000ms then auto-close (unless user interacted during the open window, in which case stay open).
- **Demo music takeover**: when a game-side `bridge.playMusic(track)` fires, duck the user's music bus to 10% over 200ms; on demo end, ramp back over 400ms. While ducked: popover title shows demo's track; prev/next buttons disabled; restart shows as `lucide:rotate-ccw` but is disabled too. Restore on demo-music end.
- **Reduced-motion**: ducking + toast both snap (no animation) but the gestures still work.

## Files likely to change

- `docs/src/components/Head.astro` — theme boot script (Step 1)
- `packages/starlight-theme/components/overrides/ThemeSelect.astro` — deleted (Step 1)
- `packages/starlight-theme/components/overrides/Header.astro` — wire SoundToggle + MusicPlayer (Steps 3, 4)
- `packages/starlight-theme/core/config/override.ts` — drop `ThemeSelect` from `COMPONENT_OVERRIDES`, add empty override to suppress Starlight's default (Step 1)
- `packages/starlight-theme/components/overrides/parts/SoundToggle.astro` — new (Step 3)
- `packages/starlight-theme/components/overrides/parts/MusicPlayer.astro` — new (Step 4)
- `docs/src/components/SoundToggle.astro` — orphan deleted (Step 3)
- `docs/src/audio/bridge.ts` — new singleton (Step 2)
- `docs/src/audio/storage.ts` — new (localStorage keys) (Step 2)
- `docs/src/audio/proxy.ts` — new (createZzfxProxy for mini consumers) (Step 2)
- `docs/src/scripts/sounds.ts` — rewritten thin shim over audio-bridge (Step 2)
- `minis/breakout/src/App.tsx` — drop inline zzfx; `import zzfx from 'zzfx'` (Step 2)
- `pnpm-workspace.yaml` — add `@zzfx-studio/zzfxm` + `zzfx` to catalog (Step 2)
- `scripts/add-track.ts` — new ingestion tool (Step 5)
- `docs/public/audio/tracks.json` — initial empty/seeded (Step 5)
- `docs/uno.config.ts` — drop `volume-3` from safelist, add `lucide:music`/`lucide:skip-back`/`lucide:skip-forward`/`lucide:play`/`lucide:pause`/`lucide:rotate-ccw` if not present

## Out of scope

- Cross-tab sync (BroadcastChannel) — defer.
- Per-section auto-track switching — manual prev/next only in v1.
- Examples that use audio — none currently do; not in this phase.

## Open questions (deferring all of these to in-implementation review)

- Toast duration — start at 3000ms, tune.
- Sequential vs shuffle default — sequential.
- Music icon — `lucide:music` (recommend) vs `lucide:disc-3`. Going with `lucide:music`.
- Boot script injection point — `astro.config.mjs` `head` array (recommend over inline-in-Head.astro for ordering certainty).

## Verification per phase

- **Phase 1**: visit `/` with system pref dark/light; confirm `<html data-theme>` matches before paint; toggle OS pref live; no ThemeSelect in header.
- **Phase 2**: existing UI sounds (`playClick`, `playHover`, `playAccordionOpen`, etc.) all still fire; `pnpm --filter=docs build` chunk analysis shows audio code code-split (not in main bundle).
- **Phase 3**: SoundToggle renders rightmost in header; cycles mute→low→med→high→mute; persists across reload; persists across SPA navigation.
- **Phase 4**: popover opens left of SoundToggle; controls work; volume slider drives music bus only; toast auto-opens for 3s on track change and on first auto-start.
- **Phase 5**: paste a `zzfxm(...)` one-liner via stdin → `tracks.json` updated → popover lists the track.
- **Phase 6**: Lighthouse Performance ≥95 on landing + a docs page; audio-bridge in `dist/_astro/audio-bridge.<hash>.js` (separate chunk); `tracks.json` served statically from `dist/audio/`.

## Acceptance gate (Phase 10)

The PR (#33) acceptance gate already exists for the foundation refresh. This work extends it. For final review, every UX rule above carries evidence — screenshots, build-artifact paths, dev-server probe results — appended to the PR description's verification section.
