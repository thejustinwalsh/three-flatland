import { defineConfig } from 'astro/config';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import UnoCSS from 'unocss/astro';
import Icons from 'starlight-plugin-icons';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import starlightHeadingBadges from 'starlight-heading-badges';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightTheme from 'starlight-theme';
import react from '@astrojs/react';
import { watchExamples } from './vite-plugins/watch-examples.js';
import { copyExamples } from './vite-plugins/copy-examples.js';
import { copyDevtools } from './vite-plugins/copy-devtools.js';
import { rehypeExternalLinks } from './rehype-plugins/external-links.js';
import stripIndexLinks from './typedoc-plugins/strip-index-links.mjs';

// Dev-server topology:
//   - Docs (this app) is the authoritative host on Astro's default
//     dev port (:4321).
//   - Examples MPA runs at :5174 (overridable via EXAMPLES_PORT env;
//     passed through turbo's strict env filter via globalPassThroughEnv
//     so docs + examples stay on the same origin when overridden).
//   - The iframe in `ExampleSplitView.astro` points DIRECTLY at the
//     examples server (cross-origin in dev). Safari's cross-origin
//     iframe rAF throttle requires a one-time user click inside the
//     iframe to release 60fps — accepted trade-off; an attempted
//     same-origin proxy hit unworkable Vite-internal-path collisions
//     between the two Vite instances (/@vite/client, /@react-refresh,
//     /node_modules/.vite/deps/...) and was abandoned.
const EXAMPLES_PORT = Number(process.env.EXAMPLES_PORT) || 5174;
const examplesPort = EXAMPLES_PORT;

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
  // Off by default for everyone; summon for diagnostics with
  //   ASTRO_DEV_TOOLBAR=1 pnpm dev
  // The Audit app walks the DOM via getBoundingClientRect on scroll/
  // resize/interaction — fine occasionally, expensive as a default.
  devToolbar: { enabled: process.env.ASTRO_DEV_TOOLBAR === '1' },
  integrations: [
    UnoCSS({ injectReset: false }),
    ...Icons({
      // codeblock: false — mutually exclusive with the standalone
      // <Code> component used by ExampleSplitView. Starlight-plugin-
      // icons' codeblock=true injects `pluginIcon` (a function) into
      // Starlight's expressiveCode option, which fails Astro EC's
      // JSON-serialization check at <Code> render time — the error
      // says "move options to ec.config.mjs" but the inline plugin
      // is also picked up by <Code>'s renderer setup, not just the
      // markdown integration. Bringing the auto-language icons back
      // (the JSON glyph on atlas files, TS on main.ts, etc.) requires
      // either upstream shipping a compiled JS dist (so we could
      // re-register pluginIcon inside ec.config.mjs) or vendoring
      // ~300 lines of icon-detection logic + a runtime GitHub
      // material-icon fetch. Worth revisiting; not invested today.
      codeblock: false,
      extractSafelist: true,
      starlight: {
        // Visual brand is "flatland" (set in Silkscreen by SiteTitle override).
        // The npm package, README, and install commands stay "three-flatland"
        // for SEO and Three.js / R3F ecosystem discoverability — see Design
        // Context (CLAUDE.md > Naming).
        title: 'flatland',
        // Site description — feeds Starlight's <meta description> and
        // the SiteFooter's brand tagline (falls back via config.description).
        description: 'Composable 2D library for three.js. Sprites, tilemaps, batching, and TSL effects, for three.js or react-three-fiber.',
        logo: {
          // Pre-baked 64×64 raster (2× retina for the 32×32 header
          // render). The source SVG (`icon.svg`, 167 KB, 1864 `<rect>`
          // pixel-art elements) is still authoritative — re-bake with
          // `node docs/scripts/bake-brand-icon.mjs` after edits.
          // BrandIcon / BrandAsset / favicon still use the SVG.
          src: './src/assets/icon.png',
        },
        favicon: '/favicon.svg',
        head: [
          // Theme boot — runs after Starlight's own ThemeProvider inline
          // script (entries in the `head` config land in DOM order, and
          // Starlight injects its provider earlier). Architecture:
          //   - CSS reacts to OS preference via `@media (prefers-color-
          //     scheme: light)` directly. Our theme.css also overrides
          //     Starlight's `--sl-color-*` primitives so vendor selectors
          //     like `[data-theme='light']` are never the source of truth.
          //   - JS consumers use `window.__threeFlatlandTheme` (same
          //     naming convention as `__threeFlatlandAudio`). API:
          //       - `current` — `'light' | 'dark'`
          //       - `subscribe(cb)` — fires cb immediately + on each
          //         change, returns unsubscribe fn.
          //   - Live OS-pref change updates the global via matchMedia
          //     listener (persists at browser level across page swaps).
          //   - `data-theme` is not written or read.
          {
            tag: 'script',
            content: `;(() => {
              function currentTheme() {
                try {
                  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches) {
                    return 'light';
                  }
                } catch {}
                return 'dark';
              }
              var listeners = new Set();
              var api = {
                current: currentTheme(),
                subscribe: function(cb) {
                  listeners.add(cb);
                  try { cb(api.current); } catch (e) {}
                  return function() { listeners.delete(cb); };
                },
              };
              window.__threeFlatlandTheme = api;
              function emit() {
                var theme = currentTheme();
                if (api.current === theme) return;
                api.current = theme;
                listeners.forEach(function(cb) { try { cb(theme); } catch (e) {} });
              }
              try {
                matchMedia('(prefers-color-scheme: light)').addEventListener('change', emit);
              } catch {}
            })();`,
          },
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
              content: 'https://thejustinwalsh.com/three-flatland/social/og-image.webp',
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
              content: 'https://thejustinwalsh.com/three-flatland/social/x-card-image.webp',
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
              // Generate `index.md` per module directory so Astro routes
              // module roots cleanly to `/api/three-flatland/src/` (no
              // `/readme/` intermediate). typedoc-plugin-markdown's URL
              // builder includes `/index/` segments in the generated
              // links (e.g., `/api/foo/src/react/index/`) — the
              // `stripIndexLinks` remark plugin (wired in `markdown.
              // remarkPlugins`) strips that segment so links resolve
              // to the directory root Astro serves.
              entryFileName: 'index',
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
          starlightHeadingBadges(),
          starlightLlmsTxt({
            // Emit raw markdown source. Rendering MDX components for the
            // text endpoints fails for pages that embed React components
            // (`<ExamplePreview>`, `<StackBlitzEmbed>`, `<ShowcaseGame>`),
            // and raw source is what LLMs actually want anyway.
            rawContent: true,
            // `exclude` is plumbed ONLY into llms-small.txt (see plugin
            // source `llms-small.txt.ts`); llms-full.txt keeps everything.
            // Drops the bulkiest, lowest-text-value content from the
            // abridged variant so LLMs with tight context can ingest the
            // small file without the full TypeDoc-generated API reference.
            exclude: ['api/**', 'showcases/**', 'llm-prompts'],
          }),
          // Theme last so its component overrides win over earlier plugins.
          // Provides Hero, SiteTitle, ThemeSelect, SocialIcons, PageFrame, …
          // and registers starlight-theme/styles/{layers,theme,base}.css.
          //
          // Explicit footerText (instead of relying on the schema default)
          // ensures the value is part of the user-config virtual module
          // and re-evaluates cleanly across dev-server reloads.
          starlightTheme({
            // SiteFooter (packages/starlight-theme/components/SiteFooter.astro)
            // owns the site footer now: structured columns + brand block +
            // attribution row, props-driven. The legacy single-string
            // footerText is no longer rendered; leave empty for schema
            // compat, slated for removal when the schema drops the field.
            footerText: '',
            // Top-of-page navigation. Three top-level surfaces:
            //   - Docs       → introduction (the entry point into the
            //                  prose docs; subsequent pages flow from
            //                  the sidebar)
            //   - Examples   → masonry grid of focused single-feature
            //                  demos (sprites, animation, batch, TSL,
            //                  pass effects, tilemaps, skia)
            //   - Showcases  → masonry grid of larger app/game demos
            //                  (currently just `breakout`)
            // Minis (e.g. mini-breakout) are implementation packages,
            // not user-facing — they don't get a top-level surface.
            navLinks: [
              { label: 'Docs', link: '/getting-started/introduction/' },
              { label: 'Examples', link: '/examples/' },
              { label: 'Showcases', link: '/showcases/' },
            ],
          }),
        ],
        components: {
          // Docs-side overrides for site-specific concerns the theme can't own:
          // `Head` carries the native ClientRouter + the progress-bar
          // listener + meta/OG tags. Site-specific salvage migrates here.
          Head: './src/components/Head.astro',
        },
        customCss: [
          // Fontsource fonts per Design Context — Silkscreen (wordmark only),
          // Public Sans (headings), Inter (UI/nav), JetBrains Mono (prose),
          // Commit Mono (code). All bundled locally, latin-only subsets to
          // keep the woff2 ship count tight (24 → ~14 files): docs are
          // English-only, so cyrillic / greek / vietnamese / latin-ext
          // subsets shipped by the default `<weight>.css` imports were
          // never being loaded in practice.
          '@fontsource/silkscreen/latin-400.css',
          '@fontsource/silkscreen/latin-700.css',
          '@fontsource/public-sans/latin-200.css',
          '@fontsource/public-sans/latin-400.css',
          '@fontsource/public-sans/latin-500.css',
          '@fontsource/public-sans/latin-600.css',
          '@fontsource/public-sans/latin-700.css',
          '@fontsource/inter/latin-400.css',
          '@fontsource/inter/latin-500.css',
          '@fontsource/inter/latin-600.css',
          '@fontsource/jetbrains-mono/latin-400.css',
          '@fontsource/jetbrains-mono/latin-500.css',
          '@fontsource/commit-mono/latin-400.css',
          '@fontsource/commit-mono/latin-500.css',
        ],
        tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 },
        social: [
          { icon: 'github', label: 'GitHub', href: 'https://github.com/thejustinwalsh/three-flatland' },
        ],
        sidebar: [
          {
            label: 'Getting Started',
            items: [
              { label: 'Introduction', slug: 'getting-started/introduction', icon: 'i-lucide:lightbulb' },
              { label: 'Installation', slug: 'getting-started/installation', icon: 'i-lucide:download' },
              { label: 'Quick Start', slug: 'getting-started/quick-start', icon: 'i-lucide:play' },
            ],
          },
          // Concepts — pages whose primary purpose is to build the reader's
          // mental model. Less "do X," more "understand why X works the way it
          // does." Slugs stay under /guides/ to preserve URL stability; the
          // IA split is sidebar-level only.
          {
            label: 'Concepts',
            items: [
              { label: 'The Flatland Pipeline', slug: 'guides/flatland' },
              { label: 'Batch Rendering', slug: 'guides/batch-rendering' },
              { label: '2D Lighting', slug: 'guides/lighting' },
              { label: 'Shadows & Occlusion', slug: 'guides/shadows' },
            ],
          },
          // Guides — task-oriented how-tos. "I want to do X." Each page should
          // get the reader from zero to a working result with their own asset.
          {
            label: 'Guides',
            items: [
              { label: 'Sprites', slug: 'guides/sprites' },
              { label: 'Animation', slug: 'guides/animation' },
              { label: 'Loaders', slug: 'guides/loaders' },
              { label: 'Tilemaps', slug: 'guides/tilemaps' },
              { label: 'Hit Testing', slug: 'guides/hit-testing' },
              { label: 'Lighting', slug: 'guides/lighting-setup' },
              { label: 'Shadows', slug: 'guides/shadows-setup' },
              { label: 'Baking', slug: 'guides/baking' },
              { label: 'TSL Nodes', slug: 'guides/tsl-nodes' },
              { label: 'Pass Effects', slug: 'guides/pass-effects' },
              { label: 'Skia', slug: 'guides/skia' },
              { label: 'Slug Text', slug: 'guides/slug-text' },
              { label: 'Devtools', slug: 'guides/devtools' },
            ],
          },
          // Examples + Showcases are now top-level surfaces with their
          // own masonry index pages reached via the header's nav links
          // (Docs / Examples / Showcases). The detail pages remain
          // routed under `/examples/<slug>/` and `/showcases/<slug>/`
          // — they're just no longer rendered in the docs sidebar.
          {
            label: 'Resources',
            items: [
              { label: 'Branding', slug: 'branding' },
              { label: 'LLMs', slug: 'llm-prompts' },
            ],
          },
          typeDocSidebarGroup,
        ],
      },
    }),
    react(),
  ],
  markdown: {
    remarkPlugins: [stripIndexLinks],
    rehypePlugins: [rehypeExternalLinks],
  },
  vite: {
    /**
     * `resolve.conditions: ['source']` would let Vite pick workspace
     * packages' source `.ts` files via their `exports['.']['source']`
     * branch — handy in dev but breaks for npm packages that declare a
     * `source` condition pointing at a path not included in the
     * published tarball (`@zzfx-studio/zzfxm` is an example: its
     * `exports` map declares `source: ./src/zzfxm.ts`, but the
     * published package ships only `dist/`). Letting Vite fall through
     * to its default conditions (`import` / `module` / `default`)
     * resolves both cases cleanly — workspace packages get their
     * built `dist/` (tsup --watch keeps it fresh in dev), npm packages
     * get their dist too.
     */
    plugins: [
      watchExamples(),
      copyExamples(),
      copyDevtools(),
      /**
       * Disable bfcache on HTML responses in dev — Chrome's in-memory
       * back/forward cache restores a frozen DOM + JS state when you
       * navigate via the browser's back/forward arrows, AND under
       * some conditions also on Cmd-R reload. Combined with the
       * ClientRouter + ReplacementSwap SPA layer + HMR, that means a
       * page poisoned mid-session can persist across reloads. Clear-
       * cache button doesn't fix it (bfcache is in-memory, not in
       * cleared storage). DevTools "Disable cache" doesn't fix it
       * (HTTP cache only). Incognito works (bfcache off by default).
       *
       * `Cache-Control: no-store` is the only directive that disables
       * bfcache eligibility. Scoped to HTML responses via URL pattern
       * so JS/CSS modules still get Vite's normal cache headers.
       *
       * Dev-only (configureServer never fires in build).
       */
      {
        name: 'tf-disable-bfcache-html-dev',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = req.url ?? '';
            const path = url.split('?')[0];
            // HTML: no extension, ends with `/`, or explicit .html
            const isHtml =
              path.endsWith('/') ||
              path.endsWith('.html') ||
              !path.includes('.');
            if (isHtml) {
              res.setHeader('Cache-Control', 'no-store, must-revalidate');
            }
            next();
          });
        },
      },
    ],
    optimizeDeps: {
      // Pre-bundle the React JSX runtimes alongside `react-dom/client`.
      // Without this, dev mode lazy-resolves `react/jsx-dev-runtime` on
      // first hydration; Chrome handles that fine, but Safari occasionally
      // commits the component before the runtime module finishes loading
      // and `jsxDEV` ends up undefined ("TypeError: jsxDEV is not a
      // function"). Pre-bundling forces the runtimes into the initial
      // dep graph so the JSX call sites always have their renderer.
      include: ['react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime'],
    },
    define: {
      'import.meta.env.VITE_EXAMPLES_PORT': JSON.stringify(examplesPort),
    },
    // COEP/COOP previously set here to enable SharedArrayBuffer + cross-
    // origin isolation. Removed because:
    //   1. No code in the workspace uses SAB or any isolation-gated API
    //      (no Atomics, no pthread, no wasm-threads, no crossOriginIsolated
    //      checks). It was defensive without a purpose.
    //   2. GitHub Pages can't set custom response headers, so the production
    //      deploy will never have cross-origin isolation anyway. Keeping
    //      them in dev/preview made those environments stricter than prod
    //      and misled testing (preview surfaced COEP-blocked third-party
    //      scripts that load fine on the live site).
    //   3. They blocked legitimate cross-origin scripts (e.g. Umami metrics
    //      at metrics.tjw.dev, which serves `Access-Control-Allow-Origin: *`
    //      but doesn't send the Cross-Origin-Resource-Policy header that
    //      COEP `require-corp` additionally demands — and we don't control
    //      that endpoint to add CORP).
    // If a future use case genuinely needs SAB on a host that supports
    // custom headers, re-add them at that point.
  },
});
