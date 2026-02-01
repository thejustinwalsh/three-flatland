# Design Tokens

Visual language for three-flatland example overlays.

## Colors

| Token | Value | Usage |
|-------|-------|-------|
| Panel bg | `rgba(0, 2, 28, 0.7)` | Settings, stats, controls |
| Panel bg (solid) | `rgba(0, 2, 28, 0.85)` | Template UI panel |
| Panel bg (light scene) | `rgba(0, 0, 0, 0.7)` | Batch demo overlays |
| Scene bg (dark) | `#00021c` | Template |
| Scene bg (dungeon) | `#0a0a12` | Tilemap |
| Scene bg (default) | `#1a1a2e` | Basic sprite, animation, tsl-nodes |
| Scene bg (sky) | `#87ceeb` | Batch demo |
| Info text | `#4a9eff` | Stats readout |
| Label text | `#8890a0` | Panel labels |
| Muted text | `#555` | Attribution, legend |
| Input text | `#ccc` | Inputs, custom buttons |
| Selected border | `#4a9eff` | Active building button |
| Custom btn bg | `rgba(255, 255, 255, 0.1)` | Building buttons |
| Custom btn hover | `rgba(255, 255, 255, 0.2)` | Building button hover |
| Custom btn border | `rgba(255, 255, 255, 0.15)` | Building button border |

## Web Awesome Theme Overrides

Set globally on `:root.wa-dark` to shrink components and match the palette:

```css
:root.wa-dark {
  --wa-font-size-scale: 0.85;
  --wa-form-control-padding-block: 0.5em;
  --wa-form-control-padding-inline: 0.75em;
  --wa-form-control-toggle-size: round(1em, 1px);
  --wa-color-surface-default: rgb(0, 2, 28);
  --wa-color-surface-raised: rgb(28, 40, 77);
  --wa-color-surface-lowered: rgb(0, 2, 28);
  --wa-color-brand-fill-loud: #0b8be6;
  --wa-color-brand-fill-quiet: var(--wa-color-brand-fill-loud);
  --wa-color-brand-on-quiet: var(--wa-color-brand-on-loud);
  --wa-color-neutral-fill-loud: var(--wa-color-surface-raised);
  --wa-color-neutral-on-loud: var(--wa-color-text-normal);
  --wa-color-text-normal: #f0edd8;
  --wa-color-text-quiet: #8890a0;
  --wa-border-radius-m: 6px;
}
```

This is defined once in each `index.html` `<style>` block. No per-panel overrides needed.

## CSS Reset

**Do NOT use `* { margin: 0; padding: 0; }`.** Both `margin: 0` and `padding: 0` on `*` override Web Awesome component internals and break theme customization. Instead, scope the reset to `body`:

```css
body {
  margin: 0;
}
```

## Overlay Layouts

All overlays: `position: fixed; z-index: 100`. Canvas fills viewport.

### Minimal (basic-sprite, template)
```
┌─────────────────────────────────┐
│                        [Stats]  │  top-right
│           Canvas                │
│                          [UI]   │  bottom-right
└─────────────────────────────────┘
```

### Simple (animation, tsl-nodes)
```
┌─────────────────────────────────┐
│                        [Stats]  │  top-right
│           Canvas                │
│         [Controls]              │  bottom: 32px center
│        [Attribution]            │  bottom: 8px center
└─────────────────────────────────┘
```

### Builder (batch-demo)
```
┌─────────────────────────────────┐
│        [Hint]          [Stats]  │  top
│           Canvas                │
│           [Tools]               │  bottom: 32px center
│          [Credits]              │  bottom: 8px center
└─────────────────────────────────┘
```

### Complex (tilemap)
```
┌─────────────────────────────────┐
│  [☰] [Settings]        [Stats] │  top
│  │ Map Size       Chunks       │
│  │ [SM][MD][LG][XL]  [512▼]   │
│  │ Density                     │
│  │ [Sparse][Normal][Dense][Pk] │
│  │ Seed                        │
│  │ [______] [↻]                │
│           Canvas                │
│  [✓ Ground ✓ Walls ✓ Decor]   │  bottom: 32px center
│          [Legend]               │  bottom: 8px center
└─────────────────────────────────┘
```

Settings panel collapses to ☰ on mobile (≤480px).

## CSS Patterns

### Stats Badge
```css
#stats {
  position: fixed; top: 12px; right: 12px;
  padding: 5px 10px; background: rgba(0, 2, 28, 0.7);
  border-radius: 6px; font-family: monospace;
  color: #4a9eff; font-size: 10px;
  line-height: 1.5; z-index: 100;
}
```

### Controls (bottom-center)
```css
#controls {
  position: fixed; bottom: 32px;
  left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px;
  z-index: 100;
}
```

### Attribution
```css
#attribution, #credits, #legend {
  position: fixed; bottom: 8px;
  left: 50%; transform: translateX(-50%);
  color: #555; font-size: 9px;
  font-family: monospace; white-space: nowrap;
  z-index: 100;
}
```

### Settings Panel
```css
#settings {
  position: fixed; top: 12px; left: 12px;
  z-index: 100; display: flex;
  flex-direction: column; gap: 6px;
  padding: 8px 10px;
  background: rgba(0, 2, 28, 0.7);
  border-radius: 6px;
}

#settings wa-radio-group::part(form-control-label) {
  font-size: 11px; color: #8890a0; font-family: monospace;
}

.setting-label {
  font-size: 11px; color: #8890a0;
  font-family: monospace; margin-bottom: 2px;
}
```

### Mobile Collapse
```css
#settings-toggle {
  display: none;
  position: fixed; top: 12px; left: 12px; z-index: 101;
  width: 28px; height: 28px;
  background: rgba(0, 2, 28, 0.7);
  border: none; border-radius: 6px;
  color: #8890a0; font-size: 16px; cursor: pointer;
  align-items: center; justify-content: center;
}

@media (max-width: 480px) {
  #settings-toggle { display: flex; }
  #settings { display: none; }
  #settings.open { display: flex; top: 48px; }
}
```

### Building Buttons (batch-demo)
```css
.building-btn {
  width: 40px; height: 40px;
  border: 2px solid transparent; border-radius: 6px;
  background-color: rgba(255, 255, 255, 0.1);
  cursor: pointer; transition: all 0.15s ease;
}
.building-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}
.building-btn.selected {
  border-color: #4a9eff;
  background-color: rgba(74, 158, 255, 0.2);
}
```

## Typography

| Element | Font | Size | Color |
|---------|------|------|-------|
| Stats | monospace | 10px | `#4a9eff` |
| Panel labels | monospace | 11px | `#8890a0` |
| Attribution | monospace | 9px | `#555` |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| Edge inset | 12px | Viewport edge to overlay |
| Bottom controls | 32px | Primary controls offset |
| Bottom attribution | 8px | Credits/legend offset |
| Panel padding | 8px 10px | Settings panels |
| Panel radius | 6px | Standard panels |
| Internal gap | 6px | Flex container items |

## Layout Rules

1. **Controls bottom-center** at `bottom: 32px` — radio groups, tool palettes, building buttons
2. **Attribution bottom-center** at `bottom: 8px` — directly below controls
3. **Stats top-right** at `top: 12px; right: 12px`
4. **Settings top-left** at `top: 12px; left: 12px` — collapses to ☰ on mobile
5. **Labels above controls** — never inline. `::part(form-control-label)` for Web Awesome, `.setting-label` for custom
6. **Consistent label style**: monospace, 11px, `#8890a0`
