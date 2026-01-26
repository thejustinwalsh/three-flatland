import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
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
      logo: {
        src: './src/assets/icon.svg',
      },
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
            externalSymbolLinkMappings: {
              '@types/three': {
                // Core
                'Object3D': 'https://github.com/mrdoob/three.js/blob/dev/src/core/Object3D.js',
                'BufferGeometry': 'https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js',
                'BufferAttribute': 'https://github.com/mrdoob/three.js/blob/dev/src/core/BufferAttribute.js',
                'InstancedBufferGeometry': 'https://github.com/mrdoob/three.js/blob/dev/src/core/InstancedBufferGeometry.js',
                'InstancedBufferAttribute': 'https://github.com/mrdoob/three.js/blob/dev/src/core/InstancedBufferAttribute.js',
                'EventDispatcher': 'https://github.com/mrdoob/three.js/blob/dev/src/core/EventDispatcher.js',
                'Layers': 'https://github.com/mrdoob/three.js/blob/dev/src/core/Layers.js',
                'Raycaster': 'https://github.com/mrdoob/three.js/blob/dev/src/core/Raycaster.js',
                // Math
                'Vector2': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Vector2.js',
                'Vector3': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js',
                'Vector4': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Vector4.js',
                'Matrix3': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix3.js',
                'Matrix4': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js',
                'Quaternion': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js',
                'Euler': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Euler.js',
                'Color': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js',
                'Box2': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Box2.js',
                'Box3': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Box3.js',
                'Sphere': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Sphere.js',
                'Ray': 'https://github.com/mrdoob/three.js/blob/dev/src/math/Ray.js',
                'MathUtils': 'https://github.com/mrdoob/three.js/blob/dev/src/math/MathUtils.js',
                // Objects
                'Mesh': 'https://github.com/mrdoob/three.js/blob/dev/src/objects/Mesh.js',
                'Group': 'https://github.com/mrdoob/three.js/blob/dev/src/objects/Group.js',
                'Line': 'https://github.com/mrdoob/three.js/blob/dev/src/objects/Line.js',
                'Points': 'https://github.com/mrdoob/three.js/blob/dev/src/objects/Points.js',
                'Sprite': 'https://github.com/mrdoob/three.js/blob/dev/src/objects/Sprite.js',
                'BatchedMesh': 'https://github.com/mrdoob/three.js/blob/dev/src/objects/BatchedMesh.js',
                'InstancedMesh': 'https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js',
                // Textures
                'Texture': 'https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js',
                'DataTexture': 'https://github.com/mrdoob/three.js/blob/dev/src/textures/DataTexture.js',
                'CanvasTexture': 'https://github.com/mrdoob/three.js/blob/dev/src/textures/CanvasTexture.js',
                'CompressedTexture': 'https://github.com/mrdoob/three.js/blob/dev/src/textures/CompressedTexture.js',
                'CubeTexture': 'https://github.com/mrdoob/three.js/blob/dev/src/textures/CubeTexture.js',
                'VideoTexture': 'https://github.com/mrdoob/three.js/blob/dev/src/textures/VideoTexture.js',
                // Materials
                'Material': 'https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js',
                'MeshBasicMaterial': 'https://github.com/mrdoob/three.js/blob/dev/src/materials/MeshBasicMaterial.js',
                'MeshStandardMaterial': 'https://github.com/mrdoob/three.js/blob/dev/src/materials/MeshStandardMaterial.js',
                'ShaderMaterial': 'https://github.com/mrdoob/three.js/blob/dev/src/materials/ShaderMaterial.js',
                'SpriteMaterial': 'https://github.com/mrdoob/three.js/blob/dev/src/materials/SpriteMaterial.js',
                // Geometries
                'PlaneGeometry': 'https://github.com/mrdoob/three.js/blob/dev/src/geometries/PlaneGeometry.js',
                'BoxGeometry': 'https://github.com/mrdoob/three.js/blob/dev/src/geometries/BoxGeometry.js',
                'SphereGeometry': 'https://github.com/mrdoob/three.js/blob/dev/src/geometries/SphereGeometry.js',
                // Loaders
                'Loader': 'https://github.com/mrdoob/three.js/blob/dev/src/loaders/Loader.js',
                'TextureLoader': 'https://github.com/mrdoob/three.js/blob/dev/src/loaders/TextureLoader.js',
                'ImageLoader': 'https://github.com/mrdoob/three.js/blob/dev/src/loaders/ImageLoader.js',
                'FileLoader': 'https://github.com/mrdoob/three.js/blob/dev/src/loaders/FileLoader.js',
                // Scenes
                'Scene': 'https://github.com/mrdoob/three.js/blob/dev/src/scenes/Scene.js',
                // Cameras
                'Camera': 'https://github.com/mrdoob/three.js/blob/dev/src/cameras/Camera.js',
                'PerspectiveCamera': 'https://github.com/mrdoob/three.js/blob/dev/src/cameras/PerspectiveCamera.js',
                'OrthographicCamera': 'https://github.com/mrdoob/three.js/blob/dev/src/cameras/OrthographicCamera.js',
                // Renderers
                'WebGLRenderer': 'https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js',
                // Lights
                'Light': 'https://github.com/mrdoob/three.js/blob/dev/src/lights/Light.js',
                'AmbientLight': 'https://github.com/mrdoob/three.js/blob/dev/src/lights/AmbientLight.js',
                'DirectionalLight': 'https://github.com/mrdoob/three.js/blob/dev/src/lights/DirectionalLight.js',
                'PointLight': 'https://github.com/mrdoob/three.js/blob/dev/src/lights/PointLight.js',
                'SpotLight': 'https://github.com/mrdoob/three.js/blob/dev/src/lights/SpotLight.js',
                // Fallback
                '*': 'https://github.com/mrdoob/three.js/tree/dev/src',
              },
              'three': {
                '*': 'https://github.com/mrdoob/three.js/tree/dev/src',
              },
            },
          },
        }),
      ],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        Icon: './src/components/Icon.astro',
        Hero: './src/components/Hero.astro',
        PageFrame: './src/components/PageFrame.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        Head: './src/components/Head.astro',
      },
      customCss: [
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
            { label: 'TSL Nodes', slug: 'guides/tsl-nodes' },
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
            { label: 'Tilemap', slug: 'examples/tilemap' },
          ],
        },
        typeDocSidebarGroup,
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
