import { defineConfig } from 'astro/config';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import react from '@astrojs/react';
import { watchExamples } from './vite-plugins/watch-examples.js';
import { copyExamples } from './vite-plugins/copy-examples.js';
import { rehypeExternalLinks } from './rehype-plugins/external-links.js';

const isProd = process.env.NODE_ENV === 'production';

// Read examples server port from microfrontends.json (single source of truth)
const mfe = JSON.parse(readFileSync('../microfrontends.json', 'utf-8'));
const examplesPort = mfe.applications.examples.development.local.port;

// Auto-generate vanilla→three redirects from filesystem so adding/removing
// examples doesn't require updating this config.
const examplesThreeDir = resolve('../examples/three');
const exampleNames = existsSync(examplesThreeDir)
  ? readdirSync(examplesThreeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(resolve(examplesThreeDir, d.name, 'package.json')))
      .map((d) => d.name)
  : [];
const vanillaRedirects = Object.fromEntries(
  exampleNames.map((name) => [
    `/examples/vanilla/${name}`,
    `/three-flatland/examples/three/${name}/`,
  ]),
);

export default defineConfig({
  site: 'https://thejustinwalsh.com',
  base: '/three-flatland/',
  trailingSlash: 'always',
  redirects: vanillaRedirects,
  integrations: [
    starlight({
      title: 'three-flatland',
      logo: {
        src: './src/assets/icon.svg',
      },
      favicon: '/favicon.svg',
      head: [
        // Open Graph
        {
          tag: 'meta',
          attrs: {
            property: 'og:type',
            content: 'website',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:site_name',
            content: 'three-flatland',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://thejustinwalsh.com/three-flatland/social/og-image.png',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:width',
            content: '1200',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:height',
            content: '630',
          },
        },
        // Twitter / X
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:card',
            content: 'summary_large_image',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:image',
            content: 'https://thejustinwalsh.com/three-flatland/social/x-card-image.png',
          },
        },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: [
            '../packages/three-flatland/src/index.ts',
            '../packages/three-flatland/src/react/index.ts',
            '../packages/nodes/src/index.ts',
            '../packages/presets/src/index.ts',
          ],
          tsconfig: './tsconfig.typedoc.json',
          sidebar: {
            label: 'API Reference',
            collapsed: false,
          },
          typeDoc: {
            gitRevision: 'main',
            plugin: ['./typedoc-plugins/external-source-links.js'],
            externalSymbolLinkMappings: {
              '@types/three': {
                // Core
                'Object3D': 'https://threejs.org/docs/#api/en/core/Object3D',
                'BufferGeometry': 'https://threejs.org/docs/#api/en/core/BufferGeometry',
                'BufferAttribute': 'https://threejs.org/docs/#api/en/core/BufferAttribute',
                'InstancedBufferGeometry': 'https://threejs.org/docs/#api/en/core/InstancedBufferGeometry',
                'InstancedBufferAttribute': 'https://threejs.org/docs/#api/en/core/InstancedBufferAttribute',
                'EventDispatcher': 'https://threejs.org/docs/#api/en/core/EventDispatcher',
                'Layers': 'https://threejs.org/docs/#api/en/core/Layers',
                'Raycaster': 'https://threejs.org/docs/#api/en/core/Raycaster',
                // Math
                'Vector2': 'https://threejs.org/docs/#api/en/math/Vector2',
                'Vector3': 'https://threejs.org/docs/#api/en/math/Vector3',
                'Vector4': 'https://threejs.org/docs/#api/en/math/Vector4',
                'Matrix3': 'https://threejs.org/docs/#api/en/math/Matrix3',
                'Matrix4': 'https://threejs.org/docs/#api/en/math/Matrix4',
                'Quaternion': 'https://threejs.org/docs/#api/en/math/Quaternion',
                'Euler': 'https://threejs.org/docs/#api/en/math/Euler',
                'Color': 'https://threejs.org/docs/#api/en/math/Color',
                'Box2': 'https://threejs.org/docs/#api/en/math/Box2',
                'Box3': 'https://threejs.org/docs/#api/en/math/Box3',
                'Sphere': 'https://threejs.org/docs/#api/en/math/Sphere',
                'Ray': 'https://threejs.org/docs/#api/en/math/Ray',
                'MathUtils': 'https://threejs.org/docs/#api/en/math/MathUtils',
                // Objects
                'Mesh': 'https://threejs.org/docs/#api/en/objects/Mesh',
                'Group': 'https://threejs.org/docs/#api/en/objects/Group',
                'Line': 'https://threejs.org/docs/#api/en/objects/Line',
                'Points': 'https://threejs.org/docs/#api/en/objects/Points',
                'Sprite': 'https://threejs.org/docs/#api/en/objects/Sprite',
                'BatchedMesh': 'https://threejs.org/docs/#api/en/objects/BatchedMesh',
                'InstancedMesh': 'https://threejs.org/docs/#api/en/objects/InstancedMesh',
                // Textures
                'Texture': 'https://threejs.org/docs/#api/en/textures/Texture',
                'DataTexture': 'https://threejs.org/docs/#api/en/textures/DataTexture',
                'CanvasTexture': 'https://threejs.org/docs/#api/en/textures/CanvasTexture',
                'CompressedTexture': 'https://threejs.org/docs/#api/en/textures/CompressedTexture',
                'CubeTexture': 'https://threejs.org/docs/#api/en/textures/CubeTexture',
                'VideoTexture': 'https://threejs.org/docs/#api/en/textures/VideoTexture',
                // Materials
                'Material': 'https://threejs.org/docs/#api/en/materials/Material',
                'MeshBasicMaterial': 'https://threejs.org/docs/#api/en/materials/MeshBasicMaterial',
                'MeshStandardMaterial': 'https://threejs.org/docs/#api/en/materials/MeshStandardMaterial',
                'ShaderMaterial': 'https://threejs.org/docs/#api/en/materials/ShaderMaterial',
                'SpriteMaterial': 'https://threejs.org/docs/#api/en/materials/SpriteMaterial',
                // Geometries
                'PlaneGeometry': 'https://threejs.org/docs/#api/en/geometries/PlaneGeometry',
                'BoxGeometry': 'https://threejs.org/docs/#api/en/geometries/BoxGeometry',
                'SphereGeometry': 'https://threejs.org/docs/#api/en/geometries/SphereGeometry',
                // Loaders
                'Loader': 'https://threejs.org/docs/#api/en/loaders/Loader',
                'TextureLoader': 'https://threejs.org/docs/#api/en/loaders/TextureLoader',
                'ImageLoader': 'https://threejs.org/docs/#api/en/loaders/ImageLoader',
                'FileLoader': 'https://threejs.org/docs/#api/en/loaders/FileLoader',
                // Scenes
                'Scene': 'https://threejs.org/docs/#api/en/scenes/Scene',
                // Cameras
                'Camera': 'https://threejs.org/docs/#api/en/cameras/Camera',
                'PerspectiveCamera': 'https://threejs.org/docs/#api/en/cameras/PerspectiveCamera',
                'OrthographicCamera': 'https://threejs.org/docs/#api/en/cameras/OrthographicCamera',
                // Renderers
                'WebGLRenderer': 'https://threejs.org/docs/#api/en/renderers/WebGLRenderer',
                // Lights
                'Light': 'https://threejs.org/docs/#api/en/lights/Light',
                'AmbientLight': 'https://threejs.org/docs/#api/en/lights/AmbientLight',
                'DirectionalLight': 'https://threejs.org/docs/#api/en/lights/DirectionalLight',
                'PointLight': 'https://threejs.org/docs/#api/en/lights/PointLight',
                'SpotLight': 'https://threejs.org/docs/#api/en/lights/SpotLight',
                // Fallback
                '*': 'https://threejs.org/docs/',
              },
              'three': {
                '*': 'https://threejs.org/docs/',
              },
            },
          },
        }),
      ],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        Hero: './src/components/Hero.astro',
        PageFrame: './src/components/PageFrame.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        Head: './src/components/Head.astro',
      },
      customCss: [
        // Fontsource fonts (bundled locally, no external requests)
        '@fontsource/silkscreen/400.css',
        '@fontsource/silkscreen/700.css',
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/ibm-plex-sans/700.css',
        '@fontsource/ibm-plex-mono/400.css',
        '@fontsource/ibm-plex-mono/500.css',
        // Custom styles
        './src/styles/global.css',
        './src/styles/patterns.css',
        './src/styles/retro-theme.css',
        './src/styles/custom.css',
      ],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/thejustinwalsh/three-flatland' },
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
            { label: 'Flatland', slug: 'guides/flatland' },
            { label: 'Loaders', slug: 'guides/loaders' },
            { label: 'TSL Nodes', slug: 'guides/tsl-nodes' },
            { label: 'Pass Effects', slug: 'guides/pass-effects' },
            { label: 'Tilemaps', slug: 'guides/tilemaps' },
            { label: 'Skia', slug: 'guides/skia' },
          ],
        },
        {
          label: 'Examples',
          items: [
            { label: 'Basic Sprite', slug: 'examples/basic-sprite' },
            { label: 'Animation', slug: 'examples/animation' },
            { label: 'Batches', slug: 'examples/batch-demo' },
            { label: 'TSL Nodes', slug: 'examples/tsl-nodes' },
            { label: 'Tilemap', slug: 'examples/tilemap' },
            { label: 'Pass Effects', slug: 'examples/pass-effects' },
            { label: 'Knightmark', slug: 'examples/knightmark' },
            { label: 'Skia', slug: 'examples/skia' },
          ],
        },
        {
          label: 'Showcases',
          items: [
            { label: 'Breakout', slug: 'showcases/breakout' },
          ],
        },
        {
          label: 'Project',
          items: [
            { label: 'Branding', slug: 'branding' },
            { label: 'LLMs', slug: 'llm-prompts' },
          ],
        },
        typeDocSidebarGroup,
      ],
    }),
    react(),
  ],
  markdown: {
    rehypePlugins: [rehypeExternalLinks],
  },
  vite: {
    resolve: {
      conditions: ['source'],
    },
    plugins: [watchExamples(), copyExamples()],
    optimizeDeps: {
      include: ['react-dom/client'],
    },
    define: {
      'import.meta.env.VITE_EXAMPLES_PORT': JSON.stringify(examplesPort),
    },
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  },
});
