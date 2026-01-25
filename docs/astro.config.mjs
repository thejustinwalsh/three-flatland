import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import { watchExamples } from './vite-plugins/watch-examples.js';

// Use /three-flatland base path only for production (GitHub Pages)
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  site: 'https://tjw.github.io',
  base: isProduction ? '/three-flatland' : '/',
  integrations: [
    starlight({
      title: 'three-flatland',
      customCss: ['./src/styles/custom.css'],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/tjw/three-flatland' },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Sprites', slug: 'guides/sprites' },
            { label: 'Animation', slug: 'guides/animation' },
            { label: 'Batch Rendering', slug: 'guides/batch-rendering' },
            { label: 'TSL Nodes', slug: 'guides/tsl-nodes' },
            { label: 'Tilemaps', slug: 'guides/tilemaps' },
          ],
        },
        {
          label: 'Examples',
          items: [
            { label: 'Basic Sprite', slug: 'examples/basic-sprite' },
            { label: 'Animation', slug: 'examples/animation' },
            { label: 'Batch Demo', slug: 'examples/batch-demo' },
            { label: 'TSL Nodes', slug: 'examples/tsl-nodes' },
            { label: 'Tilemap', slug: 'examples/tilemap' },
          ],
        },
        {
          label: 'API Reference',
          autogenerate: { directory: 'api' },
        },
      ],
    }),
    react(),
  ],
  vite: {
    plugins: [watchExamples()],
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  },
});
