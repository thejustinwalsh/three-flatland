import { defineConfig, presetIcons } from 'unocss'
import { presetStarlightIcons } from 'starlight-plugin-icons/uno'

const dynamicPixelartIcons = [
  'lightbulb', 'list', 'human', 'animation', 'heart', 'map',
  'github', 'monitor', 'sun', 'moon',
  'volume', 'volume-x', 'volume-1', 'volume-2', 'volume-3', 'volume-minus',
  'arrow-right', 'arrow-left', 'external-link',
]

export default defineConfig({
  presets: [
    presetStarlightIcons(),
    presetIcons({ extraProperties: { display: 'inline-block', 'vertical-align': 'middle' } }),
  ],
  safelist: dynamicPixelartIcons.map((n) => `i-pixelarticons:${n}`),
})
