# @three-flatland/uikit-default

Default (shadcn-style) component kit for [`@three-flatland/uikit`](../uikit) — buttons,
dialogs, cards, tabs, tooltips, and the rest of the shadcn/ui component surface, rebuilt
on flex-layout `Container`/`Text` primitives instead of DOM.

```ts
import { Button, Card, Dialog } from '@three-flatland/uikit-default'
```

```tsx
import { Button, Card, Dialog } from '@three-flatland/uikit-default/react'
```

## Forked from pmndrs/uikit

Forked from [`pmndrs/uikit`](https://github.com/pmndrs/uikit) @ `0d4d887`
(`packages/kits/default`), retargeted from `@pmndrs/uikit` to
`@three-flatland/uikit` (TSL/WebGPU + WebGL2 via the common `Renderer`, no
legacy `WebGLRenderer`) and from `@react-three/uikit` to
`@three-flatland/uikit/react`. Component logic, variants, and the shadcn color
theme are otherwise unchanged from upstream.

## License

MIT — see [LICENSE](./LICENSE). Retains the upstream copyright notices:
Bela Bohlender (2024), Coconut Capital (2023), and shadcn (2023), whose
component variants and color tokens this kit is built on.
