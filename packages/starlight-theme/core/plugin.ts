import type { StarlightPlugin } from '@astrojs/starlight/types';
import { override, COMPONENT_OVERRIDES } from './config/override';
import { expressiveCode } from './config/expresive-code';
import { vitePlugin } from './config/vite';
import {
    StarlightThemeConfigSchema,
    type StarlightThemeConfig,
    type StarlightThemeUserConfig,
} from './config/schemas';

const parseConfig = (userConfig?: StarlightThemeUserConfig): StarlightThemeConfig => {
    const parsedConfig = StarlightThemeConfigSchema.safeParse(userConfig ?? {});

    if (!parsedConfig.success) {
        throw new Error(
            `The provided plugin configuration for starlight-theme is invalid.\n${parsedConfig.error.issues.map((issue) => issue.message).join('\n')}`
        );
    }

    return parsedConfig.data;
};

const plugin = (userConfig?: StarlightThemeUserConfig): StarlightPlugin =>
    ({
        name: 'starlight-theme',
        hooks: {
            'config:setup': ({ config, logger, updateConfig, addIntegration }) => {
                updateConfig({
                    components: override(config, COMPONENT_OVERRIDES, logger),
                    customCss: [
                        ...(config.customCss ?? []),
                        'starlight-theme/styles/layers',
                        'starlight-theme/styles/theme',
                        'starlight-theme/styles/base',
                    ],
                    expressiveCode: expressiveCode(config),
                });

                addIntegration({
                    name: 'starlight-theme-integration',
                    hooks: {
                        'astro:config:setup': ({ updateConfig }) => {
                            updateConfig({
                                vite: { plugins: [vitePlugin(parseConfig(userConfig))] },
                            });
                        },
                    },
                });
            },
            // 'i18n:setup': function ({ injectTranslations }) {
            //     injectTranslations(translations);
            // },
        },
    }) satisfies StarlightPlugin;

export { plugin };
