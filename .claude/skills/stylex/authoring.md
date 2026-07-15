# StyleX — Authoring Reference

Full authoring detail. The Do/Don't summary lives in [SKILL.md](./SKILL.md) — open this file when you need the long-tail (relational selectors, view transitions, anchor positioning, type helpers, every example).

---

## Writing styles

```tsx
import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  container: { display: 'flex', alignItems: 'center', padding: 16 },
  title:     { fontSize: 24, fontWeight: 'bold', color: 'navy' },
})
```

- Use longhand and single-value shorthands over multi-value shorthands.
- `null` unsets a property.
- Numbers default to pixels.

---

## Applying styles

```tsx
function Component() {
  return (
    <div {...stylex.props(styles.container)}>
      <h1 {...stylex.props(styles.title)}>Hello</h1>
    </div>
  )
}
```

### Merging — last wins

```tsx
<div {...stylex.props(styles.base, styles.highlighted)} />
<div {...stylex.props([styles.base, styles.highlighted])} />
```

### Conditional

```tsx
<div
  {...stylex.props(
    styles.base,
    isActive && styles.active,
    isDisabled && styles.disabled,
    variant === 'primary' ? styles.primary : styles.secondary,
  )}
/>
```

### Accepting styles from parent (local first)

```tsx
import type { StyleXStyles } from '@stylexjs/stylex'

type Props = { children: React.ReactNode; style?: StyleXStyles }

const styles = stylex.create({ card: { padding: 16, borderRadius: 8 } })

function Card({ children, style }: Props) {
  return <div {...stylex.props(styles.card, style)}>{children}</div>
}
```

### Unsetting

```tsx
const styles = stylex.create({
  base:  { margin: 16, padding: 16 },
  reset: { margin: null, padding: null },
})
<div {...stylex.props(styles.base, styles.reset)} />
```

---

## Pseudo-classes (nest in property value)

```tsx
const styles = stylex.create({
  button: {
    backgroundColor: {
      default: 'lightblue',
      ':hover': 'blue',
      ':active': 'darkblue',
      ':focus-visible': 'royalblue',
      ':disabled': 'gray',
    },
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
  },
})
```

Recommended: `:hover`, `:active`, `:focus`, `:focus-visible`, `:focus-within`.

**Avoid `:first-child` / `:nth-child`** — branch in JS instead.

---

## Pseudo-elements (top-level keys)

```tsx
const styles = stylex.create({
  input: {
    color: 'black',
    '::placeholder': { color: 'gray', fontStyle: 'italic' },
    '::selection':   { backgroundColor: 'yellow' },
  },
})
```

**Avoid `::before` / `::after` for content** — render a real element.

---

## Media queries and @-rules

Nest inside the property value with a required `default`:

```tsx
const styles = stylex.create({
  container: {
    flexDirection: { default: 'column', '@media (min-width: 768px)': 'row' },
    padding: {
      default: 8,
      '@media (min-width: 768px)':  16,
      '@media (min-width: 1024px)': 24,
    },
  },
})
```

`@supports` and `@container` work the same way. Use `null` if there should be no default value.

For app-wide breakpoints, hoist to `defineConsts`.

---

## Dynamic styles

Arrow-function namespaces accept runtime values:

```tsx
const styles = stylex.create({
  bar:        (width: number)      => ({ width }),
  positioned: (x: number, y: number) => ({ transform: `translate(${x}px, ${y}px)` }),
})

<div {...stylex.props(styles.bar(100))} />
<div {...stylex.props(styles.positioned(mouseX, mouseY))} />
```

---

## Constants — `defineConsts`

For non-themable static values (breakpoints, z-indices, durations).

```ts
// constants.stylex.ts
import * as stylex from '@stylexjs/stylex'

export const breakpoints = stylex.defineConsts({
  small:  '@media (max-width: 600px)',
  medium: '@media (min-width: 601px) and (max-width: 1024px)',
  large:  '@media (min-width: 1025px)',
})

export const zIndices = stylex.defineConsts({
  modal:   '1000',
  tooltip: '1100',
  toast:   '1200',
})
```

---

## Variables — `defineVars`

For themable tokens. Must live in `*.stylex.ts` files; named exports only; nothing else exported.

```ts
// tokens.stylex.ts
import * as stylex from '@stylexjs/stylex'

export const colors = stylex.defineVars({
  primary:    'blue',
  secondary:  'gray',
  text:       'black',
  background: 'white',
})

export const spacing = stylex.defineVars({
  small:  '8px',
  medium: '16px',
  large:  '24px',
})
```

---

## Using variables and constants

```tsx
import * as stylex from '@stylexjs/stylex'
import { colors, spacing } from './tokens.stylex'

const styles = stylex.create({
  container: {
    backgroundColor: colors.background,
    color:           colors.text,
    padding:         spacing.medium,
  },
})
```

---

## Themes — `createTheme`

Override variable values for a DOM subtree. `createTheme` can live in any file (not just `.stylex.ts`).

