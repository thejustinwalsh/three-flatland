# Make Web Games — IGDA Lightning Deck (Phase 1 design)

**Date:** 2026-06-25
**Worktree:** `igda-lightning-06-2026`
**Status:** design — Phase 1 (content + scene scaffold)

## Goal

A 5-minute lightning talk for an IGDA audience of Unity/Unreal game developers,
pitching **the web as a first-class platform for indie 2D games** with
**three-flatland** as the toolkit. The deck is itself built on three-flatland
(R3F + three.js + TSL) — a live background scene escalates feature by feature
behind the slides, dogfooding the library it pitches.

The deck engine is **reusable**: this talk is the first of several. A future
2-minute three.js-conf deck will reuse the same engine and add only its own
content folder.

### Archetype (Diátaxis)

**Explanation**, held throughout — understanding-oriented, persuasive: *why*
web games, *why* now. The sizzle section (slides 6–8) bends toward
demonstration but never breaks the persuasive throughline. Register:
confident-technical and welcoming-collaborative (the brand voice), no
marketing froth.

## Phase 1 scope

**In scope — must be complete this phase:**
- The standalone Astro route and page shell (unlinked, not surfaced in docs nav).
- The reusable **deck engine** (`components/deck/`): reveal.js mount, R3F canvas,
  shared store, scene director, typography primitives.
- The **make-web-games** deck content (`components/slides/make-web-games/`):
  all 10 slides with final HTML/JSX content **and** speaker notes.
- A **scene scaffold** in the background, wired to the slide position so camera
  beats fire on slide change (placeholder geometry/sprites are fine).

**Deliberately deferred (later iteration):**
- Polished three-flatland scene content per beat (real sprite batches, tilemap,
  lighting, radiance cascades demos). Scaffold now, dogfood for real later.
- GO NATIVE device showcase: Steam Deck / iPhone **textured 3D models** (assets
  now in hand — see Assets) with a three-flatland demo **rendered to the screen
  texture** running on the virtual device screen. The render-texture swap is a
  recorded design requirement; placeholder framing in Phase 1, full integration later.
- Surfacing the deck anywhere in the docs site navigation.
- Real sourced statistics (numbers are marked `[SOURCE]` — see Open Items).

## Slide spine (10 slides)

Each slide carries: eyebrow, headline, optional subline, **speaker notes**
(`<aside class="notes">`), and a **scene beat** (camera pose + active BG elements).
Copy below is near-final; implementation should treat it as the content of record.

### 1 — MAKE WEB GAMES (cold open)
- **Eyebrow:** —
- **Headline:** MAKE WEB GAMES
- **Notes:** Who I am, the provocation. This room ships on Unity and Unreal.
  I'm here to make the case for the platform you already have open.
- **Scene beat:** single hero sprite, calm idle; camera framed tight.

### 2 — The web is the most frictionless platform in games
- **Eyebrow:** THE PITCH
- **Headline:** No install. No store. One URL.
- **Subline:** Your game is one click from every player on Earth.
- **Notes:** The friction tax of native distribution — downloads, store review,
  platform cuts. Web collapses it to a link. Instant play is a feature.
- **Scene beat:** camera pulls back slightly; parallax hint.

### 3 — USE THE PLATFORM (reach + revenue)
- **Eyebrow:** USE THE PLATFORM
- **Headline:** The web is already the biggest game platform.
- **Stats (3):**
  - `[SOURCE: web/HTML5 game market size, $X B, year]`
  - `[SOURCE: monthly players on web-game portals — Poki / CrazyGames]`
  - `[SOURCE: growth rate or revenue trend]`
- **Notes:** Cite each source out loud. The reach + revenue argument. This is
  the load-bearing data slide — sets up that web games are a real market, not a toy.
- **Scene beat:** sprites multiply across the field.

