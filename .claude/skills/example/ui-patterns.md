# Web Awesome UI Patterns

Component code for React and vanilla. All components use `size="small"`.

## Radio Group

**`size="small"` must be on the parent `<wa-radio-group>`, not individual radios.**

React:
```tsx
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'

<WaRadioGroup label="Option" size="small" orientation="horizontal" value={value}
  onChange={(e: any) => setValue((e.target as any).value)}>
  <WaRadio value="a" size="small" appearance="button">A</WaRadio>
  <WaRadio value="b" size="small" appearance="button">B</WaRadio>
</WaRadioGroup>
```

Vanilla:
```html
<wa-radio-group label="Option" value="a" size="small" orientation="horizontal">
  <wa-radio value="a" size="small" appearance="button">A</wa-radio>
  <wa-radio value="b" size="small" appearance="button">B</wa-radio>
</wa-radio-group>
```
```ts
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js'
import '@awesome.me/webawesome/dist/components/radio/radio.js'

el.addEventListener('change', (e) => { const val = (e.target as any).value })
```

Hide label in game UI:
```css
.container wa-radio-group::part(form-control-label) { display: none; }
.container wa-radio-group::part(form-control) { margin: 0; border: 0; padding: 0; }
```

## Button Group (Multi-Toggle)

Toggle `variant` between `brand` (on) and `neutral` (off). Use `start` slot for state icon.

React:
```tsx
import WaButtonGroup from '@awesome.me/webawesome/dist/react/button-group/index.js'
import WaButton from '@awesome.me/webawesome/dist/react/button/index.js'

<WaButtonGroup>
  <WaButton size="small" variant={show ? 'brand' : 'neutral'} onClick={() => setShow(v => !v)}>
    <span slot="start">{show ? '\u2713' : '\u2715'}</span>
    Layer
  </WaButton>
</WaButtonGroup>
```

Vanilla:
```html
<wa-button-group>
  <wa-button id="toggle" size="small" variant="brand">
    <span slot="start">&#x2713;</span> Layer
  </wa-button>
</wa-button-group>
```
```ts
import '@awesome.me/webawesome/dist/components/button-group/button-group.js'
import '@awesome.me/webawesome/dist/components/button/button.js'

btn.addEventListener('click', () => {
  active = !active
  btn.variant = active ? 'brand' : 'neutral'
  btn.querySelector('[slot="start"]').textContent = active ? '\u2713' : '\u2715'
})
```

## Select

React:
```tsx
import WaSelect from '@awesome.me/webawesome/dist/react/select/index.js'
import WaOption from '@awesome.me/webawesome/dist/react/option/index.js'

<WaSelect value={val} size="small"
  onChange={(e: any) => setVal((e.target as any).value)}>
  <WaOption value="256">256</WaOption>
  <WaOption value="512">512</WaOption>
</WaSelect>
```

Vanilla:
```html
<wa-select id="my-select" value="512" size="small">
  <wa-option value="256">256</wa-option>
  <wa-option value="512">512</wa-option>
</wa-select>
```
```ts
import '@awesome.me/webawesome/dist/components/select/select.js'
import '@awesome.me/webawesome/dist/components/option/option.js'

el.addEventListener('change', (e) => { const val = (e.target as any).value })
```

## Input

React:
```tsx
import WaInput from '@awesome.me/webawesome/dist/react/input/index.js'

<WaInput type="number" value={String(val)} size="small" withoutSpinButtons
  onChange={(e: any) => setVal(Number(e.target.value))} />
```

Vanilla:
```html
<wa-input id="my-input" type="number" value="42" size="small" without-spin-buttons></wa-input>
```
```ts
import '@awesome.me/webawesome/dist/components/input/input.js'

el.addEventListener('change', () => { const val = Number(el.value) })
```

## Button

React:
```tsx
import WaButton from '@awesome.me/webawesome/dist/react/button/index.js'

<WaButton size="small" onClick={handleClick}>Label</WaButton>
```

Vanilla:
```html
<wa-button id="my-btn" size="small">Label</wa-button>
```
```ts
import '@awesome.me/webawesome/dist/components/button/button.js'

document.getElementById('my-btn')!.addEventListener('click', handleClick)
```

## Range Slider

React:
```tsx
import WaRange from '@awesome.me/webawesome/dist/react/range/index.js'

<WaRange label="Speed" min={0.1} max={3} step={0.1} value={speed}
  onChange={(e: any) => setSpeed(parseFloat((e.target as any).value))} />
```

Vanilla:
```html
<wa-range label="Speed" min="0.1" max="3" step="0.1" value="1"></wa-range>
```
```ts
import '@awesome.me/webawesome/dist/components/range/range.js'

el.addEventListener('change', (e) => { const val = parseFloat((e.target as any).value) })
```

## Per-Line Pill Rounding (Wrapping Groups)

When `wa-radio-group` or `wa-button-group` wraps to multiple lines, the built-in first/last rounding is based on DOM order, not visual lines. We detect visual line breaks with JS and apply `data-line-pos` attributes, then override border-radius in CSS.

**Key difference:** `wa-radio` border-radius is on the **host element**. `wa-button` border-radius is on **`::part(base)`**.

