<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# create-three-flatland

Scaffold a [three-flatland](https://www.npmjs.com/package/three-flatland) project — a minimal, Vite-powered WebGPU 2D starter in either plain [Three.js](https://threejs.org/) or [React Three Fiber](https://r3f.docs.pmnd.rs/). An interactive sprite scene, a Suspense loading overlay, oxlint/oxfmt, and ready-to-run unit + Playwright tests, with `AGENTS.md`/`CLAUDE.md` so coding agents know the ropes.

> **Alpha Release** — this package is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/create-three-flatland)](https://www.npmjs.com/package/create-three-flatland)
[![license](https://img.shields.io/npm/l/create-three-flatland)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Usage

```bash
# npm
npm create three-flatland@latest

# pnpm
pnpm create three-flatland

# yarn
yarn create three-flatland
```

You'll be prompted for a project directory and a template. Then:

```bash
cd my-app
npm install
npm run dev
```

### Non-interactive

Pass the target directory and template as arguments (create-vite-compatible flags):

```bash
npm create three-flatland@latest my-app -- --template three
npm create three-flatland@latest my-app -- --template react
```

| Flag | Meaning |
| --- | --- |
| `-t, --template <name>` | Template to scaffold: `three` \| `react` |
| `--overwrite` | Scaffold into a non-empty target directory |
| `--help` | Show usage |

## Templates

| Template | Stack |
| --- | --- |
| `three` | Plain Three.js + WebGPU (`three/webgpu` + TSL) on Vite |
| `react` | React Three Fiber (`@react-three/fiber/webgpu`) on Vite |

Both render an interactive sprite scene, share the same loading overlay, and ship with linting, formatting, unit tests, and Playwright end-to-end tests wired up.

## Documentation

Full docs, guides, and interactive examples at **[tjw.dev/three-flatland](https://tjw.dev/three-flatland/)**.

## License

[MIT](./LICENSE)