### 4 — The objection
- **Eyebrow:** THE CATCH
- **Headline:** "But the web can't make *real* games."
- **Subline:** That was true. It isn't anymore.
- **Notes:** Name the Unity/Unreal skepticism directly and respect it. The turn:
  WebGPU + TSL changed the rendering ceiling. Set up the toolkit.
- **Scene beat:** scene desaturates / stutters — the "toy" feeling — then holds.

### 5 — FIRST CLASS 2D
- **Eyebrow:** FIRST CLASS 2D
- **Headline:** three-flatland
- **Subline:** Spartan development. One library. All you need.
- **Notes:** raylib calls it Spartan development — minimal dependencies, you
  against the machine. three-flatland is that for web 2D: WebGPU + TSL, sprites,
  tilemaps, lighting, GI, all in one place.
- **Scene beat:** scene snaps back to full color; camera settles into the "stage".

### 6 — Sizzle: sprites at scale
- **Eyebrow:** SIZZLE
- **Headline:** 100,000 sprites. One draw call.
- **Notes:** SpriteGroup batching, GPU-driven. The thing that's hard in 2D —
  throughput — is the thing the GPU does best. (Live BG demo target.)
- **Scene beat:** SpriteGroup batch floods in; perf counter visible.

### 7 — Sizzle: tilemaps + dynamic lighting
- **Eyebrow:** SIZZLE
- **Headline:** Tilemaps. Real-time 2D lights. Soft shadows.
- **Notes:** Tiled Forward+ lighting and dynamic shadows — lighting tech that
  used to mean a PC/console budget, in a 2D browser scene. (Live BG demo target.)
- **Scene beat:** tilemap builds; a light sweeps casting real shadows.

### 8 — Sizzle: radiance cascades
- **Eyebrow:** SIZZLE
- **Headline:** Radiance cascades. Global illumination in 2D.
- **Subline:** Light that bounces. In a browser.
- **Notes:** GI was console/PC-only territory. Radiance cascades bring bounced
  light to 2D, running live in the page. This is the wow beat. (Live BG demo target.)
- **Scene beat:** GI bounce lights the scene — the "previously PC-only" payoff.

### 9 — GO NATIVE
- **Eyebrow:** GO NATIVE
- **Headline:** You're not trapped in a browser.
- **Bullets:** NativeScript + three.js · ANGLE → native WebGL2 · Steam Deck
- **Notes:** The Steam Deck / native question is the real worry — answer it head-on.
  In 2026 you are not boxed in: my NativeScript + three.js demo, ANGLE bridging
  WebGL2 to native, Steam Deck's browser-grade runtime. **Hylo** is the long game —
  publish once, ship everywhere — mention it here as the trajectory, not a slide.
- **Scene beat (target):** camera zooms out; the canvas reframed inside a
  Steam Deck / iPhone **device model**, three-flatland demo rendered to its screen
  texture (see Assets for the screen-swap mechanism). *(Phase 1: placeholder framing.)*
- **Credits:** CC-BY models require visible attribution — small credit line on
  this slide (and full strings in notes). See Assets.

### 10 — Close / CTA
- **Eyebrow:** —
- **Headline:** three-flatland
- **Subline:** Make web games. First-class 2D. Go anywhere.
- **CTA:** QR code → Getting Started.
- **Notes:** The advertisement close. Invite questions — leave one thread
  deliberately unpulled (Hylo / native pipeline / a feature not shown) so the
  Q&A has somewhere obvious to start.
- **Scene beat:** camera returns to the hero sprite, now lit by everything we built.

## Architecture

**Approach A — reveal.js is the source of truth, the scene is a pure function
of it.** One React island owns both the fullscreen R3F `<Canvas>` and the reveal
container so they share a module-level store. Reveal handles all navigation
(keyboard, touch, presenter clicker). A thin adapter subscribes to reveal's
`ready` / `slidechanged` / `fragmentshown` events and writes `{ slideIndex,
fragment }` into the store. A `<SceneDirector>` in the R3F tree reads the store
and eases the camera + scene state to the active **beat**. Clean seam: reveal
owns *position*; the scene is *derived*. Swapping BG elements per slide is just
data in the beat table.

