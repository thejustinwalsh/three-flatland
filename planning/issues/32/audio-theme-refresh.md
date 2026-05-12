# Audio + theme refresh — Issue #32 follow-on

Plan for five system-level changes after the in-flight light-mode-polish PR lands:

1. Drop the user-facing theme switcher; default to dark; respect `prefers-color-scheme` automatically.
2. Restore the global volume / SoundToggle in the header.
3. Restore `@zzfx-studio` integration with a *simple* host/standalone shim — not the over-engineered version.
4. Audio inventory: review and tune every sound across the repo for pleasantness and brand-consistency.
5. **Header jukebox** — chiptune music tracks composed in `@zzfx-studio`, mini popover player next to the SoundToggle, ducks for demo music, persists across SPA navigations.

Hard rule for all five: **the only persistent UI surface for global audio state is the SoundToggle icon.** Mini player, demo audio, and tuning sweeps all defer to that one switch for the master mute.

---

## 1 — Findings

### 1.1 — Theme system today

Source of truth: `data-theme` attribute on `<html>` (`document.documentElement`).

- Toggle UI: `packages/starlight-theme/components/overrides/ThemeSelect.astro:1-156`. Cycles `auto → light → dark → auto`. Sun + moon SVGs swap by `:global([data-theme='light']) svg.sun { display: none }` (lines 81-87).
- Persistence layer: `localStorage['starlight-theme']` (string `'auto' | 'light' | 'dark'`). Loaded in the inline `<script is:inline>` block (lines 91-95) so a `StarlightThemeProvider.updatePickers()` call runs before paint to avoid FOUC. The provider script comes from `@astrojs/starlight`'s ThemeProvider override that the plugin keeps in place.
- Boot-time application: the inline ThemeProvider script (Starlight upstream — not in our overrides) reads `localStorage['starlight-theme']`, falls back to `matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'` when value is `'auto'` or empty, and sets `document.documentElement.dataset.theme` *before* CSS resolves. That's why nothing flashes.
- System-pref listener: `ThemeSelect.astro:133-137` — `matchMedia('(prefers-color-scheme: light)').addEventListener('change', …)` calls `onThemeChange('auto')` whenever the OS changes, but only if the stored preference is `'auto'`.
- Header wiring: `packages/starlight-theme/components/overrides/Header.astro:7,44` — `import ThemeSelect from './ThemeSelect.astro'` + `<div><ThemeSelect /></div>` inside `<nav class="header-nav">`.

View-transition preservation: `docs/src/components/Head.astro:23,56` mounts `VtBotBase`, which composes `ReplacementSwap rootAttributesToPreserve="data-theme"` (`node_modules/.pnpm/astro-vtbot@2.1.12/node_modules/astro-vtbot/components/starlight/Base.astro:23`). ReplacementSwap's logic (`node_modules/.pnpm/astro-vtbot@2.1.12/node_modules/astro-vtbot/components/ReplacementSwap.astro:18-58`) replays its custom swap path only when the new doc contains `[data-vtbot-replace]` markers — StarlightConnector sets `data-vtbot-replace="main"` on every page's `<main>` so the path is active for every navigation. Inside that path it reads `data-theme` from the live `<html>` before `swapRootAttributes(doc)` and writes it back afterward — so the user's *current* theme survives navigation regardless of what the new HTML's `data-theme` attribute says.

`data-theme` selector inventory (every file that depends on the attribute being set on `<html>` — load-bearing for Decision A vs B in §2):

| File | Lines | Purpose |
|---|---|---|
| `packages/starlight-theme/styles/theme.css` | 28, 184 | Defines the *entire* token palette inside `:root[data-theme='dark'] { … }` and `:root[data-theme='light'] { … }` blocks. Every CSS variable in the site resolves from one of these two blocks. |
| `packages/starlight-theme/styles/base.css` | 289-290, 304-307, 638-639, 650-655, 658 | `html` background-color fallback (289), body texture image swap (304), expressive-code light-on-dark / dark-on-light theme matching for codeblocks (638-658). |
| `packages/starlight-theme/components/overrides/PageFrame.astro` | 192 | Alpha-ribbon styling override for the landing page in light mode. |
| `packages/starlight-theme/components/overrides/Header.astro` | 239-241 | Light-mode + landing-only: animate header text color via scroll-driven keyframe. Just rebased into the in-flight light-mode polish work (in `git diff`). |
| `packages/starlight-theme/components/overrides/ThemeSelect.astro` | 81, 85 | Sun/moon icon swap inside the toggle button itself. Whole file deleted in §3 below. |
| `docs/src/components/Card.astro` | 76, 82, 89, 93, 97 | Card surface + hover + title color overrides for light mode. |
| `docs/src/components/Head.astro` | 7, 12 | Comment-only references to the vtbot preserve logic — not actual selectors. |
| `docs/src/components/SoundToggle.astro` | 224, 228 | Light-mode color overrides for the toggle. Will be rewritten in §4 to use design-system tokens, so these go away naturally. |
| `docs/src/components/FeatureCard.astro` | 127, 135 | Light-mode-only drop-shadow stack (in-flight in `git diff`). |
| `docs/src/components/gallery/GalleryTile.astro` | 166, 172 | Same — light-mode drop shadow. |
| `docs/src/content/docs/index.mdx` | 230 | Landing hero forces dark-mode tokens onto `.hero-fullscreen` inside light-mode pages so the dark-stage hero composition survives mode toggles. **Load-bearing — even with the toggle removed this rule must keep working under system-pref-driven light mode.** |

Conclusion: `data-theme` is used as a *first-class CSS selector* across ~12 files, including the entire palette definition. Migrating to CSS-only `@media (prefers-color-scheme: dark)` blocks would require touching every one of those rules, plus ReplacementSwap, plus killing the visual `<html data-theme="dark">` contract that the boot-time script writes. That's a wide-blast change, and there is no payoff — see §2.1.

### 1.2 — SoundToggle history

- Previous SoundToggle rendering site: it lived inside the *site-local* `docs/src/components/ThemeSelect.astro` (deleted in commit `12af6725`, "feat(docs): adopt starlight-theme + Tailwind v4 spec via UnoCSS presetWind4"). That ThemeSelect was a combined toggle: a SoundToggle followed by a theme cycler, both pixelated. The deletion comment was just "the theme provides them" — the SoundToggle didn't get a new home; the import path went away with the file.
- Original SoundToggle.astro at commit `f1c464f5` ("feat: docs site redesign"): a two-state on/off mute button using `volume-3` / `volume-x` icons. Lazy-loaded `../scripts/sounds.ts`, persisted to `localStorage['flatland-sound-enabled']` (boolean).
- The current `docs/src/components/SoundToggle.astro` (172 lines) is a *more sophisticated* successor: four-state cycle (mute → low → medium → high → mute), with a disabled fifth state for "audio context not yet unlocked." Persists to `localStorage['flatland-sound-volume']` (`'0'|'1'|'2'|'3'`), with migration from the old boolean key (lines 388-398 in `docs/src/scripts/sounds.ts`). It just never got re-mounted in the header after Phase 2.
- Latent bug: `SoundToggle.astro:22` renders `<Icon name="volume-3" />` but `lucide` has no `volume-3` icon — it stops at `volume-2`. `docs/uno.config.ts:112` safelists `i-lucide:volume-2` but not `volume-3`. The "high" volume state currently renders an empty span. Fix during §4 by either dropping the high level to use `volume-2` everywhere or moving the volume icon set to a different iconset that has `volume-3` (none of the common ones do).
- The actual audio engine lives at `docs/src/scripts/sounds.ts` (805 lines, current). It is more elaborate than the original (volume normalization via simplified A-weighting curves, view-transition support, debounced hover events, per-element `WeakSet` tracking, lazy-loaded AudioContext, four-level cycler, callback-based audio-state subscribers, `createZzfxProxy()` for mini-game consumers).

