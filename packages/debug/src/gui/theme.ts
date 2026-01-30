const THEME_CSS = /* css */ `
.lil-gui.three-flatland-debug {
  /* Jehkoba32 palette — matches docs site */
  --background-color: #00021c;
  --widget-color: #1c284d;
  --hover-color: #343473;
  --focus-color: #1c284d;
  --text-color: #f0edd8;
  --title-background-color: #343473;
  --title-text-color: #47cca9;
  --number-color: #0bafe6;
  --string-color: #47cca9;
  --font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  --font-family-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  --font-size: 11px;
  --input-font-size: 11px;
  --padding: 4px;
  --spacing: 4px;
  --widget-height: 22px;
  --name-width: 42%;
  --slider-knob-width: 3px;
  --slider-input-width: 28%;
  --widget-border-radius: 0px;
  --checkbox-size: calc(0.76 * var(--widget-height));
  --scrollbar-width: 5px;

  border: 2px solid #343473;
  border-radius: 0;
  box-shadow: 3px 3px 0 #1c284d;
  margin-top: 4px;
}

/* Text selection — orange text, no background */
.lil-gui.three-flatland-debug ::selection {
  color: #f09c60;
  background: transparent;
}

/* Focused inputs — orange text */
.lil-gui.three-flatland-debug input[type=text]:focus,
.lil-gui.three-flatland-debug input[type=number]:focus {
  color: #f09c60;
}

/* Controller labels — muted retro-grey */
.lil-gui.three-flatland-debug .lil-controller > .lil-name {
  color: #8890a0;
}

/* Title bar */
.lil-gui.three-flatland-debug .title {
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-size: 10px;
}

/* Number inputs */
.lil-gui.three-flatland-debug .lil-controller.lil-number input[type=number] {
  color: var(--number-color);
}

/* String inputs */
.lil-gui.three-flatland-debug .lil-controller.lil-string input {
  color: var(--string-color);
}

/* Slider track — sharp edges */
.lil-gui.three-flatland-debug .lil-controller .lil-slider {
  border-radius: 0;
}

/* Slider fill — pink accent */
.lil-gui.three-flatland-debug .lil-controller .lil-fill {
  border-radius: 0;
  background-color: #d94c87;
}

/* Checkbox — pink checkmark */
.lil-gui.three-flatland-debug input[type=checkbox] {
  border-radius: 0;
}

.lil-gui.three-flatland-debug input[type=checkbox]:checked:before {
  color: #d94c87;
}

/* Button styling — green text, hover yellow */
.lil-gui.three-flatland-debug .lil-controller.lil-function button {
  color: #47cca9;
}

.lil-gui.three-flatland-debug .lil-controller.lil-function button:hover {
  color: #f7c93e;
}

/* Dropdown selects — value text matches number-color, arrows muted */
.lil-gui.three-flatland-debug .lil-option .lil-display {
  color: #0bafe6;
  border-radius: 0;
}

.lil-gui.three-flatland-debug .lil-option .lil-display.lil-focus,
.lil-gui.three-flatland-debug .lil-option .lil-display.lil-active {
  color: #f09c60;
}

.lil-gui.three-flatland-debug .lil-option .lil-display:after {
  color: #8890a0;
}

.lil-gui.three-flatland-debug .lil-option select {
  border-radius: 0;
}

.lil-gui.three-flatland-debug .lil-option option {
  background: #1c284d;
  color: #f0edd8;
}

/* Scrollbar */
.lil-gui.three-flatland-debug::-webkit-scrollbar-thumb {
  background: #732866;
  border-radius: 0;
}

/* Children panel border */
.lil-gui.three-flatland-debug .children {
  border-left: 2px solid #343473;
}
`

let styleEl: HTMLStyleElement | null = null
let refCount = 0

export function injectTheme(): void {
  refCount++
  if (styleEl) return
  styleEl = document.createElement('style')
  styleEl.textContent = THEME_CSS
  document.head.appendChild(styleEl)
}

export function removeTheme(): void {
  refCount--
  if (refCount <= 0 && styleEl) {
    styleEl.remove()
    styleEl = null
    refCount = 0
  }
}
