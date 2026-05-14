/**
 * Re-export everything from `@astrojs/starlight/components` so MDX
 * has a single import path (`starlight-theme/components`). Our local
 * `Tabs` / `TabItem` shadow Starlight's because they're declared
 * after the `export *` line — this is the canonical TypeScript
 * pattern for replacing specific named exports while preserving
 * the rest verbatim.
 *
 * Tabs/TabItem are replacements (not Starlight overrides) because
 * Starlight's component-override system only covers
 * layout/structural components — Tabs is on the user-components
 * side and isn't on the override allow-list. Our Tabs renders icons
 * via UnoCSS preset-icons so colon-prefixed Iconify names like
 * `material-icon-theme:npm` actually render glyphs.
 */
export * from '@astrojs/starlight/components';
export { default as Tabs } from './components/custom/Tabs.astro';
export { default as TabItem } from './components/custom/TabItem.astro';

export { default as ContainerSection } from './components/custom/ContainerSection.astro';
export { default as LinkButton } from './components/custom/LinkButton.astro';
export { default as Dropdown } from './components/custom/dropdown';
