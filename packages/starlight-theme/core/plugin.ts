import type { StarlightPlugin } from '@astrojs/starlight/types'
import { override, COMPONENT_OVERRIDES } from './config/override'
import { vitePlugin } from './config/vite'
import {
  colorschemeTransformerVitePlugin,
  colorschemeTransformerPostcss,
  colorschemeTransformerBundlePlugin,
} from './config/colorscheme-transformer'
import { StarlightThemeConfigSchema, type StarlightThemeConfig, type StarlightThemeUserConfig } from './config/schemas'
// Expressive Code config moved to `docs/ec.config.mjs` — see comment
// inside plugin's `config:setup` below.

const parseConfig = (userConfig?: StarlightThemeUserConfig): StarlightThemeConfig => {
  const parsedConfig = StarlightThemeConfigSchema.safeParse(userConfig ?? {})

  if (!parsedConfig.success) {
    throw new Error(
      `The provided plugin configuration for starlight-theme is invalid.\n${parsedConfig.error.issues.map((issue) => issue.message).join('\n')}`
    )
  }

  return parsedConfig.data
}

const plugin = (userConfig?: StarlightThemeUserConfig): StarlightPlugin =>
  ({
    name: 'starlight-theme',
    hooks: {
      'config:setup': ({ config, logger, updateConfig, addIntegration }) => {
        // Expressive Code config moved to `docs/ec.config.mjs`.
        // Reason: Starlight's `<Code>` component (used by
        // ExampleSplitView's multi-file code panel) requires
        // a serializable EC config. Passing options inline
        // through `updateConfig({ expressiveCode })` failed
        // the JSON-serialization check at build time. Astro
        // resolves both at runtime — ec.config.mjs is the
        // single source for fenced code blocks AND the
        // standalone <Code> component.
        updateConfig({
          components: override(config, COMPONENT_OVERRIDES, logger),
          customCss: [
            ...(config.customCss ?? []),
            'starlight-theme/styles/layers',
            'starlight-theme/styles/theme',
            'starlight-theme/styles/base',
          ],
        })

        addIntegration({
          name: 'starlight-theme-integration',
          hooks: {
            'astro:config:setup': ({ updateConfig }) => {
              updateConfig({
                vite: {
                  plugins: [
                    vitePlugin(parseConfig(userConfig)),
                    // Semantic colorscheme transformer — three
                    // integration points covering every CSS path
                    // that reaches the bundle:
                    //   1. Vite transform: .css files + Astro <style>
                    //   2. Rollup generateBundle: emitted assets
                    //      (e.g. Expressive Code's ec.{hash}.css)
                    // PostCSS plugin is registered separately below
                    // via css.postcss.plugins so it also runs on
                    // CSS that flows through Vite's bundle stage.
                    colorschemeTransformerVitePlugin(),
                    colorschemeTransformerBundlePlugin(),
                  ],
                  css: {
                    postcss: {
                      plugins: [colorschemeTransformerPostcss()],
                    },
                  },
                },
              })
            },
          },
        })
      },
      // 'i18n:setup': function ({ injectTranslations }) {
      //     injectTranslations(translations);
      // },
    },
  }) satisfies StarlightPlugin

export { plugin }
