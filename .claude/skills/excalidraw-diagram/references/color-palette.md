# Color Palette & Brand Style — three-flatland

**This is the single source of truth for all colors and brand-specific styles.** three-flatland's docs are *technicolor on near-black*: a graphics library whose docs should themselves feel like a graphics demo. Diagrams are **dark-canvas, gem-accented, light-text** — they sit natively on the near-black docs surface and read like a lit figure.

The palette is the bearded-theme-inspired gem system. Color is **taxonomy, not decoration** — each gem carries meaning. Don't route every accent through one hue; assign gems to roles.

---

## Canvas

| Property | Value |
|----------|-------|
| Canvas background (`appState.viewBackgroundColor`) | `#111418` (near-black) |
| `appState.exportBackground` | `true` (bake the near-black so the figure is self-contained) |

Always set `viewBackgroundColor: "#111418"` in the `.excalidraw` `appState`. The diagram is a dark surface in both light and dark docs modes — consistent with the dark code blocks and the brand's near-black identity.

---

## Gem Accents (Semantic — pick by role, not by looks)

Bright gem = stroke / title / accent. Gem-soft = dark tinted container fill. Pair a bright gem stroke with its dark soft fill.

| Gem | Bright (stroke/text) | Soft fill (container) | Role |
|-----|----------------------|------------------------|------|
| amethyst | `#a85ff1` | `#1f1726` | **Primary accent** — main flow, headline nodes |
| diamond | `#11b7d4` | `#13202b` | Note/info, cool primary — data, buffers, inputs |
| emerald | `#00a884` | `#11201a` | Success/output — results, "consumes", GPU-side |
| gold | `#c7910c` | `#211c12` | Warning, foil moments — CPU-side, "produces" |
| ruby | `#c62f52` | `#241419` | Danger/key — hot path, eviction, critical |
| salmon | `#e35535` | `#241712` | Danger alt — secondary warm accent |
| pink | `#d46ec0` | `#221522` | Tip/special — TSL accessors, shader reads |
| turquoize | `#38c7bd` | `#122220` | Secondary cool — pre-passes, ambient steps |

**Rule**: bright gem stroke + matching dark soft fill. Use a different gem per logical group so color separates the stages at a glance.

---

## Neutrals & Containers

| Element | Value |
|---------|-------|
| Group / subgraph container fill | `#181d24` (elevated near-black) |
| Group container stroke | `#2b333d` (or a gem stroke to tag the group) |
| Neutral node fill | `#222a33` |
| Neutral node stroke | `#39434f` |

---

## Text Colors (Hierarchy)

| Level | Color | Use For |
|-------|-------|---------|
| Title / heading | gem bright (e.g. `#a85ff1`) | Group labels, major nodes |
| Body on dark fills | `#e6edf3` (near-white) | Text inside dark shapes/containers |
| Detail / annotation | `#9aa7b0` (muted slate) | Metadata, captions, secondary labels |
| Code / monospace | see Evidence below | Float offsets, field names, snippets |

Never use dark text — every surface is dark, so text is always near-white or a bright gem.

---

## Evidence Artifacts (code snippets, data, float layouts)

| Artifact | Background | Text Color |
|----------|-----------|------------|
| Code snippet | `#0d1117` | syntax-colored on near-white base `#e6edf3` |
| JSON / data example | `#0d1117` | `#7ee787` (green) for values |
| Buffer / float-offset cells | gem-soft fill + gem stroke | `#e6edf3` |

Syntax accents: keywords `#a85ff1` (amethyst), strings `#7ee787`, numbers `#11b7d4` (diamond), comments `#9aa7b0`.

---

## Arrows & Structural Lines

| Element | Color |
|---------|-------|
| Flow arrows | the source group's gem stroke (so flow is color-coded by stage) |
| Cross-stage / neutral arrows | `#9aa7b0` (muted slate) |
| Dividers, structural lines | `#39434f` |
| Marker dots | gem bright fill + same stroke |

---

## Don't

- Don't use a white/`#ffffff` canvas — the brand is near-black.
- Don't route everything through one gem (e.g. all-blue). Assign gems to stages so color does taxonomy work.
- Don't use light-mode-only fills (pale pastels) — they vanish on the dark canvas.
