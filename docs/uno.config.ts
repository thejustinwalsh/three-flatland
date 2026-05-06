import { defineConfig, presetIcons, presetWind4 } from 'unocss'
import { presetStarlightIcons } from 'starlight-plugin-icons/uno'
import { FileSystemIconLoader } from '@iconify/utils/lib/loader/node-loaders'

/**
 * Tokens here are the single source for design-system primitives.
 * They mirror the CSS custom properties in `packages/starlight-theme/styles/theme.css`
 * (base16 Materia) so utility classes (`text-fg`, `bg-bg-2`, `font-prose`, …)
 * resolve to the same values Starlight's overrides consume via `var(--…)`.
 */
export default defineConfig({
  presets: [
    presetStarlightIcons(),
    presetIcons({
      collections: {
        // Workspace-local custom icon collection. Drop SVGs in `docs/src/icons/tf/`
        // to use them as `<span class="i-tf:name" />` anywhere in the site.
        tf: FileSystemIconLoader('./src/icons/tf'),
      },
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetWind4({
      // Use the renamed cascade layer that `starlight-theme` declares.
      preflights: { reset: false },
    }),
  ],
  theme: {
    colors: {
      // base16 Materia primitives — names match theme.css custom properties so
      // utilities (`bg-bg`, `text-fg`, `border-border`) read the same source.
      bg: 'var(--background)',
      fg: 'var(--foreground)',
      'bg-1': 'var(--gray-7)',
      'bg-2': 'var(--gray-6)',
      muted: 'var(--muted)',
      'muted-fg': 'var(--muted-foreground)',
      border: 'var(--border)',
      ring: 'var(--ring)',
      primary: 'var(--primary)',
      'primary-fg': 'var(--primary-foreground)',
      accent: 'var(--accent)',
      'accent-fg': 'var(--accent-foreground)',
      orange: 'var(--orange)',
      green: 'var(--green)',
      blue: 'var(--blue)',
      purple: 'var(--purple)',
      red: 'var(--red)',
      yellow: 'var(--yellow)',
      teal: 'var(--teal)',
    },
    fontFamily: {
      // Typography stack per Design Context (CLAUDE.md).
      sans: ['Public Sans', 'system-ui', 'sans-serif'],
      nav: ['Inter', 'system-ui', 'sans-serif'],
      prose: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      mono: ['Commit Mono', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
    },
  },
  // Safelist icons that are constructed dynamically by Icon.astro
  // (`<Icon name="X" />` → `i-lucide:X` at runtime — UnoCSS's static scanner
  // can't extract these from the template literal in Icon.astro).
  safelist: [
    // FeatureCard / FeatureList content icons
    'i-lucide:lightbulb', 'i-lucide:list', 'i-lucide:user', 'i-lucide:play-circle',
    'i-lucide:sparkles', 'i-lucide:map', 'i-lucide:heart',
    // SoundToggle states
    'i-lucide:volume', 'i-lucide:volume-x', 'i-lucide:volume-1', 'i-lucide:volume-2',
    // ThemeSelect states
    'i-lucide:monitor', 'i-lucide:sun', 'i-lucide:moon',
    // Brand / social
    'i-lucide:github', 'i-lucide:external-link', 'i-lucide:arrow-right', 'i-lucide:arrow-left',
    // Sidebar group icons (also referenced statically in astro.config.mjs)
    'i-lucide:download', 'i-lucide:play', 'i-lucide:rocket', 'i-lucide:palette',
    'i-lucide:terminal', 'i-lucide:image', 'i-lucide:book-open',
  ],
})
