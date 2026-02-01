import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin that watches the examples directory and triggers
 * a full page reload when example files change.
 * @returns {import('vite').Plugin}
 */
export function watchExamples() {
  return {
    name: 'watch-examples',
    configureServer(server) {
      const examplesDir = path.resolve(__dirname, '../../examples');
      server.watcher.add(examplesDir);

      server.watcher.on('change', (file) => {
        if (file.startsWith(examplesDir)) {
          // Invalidate loadExample module to force reload
          const loadExamplePath = path.resolve(__dirname, '../src/utils/loadExample.ts');
          const mod = server.moduleGraph.getModuleById(loadExamplePath);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }
          // Trigger full page reload for MDX files using this example
          server.hot.send({ type: 'full-reload' });
        }
      });
    },
  };
}