```tsx
import * as stylex from '@stylexjs/stylex'
import { colors } from './tokens.stylex'

export const darkTheme = stylex.createTheme(colors, {
  primary:    'lightblue',
  text:       'white',
  background: '#1a1a1a',
})

function App({ isDark, children }) {
  return (
    <div {...stylex.props(isDark && darkTheme)}>
      {children}
    </div>
  )
}
```

---

## Relational selectors

Style based on ancestor / descendant / sibling state via `stylex.when.*` plus a marker on the observed element.

Selectors: `stylex.when.ancestor()`, `stylex.when.descendant()`, `stylex.when.anySibling()`, `stylex.when.siblingBefore()`, `stylex.when.siblingAfter()`.

Markers: `stylex.defaultMarker()` or custom via `stylex.defineMarker()`.

```tsx
const styles = stylex.create({
  card: {
    transform: {
      default: 'translateX(0)',
      [stylex.when.ancestor(':hover')]: 'translateX(10px)',
    },
  },
})

<div {...stylex.props(stylex.defaultMarker())}>
  <div {...stylex.props(styles.card)}>Hover the parent to move me</div>
</div>
```

---

## Fallback values — `firstThatWorks`

```tsx
const styles = stylex.create({
  header: {
    position: stylex.firstThatWorks('sticky', '-webkit-sticky', 'fixed'),
    display:  stylex.firstThatWorks('grid', 'flex'),
  },
})
```

---

## Keyframes

```tsx
const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

const slideIn = stylex.keyframes({
  '0%':   { transform: 'translateX(-100%)' },
  '100%': { transform: 'translateX(0)' },
})

const styles = stylex.create({
  animated: {
    animationName:           fadeIn,
    animationDuration:       '0.3s',
    animationTimingFunction: 'ease-out',
  },
})
```

---

## View transitions

```tsx
import * as stylex from '@stylexjs/stylex'
import { unstable_ViewTransition as ViewTransition } from 'react'

const fadeInUp = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(-30px)' },
  to:   { opacity: 1, transform: 'translateY(0)' },
})

const transitionClass = stylex.viewTransitionClass({
  group:     { /* ::view-transition-group styles */ },
  imagePair: { /* ::view-transition-image-pair styles */ },
  old:       { animationDuration: '2s' },
  new:       { animationName: fadeInUp },
})

<ViewTransition default={transitionClass}>{/* ... */}</ViewTransition>
```

---

## Anchor positioning — `positionTry`

```tsx
const fallback = stylex.positionTry({
  positionAnchor: '--anchor',
  top:    '0',
  left:   '0',
  width:  '100px',
  height: '100px',
})

const styles = stylex.create({
  tooltip: { positionTryFallbacks: fallback },
})
```

---

## TypeScript helpers

Prefer `StyleXStyles` / `StyleXStylesWithout` over the deprecated `StaticStyles*`.

### `StyleXStyles`

```tsx
import type { StyleXStyles } from '@stylexjs/stylex'
type Props = { style?: StyleXStyles }

// constrained
type Props2 = { style?: StyleXStyles<{ color?: string; backgroundColor?: string }> }
```

### `StyleXStylesWithout`

```tsx
import type { StyleXStylesWithout } from '@stylexjs/stylex'

type Props = {
  style?: StyleXStylesWithout<{
    margin: unknown
    padding: unknown
    width: unknown
    height: unknown
  }>
}
```

### `VarGroup`

```tsx
import type { VarGroup } from '@stylexjs/stylex'
import { colors } from './tokens.stylex'

function ThemeProvider({ theme, children }: {
  theme: VarGroup<typeof colors>
  children: React.ReactNode
}) {
  return <div {...stylex.props(theme)}>{children}</div>
}
```

---

## Antipatterns (recap from SKILL.md)

### Don't import non-StyleX values into `stylex.create`

```tsx
// BAD
import { PADDING } from './constants'
const styles = stylex.create({ container: { padding: PADDING } })

// GOOD
import { spacing } from './tokens.stylex'
const styles = stylex.create({ container: { padding: spacing.medium } })
```

### Don't combine `style` / `className` with `stylex.props`

```tsx
// BAD
<div className="m-10" style={style} {...stylex.props(styles.container)} />
// GOOD
<div {...stylex.props(styles.container)} />
```

### Don't put media queries / pseudo-classes at the top level

```tsx
// BAD
stylex.create({ container: { '@media (min-width: 768px)': { padding: 16 } } })
stylex.create({ button:    { ':hover': { backgroundColor: 'blue' } } })

// GOOD
stylex.create({
  container: { padding: { default: 8, '@media (min-width: 768px)': 16 } },
  button:    { backgroundColor: { default: 'lightblue', ':hover': 'blue' } },
})
```

---

## Resources

- Docs: https://stylexjs.com
- API: https://stylexjs.com/docs/api
- GitHub: https://github.com/facebook/stylex
