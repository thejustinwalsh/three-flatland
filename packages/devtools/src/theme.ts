/**
 * Flatland theme — based on the Jehkoba32 retro palette.
 *
 * Uses project dark/neutral colors for backgrounds, retro-white/grey for text,
 * and accent color only on control thumbs and slider grooves.
 */
export const FLATLAND_THEME: Record<string, string> = {
  // Backgrounds — retro darks
  '--tp-base-background-color': '#00021c', // retro-midnight
  '--tp-container-background-color': 'rgba(28, 40, 77, 0.4)', // retro-deep-purple @ 40%
  '--tp-input-background-color': 'rgba(0, 2, 28, 0.6)', // retro-black @ 60%
  '--tp-monitor-background-color': 'rgba(0, 2, 28, 0.4)', // retro-black @ 40%

  // Text — retro whites and greys
  '--tp-container-foreground-color': '#f0edd8', // retro-white
  '--tp-button-foreground-color': '#f0edd8', // retro-white
  '--tp-input-foreground-color': '#c8c5b4', // muted retro-white
  '--tp-label-foreground-color': 'rgba(240, 237, 216, 0.55)', // retro-white @ 55%
  '--tp-monitor-foreground-color': '#c8c5b4', // muted retro-white

  // Buttons — retro-deep-purple
  '--tp-button-background-color': '#1c284d', // retro-deep-purple

  // Accent — slider grooves & separators
  '--tp-groove-foreground-color': 'rgba(240, 237, 216, 0.12)', // muted separator/groove

  // Typography
  '--tp-base-font-family': 'monospace',
}