References to `SoundToggle` in current code:
- `docs/src/components/SoundToggle.astro` — the component itself (orphan).
- `docs/uno.config.ts:111` — safelist comment for the volume icons.

That's it. Nothing else imports it.

### 1.3 — Prior zzfx integration (what to AVOID re-doing)

The current "integration" is not the over-engineered one — it's already a thin prop-injection model. The chain is:

- **Mini package side** (`minis/breakout/src/types.ts:37-46`): `MiniGameProps` defines an optional `zzfx?: PlaySoundFn` prop. `PlaySoundFn` is the bare ZzFX param-array signature.
- **Mini package standalone** (`minis/breakout/src/App.tsx:7-109`): inlines a ~100-line ZzFX implementation locally and passes it as the `zzfx` prop to `<MiniBreakout>`. Unlocks on first `click`/`touchstart`.
- **Mini package game** (`minis/breakout/src/Game.tsx:58-59,256-282`): defaults `zzfx` to a no-op, falls through to `createSoundPlayer(zzfx)` which produces `paddleHit()`, `wallHit()`, `blockBreak()`, etc. closures that each call `zzfx(...PRESET)`.
- **Docs side** (`docs/src/components/HeroGame.tsx:73-83,120` + `docs/src/components/ShowcaseGame.tsx:9-17,55`): on mount, dynamically imports `../scripts/sounds.ts`, calls `sounds.createZzfxProxy()` (which generates ZzFX-compatible audio through the docs-side AudioContext, respects the docs-side `currentVolumeLevel`, caches the buffer per param-hash). Passes the proxy as the `zzfx` prop into `MiniBreakout`. Falls back to a no-op while the import is in flight.
- **Docs-side store** (`docs/src/scripts/sounds.ts`): owns the AudioContext, the master mute state (`currentVolumeLevel: 0|1|2|3`), the storage key (`'flatland-sound-volume'`), the volume-normalization helper, and the audio-state subscriber list. `setupSoundEvents()` wires global click/hover sounds for `[data-sound]` decorated elements (lines 460-562). `setupViewTransitionSupport()` pre-populates the hover `WeakSet` after each `astro:after-swap` (lines 571-592).

**That's already roughly the architecture the user described.** What's missing is the host-detection branching: the mini doesn't *check* whether it's in the docs host — it just receives whatever `zzfx` the parent gives it. When the docs is the parent, that's the proxy; when the standalone app is the parent, it's the inline zzfx. So calling this an "over-engineered shim" overstates what's there.

What WAS more brittle in the f1c464f5 era (and might have been what the user was reacting to):
- The SoundToggle wired itself directly into the docs-side store and *also* set up document-wide event listeners (`setupSoundEvents()`) on first mount. The store-setup and the toggle UI lived inside the toggle's custom-element constructor (`docs/src/components/SoundToggle.astro:42-57`) — coupling that the toggle should not own.
- Initialization on first navigation re-installed event listeners. The current sounds.ts has a `soundEventsSetup` flag (line 457) and an `audioStateCallbacks: Set<>` (line 37) to dedupe, but only because the toggle's constructor calls `setupSoundEvents()` from each newly-mounted instance.
- The proxy generator (`createZzfxProxy()`, lines 602-625) reimplements the entire ZzFX synthesis engine *inside* the docs-side `sounds.ts` (lines 630-756) so that calls from minis can render through the docs AudioContext. That's the duplication that probably feels over-engineered — it should be one synth, not two.

That second point is the real over-engineering signal: the docs-side `sounds.ts` carries TWO ZzFX implementations (`zzfx()` at line 128 for docs-side UI sounds, `generateZzfxBuffer()` at line 630 for the proxy used by minis), differing only in whether they write to the AudioContext destination directly or return a Float32Array. The duplication exists because the docs-side `zzfx` modulates by the global volume each call, while the proxy generates raw buffers and applies volume at playback time for caching. A single engine that returns a buffer + a thin playback wrapper would collapse those.

### 1.4 — `@zzfx-studio` package status

**Not present in this repo.** I searched:
- `pnpm-workspace.yaml`, `pnpm-lock.yaml`, every `package.json` under `packages/`, `minis/`, `examples/`, `docs/`, `assets/`, `scripts/`, root.
- `node_modules/@zzfx-studio/*` — does not exist.
- Full git history (`git log --all -G 'zzfx-studio'`) — zero hits.
- Every grep for `@zzfx-studio` in `docs/`, `packages/`, `minis/`, `examples/` — zero hits.

So the user's brief is to **adopt a new package** that is not yet wired in. I could not access the web in this research session (WebSearch + WebFetch were denied), so I cannot confirm the package's published API or whether it is a real npm package or a planned internal one. **This is an open question — see §6.**

What I can say:
- The base ZzFX project is `KilledByAPixel/ZzFX` (referenced in `docs/src/scripts/sounds.ts:7` and `minis/breakout/src/types.ts:6`). It exposes both single-shot SFX (the 21-param array we already use) and a music-sequencing function — `zzfxM(...)` — that takes instruments + a 4-channel pattern grid. So music synthesis is a known ZzFX feature; a `@zzfx-studio` scoped fork that exposes a friendlier API for both is plausible.
- The user described it as a thing to bundle into examples/showcases for standalone use, and shim through to a docs-side controller when embedded. That signature is identical to the current `MiniBreakout` `zzfx` prop pattern, just with a real package instead of an inline reimplementation.

### 1.5 — Current sound inventory (all of it)

Two locations, single consumer:

- `docs/src/scripts/sounds.ts:283-344` — UI sounds played by the docs site for click/hover/accordion/warp/etc.
- `minis/breakout/src/systems/sounds.ts:5-30` — game sounds for breakout (paddle, walls, blocks, life-loss, level clear, game over, etc.).

No example uses audio. No other mini or showcase uses audio. The full inventory is in §4 below.

---

## 2 — Design decisions

### 2.1 — Change #1: theme system

**Decision A: keep `data-theme` as the source of truth; remove the toggle; default to dark; auto-set from `prefers-color-scheme` at boot.**