### CSS (in index.html)

All examples include this in `<style>`. The template has the full set.

```css
/* ── Radio group wrapping ── */
wa-radio-group::part(form-control-input) {
  row-gap: 4px;
  justify-content: center;
}
wa-radio[data-line-pos="first"] {
  border-start-start-radius: var(--wa-border-radius-m);
  border-end-start-radius: var(--wa-border-radius-m);
  border-start-end-radius: 0;
  border-end-end-radius: 0;
}
wa-radio[data-line-pos="inner"] { border-radius: 0; }
wa-radio[data-line-pos="last"] {
  border-start-end-radius: var(--wa-border-radius-m);
  border-end-end-radius: var(--wa-border-radius-m);
  border-start-start-radius: 0;
  border-end-start-radius: 0;
}
wa-radio[data-line-pos="solo"] { border-radius: var(--wa-border-radius-m); }

/* ── Button group wrapping ── */
wa-button-group::part(base) {
  justify-content: center;
  row-gap: 4px;
}
wa-button::part(base) {
  border-color: var(--wa-color-neutral-border-loud);
}
wa-button + wa-button {
  margin-inline-start: -2px;
}
wa-button[data-line-pos="first"]::part(base) {
  border-start-start-radius: var(--wa-border-radius-m);
  border-end-start-radius: var(--wa-border-radius-m);
  border-start-end-radius: 0;
  border-end-end-radius: 0;
}
wa-button[data-line-pos="inner"]::part(base) { border-radius: 0; }
wa-button[data-line-pos="last"]::part(base) {
  border-start-end-radius: var(--wa-border-radius-m);
  border-end-end-radius: var(--wa-border-radius-m);
  border-start-start-radius: 0;
  border-end-start-radius: 0;
}
wa-button[data-line-pos="solo"]::part(base) { border-radius: var(--wa-border-radius-m); }
```

### JS — Vanilla (`setupWrappingGroup` utility)

```ts
/** Re-apply per-line first/last pill rounding when a flex container wraps */
function setupWrappingGroup(container: Element, childSelector: string) {
  const update = () => {
    const children = [...container.querySelectorAll(childSelector)]
    if (!children.length) return
    const lines: Element[][] = []
    let lastTop = -Infinity
    let line: Element[] = []
    for (const child of children) {
      const top = child.getBoundingClientRect().top
      if (Math.abs(top - lastTop) > 2) {
        if (line.length) lines.push(line)
        line = []
        lastTop = top
      }
      line.push(child)
    }
    if (line.length) lines.push(line)
    for (const ln of lines) {
      for (let i = 0; i < ln.length; i++) {
        const pos =
          ln.length === 1 ? 'solo' :
          i === 0 ? 'first' :
          i === ln.length - 1 ? 'last' : 'inner'
        ln[i]!.setAttribute('data-line-pos', pos)
      }
    }
  }
  const ro = new ResizeObserver(update)
  ro.observe(container)
  update()
  return () => ro.disconnect()
}

// Usage:
setupWrappingGroup(radioGroup, 'wa-radio')
setupWrappingGroup(buttonGroup, 'wa-button')
```

### JS — React (useEffect)

```tsx
useEffect(() => {
  const group = containerRef.current?.querySelector('wa-radio-group')
  if (!group) return
  const update = () => {
    const radios = [...group.querySelectorAll('wa-radio')]
    if (!radios.length) return
    const lines: Element[][] = []
    let lastTop = -Infinity
    let line: Element[] = []
    for (const radio of radios) {
      const top = radio.getBoundingClientRect().top
      if (Math.abs(top - lastTop) > 2) {
        if (line.length) lines.push(line)
        line = []
        lastTop = top
      }
      line.push(radio)
    }
    if (line.length) lines.push(line)
    for (const ln of lines) {
      for (let i = 0; i < ln.length; i++) {
        const pos =
          ln.length === 1 ? 'solo' :
          i === 0 ? 'first' :
          i === ln.length - 1 ? 'last' : 'inner'
        ln[i]!.setAttribute('data-line-pos', pos)
      }
    }
  }
  const ro = new ResizeObserver(update)
  ro.observe(group)
  update()
  return () => ro.disconnect()
}, [])
```

### Container requirements

- `max-width: calc(100vw - 24px)` on the outer container to allow wrapping on small viewports
- `row-gap: 4px; justify-content: center` on the group's flex container part

## Quick Reference

| Need | Component | React | Vanilla |
|------|-----------|-------|---------|
| Toggle group | `wa-radio-group` + `wa-radio` | `WaRadioGroup` + `WaRadio` | `radio-group.js` + `radio.js` |
| Multi-toggle | `wa-button-group` + `wa-button` | `WaButtonGroup` + `WaButton` | `button-group.js` + `button.js` |
| Dropdown | `wa-select` + `wa-option` | `WaSelect` + `WaOption` | `select.js` + `option.js` |
| Text/number input | `wa-input` | `WaInput` | `input.js` |
| Action button | `wa-button` | `WaButton` | `button.js` |
| Slider | `wa-range` | `WaRange` | `range.js` |

**Events**: `change` (vanilla) / `onChange` (React). Value: `(e.target as any).value`.
