import { cpSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin that copies built example dist/ directories into
 * docs/public/examples/ at the start of a production build.
 * In dev, examples are loaded via iframe from the microfrontend proxy.
 *
 * Automatically discovers all examples under examples/{type}/{name}/dist.
 * @returns {import('vite').Plugin}
 */
export function copyExamples() {
  return {
    name: 'copy-examples',
    buildStart() {
      const root = path.resolve(__dirname, '../..');
      const examplesDir = path.resolve(root, 'examples');
      const outputDir = path.resolve(__dirname, '../public/examples');

      rmSync(outputDir, { recursive: true, force: true });
      mkdirSync(outputDir, { recursive: true });

      const types = readdirSync(examplesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const type of types) {
        const typeDir = path.resolve(examplesDir, type);
        const names = readdirSync(typeDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        for (const name of names) {
          const distDir = path.resolve(typeDir, name, 'dist');
          if (!existsSync(distDir)) continue;

          const destDir = path.resolve(outputDir, type, name);
          mkdirSync(destDir, { recursive: true });
          cpSync(distDir, destDir, { recursive: true });
        }
      }
    },
  };
}