Rationale:
- The `data-theme` attribute is the load-bearing CSS selector across ~12 files (§1.1). Migrating to CSS-only `@media` blocks would require rewriting `theme.css` (the whole palette) and every override in this list. That's mechanical but it's a lot of churn for zero functional gain.
- The in-flight light-mode polish PR is writing rules against `[data-theme='light']` selectors (`Header.astro:239-241`, `FeatureCard.astro:127-138`, `GalleryTile.astro:166-177`). Decision A keeps every one of those rules valid as-is. Decision B (pure `@media`) would require the polish agent to rebase its work onto a new selector pattern mid-flight. **Avoid that.**
- The hero override (`index.mdx:230`) — `:root[data-theme='light'] .hero-fullscreen { … }` — uses the attribute to force-dark-mode the hero subtree while leaving the surrounding page light. Replacing with `@media (prefers-color-scheme: light)` works *until* the user has dark system pref and we still want to show the dark hero (we always do). The attribute version is more semantically correct: "if the page is rendering in light mode, dark-stage the hero."
- ReplacementSwap's `rootAttributesToPreserve="data-theme"` becomes dead weight — but it's already dead weight in dark-only mode (the attribute never changes during a session). Leaving it costs nothing.

Concretely:
- Inline `<script is:inline>` runs before paint, sets `document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'`. Falls back to `'dark'` if `matchMedia` is undefined or throws.
- Adds a one-time `matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => documentElement.dataset.theme = e.matches ? 'light' : 'dark')` so live OS-pref changes update the page without reload.
- No `localStorage` reads, no writes. The user CANNOT override system preference — that's the design point. If system pref is absent (e.g., `matchMedia` returns `matches: false` for both queries), the fallback is dark.

Inline script is the right delivery mechanism (not pure CSS `@media`): runs synchronously before first paint, sets the attribute, every dependent rule resolves in one pass. Pure-CSS `@media` would force every selector that's currently `[data-theme='light']` to become `:not(:root[data-theme]) ... @media (prefers-color-scheme: light)` plus duplicate rules for the dark default. Inline-script approach: one boot script, zero CSS changes.

**Anti-decision considered and rejected: leave the toggle, just hide it visually.** That keeps the localStorage state alive, lets QA / a future stakeholder ask "where did the toggle go" reveal a hidden surface, and doesn't actually simplify the boot path. If we don't want the toggle, delete the toggle.

### 2.2 — Change #2: SoundToggle restoration

**Decision: put SoundToggle back where ThemeSelect used to live in the header's nav row, restyled to the gem-token design system.**

- Slot location: `packages/starlight-theme/components/overrides/Header.astro:44`, replacing `<ThemeSelect />`. Same `<div>` inside `<nav class="header-nav">`. Same dividers (line 152-169) apply unchanged.
- Visual style:
  - Same box dimensions as ThemeSelect was (2rem × 2rem, `border-radius: calc(var(--radius) - 2px)`, `data-variant="ghost"`-style).
  - Icon: `lucide:volume-2` (active states), `lucide:volume-x` (muted), `lucide:volume-off` (audio context not yet unlocked / disabled — slightly faded). Drop the `volume-3` reference since lucide does not have it.
  - Cycle states: `unlocked-mute → unlocked-low → unlocked-medium → unlocked-high → unlocked-mute`. Keep the four-level cycle from the current `SoundToggle.astro` since the audio engine and storage already support it; the icons just compress (low + medium share `volume-1`, high uses `volume-2`).
  - Colors: foreground uses `var(--foreground)` at rest, `var(--accent-foreground)` on hover, with `var(--accent) 80%` mix as the hover background (matches ThemeSelect button styling lines 55-73). Muted state has a small `var(--ruby)` foreground tint to signal "intentionally off." Disabled / locked state at 50% opacity in `var(--muted-foreground)`.
  - When the jukebox popover (§2.5) is open, SoundToggle stays anchored (its own button, just the popover is its neighbor).
- Identity: SoundToggle is the **master** audio switch. Mute here mutes everything — UI sounds, demo audio, music. Unmute restores the previous music + SFX volume state.
- Storage key: keep `flatland-sound-volume` (4-level integer) for backwards-compat with the existing engine. Migration from the older `flatland-sound-enabled` boolean already exists in `sounds.ts:388-398`.

### 2.3 — Change #3: zzfx-studio shim

**Decision: keep the existing prop-injection contract for same-window consumers (minis + showcases). For iframe-embedded examples, do nothing — examples do not use audio today and we have no reason to add a postMessage protocol.**

The user's described "shim that detects the docs host via a global on `window`" is the right pattern *for in-process consumers* because the mini lazy-imports into the docs window — same window, no cross-origin barrier. There's no need for a window global if we just pass the `zzfx` function as a prop. The host-detection check is unnecessary indirection.

Concrete architecture (replacing the duplicate-ZzFX over-engineering identified in §1.3):

- Single `@zzfx-studio` (or fallback: vendored single-implementation in `packages/audio-bridge/`) provides `play(spec)`, `playMusic(track)`, `mute()`, `unmute()`, `subscribe(listener)` (or similar; see §6 for the open API question). It owns *one* AudioContext.
- `docs/src/scripts/sounds.ts` is rewritten as a thin shim over the zzfx-studio package — collapses the two duplicate engines into one. Re-exports the same surface (`playClick`, `playHover`, …, `createZzfxProxy`) so MDX content and the SoundToggle keep working with no caller-side changes.
- `minis/breakout/src/App.tsx` swaps its inlined ~100-line zzfx fork for a `@zzfx-studio` import. The `MiniBreakout` `zzfx` prop signature stays.
- `minis/breakout/src/Game.tsx` is unchanged — still receives a `zzfx` function via props.
- Docs side hand-off: same as today — `HeroGame.tsx` and `ShowcaseGame.tsx` build the proxy from the docs-side store and pass it as the prop.
- Host-detection branch the user described: instead of `MiniBreakout` checking `window.__threeFlatlandAudio`, *the mini's default* (when `zzfx` prop is undefined) is its own bundled `@zzfx-studio` instance. When the docs renders it with a `zzfx` prop, that proxy wins. No global needed.

The reason this is simpler than the user's brief: same-window microfrontends don't need a global handshake. The handshake is the React prop.

Audio-context unlock: docs side keeps the existing first-gesture unlock (`docs/src/scripts/sounds.ts:470-476`). Standalone mini keeps the existing first-gesture unlock (`minis/breakout/src/App.tsx:114-129`). Both routes converge on the AudioContext being unlocked before any sound plays.

State propagation:
- Master mute (SoundToggle → store) — the docs proxy checks `isSoundEnabled()` on each call and short-circuits. Already in place at `sounds.ts:606`.
- Subscribers (UI components that need to know if audio is ready) use `onAudioStateChange(cb)`. Already in place at `sounds.ts:39-43`.

### 2.4 — Change #4: audio pass

**Decision: tune every sound to a target perceptual loudness and a consistent texture; collapse the duplicate ZzFX implementation; sweep parameters for harshness.**