Rejected: **B** (React-controlled reveal) fights reveal's built-in navigation
and clicker support for no gain; **C** (two loosely-coupled timelines) loses the
per-slide camera choreography that is the whole dogfood payoff.

### File layout

```
docs/src/
  pages/slides/
    make-web-games.astro          # thin route, unlinked; future: threejs-conf.astro
  components/deck/                 # REUSABLE engine — shared by every deck
    Presentation.tsx              # owns reveal + R3F canvas, mounts both
    presentationStore.ts          # { slideIndex, fragment } via useSyncExternalStore
    SceneDirector.tsx             # reads store, eases camera to the active beat
    DeckCanvas.tsx                # fullscreen R3F <Canvas> scaffold
    primitives/                   # Slide, Eyebrow, Headline — bold typography, gem palette
  components/slides/make-web-games/   # THIS deck's content only
    deck.tsx                      # assembles slides + scene, fed to <Presentation>
    slides/*.tsx                  # one component per slide (content + <aside class="notes">)
    scene/                        # deck-specific BG elements (sprites, tilemap, …)
    beats.ts                      # slideIndex → camera pose + active scene elements
```

`deck/` is the framework (stable). `slides/<name>/` is the swappable payload.
Future decks add a route + a content folder and reuse all of `deck/`.

### Component responsibilities

- **`Presentation`** — mounts reveal.js (config: notes plugin, transitions),
  renders `DeckCanvas` as a fixed fullscreen layer *behind* the reveal DOM,
  wires reveal events → `presentationStore`. Takes `slides` and `scene` as props
  so it is deck-agnostic.
- **`presentationStore`** — module-level external store; `subscribe` + `getSnapshot`
  for `useSyncExternalStore`; setter called from reveal event handlers.
- **`DeckCanvas`** — R3F `<Canvas>` (WebGPU per repo convention) fixed at `inset:0`,
  `z-index` below slides; renders the deck's `scene` and a `SceneDirector`.
- **`SceneDirector`** — `useFrame` loop that reads the store's `slideIndex`,
  looks up the beat, and damps the camera (and any beat-driven element state)
  toward it.
- **`primitives/`** — `Slide`, `Eyebrow`, `Headline`, `Subline` — typography
  components carrying the bold-minimalist style and gem-palette tokens, so deck
  content stays declarative.
- **`slides/make-web-games/beats.ts`** — the slide→beat table; the single place
  that couples content order to scene choreography.

### Reveal.js integration notes

- reveal.js is a **new docs dependency** (not yet installed). Add to `docs/package.json`.
- Slides authored as React/JSX children inside the reveal `.slides` container,
  mounted via `client:only="react"` (reveal mutates the DOM; no SSR).
- Speaker notes use reveal's notes plugin via `<aside class="notes">` per slide;
  the `S` key opens the presenter view.
- The route page disables the Starlight layout entirely (custom `.astro` page in
  `src/pages/`, which bypasses content collections / nav).

### Design / typography

- **Headlines:** Public Sans 700 — clean, bold, tight tracking. Bold minimalism.
- **Eyebrows:** uppercase label, gem-accent color (taxonomy: each section/eyebrow
  can carry its own gem — e.g. USE THE PLATFORM in one gem, SIZZLE in another).
- **Backdrop:** the near-black live scene *is* the background; slides sit over it
  with minimal chrome. Sub-perceptual grain optional, inherited from theme.
- All color via existing `starlight-theme` gem tokens; light/dark not required for
  a presentation (dark-only is fine for a projected talk) — confirm if otherwise.

## Assets (GO NATIVE device showcase)

