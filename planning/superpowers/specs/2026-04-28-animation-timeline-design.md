# FL Sprite Atlas — Animation Timeline (v1) Design

## Goal

Add multi-animation editing to the FL Sprite Atlas tool: define named animations from existing frames, set per-cell hold counts via frame duplication, preview live in a floating square inside the canvas while continuing to edit rects, persist into the existing `meta.animations` block of the sidecar.

## Non-goals (v1)

- Per-frame durations (we use the schema's frame-duplication timing model — `fps` alone governs playback).
- Onion skinning / interpolation / transitions.
- AI labeling assist.
- Multi-resolution atlases.
- Reverse playback as a separate concept (ping-pong covers it).
- Detailed event-tag editing UI (we surface the data path; the UI gets a minimal "right-click → add tag" pass and is iterated post-MVP).

## Layout

### Atlas pane gains a vertical split

```
┌──────────────────────────┐ ┌─────────────┐
│ Atlas (canvas)           │ │ Frames      │
│   ┌──────────┐           │ ├─────────────┤
│   │ PIP      │           │ │ Tool slot   │
│   └──────────┘           │ │             │
├──────────────────────────┤ │             │
│ ▼ Animations  idle ▾  ▶  │ │             │
│ 12 fps  loop  ↺      ＋  │ │             │
│ ────── timeline body ─── │ │             │
└──────────────────────────┘ └─────────────┘
```

- The animation drawer is a peer of the canvas inside the Atlas pane (not full-width across the editor). Right column (Frames + Tool) stays exactly as today.
- Drawer follows the VSCode collapsible-panel pattern: chevron on the left of the header, header always visible (even when collapsed), resizable via a top splitter.
- Default state on open: collapsed when the sidecar has no animations, expanded otherwise. Persisted via prefs (`animDrawerExpanded`, `animDrawerHeight`).

### Drawer header (always visible)

Layout left-to-right:

| Element | Behavior |
|---|---|
| `▶`/`▼` chevron | Toggles collapsed/expanded |
| `Animations` label | Static |
| Animation dropdown (`idle ▾`) | Selects active animation; F2 / double-click renames |
| `▶`/`⏸` play | Plays / pauses the active animation; mirrors the PIP transport |
| `12 fps` chip | Click → small popover with NumberField (1–60) |
| `loop` chip | Click toggles; chip dim when off |
| `↺` ping-pong chip | Click toggles; chip dim when off |
| spacer | — |
| `＋` new animation | See "Workflow → Create" |
| `⋯` more | Delete (with confirm), Duplicate |

### Drawer body — three densities, auto from height

| Drawer height | Density | Cell representation |
|---|---|---|
| `≥ ~80 px` | **Detail** | Frame thumbnail (CSS background-image off the atlas), `×N` hold badge top-right |
| `~40–80 px` | **Dots** | Filled dot per cell; hold cells render as elongated bars proportional to N |
| `< ~24 px` (or chevron-collapsed) | **Header only** | Body hidden |

User picks density implicitly by dragging the splitter — no explicit toggle.

### Floating preview window (PIP)

- Lives **inside the canvas** as an absolutely-positioned card. Always present when an animation is selected; shows frame 0 paused by default.
- ~120×120 px, image aspect-fit, checker background matching the canvas's checker tone.
- Internal layout: sprite area (top, fills) + thin 14px transport bar (bottom): `▶ idle 3/12`.
- **Click anywhere on the PIP** = hop corners (TL → TR → BR → BL → TL). Persisted in `animPipCorner`.
- Plays at the active animation's fps; play/pause is shared state with the drawer header `▶`.
- **Live edit**: the PIP reads from the live `rects` array, so moving / resizing a rect that the playing animation references updates the next frame. No snapshot, no separate buffer.
- **No active-rect highlight in the main canvas** while playing — would flicker on every frame and competes with selection chrome. (Deferred unless real complaints.)

## Workflow

### Folder selection in Frames panel (precondition for fast create)

- Each folder header in the Frames panel gains an explicit `⊞ all` icon button.
- Click → all frames in that folder enter a **folder-selection** state (distinct from individual-pick yellow):
  - Each cell gets a slightly different hue along a gradient (green → cyan → blue → indigo → violet) so the sequence direction is visually obvious.
  - Frames in **other** folders dim to ~35% opacity until the selection clears.
  - Folder header itself flips to a "selected" treatment (cyan accent border on the `⊞ all` icon).

### Create

- `＋` **with frames selected** → new animation populated with the selected frames in their Frames-panel order. Default name = the single-folder prefix (if all selected frames share one folder) or `anim_N` (incremented). Animation immediately becomes active in the dropdown; F2 renames inline.
- `＋` **with no selection** → empty animation, drawer expands, body shows "Drag frames here, or select frames in the Frames panel and click + again."

### Add frames after creation

- **Drag** frames onto the timeline body — inserts at the drop point (between cells).
- **Multi-select + "Add to anim" button** in the Frames panel header — inserts at the timeline cursor (= playhead position; default end if never scrubbed).

### Hold

- Drag a cell's right edge to extend hold; cell widens, `×N` badge appears.
- Number keys `1`–`9` set hold on selected cell.
- Stored as duplication in `frames: string[]` (matches schema; `["idle_1","idle_1","idle_1"]` = hold 3).

### Reorder

- Drag a cell within the timeline to reorder. Same drag-kit visual as the other surfaces, border tinted "timeline" (a third accent — likely `vscode.focusRing`).

### Remove

- Select cell + Backspace, or context menu → Remove.

### Rename animation

- F2 on the dropdown's selected item, or double-click in the dropdown → inline rename.

### Delete animation

- `⋯` → Delete. Destructive — confirmation modal (`Delete "idle"? This cannot be undone.`).

## Drag system

A shared drag kit, used by three origins; one floating element renderer.

| Origin | Trigger | Border tint |
|---|---|---|
| Frames panel | Drag the icon (column 1) | `vscode.panelBorder` |
| Canvas rect | **Alt+drag** the rect body | `#ffcc00` (selection yellow) |
| Timeline cell | Drag the cell | `vscode.focusRing` |

- The floating element is the same component in all three cases — frame thumbnail (CSS background-image off the atlas image, sprite-sheet-style positioning), border color per origin.
- Drag starts at 1:1 with the source position; element follows the cursor.
- Drop targets: timeline cells (insertion gap) and drawer body (append). Highlight the gap on hover.
- Plain drag on a canvas rect still does move (existing behavior); the Alt modifier disambiguates "drag this rect into a timeline" — same convention as Figma / Aseprite for extract / duplicate gestures.
- All sources reference the same `frame.name` — single source of truth. Renaming a rect propagates to every animation that references it.

## fps / loop / ping-pong chips

- All three render as compact chips in the drawer header.
- `12 fps` chip — click opens a popover with a `NumberField` (existing primitive, range 1–60). Default fps for new animations: **12**.
- `loop` chip — click toggles; chip dim (50% opacity) when off.
- `↺` ping-pong chip — click toggles; chip dim when off. When on, playback runs `0,1,2,…N,N-1,…0,1,…`.

## Data model

No schema changes. Reuses the existing `meta.animations` block in `atlas.schema.json`:

```json
"animations": {
  "idle": {
    "frames": ["idle_0", "idle_0", "idle_1", "idle_2"],
    "fps": 8,
    "loop": true,
    "pingPong": false,
    "events": { "2": "step" }
  }
}
```

Editor in-memory shape mirrors this; serialized verbatim on save.

### Edge cases

- **Frame rename** — propagate. Renaming `idle_2` → `crouch_0` updates every animation that references it (in-place).
- **Frame delete** — strip all references on the next save; surface a banner if any animation drops below 1 frame (`"attack" was emptied — delete it?`).
- **Empty animations** are valid in editor state but stripped at save (Ajv requires `frames` non-empty). A small warning chip appears in the dropdown for empty anims.
- **Duplicate animation names** — block creation; rename inline accepts only unique names.

## Architecture / files

### New (in `tools/preview/src/`)

- `AnimationDrawer.tsx` — header + body shell + density resolver. Reads `prefs.animDrawerExpanded` + measured drawer height to pick density.
- `AnimationTimeline.tsx` — body track view (detail / dots), cell rendering, hold drag-edge, drop targets.
- `AnimationPreviewPip.tsx` — floating preview square inside the canvas + transport bar + corner cycling.
- `animationStore.ts` — atom-style store (active animation index, playhead frame, isPlaying, currentFps). Tied to a `requestAnimationFrame` tick loop.
- `dragKit.tsx` — `DragContext`, `useDragSource`, `useDragTarget`, `<DragLayer />`. Reused by RectOverlay (canvas-rect drag), Frames panel (icon drag), and AnimationTimeline (cell reorder).

### Modified

- `tools/vscode/webview/atlas/App.tsx` — adds `animations` to App state, mounts `<AnimationDrawer />` in the Atlas pane (peer of `<CanvasStage>`), mounts `<AnimationPreviewPip />` inside CanvasStage children, adds `⊞ all` icon to Frames panel folder headers and folder-selection visual treatment, adds "Add to anim" button to Frames panel header.
- `tools/vscode/webview/atlas/prefs.ts` — adds `animDrawerExpanded: boolean`, `animDrawerHeight: number`, `animPipCorner: 'tl' | 'tr' | 'br' | 'bl'`.
- `tools/preview/src/RectOverlay.tsx` — Alt+drag = "drag-as-frame" via `useDragSource('canvas-rect')`. Plain drag still = move.
- `tools/preview/src/index.ts` — exports the new components.

### Sidecar I/O

- Existing `validateAtlas` ajv pipeline already understands `meta.animations` — no changes to schema or validator.
- `App.handleSave` serializes `animations` alongside `rects` as today.

## Open items to shake out during build

- Exact pixel thresholds for density transitions (initial guesses: 80 / 24).
- Events UI beyond "right-click → add tag" — defer rich UI until we see real usage.
- Whether `animDrawerHeight` should be remembered per-animation or globally (start global; revisit if it bites).
- Whether the PIP should fade out on hover over the canvas in pan mode (probably yes; iterate).
- Drop-gap insertion indicator visual — settle during implementation.