Two passes:
1. Quality pass — recommendations in §5 inventory below.
2. Code-dedup pass — collapse `docs/src/scripts/sounds.ts` to use the same single ZzFX engine as the new shim. The volume-normalization helper (`normalizeVolume` at lines 79-109) stays — that's actually useful and worth preserving; it's the duplicated synth that goes.

The brand-vibe target: "Linear/Vercel-musical, not 8-bit-arcade-brittle." Concretely: prefer triangle and sine shapes; cap release tails at ~120ms for UI sounds; avoid raw square/saw above ~600Hz; layer slight pitch-jump in sound-on/sound-off feedback rather than relying on sharp slides. Music-bus tones (§2.5) get a separate palette — see there.

### 2.5 — Change #5: header jukebox

**Decision: render a small popover next to SoundToggle. Use `@zzfx-studio`'s music synthesis (ZzFX music = `zzfxM`-style 4-track patterns) to play a small library of in-repo tracks. Ducks the music bus when a demo plays its own music; restores when the demo exits.**

Audio routing architecture:

```
                                       ┌─ docs UI SFX  (playClick etc.)
                          ┌─ SFX bus ──┤
                          │            └─ demo SFX (via zzfx prop)
       ┌─ Master gain ────┤
AudCtx │   (master mute)  │            ┌─ docs jukebox tracks
       │                  └─ Music bus ┤
       │                       (ducks) └─ demo music (via zzfx-studio music API)
       └─ destination
```

- **Master gain node** — controlled by the SoundToggle 4-level cycler. Multiplies the existing `getZzfxV()` value. Cuts to 0 instantly when state goes to mute.
- **SFX bus** — sum of docs UI sounds (`playClick`, `playButtonPress`, etc.) and any one-shot SFX from demos (the breakout paddle hits, block breaks, etc., routed through the prop-injected `zzfx`). No ducking on SFX — sound effects are short, ducking would be jarring (per user brief).
- **Music bus** — sum of jukebox tracks (one playing at a time) and any demo-music tracks routed through `@zzfx-studio`'s music API. Music bus has its own gain node controlled by the jukebox volume slider (separate from master). When a demo starts music, the docs jukebox track drops to ~10% of slider value over 200ms (the "duck"); when the demo's music stops or the demo unmounts, it ramps back over 400ms.

Persistence:
- `flatland-sound-volume` — master (existing, 4-level).
- `flatland-music-volume` — music bus slider (new, 0–1 float, default 0.3).
- `flatland-music-track` — index into the track library (new, integer).
- `flatland-music-mode` — `'sequential' | 'shuffle'` (new, default `'sequential'`).
- `flatland-music-position` — track position in seconds when leaving the page (new, optional; restore on page reload if same track index).

View-transition compatibility:
- AudioContext + master gain + SFX bus + music bus all live at module scope on `window.__threeFlatlandAudio` (or similar singleton). The script that creates them runs once per session, NOT per page. Surviving `astro:after-swap` is automatic because it's never re-instantiated.
- The jukebox popover UI is a custom element rendered fresh on each navigation (vtbot replaces the `<main>` body but preserves the header). The popover's state — current track, slider value, play/pause — reads from the singleton's state on each new instance. Fine because the singleton survives.
- Mute behavior across navigation: SoundToggle reads from the singleton; the singleton's state is preserved; the toggle re-renders the right icon on every mount. Music continues playing through navigation because the audio nodes are never disconnected.

