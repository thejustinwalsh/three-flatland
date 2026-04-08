/** Flatland retro theme — Jehkoba32 palette with pixel aesthetic */
export const FLATLAND_THEME: Record<string, string> = {
  '--tp-base-background-color': '#0a0e1a',
  '--tp-base-border-radius': '0px',
  '--tp-base-shadow-color': 'rgba(0, 2, 28, 0.4)',
  '--tp-base-font-family': 'monospace',
  '--tp-blade-border-radius': '0px',
  '--tp-blade-horizontal-padding': '4px',
  '--tp-button-background-color': '#1c284d',
  '--tp-button-background-color-active': '#47cca9',
  '--tp-button-background-color-focus': '#2a3a6b',
  '--tp-button-background-color-hover': '#253560',
  '--tp-button-foreground-color': '#f0edd8',
  '--tp-container-background-color': 'rgba(28, 40, 77, 0.6)',
  '--tp-container-background-color-active': 'rgba(71, 204, 169, 0.15)',
  '--tp-container-background-color-focus': 'rgba(28, 40, 77, 0.8)',
  '--tp-container-background-color-hover': 'rgba(28, 40, 77, 0.8)',
  '--tp-container-foreground-color': '#f0edd8',
  '--tp-groove-foreground-color': '#47cca9',
  '--tp-input-background-color': 'rgba(0, 2, 28, 0.8)',
  '--tp-input-background-color-active': 'rgba(71, 204, 169, 0.2)',
  '--tp-input-background-color-focus': 'rgba(0, 2, 28, 0.9)',
  '--tp-input-background-color-hover': 'rgba(0, 2, 28, 0.9)',
  '--tp-input-foreground-color': '#47cca9',
  '--tp-label-foreground-color': '#8890a0',
  '--tp-monitor-background-color': 'rgba(0, 2, 28, 0.6)',
  '--tp-monitor-foreground-color': '#f7c93e',
}

export function applyTheme(
  element: HTMLElement,
  theme: Record<string, string> = FLATLAND_THEME,
): void {
  for (const [key, value] of Object.entries(theme)) {
    element.style.setProperty(key, value)
  }
}