/** Accent CSS — colorizes slider thumb and number spinner drag handle */
const ACCENT_CSS = `
/* Slider thumb */
.tp-sldv_k::after { background-color: #d94c87 !important; }
.tp-sldv_t:hover .tp-sldv_k::after { background-color: #e0609a !important; }
.tp-sldv_t:active .tp-sldv_k::after { background-color: #a6216e !important; }
/* Slider track (filled portion) */
.tp-sldv_k::before { background-color: rgba(240, 237, 216, 0.25) !important; }
/* Number spinner drag handle */
.tp-txtv_k::before { background-color: #d94c87 !important; }
/* Select/dropdown */
.tp-lstv_s { background-color: rgba(28, 40, 77, 0.6) !important; color: rgba(240, 237, 216, 0.5) !important; }
.tp-lstv_s:hover { background-color: rgba(28, 40, 77, 0.9) !important; color: #f0edd8 !important; }
.tp-lstv_s:focus { background-color: rgba(28, 40, 77, 0.9) !important; color: #f0edd8 !important; }
.tp-lstv_s:active { background-color: #343473 !important; color: #d94c87 !important; }
.tp-lstv_m { color: rgba(240, 237, 216, 0.5) !important; }
/* Buttons */
.tp-btnv_b { background-color: rgba(28, 40, 77, 0.6) !important; color: rgba(240, 237, 216, 0.5) !important; }
.tp-btnv_b:hover { background-color: rgba(28, 40, 77, 0.9) !important; color: #f0edd8 !important; }
.tp-btnv_b:active { background-color: #343473 !important; color: #d94c87 !important; }
/* Radio grid buttons */
.tp-radv_b { background-color: rgba(28, 40, 77, 0.6) !important; color: rgba(240, 237, 216, 0.5) !important; }
.tp-radv_i:hover + .tp-radv_b { background-color: rgba(28, 40, 77, 0.9) !important; color: #f0edd8 !important; }
.tp-radv_i:checked + .tp-radv_b { background-color: #1c284d !important; color: #d94c87 !important; }
.tp-radv_i:active + .tp-radv_b { background-color: #343473 !important; color: #f0edd8 !important; }

/* Dimmable pane — slightly translucent when idle, opaque on hover or when pinned.
   Hover-promotion is gated on devices that actually have a pointer (desktop),
   so on touch devices the pin toggle is the only way to flip opacity. */
.tp-flatland-dimmable { opacity: 0.8; transition: opacity 750ms ease; }
.tp-flatland-dimmable.tp-flatland-pinned { opacity: 1; }
@media (hover: hover) {
  .tp-flatland-dimmable:hover { opacity: 1; }
}

/* Pin in the pane header (left side, mirrors the collapse caret on the right) */
.tp-flatland-pin {
  position: absolute;
  left: var(--cnt-hp, 4px);
  top: 0;
  bottom: 0;
  margin: auto;
  width: var(--cnt-usz, 20px);
  height: var(--cnt-usz, 20px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(240, 237, 216, 0.45);
  cursor: pointer;
  border-radius: 2px;
  transition: color 150ms, background-color 150ms;
}
.tp-flatland-pin:hover { color: #d94c87; background: transparent; }
.tp-flatland-pin svg { display: block; }
.tp-flatland-pin svg circle { fill: none; stroke: currentColor; stroke-width: 1.6; }
.tp-flatland-pinned .tp-flatland-pin svg circle { fill: currentColor; }

/*
 * Three-mode cycle toggle in the header (replaces Tweakpane's built-in
 * fold caret). We hide the native caret via the .tp-rotv_m marker
 * class and render our own button that cycles full - minimal -
 * collapsed - full. The data-mode attribute drives icon styling.
 */
.tp-rotv_m { display: none !important; }
.tp-flatland-mode {
  position: absolute;
  right: var(--cnt-hp, 4px);
  top: 0;
  bottom: 0;
  margin: auto;
  min-width: var(--cnt-usz, 20px);
  height: var(--cnt-usz, 20px);
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Match the original tweakpane fold caret and folder-header glyphs —
   * the muted foreground token pane headers use throughout. */
  color: var(--tp-label-foreground-color);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  user-select: none;
}
/*
 * Glyph exactly replicates tweakpane's native fold marker — a 6×6
 * square with a horizontal linear-gradient that draws two vertical
 * stripes (screw-head look). Rotating gives the three states:
 *   full     → 0°   (vertical stripes, ||) — matches tweakpane's expanded
 *   minimal  → 45°  (diagonal, like a flat-head screw)
 *   collapsed → 90° (horizontal stripes, =) — matches tweakpane's collapsed
 */
.tp-flatland-mode-glyph {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: linear-gradient(
    to left,
    var(--cnt-fg, currentColor),
    var(--cnt-fg, currentColor) 2px,
    transparent 2px,
    transparent 4px,
    var(--cnt-fg, currentColor) 4px
  );
  opacity: 0.5;
  /* 0.2s ease-in-out — the exact transition tweakpane applies to its
   * own fold marker. */
  transition: transform 0.2s ease-in-out;
}
.tp-flatland-mode[data-mode="full"] .tp-flatland-mode-glyph { transform: rotate(0deg); }
.tp-flatland-mode[data-mode="minimal"] .tp-flatland-mode-glyph { transform: rotate(45deg); }
.tp-flatland-mode[data-mode="collapsed"] .tp-flatland-mode-glyph { transform: rotate(90deg); }

/*
 * Minimal mode: keep only blades tagged with .tp-flatland-minimal-keep
 * (stats graph + stats row). Non-keep blades animate max-height to 0
 * and fade out so the whole pane visibly shrinks, matching tweakpane
 * native fold feel. Values and bindings stay intact — DOM is just
 * clipped.
 *
 * max-height uses a generous ceiling instead of a measured value so we
 * can stay declarative; the transition duration matches the native
 * pane fold for continuity.
 */
/*
 * Animation timings + easings mirror tweakpane's own fold exactly:
 *   .tp-rotv_c / .tp-fldv_c use
 *     height .2s ease-in-out, opacity .2s linear, padding .2s ease-in-out
 *   and on expand, opacity has a 0.2s delay so height finishes first
 *   then opacity fades in. The collapse direction has no delay — both
 *   animate together.
 *
 * We use max-height in place of height because content height isn't
 * known at author time; with a generous ceiling the visual is
 * indistinguishable from native height tweens.
 */
.tp-rotv_c > *:not(.tp-flatland-minimal-keep) {
  max-height: 1200px;
  opacity: 1;
  overflow: hidden;
  transition:
    max-height 0.2s ease-in-out,
    opacity 0.2s linear 0.2s,
    margin 0.2s ease-in-out,
    padding 0.2s ease-in-out;
}
.tp-flatland-minimal .tp-rotv_c > *:not(.tp-flatland-minimal-keep) {
  max-height: 0;
  opacity: 0;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  pointer-events: none;
  /* On collapse: no delay on opacity — both animate together,
   * matching tweakpane's non-expanded transition shape. */
  transition:
    max-height 0.2s ease-in-out,
    opacity 0.2s linear,
    margin 0.2s ease-in-out,
    padding 0.2s ease-in-out;
}
`

export function applyTheme(
  element: HTMLElement,
  theme: Record<string, string> = FLATLAND_THEME,
): void {
  for (const [key, value] of Object.entries(theme)) {
    element.style.setProperty(key, value)
  }

  // Inject accent styles once
  if (!element.querySelector('style[data-flatland]')) {
    const style = document.createElement('style')
    style.setAttribute('data-flatland', '')
    style.textContent = ACCENT_CSS
    element.appendChild(style)
  }
}
