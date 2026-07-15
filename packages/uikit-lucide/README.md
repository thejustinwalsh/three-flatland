# @three-flatland/uikit-lucide

[Lucide](https://lucide.dev) icons for [`@three-flatland/uikit`](../uikit), as
`Svg` components — one `XIcon` class per glyph, filled (not stroked) paths.

```ts
import { HeartIcon } from '@three-flatland/uikit-lucide'
```

```tsx
import { Heart } from '@three-flatland/uikit-lucide/react'
```

## Generated, not vendored

Forked from [`pmndrs/uikit`](https://github.com/pmndrs/uikit) @ `0d4d887`
(`packages/icons/lucide`). Upstream generates this package's entire source
tree at build time and gitignores the intermediates — `icons/*` (SVGs fixed
from `lucide-static`'s stroke paths into filled paths via
`oslllo-svg-fixer`) and both `core/src/*` and `react/src/*` (one class/wrapper
per icon, stamped out by a small codegen script). In the upstream clone this
fork was cut from, all three directories contained only a `.gitkeep` — there
was nothing to port, so this package vendors the **generator**, not generated
output:

- `scripts/convert.ts` — fixes `lucide-static`'s stroke SVGs into fills,
  writing to `icons/`.
- `scripts/generate.ts` — emits one `src/<Name>.ts` (`<Name>Icon extends Svg`)
  per fixed SVG, plus `src/index.ts`.
- `scripts/generate-react.ts` — emits one `src/react/<Name>.tsx` React wrapper
  per icon, plus `src/react/index.ts`.

To populate the package:

```sh
pnpm --filter=@three-flatland/uikit-lucide convert
pnpm --filter=@three-flatland/uikit-lucide generate
```

Import paths are retargeted from `@pmndrs/uikit`/`@react-three/uikit` to
`@three-flatland/uikit`/`@three-flatland/uikit/react`; the codegen logic is
otherwise unchanged from upstream.

## License

MIT — see [LICENSE](./LICENSE). Retains the upstream copyright notices:
Bela Bohlender (2024) and Coconut Capital (2023).
