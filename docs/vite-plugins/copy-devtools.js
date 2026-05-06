import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin that copies the standalone devtools dashboard bundle
 * (`packages/devtools/bundle/`) into `docs/public/devtools/` at the
 * start of a production build. Mirrors `copy-examples.js`.
 *
 * The dashboard is a `BroadcastChannel`-driven Preact app — same
 * origin as any embedded example iframe means it connects to the
 * example's provider with no extra wiring. The static site is opened
 * via a pop-out link from the docs page, lives at
 * `/three-flatland/devtools/`, and never enters the docs entry chunk.
 *
 * In dev, the dashboard is served by `@three-flatland/devtools/vite`
 * directly off each example's dev server (the `/.devtools` middleware
 * path); this plugin is a no-op outside production.
 *
 * @returns {import('vite').Plugin}
 */
export function copyDevtools() {
  return {
    name: 'copy-devtools',
    buildStart() {
      const root = path.resolve(__dirname, '../..');
      const bundleDir = path.resolve(root, 'packages/devtools/bundle');
      const outputDir = path.resolve(__dirname, '../public/devtools');

      if (!existsSync(bundleDir)) {
        // Bundle isn't built yet — turbo's docs#build dependsOn should
        // prevent this in CI, but allow `astro build` standalone runs
        // to skip rather than fail. The pop-out link 404s in that case.
        this.warn(
          `[copy-devtools] ${bundleDir} not found. Run \`pnpm --filter @three-flatland/devtools build:bundle\` first.`,
        );
        return;
      }

      rmSync(outputDir, { recursive: true, force: true });
      mkdirSync(outputDir, { recursive: true });
      cpSync(bundleDir, outputDir, { recursive: true });
    },
  };
}