Track library:
- Stored as `docs/src/audio/tracks.ts` — each track is a `@zzfx-studio` music spec object plus metadata (`title`, `credit`, `gem`, `bpm`).
- Initial library: 4 tracks (sketch in §6 — depends on what zzfx-studio's music API looks like). Map to gem palette:
  - `gold` — "Foil" — bright arpeggios, ~110bpm, evokes the gem-foil hero.
  - `amethyst` — "Docs" — quiet pad, ~80bpm, for reading.
  - `diamond` — "Index" — bouncy chip-funk, ~130bpm, for the examples masonry.
  - `ruby` — "Showcase" — confident chip-rock, ~120bpm, for the showcases page.
- Loop: sequential, auto-advance on track end.
- Compose-from-scratch decision is in §6 — depends on whether zzfx-studio ships starters.

Popover UI:
- Trigger: small button next to SoundToggle in `<nav class="header-nav">`. Icon: `lucide:music` (or `lucide:disc-3` — see open question in §6). Aria-label: "Open music player."
- Popover anchor: trigger button's right edge. Positioning via CSS `position: absolute; top: 100% + 0.5rem; right: 0`. Same pattern as the in-header TOC dropdown (`Header.astro:369-389`).
- Dimensions: ~280px wide, ~140px tall. Compact.
- Content:
  - **Row 1**: Track title (`Inter 500, 0.8125rem, foreground`) + credit (`Inter 400, 0.6875rem, muted-foreground`).
  - **Row 2**: Prev / Play-pause / Next buttons. Tiny — 1.5rem squares with `lucide:skip-back`, `lucide:play`/`lucide:pause`, `lucide:skip-forward`. Iconography only, no text.
  - **Row 3**: Volume slider (`<input type="range">` styled into a thin gem-tinted track + handle). 0–100 → maps to 0–1 float.
  - **Row 4 (thin)**: Track-progress line. 1px tall, `var(--gem)` fill from 0% to track position, `background: var(--border)` for the empty portion. Updates via rAF only while the popover is open (no rAF when closed).
- Opening: click trigger → opens. Outside-click or `Escape` → closes. Same `AbortController`-per-open pattern as the in-flight Search override (line 200 in the in-flight diff).
- Reduced motion: visualizer-equivalent line snaps without animation; ducking fade collapses to instant volume jump; popover open/close still happens.

Behaviors:
- Master unmute → music starts at the saved slider volume (default 0.3 of master) on next user gesture.
- Master mute → music pauses without losing position.
- Demo plays music → 200ms duck to 10%, popover title updates to "now playing: [demo track]". Demo finishes / unmounts → 400ms ramp back, popover reverts.
- Demo plays SFX → no ducking.
- Layout: popover open does NOT shift the trigger or the wordmark — it's `position: absolute` from a `position: relative` parent (the trigger button), exactly like the mobile TOC dropdown does it.

---

## 3 — Implementation steps

Land in this order. Each step is independently mergeable.

### Step A — Theme: remove the toggle, default-to-dark, system-aware
**Branch from**: latest `docs-refresh-foundation` after the light-mode polish PR merges.

A1. **Add the boot script** to `docs/src/components/Head.astro` near the top (above StarlightHead so it runs before any CSS resolves, or in a Starlight `head` config entry — verify which approach the rest of the head uses). Inline-script body:
```js
;(() => {
  let theme = 'dark'
  try {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light'
    }
  } catch {}
  document.documentElement.dataset.theme = theme
  try {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      document.documentElement.dataset.theme = e.matches ? 'light' : 'dark'
    })
  } catch {}
})()
```
**Acceptance**: visit `/` with system pref dark → `<html data-theme="dark">` before any paint. Toggle OS to light → `<html data-theme="light">` updates live without reload. Hard-refresh in light pref → light from first frame, no FOUC. Disable system pref entirely (custom user-agent) → dark.

A2. **Delete the toggle component**: `rm packages/starlight-theme/components/overrides/ThemeSelect.astro`.

A3. **Delete the toggle wiring**: edit `packages/starlight-theme/components/overrides/Header.astro` to remove `import ThemeSelect from './ThemeSelect.astro'` (line 7) and the `<div><ThemeSelect /></div>` element (lines 44-46). Also remove the surrounding `<nav class="header-nav">` element if SoundToggle (Step B) isn't landing in the same PR — Step B re-adds the nav row. If A and B land together, the nav row gets SoundToggle (and later the jukebox trigger) instead of ThemeSelect.

A4. **Remove the override registration**: edit `packages/starlight-theme/core/config/override.ts` to remove `'ThemeSelect'` from `COMPONENT_OVERRIDES` (line 8). Starlight's own ThemeSelect (which we WANT not to render) will still try to mount somewhere — confirm by building. If it does, also explicitly disable it in `docs/astro.config.mjs` via:
```js
components: {
  ThemeSelect: 'starlight-theme/components/overrides/EmptyThemeSelect.astro'
}
```
…where `EmptyThemeSelect.astro` is a one-line `---` empty Astro file. (Starlight's components-config allow-list does accept `ThemeSelect`.)
**Acceptance**: no theme button visible anywhere; nav row only contains SoundIcons / Search / SoundToggle (after Step B).

A5. **Clean up vtbot preserve list**: edit `node_modules/.pnpm/astro-vtbot…/Base.astro` is read-only, so the only thing to do is acknowledge that `rootAttributesToPreserve="data-theme"` is now harmless dead weight — leave it. No change needed.
**Acceptance**: build passes; ReplacementSwap continues working for sidebar / main / multi-sidebar markers.

A6. **Remove the `starlight-theme` localStorage key on next load** (cleanup): add a one-time `localStorage.removeItem('starlight-theme')` to the boot script. Stale-key cleanup so DevTools' Application tab doesn't show a confusingly-named key forever.
**Acceptance**: after first page load, the key is gone from localStorage.

A7. **Verify all `[data-theme='light']` selectors keep working** by running `pnpm --filter=docs build` + a quick visual smoke test:
- Toggle OS pref dark → light → confirm: paper bg, gem-tinted FeatureCards with drop shadow, hero subtree still dark, header text color crossfades on landing scroll.
- Toggle OS pref light → dark → confirm: near-black bg, gem-tinted rims, no drop shadow, hero seamless.
**Acceptance**: 0 visual regressions vs in-flight light-mode-polish PR.

### Step B — SoundToggle in the header
B1. **Create the new SoundToggle inside the theme package**: `packages/starlight-theme/components/overrides/parts/SoundToggle.astro`. This is intentionally in the theme package — the docs-side SoundToggle.astro is going to be deleted in B3, but the component lives inside `parts/` because it depends on docs-side runtime (`docs/src/scripts/sounds.ts`). Resolve that by:
- Option B1a (chosen): keep the *component* in the theme package, but have it import its runtime from the docs side via a Vite alias or a virtual module. Cleanest path: define a re-exporter in `packages/starlight-theme/lib/audio.ts` that re-exports from `'three-flatland-audio'` (a tiny new internal package), so the theme package doesn't depend on the docs site directly.
- Option B1b (alternative): leave the component in `docs/src/components/SoundToggle.astro` and have the theme's Header override accept a slot for it. Simpler, but bleeds docs concerns into the theme override slot pattern.

Pick B1a. Acceptance: theme package has no `docs/` import.

B2. **Wire SoundToggle into the theme's Header**: edit `packages/starlight-theme/components/overrides/Header.astro`:
```astro
import SoundToggle from './parts/SoundToggle.astro'
…
<nav class="header-nav">
    <div><SocialIcons /></div>
    <div><SoundToggle /></div>
</nav>
```
The vertical divider (lines 152-169) continues to apply because the `> div:has(> :not(script))` selector pattern hits the new `<div><SoundToggle /></div>` just as it hit `<div><ThemeSelect /></div>`.
**Acceptance**: SoundToggle renders in header next to Search; clicking it cycles mute → low → med → high → mute; persists across reload; persists across SPA navigations.

B3. **Delete the orphan docs-side SoundToggle**: `rm docs/src/components/SoundToggle.astro`. Update `docs/uno.config.ts:111-112` comment from "SoundToggle states" to "Audio control states" if SoundToggle's new home is the theme package. The safelist itself stays — same icons used.
**Acceptance**: no orphan SoundToggle.astro under docs/src/components; UnoCSS still extracts the icons safely.

B4. **Drop the `volume-3` reference**: edit the new SoundToggle (in `parts/`) to use only `volume-x` (mute), `volume-1` (low), `volume-2` (medium + high — high gets a subtle accent dot or fuller fill via CSS, see option below). Or, cleanly: high state uses `volume-2` and the icon background gets a faint accent-colored fill via the gem palette. Update `docs/uno.config.ts:112` to drop `volume-3` from the safelist (it's been a broken reference since the file was authored).
**Acceptance**: all four volume states render a non-empty icon.

### Step C — `@zzfx-studio` shim
C1. **Confirm the package**: install `@zzfx-studio` (or the agreed-on package — see §6) into the workspace root. Verify the API surface: `play(spec)`, `playMusic(track)`, `setMasterGain(0..1)`, `setMusicGain(0..1)`, etc. (Names TBD by the package; this plan assumes the user-described shape and may need correction once the package is in.)
**Acceptance**: `import { play } from '@zzfx-studio'` resolves in both docs and minis tsconfig.

C2. **Create `packages/audio-bridge/`** (small internal package). Purpose: own the docs-side singleton (master gain + SFX bus + music bus), expose the proxy + subscribers + storage. Replaces the duplicate-ZzFX engine inside `docs/src/scripts/sounds.ts`.
```
packages/audio-bridge/
  src/
    index.ts          # public API (createPlayer, subscribe, …)
    singleton.ts      # window.__threeFlatlandAudio singleton
    storage.ts        # localStorage keys
    proxy.ts          # ZzFX-compatible function that routes through the bus
  package.json
```
Public API:
- `getPlayer(): AudioPlayer` — lazy-creates the singleton.
- `play(spec)` — SFX one-shot.
- `playMusic(track)` — start a music track on the music bus.
- `setMasterLevel(level: 0|1|2|3)` — master gain steps.
- `setMusicGain(g: 0..1)` — music bus gain.
- `duck(target: number, ms: number)` / `unduck(ms: number)` — temporary music-bus level for demo-music takeover.
- `subscribe(cb)` — state-change callback.
- `createZzfxProxy(): PlaySoundFn` — ZzFX-compatible function the docs passes into mini props.
**Acceptance**: `pnpm --filter=audio-bridge build` green; the new package can be imported from docs.

C3. **Migrate `docs/src/scripts/sounds.ts`**: rewrite it to be a thin re-export over `@three-flatland/audio-bridge`. Keep the high-level functions (`playClick`, `playHover`, …, `playWarp`) — they now call `play(spec)` from the bridge. Drop the duplicate `generateZzfxBuffer` synthesis (lines 630-756) and the duplicate `zzfx()` function (lines 128-275). Keep `normalizeVolume()` and the preset specs (lines 277-344) — those are content, not engine. Keep `setupSoundEvents()` + `setupViewTransitionSupport()` — those are docs-side event wiring, not engine.
**Acceptance**: file shrinks from ~805 lines to ~250-ish; all consumers (SoundToggle, MDX `data-sound` decorations, HeroGame, ShowcaseGame) keep working.

C4. **Migrate `minis/breakout/src/App.tsx`**: drop the inlined `createZzfx()` (lines 7-109); import zzfx-studio directly:
```ts
import { play } from '@zzfx-studio'
…
<MiniBreakout zzfx={(...spec) => play(spec)} isVisible showStats />
```
**Acceptance**: standalone `pnpm --filter=@three-flatland/mini-breakout dev:app` plays sounds correctly on a single browser tab.

C5. **Add `MiniGameProps.audio` for music** (later, when jukebox lands): augment the prop signature in `minis/breakout/src/types.ts` to also accept an optional `playMusic` function (or a wider `audio` namespace). Optional — only minis that play music need it. Breakout doesn't yet.
**Acceptance**: type compiles; prop is optional; no breaking change to existing call sites.

C6. **Wire the docs proxy**: `HeroGame.tsx` and `ShowcaseGame.tsx` keep using `sounds.createZzfxProxy()` — same call sites, the proxy now lives in audio-bridge.
**Acceptance**: ShowcaseGame paddle hits play through the docs AudioContext when audio is unlocked + unmuted.

### Step D — Audio quality pass
See §5 for the recommended new parameters. Each row of the table is independent; commit them as one sweep:
- D1. Update `docs/src/scripts/sounds.ts:283-344` UI sound preset arrays.
- D2. Update `minis/breakout/src/systems/sounds.ts:6-30` game sound preset arrays.
- D3. Smoke-test on Mac/Win/Linux for clipping. Easiest tool: AudioContext destination → MediaStreamDestination → MediaRecorder dump for offline inspection in Audacity. Optional; eyeball-listen is sufficient for the QA target.
**Acceptance**: every sound in §5 is either marked "keep" with current params, or has updated params with no audible click / no audible clipping / no >300ms tail.

### Step E — Jukebox
E1. **Compose the track library**: `docs/src/audio/tracks.ts`. Four tracks at first land. Each track is a `@zzfx-studio` music spec object plus metadata. Open question on what zzfx-studio's music spec looks like — see §6.
**Acceptance**: tracks loop cleanly when played in isolation; each is ~30-60s; volume-matched across the four.

E2. **Add music wiring to audio-bridge**: `playMusic(track)`, `stopMusic()`, `setMusicGain(g)`, `duck(level, ms)`, `unduck(ms)`. Music plays from a single oscillator/scheduler chain inside the audio-bridge singleton.
**Acceptance**: `getPlayer().playMusic(tracks[0])` from devtools starts looped playback; `stopMusic()` stops it.

E3. **Create the popover component**: `packages/starlight-theme/components/overrides/parts/MusicPlayer.astro`. Renders the trigger button + the popover. State backed by audio-bridge's subscribers + localStorage. Initial markup sketch:
```astro
<flatland-music-player>
  <button class="music-trigger" aria-label="Open music player">
    <span class="i-lucide:music" />
  </button>
  <div class="music-popover" data-open="false" role="dialog" aria-label="Music player">
    <div class="music-meta">
      <span class="music-title"></span>
      <span class="music-credit"></span>
    </div>
    <div class="music-controls">
      <button class="music-prev" aria-label="Previous track"><span class="i-lucide:skip-back" /></button>
      <button class="music-toggle" aria-label="Play"><span class="i-lucide:play" /></button>
      <button class="music-next" aria-label="Next track"><span class="i-lucide:skip-forward" /></button>
    </div>
    <input class="music-volume" type="range" min="0" max="100" value="30" aria-label="Music volume" />
    <div class="music-progress" aria-hidden="true"><span class="music-progress-fill"></span></div>
  </div>
</flatland-music-player>
```
Custom-element script handles open/close, prev/next, play/pause, slider input, and rAF-driven progress fill updates.
**Acceptance**: popover opens on click, closes on outside-click + Escape; controls work; volume slider drives music bus; progress fill animates; popover state survives SPA navigation.

E4. **Wire into Header**: edit `packages/starlight-theme/components/overrides/Header.astro` to render `<MusicPlayer />` next to SoundToggle inside the nav row:
```astro
<div><SocialIcons /></div>
<div><SoundToggle /><MusicPlayer /></div>
```
Wrap them in a flex container if dividers misalign — same `:has` pattern as before.
**Acceptance**: header has Search, social icons divider, sound + music affordances stacked horizontally, no layout shift on popover open.

E5. **Ducking pipeline**: when a demo's zzfx-studio call hits `playMusic`, audio-bridge invokes `duck(0.1, 200)`. When the demo stops or unmounts (or the `playMusic` source ends), audio-bridge invokes `unduck(400)`. Popover title shows "Now playing: [demo title]" via subscriber callback.
**Acceptance**: when ShowcaseGame eventually adds music (out of scope for this issue), the docs music ducks within 250ms. For now, manually-trigger from devtools confirms the ramp envelopes work.

E6. **Reduced-motion**: detect `prefers-reduced-motion: reduce` in audio-bridge — disable the progress-fill rAF (snap instead), make duck/unduck instant (no envelope), keep popover open/close non-animated.
**Acceptance**: under reduced-motion the player still functions; nothing animates.

E7. **localStorage persistence**: hook up the new keys (`flatland-music-volume`, `flatland-music-track`, `flatland-music-mode`, `flatland-music-position`) inside audio-bridge.
**Acceptance**: reload preserves track, slider, mode; music resumes at saved position when same track.

### Step F — Verify
F1. Build green: `pnpm --filter=docs build`, `pnpm --filter=@three-flatland/mini-breakout build`, `pnpm build`.
F2. Smoke test the user-facing acceptance criteria from the brief:
- Music starts when audio first unlocks on user gesture — not before — no autoplay-blocking warnings.
- Master mute kills music + SFX in <100ms.
- Demo music ducks the docs music within 250ms.
- Mini player state survives a full SPA navigation.
- Mini player + SoundToggle layout does not shift the wordmark.
F3. Lighthouse a11y pass — confirm new buttons + popover get proper aria-labels + keyboard navigation (Tab into the trigger, Enter to open, Tab through controls, Esc to close).

---

## 4 — Audio inventory

### 4.1 — Docs UI sounds (`docs/src/scripts/sounds.ts:283-344`)

| Sound | Current params (volume, randomness, freq, attack, sustain, release, shape, …) | What it sounds like | Recommendation | Proposed new params |
|---|---|---|---|---|
| `playClick` (line 286) | `(normalizeVolume(0.35, 400, 3), 0, 400, 0, 0.015, 0.035, 3, 1, …)` | Warm triangle tick, 400Hz, ~50ms total. Soft, warm. | **Keep.** This is the model the rest should follow. | unchanged |
| `playButtonPress` (line 293) | `(normalizeVolume(0.5, 420, 1), 0, 420, 0.01, 0.03, 0.08, 1, 0.3, -20, 0, 0, 0, 0, 0.15, 0, 8)` | Square wave + small slide + noise + bitcrush. Reads as "thunky click." | **Tune.** Bitcrush at 8 is heavy-handed for a UI sound on a clean design system; drop to 4 or 0. Square at 420Hz is on the borderline of harsh. | `(normalizeVolume(0.5, 320, 3), 0, 320, 0.005, 0.025, 0.06, 3, 1, -10, 0, 0, 0, 0, 0.06, 0, 0)` (triangle, softer, no bitcrush) |
| `playHover` (line 300) | `(normalizeVolume(0.3, 500-600 rand, 3), 0.05, …, 0, 0.015, 0.03, 3, …)` | Soft triangle tick with pitch variation. | **Keep.** | unchanged |
| `playCardHover` (line 307) | `(normalizeVolume(0.5, 350-380 rand, 0), 0, …, 0, 0.03, 0.06, 0, 1, 0, 0, 80, 0.02, …)` | Sine sweep with +80Hz pitch jump. ~90ms total. Reads as "card lit up." | **Keep**, but consider reducing pitch jump from 80 → 50 so the rise is less assertive — cards are passive. | `(normalizeVolume(0.4, 360 rand, 0), 0, 360, 0, 0.03, 0.06, 0, 1, 0, 0, 50, 0.02, 0, 0, 0, 0)` |
| `playToggleOn` (line 314) | `(normalizeVolume(0.5, 280, 0), 0, 280, 0, 0.04, 0.08, 0, 1, 0, 0, 180, 0.025, …)` | Sine, 280→460Hz pitch jump. Rising chirp. | **Keep.** Reads as "on." | unchanged |
| `playToggleOff` (line 321) | `(normalizeVolume(0.5, 380, 0), 0, 380, 0, 0.04, 0.08, 0, 1, 0, 0, -120, 0.025, …)` | Sine, 380→260Hz. Descending chirp. | **Keep.** Reads as "off." | unchanged |
| `playAccordionOpen` (line 328) | `(normalizeVolume(0.5, 300, 0), 0, 300, 0, 0.03, 0.05, 0, 1, 0, 0, 150, 0.03, …)` | Sine, 300→450Hz. Reveal chirp. | **Keep.** | unchanged |
| `playAccordionClose` (line 335) | `(normalizeVolume(0.5, 450, 0), 0, 450, 0, 0.03, 0.05, 0, 1, 0, 0, -150, 0.03, …)` | Sine, 450→300Hz. Close chirp. | **Keep.** | unchanged |
| `playWarp` (line 343) | `(normalizeVolume(0.4, 220, 0), 0, 220, 0.02, 0.08, 0.15, 0, 1, 50, 0, 200, 0.04, 0, 0, 0, 4)` | Sine sweep with pitch jump and filter sweep. ~250ms. Classic warp. | **Tune.** Currently 250ms — on the long side for an "I clicked home" sound. The filter sweep helps but feels arcade-y. Shorten release to ~0.10, drop the filter param to 2. | `(normalizeVolume(0.4, 220, 0), 0, 220, 0.02, 0.06, 0.10, 0, 1, 50, 0, 200, 0.04, 0, 0, 0, 2)` |

### 4.2 — Breakout game sounds (`minis/breakout/src/systems/sounds.ts:6-30`)

These play **inside the game**, often rapid-fire during play. Different bar — they should feel like game feedback, not UI feedback. The arcade vibe is appropriate here, but harshness/clipping still matters.

| Sound | Current params | What it sounds like | Recommendation | Proposed new params |
|---|---|---|---|---|
| `PADDLE_HIT` (line 6) | `[0.5, 0, 300, 0, 0.02, 0.05, 1]` | Square wave at 300Hz, ~70ms. Plays on every paddle-ball contact. | **Tune.** Square at 0.5 volume in fast-fire can clip when overlapping (which it does during ready-state demos). Either drop volume to 0.4 or shift to shape 3 (triangle) to soften the harmonics. | `[0.4, 0, 280, 0, 0.015, 0.04, 3]` |
| `WALL_HIT` (line 9) | `[0.3, 0.05, 200, 0, 0.015, 0.03, 3]` | Triangle at 200Hz, very short. | **Keep.** This is the model the others should follow. | unchanged |
| `BLOCK_BREAK` (line 12) | `[0.5, 0, 800, 0, 0.02, 0.08, 0]` | Sine at 800Hz, ~100ms. Bright. | **Tune.** 800Hz sine is fine but with no pitch movement it sounds static — feels like a placeholder. Add a small +200Hz pitch jump to give it a "chip" feel. | `[0.45, 0.03, 700, 0, 0.02, 0.07, 0, 1, 0, 0, 200, 0.02]` |
| `BALL_LAUNCH` (line 15) | `[0.4, 0, 400, 0, 0.03, 0.06, 0, 1, 100]` | Sine at 400Hz with +100Hz slide. Rising. | **Keep.** | unchanged |
| `GAME_OVER` (line 18) | `[0.5, 0, 400, 0, 0.15, 0.25, 0, 1, -150, 0, -80, 0.08]` | Sine, 400→sliding-down with -150 slide and -80 pitch jump. ~400ms. | **Keep, slight tune** — 400ms tail is long but appropriate for the game-over moment. Consider lowering the second pitch-jump slightly so the descent is gentler. | `[0.5, 0, 380, 0, 0.12, 0.22, 0, 1, -130, 0, -60, 0.08]` |
| `LEVEL_CLEAR` (line 21) | `[0.6, 0, 300, 0, 0.1, 0.2, 0, 1, 80, 0, 300, 0.05]` | Sine, 300→ascending. Triumphant. | **Keep.** | unchanged |
| `MISS` (line 24) | `[0.4, 0.1, 100, 0, 0.03, 0.08, 4]` | Noise shape at 100Hz, ~110ms. "Thud." | **Tune.** Pure noise at 100Hz can read as a static burst. Add a low-freq sine fundamental underneath by switching shape to 3 (triangle) and bumping noise param 13 to 0.4 for a "thump with crackle" feel. | `[0.4, 0.08, 80, 0, 0.025, 0.07, 3, 1, 0, 0, 0, 0, 0, 0.4]` |
| `GAME_START` (line 27) | `[0.5, 0, 250, 0, 0.05, 0.1, 0, 1, 150]` | Sine, 250→ascending. | **Keep.** | unchanged |
| `COUNTDOWN_TICK` (line 30) | `[0.15, 0, 500, 0, 0.015, 0.03, 0]` | Sine pip at 500Hz. Tiny. | **Keep.** | unchanged |

### 4.3 — Music tracks (new in §5)

| Track | Gem | BPM | Mood | Where it plays best |
|---|---|---|---|---|
| Foil | gold | ~110 | Bright, arpeggiated, foil-glint hero energy | Landing page idle |
| Docs | amethyst | ~80 | Quiet pad, breathy, reading-mode | Long-form prose pages (`/getting-started`, `/guides`, `/api`) |
| Index | diamond | ~130 | Bouncy chip-funk, kinetic | Examples masonry (`/examples`) |
| Showcase | ruby | ~120 | Confident chip-rock | Showcases page (`/showcases`) |

Track selection on navigation is automatic — see §6 for whether we want auto-track-per-section or pure-manual.

---

## 5 — Risk + sequencing

**Wait for the in-flight light-mode polish PR to merge before starting any of this.** That PR is in your `git diff` right now (FeatureCard light-mode drop-shadow, GalleryTile light-mode drop-shadow, Header light-mode landing text-fade, Search default-browse panel + view-transition cleanups). Every one of those introduces or refines `[data-theme='light']` selectors. Doing Step A on top is trivial — the selectors already work — but doing it under the polish PR mid-flight would force the polish agent to rebase its CSS selectors, which is wasted churn.

Sequencing inside this plan:
- **Land Steps A + B together.** They share a single Header.astro edit. Splitting them creates an intermediate state where the toggle is gone but no sound icon yet — and the nav row hides the divider via `:has(> :not(script))`, so removing one nav item without adding another temporarily breaks the visual divider too. One PR.
- **Land Step C alone.** It's a refactor of the audio engine; behavior shouldn't change. Easy to review in isolation.
- **Land Step D after C.** D depends on C's de-duplicated synth so we're only tuning one set of params, not two.
- **Land Step E last.** Largest scope, most surface area.

Risk callouts:
- **A4 — Starlight's default ThemeSelect**: if Starlight injects its own ThemeSelect when our override is absent, we'd need the empty-override file to suppress it. I confirmed Starlight's `components` config does accept `ThemeSelect`, but verify after A3 + A4 land.
- **A1 — boot script ordering**: the script must run before `StarlightHead` resolves CSS. If `StarlightHead` injects its own ThemeProvider inline script first, ours might race. Mitigation: run our script *inside* an early head entry via `astro.config.mjs`'s `head` array (priority is by position in the array). I'd verify by inspecting build output `dist/index.html` and confirming our boot script appears before any Starlight theme script.
- **C1 — `@zzfx-studio` reality check**: if the package doesn't exist publicly, the entire Step C through E plan depends on us building it. That's a different scope — see §6.
- **C2 — internal package overhead**: adding `packages/audio-bridge/` adds workspace surface. Worth it because the docs-side AudioContext needs to be a singleton outside any single component lifecycle, and putting it in `docs/` couples it to docs. But: justify the workspace package vs a `docs/src/audio/` module before doing the work.
- **E3 — popover + ReplacementSwap**: the popover's open state lives in custom-element instance state. Since the header *survives* navigation (vtbot preserves it) the custom element is NOT re-instantiated — its open state survives navigation naturally. Verify by opening the popover, navigating, and confirming it stays open.
- **E5 — ducking on cross-window**: examples are iframed; their zzfx-studio playback runs in *their* AudioContext, not the docs'. The docs music won't auto-duck for iframed example audio unless we add a postMessage protocol (which §2.3 explicitly defers). For now, examples don't play music, so this is fine. If a future example adds music, design the postMessage protocol then.

---

## 6 — Open questions

These are decision points the plan cannot resolve without you. Please address before Step C starts.

1. **`@zzfx-studio` reality.** Does this package exist on npm, or are we creating it as part of this work?
   - If it exists: what's its actual API? Please paste the README or the published index.d.ts so the audio-bridge wraps the right surface. Specifically: how are tracks defined (object vs nested arrays, like ZzFX's `zzfxM` 4-channel pattern grid)? Is there a separate "music" subexport or is it a single API?
   - If we're creating it: that's a separate package authoring task with its own scope. The plan above would need to either fold that in (Step C0: build the package) or wait. **Recommend**: fold it in *only* if there's no published equivalent. Otherwise it doubles the work.

2. **Track composition.** Do you have a starter set, or do we compose four tracks from scratch? Composing is non-trivial — a single ~30s loopable chiptune track is a few hours of iteration. If we compose: are you OK with the gem-mapping in §4.3 as the brief for the four tracks, or do you want different moods?

3. **Per-section auto-track switching.** Should navigating from `/examples` to `/api` auto-switch the playing track from "Index" to "Docs"? Or does the user pick once via the popover prev/next and the track stays put? Auto-switching is a nicer feel; manual is simpler. **Recommend**: manual for v1, auto for v2 (gated on user feedback that the auto-switch is wanted).

4. **Sequential vs shuffle.** §2.5 defaults to sequential. Are you OK with that, or do you want shuffle as the default?

5. **Master mute + music pause behavior on cross-tab.** If a user opens two docs tabs and mutes in tab A, should tab B also reflect mute? Cross-tab sync via `BroadcastChannel` or `storage` event is straightforward to add but not in the brief. **Recommend**: not in v1; cross-tab independence is fine.

6. **Music auto-start on master unmute.** §2.5 says "When global audio is enabled (SoundToggle on), the ambient music starts playing automatically." Is that the right default for the very first time a user enables audio? Some users may want SFX-only — the first click on SoundToggle being "now audio is on AND music started playing too" might surprise. **Recommend**: first SoundToggle unmute does NOT auto-start music; user has to explicitly open the popover and click play. Subsequent unmutes resume music if it was previously playing.

7. **Popover trigger icon.** Pick: `lucide:music`, `lucide:disc-3`, `lucide:headphones`, `lucide:radio`, `lucide:cassette-tape` (if available). **Recommend**: `lucide:music` (universally legible) or `lucide:disc-3` (more characterful, matches the chiptune vibe).

8. **`docs/src/components/HeroGame.tsx` deletion.** That file still exists but no MDX renders it — the landing now uses `HeroShader.tsx`. Is it worth keeping HeroGame.tsx as a reference for the breakout-on-landing variant, or should it be deleted in Step C? **Recommend**: delete in Step C; if the breakout-on-landing variant comes back, ShowcaseGame.tsx is the canonical breakout-embedding pattern.

9. **Theme-provider script injection point.** Where exactly should the boot script in Step A1 live? Two options:
   - In `docs/src/components/Head.astro` as a `<script is:inline>` block at the top.
   - In `docs/astro.config.mjs`'s Starlight `head` array as the very first entry.
   The latter guarantees ordering (Starlight prepends nothing before its own `head` entries). **Recommend**: the astro.config.mjs entry.

10. **WebSearch / WebFetch denied in this session.** I could not confirm the published state of `@zzfx-studio` or read its README. If you can paste the relevant docs back into the next prompt, I can sharpen Step C and Step E based on the real API.
