# /example — Create a New Example

Creates a new three-flatland example with both vanilla and React variants.

## Philosophy

- Examples are **self-contained** and **copy-paste-able** — real npm version strings, not `workspace:*` or `catalog:`
- Always create **both** vanilla AND React variants simultaneously
- Root `pnpm.overrides` maps `@three-flatland/*` to workspace packages during development
- Run `pnpm syncpack:examples` after catalog version changes to keep examples in sync

## Checklist

1. Create `examples/vanilla/{name}/` and `examples/react/{name}/`
2. Copy from the template examples — update `name` in package.json
3. Add dependencies with real version strings
4. Modify the main source file (`main.ts` / `App.tsx`)
5. Register both in `microfrontends.json` (next port after 4012)
6. Run `pnpm install` then `pnpm syncpack:examples`
7. Test with `pnpm --filter=example-{type}-{name} dev`

## Project Structure

```
examples/
├── react/{name}/
│   ├── package.json         # Real npm versions
│   ├── vite.config.ts       # base: '/react/{name}/'
│   ├── tsconfig.json        # Self-contained, no extends
│   ├── index.html           # wa-dark, #root div
│   ├── main.tsx             # React root mount
│   ├── App.tsx              # Main component
│   └── README.md
└── vanilla/{name}/
    ├── package.json
    ├── vite.config.ts       # base: '/vanilla/{name}/'
    ├── tsconfig.json        # Self-contained, no extends
    ├── index.html           # wa-dark, inline <style>, Web Awesome elements
    ├── main.ts              # Entry point
    └── README.md
```

## Package.json

```json
{
  "dependencies": {
    "@awesome.me/webawesome": "^3.0.0",
    "@three-flatland/core": "^0.0.0",
    "three": "^0.182.0"
  }
}
```

React examples add `@react-three/fiber`, `@three-flatland/react`, `react`, `react-dom`.

## Web Awesome Setup

See [ui-patterns.md](ui-patterns.md) for component code and [design-tokens.md](design-tokens.md) for theming and layout.

**HTML**: `<html lang="en" class="wa-dark">`

**React imports**:
```tsx
import '@awesome.me/webawesome/dist/styles/themes/default.css'
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'
```

**Vanilla imports**:
```ts
import '@awesome.me/webawesome/dist/styles/themes/default.css'
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js'
import '@awesome.me/webawesome/dist/components/radio/radio.js'
```

## Microfrontends

```json
"example-{type}-{name}": {
  "development": { "local": { "port": 40XX } },
  "routing": [{
    "group": "{type}-examples",
    "paths": ["/{type}/{name}", "/{type}/{name}/:path*"]
  }]
}
```

Ports start at 4001, increment sequentially. Check `microfrontends.json` for next available.
