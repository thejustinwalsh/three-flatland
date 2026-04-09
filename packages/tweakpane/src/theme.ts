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
