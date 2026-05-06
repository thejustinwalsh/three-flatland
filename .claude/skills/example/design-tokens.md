# Design Tokens

Visual language for three-flatland example overlays.

## Colors

Tweakpane colors come from `FLATLAND_THEME` — don't redefine them. The tokens below are for **scene backgrounds** and **custom HTML overlays only** (attribution, batch-demo's tool palette).

| Token | Value | Usage |
|-------|-------|-------|
| Scene bg (dark) | `#00021c` | Template |
| Scene bg (dungeon) | `#0a0a12` | Tilemap |
| Scene bg (default) | `#1a1a2e` | Basic sprite, animation, tsl-nodes |
| Scene bg (sky) | `#87ceeb` | Batch demo |
| Custom panel bg | `rgba(0, 0, 0, 0.7)` | Custom tool palettes (batch-demo `#building-selector`) |
| Muted text | `#555` | Attribution, legend |
| Selected border | `#4a9eff` | Active building button |
| Custom btn bg | `rgba(255, 255, 255, 0.1)` | Building buttons |
| Custom btn hover | `rgba(255, 255, 255, 0.2)` | Building button hover |
| Custom btn border | `rgba(255, 255, 255, 0.15)` | Building button border |

## Tweakpane Theme

The pane is themed automatically by `createPane()` / `usePane()` via `FLATLAND_THEME` from `@three-flatland/devtools`. The theme uses retro-midnight backgrounds, retro-white text, and a pink accent (`#d94c87`) on slider thumbs and active buttons. Source: `packages/devtools/src/theme.ts`.

**Do not** override the pane's CSS variables in example code — the theme is applied per-instance and shared across all examples for consistency. If a setting needs adjustment, update `FLATLAND_THEME` in the package.

## CSS Reset

Keep the example HTML lean — no global `* { margin: 0; padding: 0; }` reset. Scope it to `body` only:

```css
body { margin: 0; }
```

The Tweakpane container is positioned absolutely (top-right by default) and floats above the canvas via `z-index: 1000` (set inside `createPane`). No other overlays are needed for typical examples.

## Overlay Layouts

Canvas fills viewport. The Tweakpane is positioned by the library (top-right by default, `z-index: 1000`) and contains the stats graph, renderer info, and all controls. Custom HTML overlays are the exception, not the rule.

### Standard (most examples)
```
┌─────────────────────────────────┐
│                       [Pane ▾] │  top-right (Tweakpane)
│           Canvas                │
│                                 │
│         [Attribution]           │  bottom: 8px center (optional)
└─────────────────────────────────┘
```

The pane covers controls + stats. No custom settings panel needed.

### With Custom Tool Palette (batch-demo)
```
┌─────────────────────────────────┐
│        [Hint]         [Pane ▾] │  top
│           Canvas                │
│           [Tools]               │  bottom: 32px center
│          [Credits]              │  bottom: 8px center
└─────────────────────────────────┘
```

batch-demo's `#building-selector` is a genuine custom interaction (click-to-place tool palette) — keep it as custom HTML. Anything that's a parameter slider, toggle, or color picker should live in the pane.

## CSS Patterns

> Stats and primary controls are inside the Tweakpane — don't reimplement them as custom HTML. The patterns below are for the **rare** case where you need a custom overlay (tool palettes, attribution, custom hint text).

### Attribution / Credits
```css
#attribution, #credits, #legend {
  position: fixed; bottom: 8px;
  left: 50%; transform: translateX(-50%);
  color: #555; font-size: 9px;
  font-family: monospace; white-space: nowrap;
  z-index: 100;
}
```

### Custom Tool Palette (bottom-center)
```css
#building-selector {
  position: fixed; bottom: 32px;
  left: 50%; transform: translateX(-50%);
  display: flex; gap: 6px; padding: 8px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 10px; z-index: 100;
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
| Tweakpane | monospace | inherits | themed via `FLATLAND_THEME` |
| Attribution | monospace | 9px | `#555` |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| Bottom tool palette | 32px | Custom tool overlays (e.g. batch-demo `#building-selector`) |
| Bottom attribution | 8px | Credits / legend offset |
| Panel radius | 6px | Custom panel corners |
| Internal gap | 6px | Flex container items |

## Layout Rules

1. **Tweakpane handles all sliders, toggles, color pickers, dropdowns, and stats** — don't build custom HTML for these
2. **Custom tool palettes bottom-center** at `bottom: 32px` — only for genuine non-parameter interactions (click-to-place, brush selection)
3. **Attribution bottom-center** at `bottom: 8px` — credits and legends below any custom palette
4. **Tweakpane is at `z-index: 1000`** (set by `createPane`); custom overlays sit at `z-index: 100`
