// Generates the React `build()` wrapper for each icon in ./icons/. Forked
// from pmndrs/uikit @ 0d4d887 (packages/icons/lucide/react/generate.ts) —
// retargeted from `@pmndrs/uikit-lucide`/`@react-three/uikit` to
// `@three-flatland/uikit-lucide`/`@three-flatland/uikit/react`, and from the
// split core/react layout to this single package's `src/react/` output.
import { readdir, writeFile } from 'fs/promises'

const baseDir = './icons/'
const outDir = './src/react/'

// JS restricted global names (eslint `no-shadow-restricted-names`) that a few icons collide with
// via their un-suffixed alias — e.g. lucide's `infinity` → `Infinity`. The suffixed `${name}Icon`
// export is always safe; the alias just carries a disable so both spellings stay importable.
const RESTRICTED_GLOBALS = new Set(['Infinity', 'NaN', 'undefined', 'eval', 'arguments'])

async function main() {
  const icons = await readdir(baseDir)
  const names: string[] = []
  for (const icon of icons) {
    if (icon === '.gitkeep') {
      continue
    }
    const name = getName(icon)
    names.push(name)
    const aliasEslintDisable = RESTRICTED_GLOBALS.has(name)
      ? '// eslint-disable-next-line no-shadow-restricted-names\n'
      : ''
    const code = `
import type { ForwardRefExoticComponent, PropsWithoutRef, RefAttributes } from 'react'
import { ${name}Icon as Vanilla${name}Icon } from '@three-flatland/uikit-lucide'
import { build } from '@three-flatland/uikit/react'
import type { SvgProperties } from '@three-flatland/uikit/react'

export const ${name}Icon: ForwardRefExoticComponent<
  PropsWithoutRef<SvgProperties> & RefAttributes<Vanilla${name}Icon>
> = /*@__PURE__*/ build<Vanilla${name}Icon, SvgProperties>(Vanilla${name}Icon)
${aliasEslintDisable}export const ${name}: ForwardRefExoticComponent<
  PropsWithoutRef<SvgProperties> & RefAttributes<Vanilla${name}Icon>
> = ${name}Icon
    `
    await writeFile(`${outDir}${name}.tsx`, code)
  }
  await writeFile(
    `${outDir}index.ts`,
    names.map((name) => `export * from './${name}.js';`).join('\n') + '\n'
  )
  await writeFile(`src/react.ts`, `export * from './react/index.js'\n`)
}

function getName(file: string): string {
  const name = file.slice(0, -4)
  return name[0]!.toUpperCase() + name.slice(1).replace(/-./g, (x) => x[1]!.toUpperCase())
}

main()