Two CC-BY-4.0 glTF device models are vaulted in the worktree at
`assets-src/devices/` (git-excluded staging — raw originals ~40 MB; optimized
`.glb` gets committed to `docs/public/`, not the raw source). Both are
`scene.gltf` + `scene.bin` + textures.

### steam-deck (`assets-src/devices/steam-deck/`)
- Screen is **cleanly isolable**: material `steam_deck_mat03` (material 0) is the
  screen only, on its own mesh node `steam_deck_steam_deck_mat03_0` (mesh 0,
  node 4), emissive-lit (`emissiveFactor [1,1,1]`, emissiveTexture).
- **Swap mechanism:** replace that mesh's material with a TSL node material whose
  color/emissive samples the flatland `RenderTarget`. Trivial, well-bounded.

### iphone-14-pro (`assets-src/devices/iphone-14-pro/`)
- Screen is **NOT separable by material/mesh**: the whole phone is one mesh
  (`defaultMaterial`, mesh 0) with one material (`Material`), screen baked into a
  shared 4096² baseColor + 4096² emissive (`Material_emissive.jpeg`) atlas.
- **Swap mechanism — two options, decide at implementation:**
  1. **Offline screen split (recommended):** preprocess with gltf-transform /
     Blender so the screen faces become their own primitive + material with flat,
     axis-aligned quad UVs. Cleanest runtime, correctly oriented demo, one-time
     asset prep. Fits dogfooding our own asset pipeline.
  2. **Emissive-mask composite (TSL fallback):** custom node material samples the
     flatland `RenderTarget` where emissive luminance marks the screen, original
     PBR elsewhere. No asset surgery, but risks UV distortion if the screen UVs
     are not a clean rect.

### Optimization (plan task)
Raw is ~40 MB. Before committing: gltf-transform pass — meshopt/draco geometry
compression, resize + KTX2 textures, **drop the baked screen textures** (the
render target replaces them). Target a lean `.glb` per device in `docs/public/`.

### Attribution (mandatory — CC-BY-4.0)
Visible credit required wherever shared. Exact strings (from each `license.txt`):
- Steam Deck: *This work is based on "Steam Deck"
  (https://sketchfab.com/3d-models/steam-deck-502407f2dab048728e1b63699bf99d45)
  by VM-Models (https://sketchfab.com/vm-models) licensed under CC-BY-4.0
  (http://creativecommons.org/licenses/by/4.0/)*
- iPhone 14 Pro: *This work is based on "Iphone 14 Pro"
  (https://sketchfab.com/3d-models/iphone-14-pro-5cb0778041a34f09b409a38c687bb1d4)
  by mister dude (https://sketchfab.com/misterdude) licensed under CC-BY-4.0
  (http://creativecommons.org/licenses/by/4.0/)*
- Placement: a small persistent credit line on slide 9 (GO NATIVE) plus the full
  strings in that slide's speaker notes, and a `CREDITS` entry in the deck folder.

## Open items

- **Statistics (slide 3):** three figures marked `[SOURCE]`. Need verified
  numbers — web/HTML5 game market size, web-portal monthly players (Poki /
  CrazyGames), growth/revenue trend. Run as a dedicated research + verification
  pass before the talk; do not ship fabricated numbers.
- **reveal.js version + plugins:** pick current reveal.js; confirm notes plugin
  and a transition style that suits camera-synced beats (likely `none`/`fade` so
  the scene carries motion, not slide wipes).
- **WebGPU fallback:** repo targets WebGPU + WebGL2 via TSL. Confirm the canvas
  uses the repo's standard renderer setup so the deck runs on the presentation
  machine / projector.
- **iPhone screen swap:** decide offline-split vs. emissive-mask (see Assets) at
  implementation — depends on inspecting the screen UV island.

## Out of scope (this project)

- Docs-nav discoverability for the deck.
- The future three.js-conf 2-minute deck (separate content folder, later).
- Any Hylo platform implementation (Hylo is a talking point only).
