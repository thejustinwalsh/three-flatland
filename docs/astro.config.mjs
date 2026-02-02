import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import react from '@astrojs/react';
import { watchExamples } from './vite-plugins/watch-examples.js';
import { rehypeExternalLinks } from './rehype-plugins/external-links.js';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  site: 'https://thejustinwalsh.com',
  base: isProd ? 'three-flatland' : undefined,
  integrations: [
    starlight({
      title: 'three-flatland',
      logo: {
        src: './src/assets/icon.svg',
      },
      favicon: '/favicon.svg',
      plugins: [
        starlightTypeDoc({
          entryPoints: [
            '../packages/core/src/index.ts',
            '../packages/nodes/src/index.ts',
            '../packages/react/src/index.ts',
            '../packages/presets/src/index.ts',
          ],
          tsconfig: '../packages/core/tsconfig.json',
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
        Icon: './src/components/Icon.astro',
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
            { label: 'Flatland', slug: 'guides/flatland' },
            { label: 'Sprites', slug: 'guides/sprites' },
            { label: 'Animation', slug: 'guides/animation' },
            { label: 'Batch Rendering', slug: 'guides/batch-rendering' },
            { label: '2D Lighting', slug: 'guides/lighting' },
            { label: 'Post-Processing', slug: 'guides/post-processing' },
            { label: 'TSL Nodes', slug: 'guides/tsl-nodes' },
            { label: 'Loaders', slug: 'guides/loaders' },
            { label: 'Tilemaps', slug: 'guides/tilemaps' },
          ],
        },
        {
          label: 'Examples',
          items: [
            { label: 'Basic Sprite', slug: 'examples/basic-sprite' },
            { label: 'Animation', slug: 'examples/animation' },
            { label: 'Batches', slug: 'examples/batch-demo' },
            { label: 'TSL Nodes', slug: 'examples/tsl-nodes' },
            { label: '2D Lighting', slug: 'examples/lighting' },
            { label: 'Post-Processing', slug: 'examples/post-processing' },
            { label: 'Tilemap', slug: 'examples/tilemap' },
            { label: 'Knightmark', slug: 'examples/knightmark' },
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
    plugins: [watchExamples()],
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  },
});
