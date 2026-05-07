/**
 * Expressive Code config — required by Starlight 0.38+ for the
 * `<Code>` component to work standalone (i.e. when used outside
 * MDX-rendered fenced code blocks). Without this file, `<Code>`
 * fails to render at build time with an error pointing at non-
 * serializable options in the Astro config.
 *
 * The Starlight integration (in `astro.config.mjs` via the
 * starlight-theme plugin) still configures EC for fenced code
 * blocks across the docs; this file mirrors the visual treatment
 * (themes, code-frame token bridge, gem-tinted code background)
 * for the standalone `<Code>` component used by ExampleSplitView.
 *
 * Keep these in rough sync with
 * `packages/starlight-theme/core/config/expresive-code.ts`.
 */
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'

export default {
    themes: ['github-dark-default', 'github-light-default'],
    // pluginLineNumbers is opt-in via `showLineNumbers` prop on
    // individual <Code> calls (only ExampleSplitView uses it).
    // Markdown fenced code blocks across the rest of the docs stay
    // number-free per `defaultProps.showLineNumbers: false` below.
    //
    // Note: starlight-plugin-icons' `pluginIcon` (codeblock-title
    // language-icon injector) can't be imported here because the
    // package ships TS source (no compiled JS), and Node refuses
    // to type-strip files inside node_modules. The auto-injected
    // language icon on `~~~lang title="…"` blocks is therefore
    // disabled site-wide; codeblock titles still render the
    // filename in italic gem-toned typography per base.css. Worth
    // revisiting if the upstream ships dist/ — see
    // https://github.com/Rettend/starlight-plugin-icons.
    plugins: [pluginLineNumbers()],
    defaultProps: {
        showLineNumbers: false,
    },
    styleOverrides: {
        codeBackground: 'var(--code-background)',
        borderWidth: '0px',
        borderRadius: 'calc(var(--radius) + 4px)',
        gutterBorderWidth: '0px',
        frames: {
            editorBackground: 'var(--code-background)',
            editorActiveTabBackground: 'var(--gray-5)',
            editorActiveTabForeground: 'var(--foreground)',
            editorTabBarBackground: 'var(--gray-6)',
            editorTabBarBorderColor: 'var(--border)',
            editorTabBarBorderBottomColor: 'var(--border)',
            terminalBackground: 'var(--code-background)',
            terminalTitlebarBackground: 'var(--gray-6)',
            terminalTitlebarBorderBottomColor: 'var(--border)',
            terminalTitlebarForeground: 'var(--muted-foreground)',
            shadowColor: 'transparent',
        },
        textMarkers: {
            markBackground: 'var(--mark-background)',
            markBorderColor: 'var(--border)',
        },
    },
}
