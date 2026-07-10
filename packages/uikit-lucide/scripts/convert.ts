// Converts lucide-static's stroke-based SVGs into filled paths (Svg glyphs
// in this kit render fills, not strokes) using oslllo-svg-fixer. Forked from
// pmndrs/uikit @ 0d4d887 (packages/icons/lucide/convert.ts) — paths retargeted
// from the split core/react package layout to this single-package layout.
//@ts-ignore
import SVGFixer from 'oslllo-svg-fixer'

const searchDir = 'node_modules/lucide-static/icons/'
const outDir = './icons/'

async function main() {
  await SVGFixer(searchDir, outDir).fix()
}

main()
